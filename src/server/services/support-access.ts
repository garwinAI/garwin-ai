// Remote view: an Admin asks to see a user's account, the user accepts or denies in a pop-up, and
// the Admin then gets READ-ONLY access for a limited time. Both sides see a banner, either can end
// it, and every request, decision and page viewed is written to the audit log (and Console).
// Never impersonation: the Admin stays signed in as themselves and nothing can be changed.
import "server-only";
import { and, asc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, supportAccessGrants, supportAccessGrantScopes, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { REMOTE_VIEW_MINUTES, REMOTE_VIEW_SCOPES, type RemoteViewSection } from "@/lib/remote-view";
import { recordAudit } from "./audit";
import { assertAdmin } from "./admin-users";
import { notify } from "./notifications";
import type { RequestMeta } from "./security-events";

type Actor = { id: string; role: string; name: string };

const otherAdminMessage = "That remote view session doesn't exist or has ended.";

/** Marks approved grants past their end time as expired (cheap, runs before reads). */
async function expireOldGrants() {
  await db
    .update(supportAccessGrants)
    .set({ status: "expired" })
    .where(and(eq(supportAccessGrants.status, "approved"), lte(supportAccessGrants.expiresAt, sql`now()`)));
}

/** Admin asks to view `userId`'s own workspace. Returns the (new or existing open) request. */
export async function requestRemoteView(admin: Actor, userId: string, reason: string, meta?: RequestMeta) {
  assertAdmin(admin);
  if (userId === admin.id) throw new AppError("CONFLICT", "You can't remote view your own account.");
  const trimmed = reason.trim();
  if (trimmed.length < 10 || trimmed.length > 1000) throw new AppError("VALIDATION", "Give a reason of at least 10 characters.");
  await expireOldGrants();

  const [target] = await db
    .select({ id: users.id, name: users.name, status: users.status, accountId: accounts.id })
    .from(users)
    .innerJoin(accounts, eq(accounts.ownerUserId, users.id))
    .where(eq(users.id, userId));
  if (!target) throw new AppError("NOT_FOUND", "That user doesn't exist.");

  const [open] = await db
    .select()
    .from(supportAccessGrants)
    .where(
      and(
        eq(supportAccessGrants.accountId, target.accountId),
        eq(supportAccessGrants.requestedBy, admin.id),
        inArray(supportAccessGrants.status, ["requested", "approved"]),
      ),
    );
  if (open) return { grant: open, created: false };

  const grant = await db.transaction(async (tx) => {
    const [g] = await tx.insert(supportAccessGrants).values({ accountId: target.accountId, requestedBy: admin.id, reason: trimmed }).returning();
    await tx.insert(supportAccessGrantScopes).values(REMOTE_VIEW_SCOPES.map((scope) => ({ grantId: g.id, scope })));
    await recordAudit(
      {
        accountId: target.accountId,
        actorUserId: admin.id,
        actorType: "admin",
        action: "support_access.requested",
        targetType: "user",
        targetId: target.id,
        supportGrantId: g.id,
        metadata: { name: target.name },
        meta,
      },
      tx,
    );
    return g;
  });
  await notify([target.id], {
    type: "support_access.requested",
    title: `Admin ${admin.name} is requesting permission to view your account`,
    body: `Reason: ${trimmed}. If you accept, they can see (not change) your account for ${REMOTE_VIEW_MINUTES} minutes.`,
    link: "/notifications",
    data: { grantId: grant.id },
  });
  return { grant, created: true };
}

/** The oldest pending request for the user's own workspace (shown as a pop-up), if any. */
export async function pendingRequestFor(userId: string) {
  const [row] = await db
    .select({ id: supportAccessGrants.id, reason: supportAccessGrants.reason, adminName: users.name, createdAt: supportAccessGrants.createdAt })
    .from(supportAccessGrants)
    .innerJoin(accounts, eq(accounts.id, supportAccessGrants.accountId))
    .innerJoin(users, eq(users.id, supportAccessGrants.requestedBy))
    .where(and(eq(accounts.ownerUserId, userId), eq(supportAccessGrants.status, "requested")))
    .orderBy(asc(supportAccessGrants.createdAt))
    .limit(1);
  return row ?? null;
}

/** Remote view sessions currently running on the user's own workspace (shown as a banner). */
export async function activeViewsOf(userId: string) {
  await expireOldGrants();
  return db
    .select({ id: supportAccessGrants.id, adminName: users.name, expiresAt: supportAccessGrants.expiresAt })
    .from(supportAccessGrants)
    .innerJoin(accounts, eq(accounts.id, supportAccessGrants.accountId))
    .innerJoin(users, eq(users.id, supportAccessGrants.requestedBy))
    .where(and(eq(accounts.ownerUserId, userId), eq(supportAccessGrants.status, "approved"), gt(supportAccessGrants.expiresAt, sql`now()`)));
}

/** The account owner accepts or denies a request. Only the owner of that workspace can. */
export async function decideRemoteView(user: { id: string; name: string }, grantId: string, accept: boolean, meta?: RequestMeta) {
  const [g] = await db
    .select({ grant: supportAccessGrants, ownerUserId: accounts.ownerUserId })
    .from(supportAccessGrants)
    .innerJoin(accounts, eq(accounts.id, supportAccessGrants.accountId))
    .where(eq(supportAccessGrants.id, grantId));
  // Someone else's request looks exactly like a missing one.
  if (!g || g.ownerUserId !== user.id) throw new AppError("NOT_FOUND", "That request doesn't exist.");
  if (g.grant.status !== "requested") throw new AppError("CONFLICT", "That request was already answered.");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + REMOTE_VIEW_MINUTES * 60_000);
  const updated = await db
    .update(supportAccessGrants)
    .set(accept ? { status: "approved", decidedBy: user.id, decidedAt: now, expiresAt } : { status: "denied", decidedBy: user.id, decidedAt: now })
    .where(and(eq(supportAccessGrants.id, grantId), eq(supportAccessGrants.status, "requested")))
    .returning({ id: supportAccessGrants.id });
  if (updated.length === 0) throw new AppError("CONFLICT", "That request was already answered.");

  await recordAudit({
    accountId: g.grant.accountId,
    actorUserId: user.id,
    action: accept ? "support_access.approved" : "support_access.denied",
    targetType: "user",
    targetId: user.id,
    supportGrantId: grantId,
    metadata: { name: user.name },
    meta,
  });
  await notify([g.grant.requestedBy], {
    type: accept ? "support_access.approved" : "support_access.denied",
    title: accept ? `${user.name} accepted your remote view request` : `${user.name} denied your remote view request`,
    body: accept ? `You can view their account (read-only) for ${REMOTE_VIEW_MINUTES} minutes.` : "You can't view their account.",
    link: accept ? `/admin/remote/${grantId}` : "/admin",
    data: { grantId },
  });
  return accept ? expiresAt : null;
}

/** Ends a session. The Admin who requested it or the account owner may end it. */
export async function endRemoteView(actor: { id: string; name: string }, grantId: string, meta?: RequestMeta) {
  const [g] = await db
    .select({ grant: supportAccessGrants, ownerUserId: accounts.ownerUserId })
    .from(supportAccessGrants)
    .innerJoin(accounts, eq(accounts.id, supportAccessGrants.accountId))
    .where(eq(supportAccessGrants.id, grantId));
  if (!g || (g.grant.requestedBy !== actor.id && g.ownerUserId !== actor.id)) throw new AppError("NOT_FOUND", otherAdminMessage);
  if (!["requested", "approved"].includes(g.grant.status)) return;
  await db.update(supportAccessGrants).set({ status: "revoked", revokedAt: new Date() }).where(eq(supportAccessGrants.id, grantId));
  await recordAudit({
    accountId: g.grant.accountId,
    actorUserId: actor.id,
    actorType: actor.id === g.grant.requestedBy ? "admin" : "user",
    action: "support_access.ended",
    targetType: "user",
    targetId: g.ownerUserId,
    supportGrantId: grantId,
    metadata: { endedBy: actor.id === g.ownerUserId ? "user" : "admin" },
    meta,
  });
  if (actor.id === g.ownerUserId) {
    await notify([g.grant.requestedBy], { type: "support_access.ended", title: "Remote view ended by the user", body: "", link: "/admin", data: { grantId } });
  }
}

/**
 * Checks that `admin` may view `section` of the account in grant `grantId` right now, records the
 * view, and returns who is being viewed. Anything else (another Admin's grant, expired, denied,
 * not yet accepted) is NOT_FOUND.
 */
export async function openRemoteView(admin: Actor, grantId: string, section: RemoteViewSection, meta?: RequestMeta) {
  assertAdmin(admin);
  await expireOldGrants();
  const [g] = await db
    .select({ grant: supportAccessGrants, owner: { id: users.id, name: users.name, email: users.email } })
    .from(supportAccessGrants)
    .innerJoin(accounts, eq(accounts.id, supportAccessGrants.accountId))
    .innerJoin(users, eq(users.id, accounts.ownerUserId))
    .where(eq(supportAccessGrants.id, grantId));
  if (!g || g.grant.requestedBy !== admin.id) throw new AppError("NOT_FOUND", otherAdminMessage);
  if (g.grant.status === "requested") return { state: "waiting" as const, owner: g.owner };
  if (g.grant.status !== "approved") throw new AppError("NOT_FOUND", otherAdminMessage);

  const scopes = await db.select({ scope: supportAccessGrantScopes.scope }).from(supportAccessGrantScopes).where(eq(supportAccessGrantScopes.grantId, grantId));
  const needed = section === "overview" ? "account.view" : `${section}.view`;
  if (!scopes.some((s) => s.scope === needed)) throw new AppError("FORBIDDEN", "This remote view doesn't include that section.");

  await recordAudit({
    accountId: g.grant.accountId,
    actorUserId: admin.id,
    actorType: "support",
    action: "support_access.viewed",
    targetType: "user",
    targetId: g.owner.id,
    supportGrantId: grantId,
    metadata: { section, name: g.owner.name },
    meta,
  });
  return {
    state: "active" as const,
    owner: g.owner,
    accountId: g.grant.accountId,
    expiresAt: g.grant.expiresAt!,
    // The owner's identity, used ONLY with read functions of the existing services.
    actorForReads: { id: g.owner.id, accountId: g.grant.accountId },
  };
}

/** The Admin's open remote view sessions (for the Admin home widget). */
export async function myRemoteViews(admin: Actor) {
  assertAdmin(admin);
  await expireOldGrants();
  return db
    .select({ id: supportAccessGrants.id, status: supportAccessGrants.status, expiresAt: supportAccessGrants.expiresAt, userName: users.name })
    .from(supportAccessGrants)
    .innerJoin(accounts, eq(accounts.id, supportAccessGrants.accountId))
    .innerJoin(users, eq(users.id, accounts.ownerUserId))
    .where(and(eq(supportAccessGrants.requestedBy, admin.id), inArray(supportAccessGrants.status, ["requested", "approved"])));
}
