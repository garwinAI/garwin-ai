// THE central entitlement service. Every plan limit, feature and permission check on the server
// goes through here. Pages may call it to decide what to show, but services must call the
// assert*/reserve*/acquire* functions before changing anything: frontend checks are never enough.
//
// Rules:
//  - A user's plan is their ACCOUNT's plan (team members share the host's).
//  - The account's plan is its current entitling subscription's plan, or Free.
//  - Owners have all permissions; members only what the host granted.
//  - Owner-only: billing, members, apps, permanent deletion.
import "server-only";
import { cache } from "react";
import { and, asc, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accountMembers,
  accounts,
  appzoneAcquisitions,
  appzoneItems,
  invitations,
  memberPermissions,
  planApps,
  plans,
  purchases,
  subscriptions,
  type Permission,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { GB, isPlanId, type PlanId } from "@/lib/plans";
import {
  decideAcquisition,
  effectivePermissions,
  ENTITLING_STATUSES,
  hasFreeSeat,
  type EntitledPlan,
} from "@/lib/entitlements";

const log = logger.child({ module: "entitlements" });

type UserRef = { id: string };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------- plans

// Plans change only through migrations, so a short in-memory cache is safe and saves a query on
// every request. IMPORTANT: inside a transaction, pass `tx` so loading never takes a second pool
// connection (that deadlocks the pool under concurrent requests).
const PLAN_CACHE_MS = 60_000;
let planCache: { at: number; plans: EntitledPlan[] } | undefined;

async function loadPlans(exec: Tx | typeof db = db): Promise<EntitledPlan[]> {
  if (planCache && Date.now() - planCache.at < PLAN_CACHE_MS) return planCache.plans;
  const rows = await exec.select().from(plans).orderBy(asc(plans.sortOrder));
  const apps = await exec.select().from(planApps);
  const loaded = rows.map((p) => {
    if (!isPlanId(p.id)) throw new Error(`Unknown plan id in database: ${p.id}`);
    return {
      id: p.id,
      name: p.name,
      storageBytes: p.storageBytes,
      storageGb: Math.round(p.storageBytes / GB),
      teamMemberLimit: p.teamMemberLimit,
      freeAppzoneDownloadLimit: p.freeAppzoneDownloadLimit,
      includedApps: apps.filter((a) => a.planId === p.id).map((a) => a.appSlug),
      isPaid: p.isPaid,
    } satisfies EntitledPlan;
  });
  planCache = { at: Date.now(), plans: loaded };
  return loaded;
}

/** All plans with their included apps, ordered for display. */
export async function listPlans(): Promise<EntitledPlan[]> {
  return loadPlans();
}

async function getPlan(id: PlanId, exec: Tx | typeof db = db): Promise<EntitledPlan> {
  const plan = (await loadPlans(exec)).find((p) => p.id === id);
  if (!plan) throw new Error(`Plan ${id} missing from database`);
  return plan;
}

/** The plan an account is entitled to right now. */
export async function planForAccount(accountId: string, tx: Tx | typeof db = db): Promise<PlanId> {
  const [sub] = await tx
    .select({ planId: subscriptions.planId })
    .from(subscriptions)
    .where(and(eq(subscriptions.accountId, accountId), inArray(subscriptions.status, [...ENTITLING_STATUSES])))
    .limit(1);
  return sub && isPlanId(sub.planId) ? sub.planId : "free";
}

// ---------------------------------------------------------------- the user's entitlements

export type Entitlements = {
  accountId: string;
  role: "owner" | "member";
  isTeamMember: boolean;
  plan: EntitledPlan;
  permissions: ReadonlySet<Permission>;
  can: (permission: Permission) => boolean;
  canManageBilling: boolean;
  canManageMembers: boolean;
  canManageApps: boolean;
  canPermanentlyDelete: boolean;
  hasApp: (slug: string) => boolean;
};

/** Everything the signed-in user may use. Cached per request. */
export const getEntitlements = cache(async (user: UserRef): Promise<Entitlements> => {
  const [membership] = await db
    .select({ memberId: accountMembers.id, accountId: accountMembers.accountId, role: accountMembers.role })
    .from(accountMembers)
    .where(eq(accountMembers.userId, user.id));
  if (!membership) throw new Error(`User ${user.id} has no account membership`);

  const [planId, granted] = await Promise.all([
    planForAccount(membership.accountId),
    membership.role === "owner"
      ? Promise.resolve([] as Permission[])
      : db
          .select({ permission: memberPermissions.permission })
          .from(memberPermissions)
          .where(eq(memberPermissions.memberId, membership.memberId))
          .then((rows) => rows.map((r) => r.permission)),
  ]);
  const plan = await getPlan(planId);
  const permissions = effectivePermissions(membership.role, granted);
  const isOwner = membership.role === "owner";

  return {
    accountId: membership.accountId,
    role: membership.role,
    isTeamMember: !isOwner,
    plan,
    permissions,
    can: (p) => permissions.has(p),
    canManageBilling: isOwner,
    canManageMembers: isOwner,
    canManageApps: isOwner,
    canPermanentlyDelete: isOwner,
    hasApp: (slug) => plan.includedApps.includes(slug),
  };
});

// ---------------------------------------------------------------- assertions

export async function assertPermission(user: UserRef, permission: Permission) {
  const ent = await getEntitlements(user);
  if (!ent.can(permission)) throw new AppError("FORBIDDEN", "You don't have permission to do that. Ask your account host.");
  return ent;
}

export async function assertOwner(user: UserRef) {
  const ent = await getEntitlements(user);
  if (ent.role !== "owner") throw new AppError("FORBIDDEN", "Only the account host can do that.");
  return ent;
}

export async function assertAppIncluded(user: UserRef, slug: string) {
  const ent = await getEntitlements(user);
  if (!ent.hasApp(slug)) throw new AppError("PLAN_LIMIT", "That app isn't included in your plan. Upgrade to use it.");
  return ent;
}

// ---------------------------------------------------------------- usage

export async function getUsage(accountId: string) {
  const [[account], [{ members }], [{ openInvites }], [{ freeDownloads }]] = await Promise.all([
    db.select({ used: accounts.storageUsedBytes }).from(accounts).where(eq(accounts.id, accountId)),
    db.select({ members: count() }).from(accountMembers).where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.role, "member"))),
    db.select({ openInvites: count() }).from(invitations).where(openInvitationsFor(accountId)),
    db.select({ freeDownloads: count() }).from(appzoneAcquisitions).where(and(eq(appzoneAcquisitions.accountId, accountId), eq(appzoneAcquisitions.countsTowardFreeLimit, true))),
  ]);
  return { storageUsedBytes: account?.used ?? 0, teamMembers: members, openInvitations: openInvites, freeDownloadsUsed: freeDownloads };
}

function openInvitationsFor(accountId: string) {
  return and(eq(invitations.accountId, accountId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, sql`now()`));
}

/** Locks the account row for the rest of the transaction, serializing limit checks per account. */
async function lockAccount(tx: Tx, accountId: string) {
  await tx.execute(sql`select 1 from ${accounts} where ${accounts.id} = ${accountId} for update`);
}

// ---------------------------------------------------------------- storage quota

/**
 * Reserve quota before uploading `bytes`. A single conditional UPDATE, so two uploads at once can't
 * both squeeze past the limit. Call releaseStorage() if the upload is abandoned.
 */
export async function reserveStorage(user: UserRef, bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new AppError("VALIDATION", "Invalid file size.");
  const ent = await assertPermission(user, "storage.upload");
  const rows = await db
    .update(accounts)
    .set({ storageUsedBytes: sql`${accounts.storageUsedBytes} + ${bytes}`, updatedAt: new Date() })
    .where(and(eq(accounts.id, ent.accountId), sql`${accounts.storageUsedBytes} + ${bytes} <= ${ent.plan.storageBytes}`))
    .returning({ used: accounts.storageUsedBytes });
  if (rows.length === 0) {
    throw new AppError("PLAN_LIMIT", `Not enough storage. Your ${ent.plan.name} plan includes ${ent.plan.storageGb} GB.`);
  }
  return { accountId: ent.accountId, usedBytes: rows[0].used };
}

/** Return quota after a file is permanently deleted or an upload is abandoned. Never below zero. */
export async function releaseStorage(accountId: string, bytes: number, tx: Tx | typeof db = db) {
  await tx
    .update(accounts)
    .set({ storageUsedBytes: sql`greatest(0, ${accounts.storageUsedBytes} - ${bytes})`, updatedAt: new Date() })
    .where(eq(accounts.id, accountId));
}

// ---------------------------------------------------------------- team seats

/**
 * Checks the host may invite one more person, inside the caller's transaction with the account
 * locked, so two invitations sent at once can't exceed the plan's team size.
 */
export async function assertSeatAvailable(tx: Tx, accountId: string) {
  await lockAccount(tx, accountId);
  const plan = await getPlan(await planForAccount(accountId, tx), tx);
  const [{ members }] = await tx
    .select({ members: count() })
    .from(accountMembers)
    .where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.role, "member")));
  const [{ openInvites }] = await tx.select({ openInvites: count() }).from(invitations).where(openInvitationsFor(accountId));
  if (!hasFreeSeat(members, openInvites, plan.teamMemberLimit)) {
    throw new AppError(
      "PLAN_LIMIT",
      plan.teamMemberLimit === 0
        ? `The ${plan.name} plan doesn't include team members. Upgrade to invite your team.`
        : `Your ${plan.name} plan includes up to ${plan.teamMemberLimit} team member${plan.teamMemberLimit === 1 ? "" : "s"}, counting pending invitations.`,
    );
  }
  return plan;
}

// ---------------------------------------------------------------- AppZone

/**
 * Give the user's account an AppZone item (the "download"). Enforces, atomically:
 *  - permission appzone.install;
 *  - item must be published;
 *  - paid items need a completed purchase;
 *  - free items: unlimited on paid plans, LIFETIME limit (10) on Free. Ownership is permanent,
 *    so uninstalling never gives a download back.
 * Idempotent: acquiring something already owned returns the existing record.
 */
export async function acquireAppzoneItem(user: UserRef, itemId: string) {
  const ent = await assertPermission(user, "appzone.install");
  return db.transaction(async (tx) => {
    await lockAccount(tx, ent.accountId);

    const [existing] = await tx
      .select()
      .from(appzoneAcquisitions)
      .where(and(eq(appzoneAcquisitions.accountId, ent.accountId), eq(appzoneAcquisitions.itemId, itemId)));
    if (existing) return { acquisition: existing, created: false };

    const [item] = await tx.select().from(appzoneItems).where(eq(appzoneItems.id, itemId));
    if (!item || item.status !== "published") throw new AppError("NOT_FOUND", "That item isn't available.");

    const plan = await getPlan(await planForAccount(ent.accountId, tx), tx);
    const [{ used }] = await tx
      .select({ used: count() })
      .from(appzoneAcquisitions)
      .where(and(eq(appzoneAcquisitions.accountId, ent.accountId), eq(appzoneAcquisitions.countsTowardFreeLimit, true)));
    const [purchase] = await tx
      .select({ id: purchases.id })
      .from(purchases)
      .where(and(eq(purchases.accountId, ent.accountId), eq(purchases.itemId, itemId), eq(purchases.status, "paid")));

    const decision = decideAcquisition({
      priceCents: item.priceCents,
      hasPaidPurchase: Boolean(purchase),
      freeLimit: plan.freeAppzoneDownloadLimit,
      freeDownloadsUsed: used,
    });
    if (!decision.ok) {
      throw decision.reason === "needs_purchase"
        ? new AppError("PLAN_LIMIT", "This is a paid item. Buy it to add it to your workspace.")
        : new AppError("PLAN_LIMIT", `The ${plan.name} plan includes ${plan.freeAppzoneDownloadLimit} free AppZone downloads in total, and you've used them all. Upgrade for unlimited free items.`);
    }

    const [acquisition] = await tx
      .insert(appzoneAcquisitions)
      .values({
        accountId: ent.accountId,
        itemId,
        acquiredBy: user.id,
        source: item.priceCents > 0 ? "purchase" : "free_download",
        purchaseId: purchase?.id ?? null,
        countsTowardFreeLimit: decision.countsTowardFreeLimit,
      })
      .returning();
    log.info("appzone.acquired", { accountId: ent.accountId, itemId, counts: decision.countsTowardFreeLimit });
    return { acquisition, created: true };
  });
}
