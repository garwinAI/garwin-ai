import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accountMembers,
  accounts,
  appzoneInstallations,
  appzoneItems,
  auditLogs,
  conversations,
  developerProfiles,
  invitations,
  memberPermissions,
  planApps,
  plans,
  purchases,
  storageObjects,
  subscriptions,
  supportAccessGrants,
  uploadFees,
  users,
  type Permission,
} from "@/db/schema";
import { PLAN_SPEC, GB } from "@/lib/plans";
import { AppError } from "@/lib/errors";
import {
  acquireAppzoneItem,
  assertOwner,
  assertPermission,
  assertSeatAvailable,
  getEntitlements,
  getUsage,
  releaseStorage,
  reserveStorage,
} from "@/server/services/entitlements";
import { createUser } from "@/server/services/users";
import { splitSale } from "@/lib/entitlements";
import { uniqueEmail } from "./helpers";

// ---------------------------------------------------------------- fixtures

async function host(plan: "free" | "starter" | "plus" | "pro" = "free") {
  const user = await createUser({ name: "Host", email: uniqueEmail("host"), passwordHash: "x" });
  const [m] = await db.select().from(accountMembers).where(eq(accountMembers.userId, user.id));
  if (plan !== "free") await db.insert(subscriptions).values({ accountId: m.accountId, planId: plan, source: "admin", status: "active" });
  return { user, accountId: m.accountId };
}

/** Adds a team member to the host's account directly (the invitation flow arrives in Phase 3). */
async function teamMember(accountId: string, perms: Permission[]) {
  const [user] = await db.insert(users).values({ name: "Member", email: uniqueEmail("member"), passwordHash: "x" }).returning();
  const [member] = await db.insert(accountMembers).values({ accountId, userId: user.id, role: "member" }).returning();
  if (perms.length) await db.insert(memberPermissions).values(perms.map((permission) => ({ memberId: member.id, permission })));
  return user;
}

let devId: string | undefined;
async function developer() {
  if (devId) return devId;
  const u = await createUser({ name: "Dev", email: uniqueEmail("dev"), passwordHash: "x" });
  const [d] = await db.insert(developerProfiles).values({ userId: u.id, status: "approved", displayName: "Dev Co", reviewedAt: new Date() }).returning();
  return (devId = d.id);
}

async function item(opts: { priceCents?: number; status?: "published" | "draft" } = {}) {
  const status = opts.status ?? "published";
  const [i] = await db
    .insert(appzoneItems)
    .values({
      developerId: await developer(),
      kind: "widget",
      slug: `w-${Math.random().toString(36).slice(2, 10)}`,
      name: "Widget",
      status,
      priceCents: opts.priceCents ?? 0,
      publishedAt: status === "published" ? new Date() : null,
    })
    .returning();
  return i;
}

async function expectAppError(p: Promise<unknown>, code: AppError["code"]) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err.code).toBe(code);
}

async function expectDbError(p: Promise<unknown>, constraint?: string) {
  const err = await p.then(() => null, (e) => e);
  expect(err, "expected the database to reject this").toBeTruthy();
  if (constraint) expect(String(err.cause?.constraint ?? err.constraint ?? err.cause?.message ?? err.message)).toContain(constraint);
}

// ---------------------------------------------------------------- plans

describe("plans in the database match the product spec", () => {
  it("limits and included apps", async () => {
    const rows = await db.select().from(plans);
    const apps = await db.select().from(planApps);
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      const spec = PLAN_SPEC[r.id as keyof typeof PLAN_SPEC];
      expect(r.storageBytes).toBe(spec.storageGb * GB);
      expect(r.teamMemberLimit).toBe(spec.teamMembers);
      expect(r.freeAppzoneDownloadLimit).toBe(spec.freeAppzoneDownloads);
      expect(r.isPaid).toBe(spec.isPaid);
      expect(apps.filter((a) => a.planId === r.id).map((a) => a.appSlug).sort()).toEqual([...spec.includedApps].sort());
    }
  });
});

// ---------------------------------------------------------------- accounts and plans

describe("account plan resolution", () => {
  it("a new user owns a Free workspace with the core apps", async () => {
    const { user, accountId } = await host();
    const ent = await getEntitlements(user);
    expect(ent).toMatchObject({ accountId, role: "owner", isTeamMember: false, canManageBilling: true });
    expect(ent.plan.id).toBe("free");
    expect(ent.hasApp("calendar")).toBe(true);
    expect(ent.hasApp("wordbase")).toBe(false);
  });

  it.each([
    ["active", "starter"],
    ["trialing", "starter"],
    ["past_due", "starter"],
    ["incomplete", "free"],
    ["unpaid", "free"],
    ["canceled", "free"],
  ] as const)("subscription status %s gives plan %s", async (status, expected) => {
    const { user, accountId } = await host();
    await db.insert(subscriptions).values({ accountId, planId: "starter", source: "admin", status });
    expect((await getEntitlements(user)).plan.id).toBe(expected);
  });

  it("an account can't have two current subscriptions", async () => {
    const { accountId } = await host("plus");
    await expectDbError(db.insert(subscriptions).values({ accountId, planId: "pro", source: "admin", status: "active" }), "subscriptions_one_current_idx");
  });

  it("a canceled subscription can be followed by a new one", async () => {
    const { user, accountId } = await host();
    await db.insert(subscriptions).values({ accountId, planId: "plus", source: "admin", status: "canceled" });
    await db.insert(subscriptions).values({ accountId, planId: "pro", source: "admin", status: "active" });
    expect((await getEntitlements(user)).plan.id).toBe("pro");
  });
});

// ---------------------------------------------------------------- teams and permissions

describe("team members", () => {
  it("inherit the host's plan and get only granted permissions", async () => {
    const { accountId } = await host("pro");
    const member = await teamMember(accountId, ["storage.view", "storage.mark_for_deletion"]);
    const ent = await getEntitlements(member);
    expect(ent.plan.id).toBe("pro");
    expect(ent.isTeamMember).toBe(true);
    expect(ent.can("storage.view")).toBe(true);
    expect(ent.can("storage.upload")).toBe(false);
    expect(ent).toMatchObject({ canManageBilling: false, canManageMembers: false, canManageApps: false, canPermanentlyDelete: false });
  });

  it("are refused owner-only and ungranted actions on the server", async () => {
    const { accountId } = await host("starter");
    const member = await teamMember(accountId, ["storage.view"]);
    await expectAppError(assertOwner(member), "FORBIDDEN");
    await expectAppError(assertPermission(member, "storage.upload"), "FORBIDDEN");
    await expectAppError(reserveStorage(member, 10), "FORBIDDEN");
  });

  it("a person can belong to only one account, and an account has one owner", async () => {
    const a = await host();
    const b = await host();
    await expectDbError(db.insert(accountMembers).values({ accountId: b.accountId, userId: a.user.id, role: "member" }), "account_members_user_id_unique");
    const other = await teamMember(a.accountId, []);
    await expectDbError(db.update(accountMembers).set({ role: "owner" }).where(eq(accountMembers.userId, other.id)), "account_members_one_owner_idx");
  });
});

describe("team seats", () => {
  const invite = (accountId: string, expiresInSec = 3600) =>
    db.insert(invitations).values({ accountId, email: uniqueEmail("inv"), tokenHash: Math.random().toString(36), expiresAt: new Date(Date.now() + expiresInSec * 1000) });

  it("Free has no seats", async () => {
    const { accountId } = await host("free");
    await expectAppError(db.transaction((tx) => assertSeatAvailable(tx, accountId)), "PLAN_LIMIT");
  });

  it("Starter has 1 seat, and a pending invitation uses it", async () => {
    const { accountId } = await host("starter");
    await db.transaction((tx) => assertSeatAvailable(tx, accountId));
    await invite(accountId);
    await expectAppError(db.transaction((tx) => assertSeatAvailable(tx, accountId)), "PLAN_LIMIT");
  });

  it("expired invitations don't use a seat", async () => {
    const { accountId } = await host("starter");
    await invite(accountId, -60);
    await db.transaction((tx) => assertSeatAvailable(tx, accountId));
  });

  it("Plus allows 3 and Pro 10", async () => {
    const plus = await host("plus");
    for (let i = 0; i < 3; i++) await teamMember(plus.accountId, []);
    await expectAppError(db.transaction((tx) => assertSeatAvailable(tx, plus.accountId)), "PLAN_LIMIT");
    const pro = await host("pro");
    for (let i = 0; i < 9; i++) await teamMember(pro.accountId, []);
    await db.transaction((tx) => assertSeatAvailable(tx, pro.accountId));
  });

  it("two invitations at once can't both take the last seat", async () => {
    const { accountId } = await host("starter");
    const attempt = () =>
      db.transaction(async (tx) => {
        await assertSeatAvailable(tx, accountId);
        await tx.insert(invitations).values({ accountId, email: uniqueEmail("race"), tokenHash: Math.random().toString(36), expiresAt: new Date(Date.now() + 3600_000) });
      });
    const results = await Promise.allSettled([attempt(), attempt(), attempt()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("only one open invitation per email per account", async () => {
    const { accountId } = await host("pro");
    const email = uniqueEmail("dup");
    const row = () => db.insert(invitations).values({ accountId, email, tokenHash: Math.random().toString(36), expiresAt: new Date(Date.now() + 3600_000) });
    await row();
    await expectDbError(row(), "invitations_open_email_idx");
  });
});

// ---------------------------------------------------------------- storage

describe("storage quota", () => {
  it("reserves within the plan and refuses beyond it", async () => {
    const { user, accountId } = await host("free");
    await reserveStorage(user, Math.floor(0.9 * GB));
    await expectAppError(reserveStorage(user, Math.floor(0.2 * GB)), "PLAN_LIMIT");
    expect((await getUsage(accountId)).storageUsedBytes).toBe(Math.floor(0.9 * GB));
  });

  it("concurrent uploads can't exceed the quota", async () => {
    const { user, accountId } = await host("free");
    const chunk = 300 * 1024 ** 2; // 300 MB; only 3 fit in 1 GB
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => reserveStorage(user, chunk)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect((await getUsage(accountId)).storageUsedBytes).toBe(3 * chunk);
  });

  it("team members share the host's quota", async () => {
    const { user, accountId } = await host("starter");
    const member = await teamMember(accountId, ["storage.upload"]);
    await reserveStorage(user, 15 * GB);
    await expectAppError(reserveStorage(member, 6 * GB), "PLAN_LIMIT");
    await reserveStorage(member, 5 * GB);
  });

  it("releasing never goes below zero, and the DB refuses negative usage", async () => {
    const { accountId } = await host();
    await releaseStorage(accountId, 10_000);
    expect((await getUsage(accountId)).storageUsedBytes).toBe(0);
    await expectDbError(db.update(accounts).set({ storageUsedBytes: -1 }).where(eq(accounts.id, accountId)), "accounts_storage_used_nonnegative");
  });

  it("rejects invalid sizes", async () => {
    const { user } = await host();
    await expectAppError(reserveStorage(user, -1), "VALIDATION");
    await expectAppError(reserveStorage(user, 1.5), "VALIDATION");
  });

  it("enforces folder/file shape and unique names per folder (case-insensitive)", async () => {
    const { accountId } = await host();
    await db.insert(storageObjects).values({ accountId, kind: "folder", name: "Docs" });
    await expectDbError(db.insert(storageObjects).values({ accountId, kind: "folder", name: "docs" }), "storage_objects_unique_name_idx");
    await expectDbError(db.insert(storageObjects).values({ accountId, kind: "folder", name: "Big", sizeBytes: 5 }), "storage_objects_kind_fields");
    await expectDbError(db.insert(storageObjects).values({ accountId, kind: "file", name: "a.txt" }), "storage_objects_kind_fields");
    await expectDbError(db.insert(storageObjects).values({ accountId, kind: "folder", name: "a/b" }), "storage_objects_name_valid");
  });
});

// ---------------------------------------------------------------- AppZone

describe("AppZone downloads", () => {
  it("Free: 10 free items in total, ever; uninstalling doesn't give one back", async () => {
    const { user, accountId } = await host("free");
    const items = await Promise.all(Array.from({ length: 11 }, () => item()));
    for (const i of items.slice(0, 10)) await acquireAppzoneItem(user, i.id);
    await expectAppError(acquireAppzoneItem(user, items[10].id), "PLAN_LIMIT");

    // "Uninstall" (installations are separate from ownership); the limit is lifetime.
    await db.delete(appzoneInstallations).where(eq(appzoneInstallations.accountId, accountId));
    await expectAppError(acquireAppzoneItem(user, items[10].id), "PLAN_LIMIT");
    expect((await getUsage(accountId)).freeDownloadsUsed).toBe(10);
  });

  it("re-acquiring an owned item is free and idempotent", async () => {
    const { user, accountId } = await host("free");
    const i = await item();
    const first = await acquireAppzoneItem(user, i.id);
    const again = await acquireAppzoneItem(user, i.id);
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect((await getUsage(accountId)).freeDownloadsUsed).toBe(1);
  });

  it("paid plans get unlimited free items, which don't count", async () => {
    const { user, accountId } = await host("starter");
    for (let n = 0; n < 12; n++) await acquireAppzoneItem(user, (await item()).id);
    expect((await getUsage(accountId)).freeDownloadsUsed).toBe(0);
  });

  it("upgrading lifts the limit for new items; earlier items stay owned", async () => {
    const { user, accountId } = await host("free");
    for (let n = 0; n < 10; n++) await acquireAppzoneItem(user, (await item()).id);
    await db.insert(subscriptions).values({ accountId, planId: "plus", source: "admin", status: "active" });
    await acquireAppzoneItem(user, (await item()).id);
  });

  it("paid items need a completed purchase on any plan, and don't use free downloads", async () => {
    const { user, accountId } = await host("free");
    const paid = await item({ priceCents: 499 });
    await expectAppError(acquireAppzoneItem(user, paid.id), "PLAN_LIMIT");

    const split = splitSale(499);
    const [p] = await db.insert(purchases).values({ accountId, itemId: paid.id, buyerUserId: user.id, status: "pending", amountCents: 499, currency: "usd", ...split }).returning();
    await expectAppError(acquireAppzoneItem(user, paid.id), "PLAN_LIMIT"); // still pending

    await db.execute(sql`insert into payments (id, kind, status, amount_cents, stripe_payment_intent_id) values (gen_random_uuid(), 'appzone_purchase', 'succeeded', 499, ${"pi_" + p.id})`);
    const [payment] = await db.execute<{ id: string }>(sql`select id from payments where stripe_payment_intent_id = ${"pi_" + p.id}`).then((r) => r.rows);
    await db.update(purchases).set({ status: "paid", paymentId: payment.id }).where(eq(purchases.id, p.id));

    const { acquisition } = await acquireAppzoneItem(user, paid.id);
    expect(acquisition).toMatchObject({ source: "purchase", purchaseId: p.id, countsTowardFreeLimit: false });
    expect((await getUsage(accountId)).freeDownloadsUsed).toBe(0);
  });

  it("unpublished items can't be acquired", async () => {
    const { user } = await host("pro");
    await expectAppError(acquireAppzoneItem(user, (await item({ status: "draft" })).id), "NOT_FOUND");
  });

  it("members need the appzone.install permission", async () => {
    const { accountId } = await host("pro");
    const member = await teamMember(accountId, ["apps.use"]);
    await expectAppError(acquireAppzoneItem(member, (await item()).id), "FORBIDDEN");
  });

  it("concurrent downloads can't exceed the Free limit", async () => {
    const { user, accountId } = await host("free");
    for (let n = 0; n < 8; n++) await acquireAppzoneItem(user, (await item()).id);
    const more = await Promise.all(Array.from({ length: 5 }, () => item()));
    const results = await Promise.allSettled(more.map((i) => acquireAppzoneItem(user, i.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((await getUsage(accountId)).freeDownloadsUsed).toBe(10);
  });
});

// ---------------------------------------------------------------- money rules in the database

describe("database constraints on money", () => {
  it("purchases must split exactly 15% to Garwin AI", async () => {
    const { accountId } = await host();
    const paid = await item({ priceCents: 1000 });
    await expectDbError(
      db.insert(purchases).values({ accountId, itemId: paid.id, amountCents: 1000, currency: "usd", platformFeeCents: 100, developerAmountCents: 900 }),
      "purchases_fee_is_15_percent",
    );
  });

  it("upload fees must match the item kind", async () => {
    const devProfile = await developer();
    const w = await item();
    await expectDbError(db.insert(uploadFees).values({ developerId: devProfile, itemId: w.id, kind: "widget", amountCents: 3999 }), "upload_fees_amount_matches_kind");
    await db.insert(uploadFees).values({ developerId: devProfile, itemId: w.id, kind: "widget", amountCents: 1999 });
  });

  it("item prices are free or at least $0.99", async () => {
    await expectDbError(item({ priceCents: 50 }), "appzone_items_price_valid");
  });

  it("subscriptions can't be for the Free plan, and Stripe ones need Stripe ids", async () => {
    const { accountId } = await host();
    await expectDbError(db.insert(subscriptions).values({ accountId, planId: "free", source: "admin", status: "active" }), "subscriptions_paid_plan_only");
    await expectDbError(db.insert(subscriptions).values({ accountId, planId: "plus", source: "stripe", status: "active" }), "subscriptions_stripe_fields");
  });
});

// ---------------------------------------------------------------- support access and audit

describe("support access and audit log", () => {
  it("support access can't last longer than 24 hours", async () => {
    const { accountId } = await host();
    const admin = await createUser({ name: "Admin", email: uniqueEmail("admin"), passwordHash: "x", role: "admin" });
    const decidedAt = new Date();
    await expectDbError(
      db.insert(supportAccessGrants).values({
        accountId,
        requestedBy: admin.id,
        reason: "Customer reported missing files in Storage",
        status: "approved",
        decidedAt,
        expiresAt: new Date(decidedAt.getTime() + 25 * 3600_000),
      }),
      "support_access_max_24h",
    );
  });

  it("audit logs are append-only", async () => {
    const [row] = await db.insert(auditLogs).values({ actorType: "system", action: "test.recorded" }).returning();
    await expectDbError(db.update(auditLogs).set({ action: "tampered" }).where(eq(auditLogs.id, row.id)), "append-only");
    await expectDbError(db.delete(auditLogs).where(eq(auditLogs.id, row.id)), "append-only");
    const [still] = await db.select().from(auditLogs).where(and(eq(auditLogs.id, row.id), eq(auditLogs.action, "test.recorded")));
    expect(still).toBeTruthy();
  });

  it("messages belong to conversations that belong to accounts", async () => {
    const { accountId } = await host();
    await expectDbError(db.insert(conversations).values({ accountId: "00000000-0000-0000-0000-000000000000", kind: "team" }));
    await db.insert(conversations).values({ accountId, kind: "team" });
  });
});
