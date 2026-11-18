// AppZone: developer applications, item uploads, Admin review and upload fees.
//
// Fees are charged ONLY when Admin approves (listing fee for a new item, $9.99 for each newer
// version). A denied upload is never charged. The charge is made off-session on the developer's
// saved card at approval time; if it fails, nothing is approved. The payments ledger row is
// written by the verified Stripe webhook, like every other payment.
//
// Uploaded packages are stored, never unpacked or executed here (see security rules).
import "server-only";
import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accountMembers, accounts, appzoneFiles, appzoneItems, appzoneItemVersions, developerProfiles, payments, uploadFees, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  checkUpload,
  compareVersions,
  MAX_GALLERY_IMAGES,
  missingForSubmit,
  slugify,
  uploadFeeFor,
  type FileRole,
  type ItemDetails,
  type ItemKind,
} from "@/lib/appzone";
import { formatPrice } from "@/lib/pricing";
import { getStripe, isMissing, stripeConfigured } from "@/server/stripe/client";
import { recordAudit } from "./audit";
import { notify } from "./notifications";
import { listAdminIds } from "./users";
import type { RequestMeta } from "./security-events";

const log = logger.child({ module: "appzone" });

type UserRef = { id: string };
type Admin = { id: string; role: string };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function assertAdmin(user: Admin) {
  if (user.role !== "admin") throw new AppError("FORBIDDEN", "Only an Admin can do that.");
}

// ---------------------------------------------------------------- developer profile

export async function getDeveloperProfile(userId: string) {
  const [row] = await db.select().from(developerProfiles).where(eq(developerProfiles.userId, userId));
  return row ?? null;
}

async function requireApprovedDeveloper(user: UserRef) {
  const dev = await getDeveloperProfile(user.id);
  if (!dev || dev.status !== "approved") throw new AppError("FORBIDDEN", "Only approved developers can upload to AppZone.");
  return dev;
}

export async function applyAsDeveloper(user: UserRef & { name: string }, input: { displayName: string; website: string | null; applicationNote: string }, meta: RequestMeta) {
  const existing = await getDeveloperProfile(user.id);
  if (existing?.status === "approved") throw new AppError("CONFLICT", "You're already an approved developer.");
  if (existing?.status === "pending") throw new AppError("CONFLICT", "Your application is already waiting for review.");
  if (existing) {
    await db
      .update(developerProfiles)
      .set({ ...input, status: "pending", reviewedAt: null, reviewedBy: null, reviewNote: null, updatedAt: new Date() })
      .where(eq(developerProfiles.id, existing.id));
  } else {
    await db.insert(developerProfiles).values({ userId: user.id, ...input, status: "pending" });
  }
  await recordAudit({ accountId: null, actorUserId: user.id, action: "developer.applied", targetType: "user", targetId: user.id, metadata: { displayName: input.displayName }, meta });
  await notify(await listAdminIds(), { type: "developer.applied", title: `Developer application: ${input.displayName}`, body: `From ${user.name}`, link: "/admin/appzone?tab=developers" });
  log.info("developer.applied", { userId: user.id });
}

// ---------------------------------------------------------------- paying upload fees

/** The workspace the developer hosts; its saved card pays upload fees. */
async function ownAccountId(userId: string, exec: Tx | typeof db = db) {
  const [row] = await exec
    .select({ accountId: accountMembers.accountId })
    .from(accountMembers)
    .where(and(eq(accountMembers.userId, userId), eq(accountMembers.role, "owner")));
  return row?.accountId ?? null;
}

type PayingCard = { accountId: string; customer: string; paymentMethod: string; brand: string; last4: string };

/** The developer's default card (or first card) in Stripe, or null. */
async function payingCard(userId: string): Promise<PayingCard | null> {
  const stripe = getStripe();
  const accountId = await ownAccountId(userId);
  if (!stripe || !accountId) return null;
  const [account] = await db.select({ customer: accounts.stripeCustomerId }).from(accounts).where(eq(accounts.id, accountId));
  if (!account?.customer) return null;
  try {
    const customer = await stripe.customers.retrieve(account.customer);
    if (customer.deleted) return null;
    const methods = await stripe.customers.listPaymentMethods(account.customer, { type: "card", limit: 10 });
    const def = customer.invoice_settings?.default_payment_method;
    const defId = typeof def === "string" ? def : (def?.id ?? null);
    const pm = methods.data.find((m) => m.id === defId) ?? methods.data[0];
    if (!pm?.card) return null;
    return { accountId, customer: account.customer, paymentMethod: pm.id, brand: pm.card.brand, last4: pm.card.last4 };
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

/** For the developer pages: can fees be taken, and from which card. */
export async function feeReadiness(user: UserRef) {
  if (!stripeConfigured()) return { ready: false as const, reason: "Payments aren't switched on yet, so items can't be sent for review." };
  if (!(await ownAccountId(user.id))) return { ready: false as const, reason: "Upload fees are paid from your own workspace. Create one first." };
  const card = await payingCard(user.id);
  if (!card) return { ready: false as const, reason: "Add a card in Settings → Cards. You're only charged when Admin approves." };
  return { ready: true as const, card: { brand: card.brand, last4: card.last4 } };
}

async function assertCanPayFees(user: UserRef) {
  const r = await feeReadiness(user);
  if (!r.ready) throw new AppError("CONFLICT", r.reason);
}

// ---------------------------------------------------------------- files

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export type Upload = { role: FileRole; bytes: Uint8Array };

function checked(u: Upload) {
  const r = checkUpload(u.role, u.bytes);
  if (!r.ok) throw new AppError("VALIDATION", r.error);
  return { contentType: r.contentType, sizeBytes: u.bytes.length, sha256: sha256(u.bytes), data: Buffer.from(u.bytes) };
}

async function putSingleImage(tx: Tx, itemId: string, u: Upload) {
  const file = checked(u);
  await tx.delete(appzoneFiles).where(and(eq(appzoneFiles.itemId, itemId), eq(appzoneFiles.role, u.role)));
  await tx.insert(appzoneFiles).values({ itemId, role: u.role, ...file });
}

/** File metadata (never the bytes) for an item. */
async function fileList(itemId: string) {
  return db
    .select({ id: appzoneFiles.id, role: appzoneFiles.role, position: appzoneFiles.position, versionId: appzoneFiles.versionId, sizeBytes: appzoneFiles.sizeBytes, contentType: appzoneFiles.contentType })
    .from(appzoneFiles)
    .where(eq(appzoneFiles.itemId, itemId))
    .orderBy(asc(appzoneFiles.role), asc(appzoneFiles.position), asc(appzoneFiles.createdAt));
}

/**
 * A file for the /api/appzone/files route. Images of published items are public; everything else
 * (drafts, packages) only for the item's developer and Admins.
 */
export async function getFileForViewer(fileId: string, viewer: { id: string; role: string } | null) {
  const [row] = await db
    .select({
      role: appzoneFiles.role,
      contentType: appzoneFiles.contentType,
      data: appzoneFiles.data,
      sha256: appzoneFiles.sha256,
      itemStatus: appzoneItems.status,
      slug: appzoneItems.slug,
      devUserId: developerProfiles.userId,
    })
    .from(appzoneFiles)
    .innerJoin(appzoneItems, eq(appzoneItems.id, appzoneFiles.itemId))
    .innerJoin(developerProfiles, eq(developerProfiles.id, appzoneItems.developerId))
    .where(eq(appzoneFiles.id, fileId));
  if (!row) return null;
  const isPublicImage = row.role !== "package" && row.itemStatus === "published";
  const isOwnerOrAdmin = viewer !== null && (viewer.role === "admin" || viewer.id === row.devUserId);
  if (!isPublicImage && !isOwnerOrAdmin) return null;
  return { ...row, isPublic: isPublicImage };
}

// ---------------------------------------------------------------- developer: items

export async function listMyItems(user: UserRef) {
  const dev = await getDeveloperProfile(user.id);
  if (!dev) return [];
  const items = await db.select().from(appzoneItems).where(eq(appzoneItems.developerId, dev.id)).orderBy(desc(appzoneItems.updatedAt));
  if (items.length === 0) return [];
  const icons = await db
    .select({ id: appzoneFiles.id, itemId: appzoneFiles.itemId })
    .from(appzoneFiles)
    .where(and(inArray(appzoneFiles.itemId, items.map((i) => i.id)), eq(appzoneFiles.role, "icon")));
  const iconOf = new Map(icons.map((i) => [i.itemId, i.id]));
  return items.map((i) => ({ ...i, iconFileId: iconOf.get(i.id) ?? null }));
}

/** One of the developer's own items with its versions and file list. Admins may read any item. */
export async function getItemDetail(viewer: Admin, itemId: string) {
  const [item] = await db
    .select({ item: appzoneItems, dev: developerProfiles })
    .from(appzoneItems)
    .innerJoin(developerProfiles, eq(developerProfiles.id, appzoneItems.developerId))
    .where(eq(appzoneItems.id, itemId));
  if (!item || (item.dev.userId !== viewer.id && viewer.role !== "admin")) throw new AppError("NOT_FOUND", "Item not found.");
  const [versions, files, fees] = await Promise.all([
    db.select().from(appzoneItemVersions).where(eq(appzoneItemVersions.itemId, itemId)).orderBy(desc(appzoneItemVersions.createdAt)),
    fileList(itemId),
    db.select().from(uploadFees).where(eq(uploadFees.itemId, itemId)).orderBy(desc(uploadFees.createdAt)),
  ]);
  const open = versions.find((v) => v.reviewStatus === "pending") ?? null;
  const latestApproved = versions.filter((v) => v.reviewStatus === "approved").sort((a, b) => compareVersions(b.version, a.version))[0] ?? null;
  return { ...item.item, developer: item.dev, versions, files, fees, openVersion: open, latestApproved };
}

const EDITABLE: ReadonlyArray<string> = ["draft", "rejected"];

async function uniqueSlug(tx: Tx, name: string) {
  const base = slugify(name);
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 && base !== "developer" ? base : `${base}-${n}`;
    const [taken] = await tx.select({ id: appzoneItems.id }).from(appzoneItems).where(eq(appzoneItems.slug, slug));
    if (!taken) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function itemColumns(d: ItemDetails) {
  return {
    kind: d.kind,
    appType: d.appType,
    targetApp: d.targetApp,
    themeLayout: d.themeLayout,
    name: d.name,
    summary: d.summary,
    description: d.description,
    priceCents: d.priceCents,
    yearlyPriceCents: d.yearlyPriceCents,
    mainColor: d.mainColor,
    copyright: d.copyright,
    supportEmail: d.supportEmail,
    websiteUrl: d.websiteUrl,
    privacyUrl: d.privacyUrl,
  };
}

/** Step 1: details, icon and main image. Creates a draft item and its first (draft) version. */
export async function createItem(user: UserRef, details: ItemDetails, images: Upload[], meta: RequestMeta) {
  const dev = await requireApprovedDeveloper(user);
  for (const u of images) checked(u); // fail before writing anything
  const item = await db.transaction(async (tx) => {
    const [item] = await tx
      .insert(appzoneItems)
      .values({ developerId: dev.id, slug: await uniqueSlug(tx, details.name), status: "draft", ...itemColumns(details) })
      .returning();
    await tx.insert(appzoneItemVersions).values({ itemId: item.id, version: details.version, releaseNotes: details.releaseNotes, manifest: {} });
    for (const u of images) await putSingleImage(tx, item.id, u);
    return item;
  });
  await recordAudit({ accountId: null, actorUserId: user.id, action: "appzone.item_created", targetType: "appzone_item", targetId: item.id, metadata: { name: item.name, kind: item.kind }, meta });
  log.info("appzone.item_created", { itemId: item.id, kind: item.kind });
  return item;
}

async function lockOwnItem(tx: Tx, user: UserRef, itemId: string) {
  const rows = await tx.execute<{ id: string; status: string; kind: ItemKind; dev_user: string; developer_id: string; name: string }>(sql`
    select i.id, i.status, i.kind, i.name, i.developer_id, d.user_id as dev_user
    from appzone_items i join developer_profiles d on d.id = i.developer_id
    where i.id = ${itemId} for update of i`);
  const item = rows.rows[0];
  if (!item || item.dev_user !== user.id) throw new AppError("NOT_FOUND", "Item not found.");
  return item;
}

/** Edit details (and optionally replace icon/main image) while the item is a draft or was denied. */
export async function updateItemDetails(user: UserRef, itemId: string, details: ItemDetails, images: Upload[], meta: RequestMeta) {
  await requireApprovedDeveloper(user);
  for (const u of images) checked(u);
  await db.transaction(async (tx) => {
    const item = await lockOwnItem(tx, user, itemId);
    if (!EDITABLE.includes(item.status)) throw new AppError("CONFLICT", "Details can't be changed while the item is in review or published.");
    await tx.update(appzoneItems).set({ ...itemColumns(details), updatedAt: new Date() }).where(eq(appzoneItems.id, itemId));
    await tx
      .update(appzoneItemVersions)
      .set({ version: details.version, releaseNotes: details.releaseNotes })
      .where(and(eq(appzoneItemVersions.itemId, itemId), eq(appzoneItemVersions.reviewStatus, "pending")));
    for (const u of images) await putSingleImage(tx, itemId, u);
  });
  await recordAudit({ accountId: null, actorUserId: user.id, action: "appzone.item_updated", targetType: "appzone_item", targetId: itemId, meta });
}

export async function addGalleryImage(user: UserRef, itemId: string, bytes: Uint8Array) {
  await requireApprovedDeveloper(user);
  const file = checked({ role: "gallery", bytes });
  await db.transaction(async (tx) => {
    const item = await lockOwnItem(tx, user, itemId);
    if (!EDITABLE.includes(item.status)) throw new AppError("CONFLICT", "Images can't be changed while the item is in review or published.");
    const [{ n, maxPos }] = await tx
      .select({ n: sql<number>`count(*)::int`, maxPos: sql<number>`coalesce(max(${appzoneFiles.position}), -1)::int` })
      .from(appzoneFiles)
      .where(and(eq(appzoneFiles.itemId, itemId), eq(appzoneFiles.role, "gallery")));
    if (n >= MAX_GALLERY_IMAGES) throw new AppError("VALIDATION", `You can add up to ${MAX_GALLERY_IMAGES} gallery images.`);
    await tx.insert(appzoneFiles).values({ itemId, role: "gallery", position: maxPos + 1, ...file });
  });
}

export async function removeGalleryImage(user: UserRef, fileId: string) {
  await db.transaction(async (tx) => {
    const [f] = await tx.select({ itemId: appzoneFiles.itemId, role: appzoneFiles.role }).from(appzoneFiles).where(eq(appzoneFiles.id, fileId));
    if (!f || f.role !== "gallery") throw new AppError("NOT_FOUND", "Image not found.");
    const item = await lockOwnItem(tx, user, f.itemId);
    if (!EDITABLE.includes(item.status)) throw new AppError("CONFLICT", "Images can't be changed while the item is in review or published.");
    await tx.delete(appzoneFiles).where(eq(appzoneFiles.id, fileId));
  });
}

async function attachPackage(tx: Tx, itemId: string, versionId: string, bytes: Uint8Array) {
  const file = checked({ role: "package", bytes });
  await tx.delete(appzoneFiles).where(and(eq(appzoneFiles.versionId, versionId), eq(appzoneFiles.role, "package")));
  const [row] = await tx.insert(appzoneFiles).values({ itemId, versionId, role: "package", ...file }).returning({ id: appzoneFiles.id });
  await tx.update(appzoneItemVersions).set({ bundleStorageKey: `db:${row.id}`, bundleSha256: file.sha256 }).where(eq(appzoneItemVersions.id, versionId));
}

/** Upload or replace the package of a draft/denied item's first version. */
export async function uploadPackage(user: UserRef, itemId: string, bytes: Uint8Array) {
  await requireApprovedDeveloper(user);
  checked({ role: "package", bytes });
  await db.transaction(async (tx) => {
    const item = await lockOwnItem(tx, user, itemId);
    if (!EDITABLE.includes(item.status)) throw new AppError("CONFLICT", "The package can't be changed while the item is in review or published.");
    const [open] = await tx.select({ id: appzoneItemVersions.id }).from(appzoneItemVersions).where(and(eq(appzoneItemVersions.itemId, itemId), eq(appzoneItemVersions.reviewStatus, "pending")));
    if (!open) throw new AppError("CONFLICT", "There's no version waiting for a package.");
    await attachPackage(tx, itemId, open.id, bytes);
  });
}

/** Step 3: send a new item (or a denied one, fixed) to Admin. No money moves until approval. */
export async function submitItem(user: UserRef & { name: string }, itemId: string, meta: RequestMeta) {
  const dev = await requireApprovedDeveloper(user);
  await assertCanPayFees(user);
  const name = await db.transaction(async (tx) => {
    const item = await lockOwnItem(tx, user, itemId);
    if (!EDITABLE.includes(item.status)) throw new AppError("CONFLICT", "This item is already in review or published.");
    const [open] = await tx.select().from(appzoneItemVersions).where(and(eq(appzoneItemVersions.itemId, itemId), eq(appzoneItemVersions.reviewStatus, "pending")));
    const roles = await tx.select({ role: appzoneFiles.role }).from(appzoneFiles).where(and(eq(appzoneFiles.itemId, itemId), isNull(appzoneFiles.versionId)));
    const missing = missingForSubmit({
      kind: item.kind,
      hasIcon: roles.some((r) => r.role === "icon"),
      hasMainImage: roles.some((r) => r.role === "main_image"),
      hasPackage: Boolean(open?.bundleStorageKey),
    });
    if (!open || missing.length > 0) throw new AppError("VALIDATION", `Add ${missing.join(", ") || "a version"} before sending for review.`);
    const now = new Date();
    await tx.update(appzoneItemVersions).set({ submittedAt: now, reviewedAt: null, reviewedBy: null }).where(eq(appzoneItemVersions.id, open.id));
    await tx.update(appzoneItems).set({ status: "in_review", submittedAt: now, updatedAt: now }).where(eq(appzoneItems.id, itemId));
    return item.name;
  });
  await recordAudit({ accountId: null, actorUserId: user.id, action: "appzone.item_submitted", targetType: "appzone_item", targetId: itemId, meta });
  await notify(await listAdminIds(), { type: "appzone.review_requested", title: `AppZone review: ${name}`, body: `New item from ${dev.displayName}`, link: "/admin/appzone" });
  log.info("appzone.item_submitted", { itemId });
}

/** Upload a newer version of a published item. Sent straight to review; $9.99 is charged if approved. */
export async function submitNewVersion(user: UserRef, itemId: string, input: { version: string; releaseNotes: string }, bytes: Uint8Array, meta: RequestMeta) {
  const dev = await requireApprovedDeveloper(user);
  checked({ role: "package", bytes });
  await assertCanPayFees(user);
  const name = await db.transaction(async (tx) => {
    const item = await lockOwnItem(tx, user, itemId);
    if (item.status !== "published") throw new AppError("CONFLICT", "You can upload a newer version once the item is approved.");
    const versions = await tx.select().from(appzoneItemVersions).where(eq(appzoneItemVersions.itemId, itemId));
    if (versions.some((v) => v.reviewStatus === "pending")) throw new AppError("CONFLICT", "A version is already waiting for review.");
    const latest = versions.filter((v) => v.reviewStatus === "approved").sort((a, b) => compareVersions(b.version, a.version))[0];
    if (latest && compareVersions(input.version, latest.version) <= 0) throw new AppError("VALIDATION", `The new version must be higher than ${latest.version}.`);
    // A denied version with the same number is replaced (it was never charged).
    const denied = versions.find((v) => v.version === input.version && v.reviewStatus === "rejected");
    if (denied) await tx.delete(appzoneItemVersions).where(eq(appzoneItemVersions.id, denied.id));
    const [v] = await tx.insert(appzoneItemVersions).values({ itemId, version: input.version, releaseNotes: input.releaseNotes, manifest: {} }).returning();
    await attachPackage(tx, itemId, v.id, bytes);
    await tx.update(appzoneItemVersions).set({ submittedAt: new Date() }).where(eq(appzoneItemVersions.id, v.id));
    return item.name;
  });
  await recordAudit({ accountId: null, actorUserId: user.id, action: "appzone.version_submitted", targetType: "appzone_item", targetId: itemId, metadata: { version: input.version }, meta });
  await notify(await listAdminIds(), { type: "appzone.review_requested", title: `AppZone update: ${name} ${input.version}`, body: `From ${dev.displayName}`, link: "/admin/appzone" });
}

// ---------------------------------------------------------------- Admin: developers

export async function listDeveloperApplications(admin: Admin) {
  assertAdmin(admin);
  return db
    .select({ profile: developerProfiles, userName: users.name, userEmail: users.email })
    .from(developerProfiles)
    .innerJoin(users, eq(users.id, developerProfiles.userId))
    .orderBy(sql`${developerProfiles.status} = 'pending' desc`, desc(developerProfiles.createdAt))
    .limit(100);
}

export async function reviewDeveloper(admin: Admin, profileId: string, decision: "approve" | "deny", note: string, meta: RequestMeta) {
  assertAdmin(admin);
  if (decision === "deny" && note.length < 3) throw new AppError("VALIDATION", "Give the developer a reason.");
  const [row] = await db
    .update(developerProfiles)
    .set({ status: decision === "approve" ? "approved" : "denied", reviewedBy: admin.id, reviewedAt: new Date(), reviewNote: note || null, updatedAt: new Date() })
    .where(and(eq(developerProfiles.id, profileId), eq(developerProfiles.status, "pending")))
    .returning();
  if (!row) throw new AppError("CONFLICT", "That application was already reviewed.");
  await recordAudit({ accountId: null, actorUserId: admin.id, actorType: "admin", action: `developer.${decision === "approve" ? "approved" : "denied"}`, targetType: "user", targetId: row.userId, meta });
  await notify([row.userId], {
    type: "developer.reviewed",
    title: decision === "approve" ? "You're an AppZone developer" : "Developer application not approved",
    body: decision === "approve" ? "You can now upload apps, widgets and themes." : note,
    link: "/appzone/developer",
  });
}

// ---------------------------------------------------------------- Admin: review queue

export async function listReviewQueue(admin: Admin) {
  assertAdmin(admin);
  return db
    .select({
      versionId: appzoneItemVersions.id,
      version: appzoneItemVersions.version,
      submittedAt: appzoneItemVersions.submittedAt,
      itemId: appzoneItems.id,
      name: appzoneItems.name,
      kind: appzoneItems.kind,
      appType: appzoneItems.appType,
      itemStatus: appzoneItems.status,
      developer: developerProfiles.displayName,
    })
    .from(appzoneItemVersions)
    .innerJoin(appzoneItems, eq(appzoneItems.id, appzoneItemVersions.itemId))
    .innerJoin(developerProfiles, eq(developerProfiles.id, appzoneItems.developerId))
    .where(and(eq(appzoneItemVersions.reviewStatus, "pending"), isNotNull(appzoneItemVersions.submittedAt)))
    .orderBy(asc(appzoneItemVersions.submittedAt));
}

/** Everything Admin needs to decide on one submitted version. */
export async function getReview(admin: Admin, versionId: string) {
  assertAdmin(admin);
  const [v] = await db.select().from(appzoneItemVersions).where(eq(appzoneItemVersions.id, versionId));
  if (!v) throw new AppError("NOT_FOUND", "That upload doesn't exist.");
  const detail = await getItemDetail(admin, v.itemId);
  const purpose = detail.status === "published" ? ("update" as const) : ("listing" as const);
  return { version: v, item: detail, purpose, feeCents: uploadFeeFor(detail.kind, purpose) };
}

const declineMessage = (err: Stripe.errors.StripeError) =>
  err.code === "authentication_required"
    ? "the bank wants the developer to confirm the payment"
    : err.decline_code === "insufficient_funds"
      ? "insufficient funds"
      : (err.message?.slice(0, 120) ?? "the card was declined");

/**
 * Approve: charge the fee first, then publish. If the charge fails nothing is approved and the
 * developer is told to update their card. Stripe's idempotency key (one per version) means a
 * double click or a retry never charges twice.
 */
export async function approveUpload(admin: Admin, versionId: string, note: string, meta: RequestMeta) {
  assertAdmin(admin);
  const { version, item, purpose, feeCents } = await getReview(admin, versionId);
  if (version.reviewStatus !== "pending" || !version.submittedAt) throw new AppError("CONFLICT", "That upload was already reviewed.");

  const stripe = getStripe();
  if (!stripe) throw new AppError("CONFLICT", "Payments aren't switched on, so the upload fee can't be taken. Add the Stripe keys first.");
  const card = await payingCard(item.developer.userId);
  if (!card) {
    await notify([item.developer.userId], { type: "appzone.fee_failed", title: `Add a card to publish ${item.name}`, body: "Admin tried to approve your upload, but there's no card to take the upload fee from.", link: "/settings/cards" });
    throw new AppError("CONFLICT", "The developer has no card on file, so the fee can't be taken. They've been asked to add one.");
  }

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: feeCents,
        currency: "usd",
        customer: card.customer,
        payment_method: card.paymentMethod,
        off_session: true,
        confirm: true,
        description: `AppZone ${purpose === "update" ? "update" : "listing"} fee: ${item.name} ${version.version}`,
        metadata: { kind: "upload_fee", purpose, versionId, itemId: item.id, accountId: card.accountId },
      },
      { idempotencyKey: `upload-fee-${versionId}` },
    );
  } catch (err) {
    const e = err as Stripe.errors.StripeError;
    if (e?.type === "StripeCardError") {
      const why = declineMessage(e);
      log.info("appzone.fee_declined", { versionId, code: e.code });
      await notify([item.developer.userId], {
        type: "appzone.fee_failed",
        title: `Payment failed for ${item.name}`,
        body: `Admin approved your upload, but the ${formatPrice(feeCents, "usd")} fee couldn't be taken (${why}). Update your card and ask support to retry.`,
        link: "/settings/cards",
      });
      throw new AppError("CONFLICT", `The fee couldn't be taken (${why}). Nothing was approved; the developer has been told to update their card.`);
    }
    throw err;
  }
  if (intent.status !== "succeeded") {
    throw new AppError("CONFLICT", `The fee is still processing (${intent.status}). Nothing was approved yet; try again in a minute.`);
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(appzoneItemVersions).where(eq(appzoneItemVersions.id, versionId)).for("update");
    if (!locked || locked.reviewStatus !== "pending") return; // a concurrent approve won; same charge (idempotency key)
    const [ledger] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.stripePaymentIntentId, intent.id));
    await tx
      .insert(uploadFees)
      .values({
        developerId: item.developer.id,
        itemId: item.id,
        versionId,
        purpose,
        kind: item.kind,
        amountCents: feeCents,
        stripePaymentIntentId: intent.id,
        paymentId: ledger?.id ?? null,
        paidAt: now,
      })
      .onConflictDoNothing();
    await tx.update(appzoneItemVersions).set({ reviewStatus: "approved", reviewedBy: admin.id, reviewedAt: now, reviewNote: note || null }).where(eq(appzoneItemVersions.id, versionId));
    if (purpose === "listing") {
      await tx.update(appzoneItems).set({ status: "published", publishedAt: now, updatedAt: now }).where(eq(appzoneItems.id, item.id));
    } else {
      await tx.update(appzoneItems).set({ updatedAt: now }).where(eq(appzoneItems.id, item.id));
    }
    await recordAudit(
      {
        accountId: card.accountId,
        actorUserId: admin.id,
        actorType: "admin",
        action: "appzone.upload_approved",
        targetType: "appzone_item",
        targetId: item.id,
        metadata: { version: version.version, purpose, feeCents },
        meta,
      },
      tx,
    );
  });
  await notify([item.developer.userId], {
    type: "appzone.approved",
    title: purpose === "listing" ? `${item.name} is live in AppZone` : `${item.name} ${version.version} is approved`,
    body: `The ${formatPrice(feeCents, "usd")} upload fee was charged to your ${card.brand} ending ${card.last4}.${note ? ` Note from Admin: ${note}` : ""}`,
    link: `/appzone/developer/${item.id}`,
  });
  log.info("appzone.upload_approved", { versionId, purpose });
}

/** Deny: no fee is taken. A new item goes back to the developer to fix and resend. */
export async function denyUpload(admin: Admin, versionId: string, note: string, meta: RequestMeta) {
  assertAdmin(admin);
  if (note.length < 3) throw new AppError("VALIDATION", "Tell the developer why, so they can fix it.");
  const { version, item, purpose } = await getReview(admin, versionId);
  const now = new Date();
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(appzoneItemVersions)
      .set({ reviewStatus: "rejected", reviewedBy: admin.id, reviewedAt: now, reviewNote: note })
      .where(and(eq(appzoneItemVersions.id, versionId), eq(appzoneItemVersions.reviewStatus, "pending"), isNotNull(appzoneItemVersions.submittedAt)))
      .returning({ id: appzoneItemVersions.id });
    if (!updated) throw new AppError("CONFLICT", "That upload was already reviewed.");
    if (purpose === "listing") await tx.update(appzoneItems).set({ status: "rejected", updatedAt: now }).where(eq(appzoneItems.id, item.id));
    await recordAudit(
      { accountId: null, actorUserId: admin.id, actorType: "admin", action: "appzone.upload_denied", targetType: "appzone_item", targetId: item.id, metadata: { version: version.version, purpose }, meta },
      tx,
    );
  });
  await notify([item.developer.userId], {
    type: "appzone.denied",
    title: `${item.name} ${version.version} wasn't approved`,
    body: `No upload fee was charged. ${note}`,
    link: `/appzone/developer/${item.id}`,
  });
}

/** Reopen a denied new item so the developer can fix it (the denied version becomes the draft again). */
export async function reopenDeniedItem(user: UserRef, itemId: string) {
  await requireApprovedDeveloper(user);
  await db.transaction(async (tx) => {
    const item = await lockOwnItem(tx, user, itemId);
    if (item.status !== "rejected") return;
    const [v] = await tx
      .select({ id: appzoneItemVersions.id })
      .from(appzoneItemVersions)
      .where(and(eq(appzoneItemVersions.itemId, itemId), eq(appzoneItemVersions.reviewStatus, "rejected")))
      .orderBy(desc(appzoneItemVersions.createdAt))
      .limit(1);
    if (v) await tx.update(appzoneItemVersions).set({ reviewStatus: "pending", submittedAt: null }).where(eq(appzoneItemVersions.id, v.id));
    await tx.update(appzoneItems).set({ status: "draft", updatedAt: new Date() }).where(eq(appzoneItems.id, itemId));
  });
}

// ---------------------------------------------------------------- webhook: upload fee ledger

/** Records a succeeded upload-fee PaymentIntent in the ledger (idempotent) and links the fee. */
export async function recordUploadFeePayment(intent: Stripe.PaymentIntent) {
  if (intent.metadata?.kind !== "upload_fee" || intent.status !== "succeeded") return false;
  const accountId = intent.metadata.accountId || null;
  const [developer] = accountId
    ? await db.select({ userId: accountMembers.userId }).from(accountMembers).where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.role, "owner")))
    : [];
  await db
    .insert(payments)
    .values({
      accountId,
      userId: developer?.userId ?? null,
      kind: "upload_fee",
      status: "succeeded",
      amountCents: intent.amount_received || intent.amount,
      currency: intent.currency,
      stripePaymentIntentId: intent.id,
      stripeChargeId: typeof intent.latest_charge === "string" ? intent.latest_charge : (intent.latest_charge?.id ?? null),
      description: intent.description,
    })
    .onConflictDoNothing();
  const [ledger] = await db.select({ id: payments.id }).from(payments).where(eq(payments.stripePaymentIntentId, intent.id));
  if (ledger) await db.update(uploadFees).set({ paymentId: ledger.id }).where(and(eq(uploadFees.stripePaymentIntentId, intent.id), isNull(uploadFees.paymentId)));
  return true;
}

// ---------------------------------------------------------------- the marketplace

export async function listPublishedItems() {
  const items = await db
    .select({
      id: appzoneItems.id,
      slug: appzoneItems.slug,
      name: appzoneItems.name,
      summary: appzoneItems.summary,
      kind: appzoneItems.kind,
      appType: appzoneItems.appType,
      priceCents: appzoneItems.priceCents,
      yearlyPriceCents: appzoneItems.yearlyPriceCents,
      currency: appzoneItems.currency,
      mainColor: appzoneItems.mainColor,
      developer: developerProfiles.displayName,
    })
    .from(appzoneItems)
    .innerJoin(developerProfiles, eq(developerProfiles.id, appzoneItems.developerId))
    .where(eq(appzoneItems.status, "published"))
    .orderBy(desc(appzoneItems.publishedAt))
    .limit(200);
  if (items.length === 0) return [];
  const icons = await db
    .select({ id: appzoneFiles.id, itemId: appzoneFiles.itemId })
    .from(appzoneFiles)
    .where(and(inArray(appzoneFiles.itemId, items.map((i) => i.id)), eq(appzoneFiles.role, "icon")));
  const iconOf = new Map(icons.map((i) => [i.itemId, i.id]));
  return items.map((i) => ({ ...i, iconFileId: iconOf.get(i.id) ?? null }));
}

export async function getPublishedItem(slug: string) {
  const [row] = await db
    .select({ item: appzoneItems, developer: developerProfiles.displayName })
    .from(appzoneItems)
    .innerJoin(developerProfiles, eq(developerProfiles.id, appzoneItems.developerId))
    .where(and(eq(appzoneItems.slug, slug), eq(appzoneItems.status, "published")));
  if (!row) return null;
  const [files, versions] = await Promise.all([
    fileList(row.item.id),
    db
      .select({ version: appzoneItemVersions.version, releaseNotes: appzoneItemVersions.releaseNotes, reviewedAt: appzoneItemVersions.reviewedAt })
      .from(appzoneItemVersions)
      .where(and(eq(appzoneItemVersions.itemId, row.item.id), eq(appzoneItemVersions.reviewStatus, "approved"))),
  ]);
  versions.sort((a, b) => compareVersions(b.version, a.version));
  return { ...row.item, developer: row.developer, files: files.filter((f) => f.role !== "package"), currentVersion: versions[0] ?? null };
}


