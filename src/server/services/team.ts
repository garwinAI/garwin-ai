// Team management: invitations (email/SMS), acceptance, permissions, removal, leaving, switching.
//
// Security rules (all enforced here, never only in the UI):
//  - Only the host (account owner) invites, edits permissions, removes members.
//  - Every query is scoped to the actor's CURRENT account; ids from the client are never trusted
//    on their own (cross-account access returns NOT_FOUND).
//  - Invitation tokens: 256-bit, stored as HMACs, single use (atomic consume), expire in 7 days.
//  - Email invitations can only be accepted by an account with that email address.
//  - Seats are checked with the account row locked, both when inviting and when accepting.
import "server-only";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accountMembers, accounts, invitationPermissions, invitations, memberPermissions, PERMISSIONS, sessions, users, type Permission } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { generateToken, hashToken, looksLikeToken } from "@/lib/security/tokens";
import { sendEmail } from "@/server/email/send";
import { teamInviteMessage } from "@/server/email/templates";
import { sendSms, smsAvailable } from "@/server/sms/send";
import { recordAudit } from "./audit";
import { assertOwner, assertRoomForNewMember, assertSeatAvailable, getEntitlements, resolveMembership } from "./entitlements";
import { notify } from "./notifications";
import { enforce } from "./rate-limit";
import type { RequestMeta } from "./security-events";
import { markEmailVerified } from "./users";

const log = logger.child({ module: "team" });

export const INVITE_TTL_SEC = 7 * 24 * 60 * 60;

/** Sensible starting permissions for a new team member. The host can change them any time. */
export const DEFAULT_MEMBER_PERMISSIONS: Permission[] = [
  "storage.view",
  "storage.upload",
  "storage.mark_for_deletion",
  "calendar.view",
  "calendar.edit",
  "contacts.view",
  "contacts.edit",
  "messages.use",
  "apps.use",
];

type Actor = { id: string; accountId?: string | null };

const inviteLink = (token: string) => `${env().APP_URL}/invite#token=${token}`;

function cleanPermissions(perms: readonly string[]): Permission[] {
  const allowed = new Set<string>(PERMISSIONS);
  const bad = perms.filter((p) => !allowed.has(p));
  if (bad.length) throw new AppError("VALIDATION", "Unknown permission.");
  return [...new Set(perms)] as Permission[];
}

// ---------------------------------------------------------------- reading

export async function listTeam(actor: Actor) {
  const ent = await getEntitlements(actor);
  const members = await db
    .select({ memberId: accountMembers.id, userId: users.id, name: users.name, email: users.email, role: accountMembers.role, joinedAt: accountMembers.createdAt })
    .from(accountMembers)
    .innerJoin(users, eq(users.id, accountMembers.userId))
    .where(eq(accountMembers.accountId, ent.accountId))
    .orderBy(sql`${accountMembers.role} = 'owner' desc`, asc(accountMembers.createdAt));

  const perms = await db
    .select()
    .from(memberPermissions)
    .where(inArray(memberPermissions.memberId, members.map((m) => m.memberId).concat("00000000-0000-0000-0000-000000000000")));

  // Pending invitations (with contact details) are only visible to the host.
  const pending = ent.canManageMembers
    ? await db
        .select({ id: invitations.id, channel: invitations.channel, email: invitations.email, phone: invitations.phone, expiresAt: invitations.expiresAt, createdAt: invitations.createdAt })
        .from(invitations)
        .where(and(eq(invitations.accountId, ent.accountId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, sql`now()`)))
        .orderBy(asc(invitations.createdAt))
    : [];

  return {
    accountId: ent.accountId,
    plan: ent.plan,
    isHost: ent.canManageMembers,
    seatsUsed: members.filter((m) => m.role === "member").length + pending.length,
    members: members.map((m) => ({
      ...m,
      permissions: m.role === "owner" ? [...PERMISSIONS] : perms.filter((p) => p.memberId === m.memberId).map((p) => p.permission),
    })),
    pending,
    smsAvailable: smsAvailable(),
  };
}

// ---------------------------------------------------------------- inviting

export type InviteInput = { channel: "email"; email: string; permissions: string[] } | { channel: "sms"; phone: string; permissions: string[] };

export async function inviteMember(actor: Actor, input: InviteInput, meta: RequestMeta) {
  const ent = await assertOwner(actor);
  const permissions = cleanPermissions(input.permissions);
  if (input.channel === "sms" && !smsAvailable()) throw new AppError("VALIDATION", "Text-message invitations aren't available yet. Use email.");
  await enforce(`invite:account:${ent.accountId}`, { limit: 20, windowSec: 60 * 60 }, "You've sent a lot of invitations. Try again in an hour.");

  const [host] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, actor.id));
  const [account] = await db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, ent.accountId));

  if (input.channel === "email") {
    if (input.email === host.email) throw new AppError("VALIDATION", "That's your own email address.");
    const [existing] = await db
      .select({ id: accountMembers.id })
      .from(accountMembers)
      .innerJoin(users, eq(users.id, accountMembers.userId))
      .where(and(eq(accountMembers.accountId, ent.accountId), eq(users.email, input.email)));
    if (existing) throw new AppError("CONFLICT", "That person is already on your team.");
  }

  const token = generateToken();
  const invitation = await db.transaction(async (tx) => {
    await assertSeatAvailable(tx, ent.accountId);
    const [inv] = await tx
      .insert(invitations)
      .values({
        accountId: ent.accountId,
        channel: input.channel,
        email: input.channel === "email" ? input.email : null,
        phone: input.channel === "sms" ? input.phone : null,
        tokenHash: hashToken(token),
        invitedBy: actor.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_SEC * 1000),
      })
      .onConflictDoNothing()
      .returning();
    if (!inv) throw new AppError("CONFLICT", "There's already a pending invitation for that person. Resend or cancel it instead.");
    if (permissions.length) await tx.insert(invitationPermissions).values(permissions.map((permission) => ({ invitationId: inv.id, permission })));
    await recordAudit({ accountId: ent.accountId, actorUserId: actor.id, action: "member.invited", targetType: "invitation", targetId: inv.id, metadata: { channel: input.channel, permissions }, meta }, tx);
    return inv;
  });

  await deliverInvite(invitation.channel, invitation.email ?? invitation.phone!, host.name, account.name, token);
  log.info("team.invited", { accountId: ent.accountId, invitationId: invitation.id, channel: invitation.channel });
  return invitation;
}

async function deliverInvite(channel: "email" | "sms", to: string, hostName: string, workspaceName: string, token: string) {
  if (channel === "email") {
    await sendEmail(teamInviteMessage(to, hostName, workspaceName, inviteLink(token)));
  } else {
    await sendSms({
      to,
      tag: "team_invite",
      body: `${hostName} invited you to their Garwin AI team. Accept (expires in 7 days): ${inviteLink(token)}`,
    });
  }
}

/** Sends a fresh link (the old one stops working) and restarts the 7-day clock. */
export async function resendInvitation(actor: Actor, invitationId: string, meta: RequestMeta) {
  const ent = await assertOwner(actor);
  await enforce(`invite-resend:${invitationId}`, { limit: 3, windowSec: 60 * 60 }, "You've resent this invitation several times. Try again later.");
  const token = generateToken();
  const [inv] = await db
    .update(invitations)
    .set({ tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_SEC * 1000) })
    .where(and(eq(invitations.id, invitationId), eq(invitations.accountId, ent.accountId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    .returning();
  if (!inv) throw new AppError("NOT_FOUND", "That invitation isn't pending.");
  const [host] = await db.select({ name: users.name }).from(users).where(eq(users.id, actor.id));
  const [account] = await db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, ent.accountId));
  await deliverInvite(inv.channel, inv.email ?? inv.phone!, host.name, account.name, token);
  await recordAudit({ accountId: ent.accountId, actorUserId: actor.id, action: "member.invite_resent", targetType: "invitation", targetId: inv.id, meta });
}

export async function revokeInvitation(actor: Actor, invitationId: string, meta: RequestMeta) {
  const ent = await assertOwner(actor);
  const rows = await db
    .update(invitations)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(invitations.id, invitationId), eq(invitations.accountId, ent.accountId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    .returning({ id: invitations.id });
  if (rows.length === 0) throw new AppError("NOT_FOUND", "That invitation isn't pending.");
  await recordAudit({ accountId: ent.accountId, actorUserId: actor.id, action: "member.invite_revoked", targetType: "invitation", targetId: invitationId, meta });
}

// ---------------------------------------------------------------- accepting

const openInvite = (token: string) =>
  and(eq(invitations.tokenHash, hashToken(token)), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, sql`now()`));

/** What the invite page shows before the person signs in. Reveals nothing for invalid tokens. */
export async function previewInvitation(token: unknown) {
  if (!looksLikeToken(token)) return null;
  const [row] = await db
    .select({ channel: invitations.channel, email: invitations.email, workspace: accounts.name, hostName: users.name })
    .from(invitations)
    .innerJoin(accounts, eq(accounts.id, invitations.accountId))
    .innerJoin(users, eq(users.id, accounts.ownerUserId))
    .where(openInvite(token));
  return row ?? null;
}

/**
 * Joins the signed-in user to the inviting host's team. Atomic: the token is consumed, the seat
 * re-checked with the account locked, and membership + permissions created together.
 */
export async function acceptInvitation(user: { id: string; email: string }, token: unknown, sessionId: string | null, meta: RequestMeta) {
  const invalid = new AppError("NOT_FOUND", "This invitation is invalid, expired or already used. Ask the host to send a new one.");
  if (!looksLikeToken(token)) throw invalid;

  const result = await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invitations).where(openInvite(token)).for("update");
    if (!inv) throw invalid;
    if (inv.channel === "email" && inv.email !== user.email) {
      throw new AppError("FORBIDDEN", `This invitation was sent to ${maskEmail(inv.email!)}. Sign in with that email address to accept it.`);
    }
    const [already] = await tx.select({ id: accountMembers.id }).from(accountMembers).where(and(eq(accountMembers.accountId, inv.accountId), eq(accountMembers.userId, user.id)));
    if (already) throw new AppError("CONFLICT", "You're already on this team.");

    await assertRoomForNewMember(tx, inv.accountId);
    await tx.update(invitations).set({ acceptedAt: sql`now()`, acceptedBy: user.id }).where(eq(invitations.id, inv.id));
    const [member] = await tx.insert(accountMembers).values({ accountId: inv.accountId, userId: user.id, role: "member", invitedBy: inv.invitedBy }).returning();
    const perms = await tx.select({ permission: invitationPermissions.permission }).from(invitationPermissions).where(eq(invitationPermissions.invitationId, inv.id));
    if (perms.length) await tx.insert(memberPermissions).values(perms.map((p) => ({ memberId: member.id, permission: p.permission, grantedBy: inv.invitedBy })));
    // Open the host's workspace in this session.
    if (sessionId) await tx.update(sessions).set({ activeAccountId: inv.accountId }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)));
    await recordAudit({ accountId: inv.accountId, actorUserId: user.id, action: "member.joined", targetType: "account_member", targetId: member.id, metadata: { channel: inv.channel }, meta }, tx);

    const [account] = await tx.select({ ownerUserId: accounts.ownerUserId, name: accounts.name }).from(accounts).where(eq(accounts.id, inv.accountId));
    const [joiner] = await tx.select({ name: users.name }).from(users).where(eq(users.id, user.id));
    await notify([account.ownerUserId], { type: "team.member_joined", title: `${joiner.name} joined your team`, link: "/settings/team" }, tx);
    return { accountId: inv.accountId, workspace: account.name, channel: inv.channel };
  });

  // The link arrived in this inbox, which proves the address.
  if (result.channel === "email") await markEmailVerified(user.id);
  log.info("team.joined", { accountId: result.accountId, userId: user.id });
  return result;
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

// ---------------------------------------------------------------- managing members

/** Loads a member of the actor's current account, or NOT_FOUND (also for other accounts' ids). */
async function memberInMyAccount(accountId: string, memberId: string) {
  const [m] = await db.select().from(accountMembers).where(and(eq(accountMembers.id, memberId), eq(accountMembers.accountId, accountId)));
  if (!m) throw new AppError("NOT_FOUND", "That team member doesn't exist.");
  return m;
}

export async function setMemberPermissions(actor: Actor, memberId: string, permissions: string[], meta: RequestMeta) {
  const ent = await assertOwner(actor);
  const member = await memberInMyAccount(ent.accountId, memberId);
  if (member.role === "owner") throw new AppError("VALIDATION", "The host always has full access.");
  const perms = cleanPermissions(permissions);
  await db.transaction(async (tx) => {
    await tx.delete(memberPermissions).where(eq(memberPermissions.memberId, memberId));
    if (perms.length) await tx.insert(memberPermissions).values(perms.map((permission) => ({ memberId, permission, grantedBy: actor.id })));
    await recordAudit({ accountId: ent.accountId, actorUserId: actor.id, action: "member.permissions_changed", targetType: "account_member", targetId: memberId, metadata: { permissions: perms }, meta }, tx);
  });
}

export async function removeMember(actor: Actor, memberId: string, meta: RequestMeta) {
  const ent = await assertOwner(actor);
  const member = await memberInMyAccount(ent.accountId, memberId);
  if (member.role === "owner") throw new AppError("VALIDATION", "The host can't be removed.");
  await db.transaction(async (tx) => {
    await tx.delete(accountMembers).where(eq(accountMembers.id, memberId));
    await recordAudit({ accountId: ent.accountId, actorUserId: actor.id, action: "member.removed", targetType: "user", targetId: member.userId, meta }, tx);
    await notify([member.userId], { type: "team.removed", title: "You were removed from a team", body: "You no longer have access to that workspace." }, tx);
  });
}

export async function leaveTeam(actor: Actor, accountId: string, meta: RequestMeta) {
  const membership = await resolveMembership(actor.id, accountId);
  if (!membership) throw new AppError("NOT_FOUND", "You're not on that team.");
  if (membership.role === "owner") throw new AppError("VALIDATION", "You can't leave your own workspace.");
  await db.transaction(async (tx) => {
    await tx.delete(accountMembers).where(eq(accountMembers.id, membership.memberId));
    await recordAudit({ accountId, actorUserId: actor.id, action: "member.left", targetType: "user", targetId: actor.id, meta }, tx);
    const [account] = await tx.select({ ownerUserId: accounts.ownerUserId }).from(accounts).where(eq(accounts.id, accountId));
    await notify([account.ownerUserId], { type: "team.member_left", title: "A team member left your team", link: "/settings/team" }, tx);
  });
}

/** Points this session at another workspace the user belongs to. */
export async function switchWorkspace(userId: string, sessionId: string, accountId: string) {
  const membership = await resolveMembership(userId, accountId);
  if (!membership) throw new AppError("NOT_FOUND", "You're not a member of that workspace.");
  await db.update(sessions).set({ activeAccountId: accountId }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}
