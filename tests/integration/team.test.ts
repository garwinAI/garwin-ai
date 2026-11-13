import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accountMembers, auditLogs, invitations, notifications, sessions, storageObjects, subscriptions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { hashToken } from "@/lib/security/tokens";
import { createUser, markEmailVerified, findUserById } from "@/server/services/users";
import { createSession } from "@/server/services/sessions";
import { getEntitlements, reserveStorage } from "@/server/services/entitlements";
import {
  acceptInvitation,
  inviteMember,
  leaveTeam,
  listTeam,
  previewInvitation,
  removeMember,
  resendInvitation,
  revokeInvitation,
  setMemberPermissions,
  switchWorkspace,
} from "@/server/services/team";
import { createFolder, deletePermanently, listFolder, listMarkedForDeletion, markForDeletion, unmarkForDeletion } from "@/server/services/storage";
import { getThread, listConversations, openDirectConversation, sendMessage } from "@/server/services/messaging";
import { freshMeta, mailsTo, uniqueEmail } from "./helpers";

const meta = freshMeta;

async function makeHost(plan: "free" | "starter" | "plus" | "pro" = "starter") {
  const user = await createUser({ name: "Hana Host", email: uniqueEmail("host"), passwordHash: "x" });
  const [m] = await db.select().from(accountMembers).where(eq(accountMembers.userId, user.id));
  if (plan !== "free") await db.insert(subscriptions).values({ accountId: m.accountId, planId: plan, source: "admin", status: "active" });
  return { ...user, accountId: m.accountId };
}

async function makePerson(tag = "p") {
  const user = await createUser({ name: `Person ${tag}`, email: uniqueEmail(tag), passwordHash: "x" });
  const [m] = await db.select().from(accountMembers).where(eq(accountMembers.userId, user.id));
  return { ...user, ownAccountId: m.accountId };
}

function inviteToken(to: string): string {
  const mail = mailsTo(to).filter((m) => m.tag === "team_invite").at(-1);
  const token = mail?.text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
  if (!token) throw new Error(`no invite for ${to}`);
  return token;
}

/** Invites `person` by email to `host`'s team and accepts; returns the member as an actor in the host's account. */
async function join(host: { id: string; accountId: string }, person: { id: string; email: string }, permissions: string[] = []) {
  await inviteMember(host, { channel: "email", email: person.email, permissions }, meta());
  await acceptInvitation(person, inviteToken(person.email), null, meta());
  const [m] = await db.select().from(accountMembers).where(and(eq(accountMembers.accountId, host.accountId), eq(accountMembers.userId, person.id)));
  return { id: person.id, accountId: host.accountId, memberId: m.id };
}

async function expectAppError(p: Promise<unknown>, code: AppError["code"], msg?: RegExp) {
  const err = await p.then(() => null, (e) => e);
  expect(err, "expected AppError " + code).toBeInstanceOf(AppError);
  expect(err.code).toBe(code);
  if (msg) expect(err.publicMessage).toMatch(msg);
}

// ---------------------------------------------------------------- invitations

describe("inviting", () => {
  it("Free hosts can't invite anyone", async () => {
    const host = await makeHost("free");
    await expectAppError(inviteMember(host, { channel: "email", email: uniqueEmail("x"), permissions: [] }, meta()), "PLAN_LIMIT", /doesn't include team members/);
  });

  it.each([
    ["starter", 1],
    ["plus", 3],
    ["pro", 10],
  ] as const)("%s hosts can invite %d", async (plan, seats) => {
    const host = await makeHost(plan);
    for (let i = 0; i < seats; i++) await inviteMember(host, { channel: "email", email: uniqueEmail("seat"), permissions: [] }, meta());
    await expectAppError(inviteMember(host, { channel: "email", email: uniqueEmail("seat"), permissions: [] }, meta()), "PLAN_LIMIT");
  });

  it("only the host can invite", async () => {
    const host = await makeHost("plus");
    const member = await join(host, await makePerson("m"), ["messages.use"]);
    await expectAppError(inviteMember(member, { channel: "email", email: uniqueEmail("x"), permissions: [] }, meta()), "FORBIDDEN");
  });

  it("stores only a hash of the token, which expires in 7 days", async () => {
    const host = await makeHost();
    const email = uniqueEmail("hash");
    const inv = await inviteMember(host, { channel: "email", email, permissions: [] }, meta());
    const token = inviteToken(email);
    expect(inv.tokenHash).toBe(hashToken(token));
    expect(inv.tokenHash).not.toContain(token);
    const days = (inv.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("rejects unknown permissions, self-invites and duplicates", async () => {
    const host = await makeHost("pro");
    await expectAppError(inviteMember(host, { channel: "email", email: uniqueEmail("x"), permissions: ["billing.manage"] }, meta()), "VALIDATION");
    await expectAppError(inviteMember(host, { channel: "email", email: host.email, permissions: [] }, meta()), "VALIDATION");
    const email = uniqueEmail("dup");
    await inviteMember(host, { channel: "email", email, permissions: [] }, meta());
    await expectAppError(inviteMember(host, { channel: "email", email, permissions: [] }, meta()), "CONFLICT");
  });

  it("sends SMS invitations to E.164 numbers", async () => {
    const host = await makeHost();
    const phone = `+1555${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    await inviteMember(host, { channel: "sms", phone, permissions: ["messages.use"] }, meta());
    const sms = mailsTo(phone).at(-1);
    expect(sms?.text).toMatch(/invited you to their Garwin AI team/);
    expect(sms?.text).toMatch(/#token=[A-Za-z0-9_-]{43}/);
  });

  it("revoked and resent invitations: old links stop working", async () => {
    const host = await makeHost("plus");
    const person = await makePerson("r");
    const inv = await inviteMember(host, { channel: "email", email: person.email, permissions: [] }, meta());
    const first = inviteToken(person.email);
    await resendInvitation(host, inv.id, meta());
    const second = inviteToken(person.email);
    expect(second).not.toBe(first);
    await expectAppError(acceptInvitation(person, first, null, meta()), "NOT_FOUND");
    await revokeInvitation(host, inv.id, meta());
    await expectAppError(acceptInvitation(person, second, null, meta()), "NOT_FOUND");
  });

  it("a host can't revoke another host's invitation", async () => {
    const a = await makeHost();
    const b = await makeHost();
    const inv = await inviteMember(a, { channel: "email", email: uniqueEmail("x"), permissions: [] }, meta());
    await expectAppError(revokeInvitation(b, inv.id, meta()), "NOT_FOUND");
  });
});

// ---------------------------------------------------------------- accepting

describe("accepting", () => {
  it("joins the host's team, keeps their own workspace, copies permissions, verifies email and notifies the host", async () => {
    const host = await makeHost("starter");
    const person = await makePerson("j");
    await inviteMember(host, { channel: "email", email: person.email, permissions: ["storage.view", "messages.use"] }, meta());
    const token = inviteToken(person.email);
    expect(await previewInvitation(token)).toMatchObject({ workspace: expect.stringContaining("Hana Host"), hostName: "Hana Host" });

    await acceptInvitation(person, token, null, meta());
    const ent = await getEntitlements({ id: person.id, accountId: host.accountId });
    expect(ent).toMatchObject({ role: "member", isTeamMember: true });
    expect(ent.plan.id).toBe("starter");
    expect([...ent.permissions].sort()).toEqual(["messages.use", "storage.view"]);
    expect((await getEntitlements({ id: person.id })).accountId).toBe(person.ownAccountId);
    expect((await findUserById(person.id))!.emailVerifiedAt).not.toBeNull();
    const [n] = await db.select().from(notifications).where(eq(notifications.userId, host.id));
    expect(n.type).toBe("team.member_joined");
  });

  it("is single use", async () => {
    const host = await makeHost("plus");
    const p = await makePerson("s");
    await inviteMember(host, { channel: "email", email: p.email, permissions: [] }, meta());
    const token = inviteToken(p.email);
    await acceptInvitation(p, token, null, meta());
    await expectAppError(acceptInvitation(p, token, null, meta()), "NOT_FOUND");
  });

  it("can't be used after it expires", async () => {
    const host = await makeHost();
    const p = await makePerson("e");
    await inviteMember(host, { channel: "email", email: p.email, permissions: [] }, meta());
    const token = inviteToken(p.email);
    await db.update(invitations).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(invitations.tokenHash, hashToken(token)));
    await expectAppError(acceptInvitation(p, token, null, meta()), "NOT_FOUND");
    expect(await previewInvitation(token)).toBeNull();
  });

  it("email invitations only work for that email address", async () => {
    const host = await makeHost();
    const invited = await makePerson("inv");
    const stranger = await makePerson("str");
    await inviteMember(host, { channel: "email", email: invited.email, permissions: [] }, meta());
    await expectAppError(acceptInvitation(stranger, inviteToken(invited.email), null, meta()), "FORBIDDEN", /Sign in with that email/);
  });

  it("SMS invitations can be accepted by whoever holds the link", async () => {
    const host = await makeHost();
    const phone = `+1555${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    await inviteMember(host, { channel: "sms", phone, permissions: [] }, meta());
    const token = mailsTo(phone).at(-1)!.text.match(/#token=([A-Za-z0-9_-]{43})/)![1];
    const p = await makePerson("sms");
    await acceptInvitation(p, token, null, meta());
    expect((await getEntitlements({ id: p.id, accountId: host.accountId })).isTeamMember).toBe(true);
  });

  it("is refused if the host downgraded and the team is now full", async () => {
    const host = await makeHost("plus");
    const p1 = await makePerson("d1");
    const p2 = await makePerson("d2");
    await join(host, p1);
    await inviteMember(host, { channel: "email", email: p2.email, permissions: [] }, meta());
    await db.update(subscriptions).set({ status: "canceled" }).where(eq(subscriptions.accountId, host.accountId));
    await db.insert(subscriptions).values({ accountId: host.accountId, planId: "starter", source: "admin", status: "active" });
    await expectAppError(acceptInvitation(p2, inviteToken(p2.email), null, meta()), "PLAN_LIMIT", /team is full/);
  });

  it("switches the accepting session to the host's workspace", async () => {
    const host = await makeHost();
    const p = await makePerson("sw");
    const { session } = await createSession(p.id, meta());
    await inviteMember(host, { channel: "email", email: p.email, permissions: [] }, meta());
    await acceptInvitation(p, inviteToken(p.email), session.id, meta());
    const [s] = await db.select().from(sessions).where(eq(sessions.id, session.id));
    expect(s.activeAccountId).toBe(host.accountId);
  });

  it("garbage tokens are rejected without touching other invitations", async () => {
    const p = await makePerson("g");
    await expectAppError(acceptInvitation(p, "x".repeat(43), null, meta()), "NOT_FOUND");
    await expectAppError(acceptInvitation(p, "<script>", null, meta()), "NOT_FOUND");
  });
});

// ---------------------------------------------------------------- managing the team

describe("managing members", () => {
  it("host sets permissions individually; changes apply immediately", async () => {
    const host = await makeHost("plus");
    const a = await join(host, await makePerson("a"), ["storage.view"]);
    const b = await join(host, await makePerson("b"), ["storage.view"]);
    await setMemberPermissions(host, a.memberId, ["storage.view", "storage.upload"], meta());
    expect((await getEntitlements(a)).can("storage.upload")).toBe(true);
    expect((await getEntitlements(b)).can("storage.upload")).toBe(false);
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.accountId, host.accountId), eq(auditLogs.action, "member.permissions_changed")));
    expect(log.targetId).toBe(a.memberId);
  });

  it("members can't change permissions, remove people or see pending invitation contacts", async () => {
    const host = await makeHost("plus");
    const a = await join(host, await makePerson("a"), ["messages.use"]);
    const b = await join(host, await makePerson("b"));
    await inviteMember(host, { channel: "email", email: uniqueEmail("pending"), permissions: [] }, meta());
    await expectAppError(setMemberPermissions(a, b.memberId, ["storage.upload"], meta()), "FORBIDDEN");
    await expectAppError(setMemberPermissions(a, a.memberId, ["storage.upload"], meta()), "FORBIDDEN");
    await expectAppError(removeMember(a, b.memberId, meta()), "FORBIDDEN");
    const view = await listTeam(a);
    expect(view.isHost).toBe(false);
    expect(view.pending).toEqual([]);
  });

  it("a host can't manage another account's members", async () => {
    const hostA = await makeHost("plus");
    const hostB = await makeHost("plus");
    const memberOfA = await join(hostA, await makePerson("x"));
    await expectAppError(setMemberPermissions(hostB, memberOfA.memberId, ["storage.upload"], meta()), "NOT_FOUND");
    await expectAppError(removeMember(hostB, memberOfA.memberId, meta()), "NOT_FOUND");
  });

  it("removed members lose access at once and are told", async () => {
    const host = await makeHost("plus");
    const person = await makePerson("rm");
    const m = await join(host, person, ["storage.view"]);
    await removeMember(host, m.memberId, meta());
    await expectAppError(getEntitlements(m), "FORBIDDEN");
    await expectAppError(listFolder(m, null), "FORBIDDEN");
    expect((await getEntitlements({ id: person.id })).accountId).toBe(person.ownAccountId);
    const [n] = await db.select().from(notifications).where(eq(notifications.userId, person.id));
    expect(n.type).toBe("team.removed");
  });

  it("members can leave; hosts can't leave their own workspace", async () => {
    const host = await makeHost();
    const m = await join(host, await makePerson("l"));
    await leaveTeam(m, host.accountId, meta());
    await expectAppError(getEntitlements(m), "FORBIDDEN");
    await expectAppError(leaveTeam(host, host.accountId, meta()), "VALIDATION");
  });

  it("can't switch into a workspace you don't belong to", async () => {
    const host = await makeHost();
    const outsider = await makePerson("o");
    const { session } = await createSession(outsider.id, meta());
    await expectAppError(switchWorkspace(outsider.id, session.id, host.accountId), "NOT_FOUND");
  });
});

// ---------------------------------------------------------------- shared storage

describe("shared storage", () => {
  it("host and team share the host's quota", async () => {
    const host = await makeHost("starter");
    const m = await join(host, await makePerson("q"), ["storage.upload"]);
    await reserveStorage(host, 19 * 1024 ** 3);
    await expectAppError(reserveStorage(m, 2 * 1024 ** 3), "PLAN_LIMIT");
  });

  it("members can mark for deletion but never delete permanently; the host can", async () => {
    const host = await makeHost("plus");
    const m = await join(host, await makePerson("del"), ["storage.view", "storage.upload", "storage.mark_for_deletion"]);
    const folder = await createFolder(m, null, "Reports", meta());

    await expectAppError(deletePermanently(m, folder.id, meta()), "FORBIDDEN", /Only the host/);
    await markForDeletion(m, folder.id, meta());
    expect((await listMarkedForDeletion(host)).map((o) => o.id)).toContain(folder.id);
    const [n] = await db.select().from(notifications).where(and(eq(notifications.userId, host.id), eq(notifications.type, "storage.marked")));
    expect(n).toBeTruthy();

    await expectAppError(deletePermanently(m, folder.id, meta()), "FORBIDDEN");
    await deletePermanently(host, folder.id, meta());
    expect(await db.select().from(storageObjects).where(eq(storageObjects.id, folder.id))).toHaveLength(0);
  });

  it("deleting a folder deletes its contents and returns their bytes to the quota", async () => {
    const host = await makeHost("starter");
    const parent = await createFolder(host, null, "Big", meta());
    await reserveStorage(host, 5000);
    await db.insert(storageObjects).values({ accountId: host.accountId, parentId: parent.id, kind: "file", name: "a.bin", sizeBytes: 5000, storageKey: `k-${Math.random()}` });
    await deletePermanently(host, parent.id, meta());
    const [{ used }] = (await db.execute<{ used: string }>(sql`select storage_used_bytes::text as used from accounts where id = ${host.accountId}`)).rows;
    expect(Number(used)).toBe(0);
  });

  it("only the host or the person who marked an item can unmark it", async () => {
    const host = await makeHost("plus");
    const a = await join(host, await makePerson("ua"), ["storage.view", "storage.upload", "storage.mark_for_deletion"]);
    const b = await join(host, await makePerson("ub"), ["storage.view", "storage.mark_for_deletion"]);
    const f = await createFolder(a, null, "Drafts", meta());
    await markForDeletion(a, f.id, meta());
    await expectAppError(unmarkForDeletion(b, f.id, meta()), "FORBIDDEN");
    await unmarkForDeletion(a, f.id, meta());
    await markForDeletion(a, f.id, meta());
    await unmarkForDeletion(host, f.id, meta());
  });

  it("permissions are enforced per action", async () => {
    const host = await makeHost("plus");
    const viewer = await join(host, await makePerson("v"), ["storage.view"]);
    const f = await createFolder(host, null, "Shared", meta());
    expect((await listFolder(viewer, null)).items.map((i) => i.name)).toContain("Shared");
    await expectAppError(createFolder(viewer, null, "Nope", meta()), "FORBIDDEN");
    await expectAppError(markForDeletion(viewer, f.id, meta()), "FORBIDDEN");
    const none = await join(host, await makePerson("n"), []);
    await expectAppError(listFolder(none, null), "FORBIDDEN");
  });

  it("no access to another account's storage, even with a valid id", async () => {
    const hostA = await makeHost();
    const hostB = await makeHost();
    const secret = await createFolder(hostA, null, "Secret", meta());
    await expectAppError(listFolder(hostB, secret.id), "NOT_FOUND");
    await expectAppError(markForDeletion(hostB, secret.id, meta()), "NOT_FOUND");
    await expectAppError(deletePermanently(hostB, secret.id, meta()), "NOT_FOUND");
    await expectAppError(createFolder(hostB, secret.id, "Sneaky", meta()), "NOT_FOUND");
    expect((await listFolder(hostB, null)).items.map((i) => i.id)).not.toContain(secret.id);
  });

  it("a member's own workspace and the host's workspace stay separate", async () => {
    const host = await makeHost();
    const person = await makePerson("sep");
    const asMember = await join(host, person, ["storage.view", "storage.upload"]);
    await createFolder({ id: person.id }, null, "Personal", meta());
    await createFolder(asMember, null, "Team stuff", meta());
    expect((await listFolder(host, null)).items.map((i) => i.name)).toEqual(["Team stuff"]);
    expect((await listFolder({ id: person.id }, null)).items.map((i) => i.name)).toEqual(["Personal"]);
  });

  it("rejects bad names", async () => {
    const host = await makeHost();
    await expectAppError(createFolder(host, null, "a/b", meta()), "VALIDATION");
    await expectAppError(createFolder(host, null, "   ", meta()), "VALIDATION");
    await createFolder(host, null, "Same", meta());
    await expectAppError(createFolder(host, null, "same", meta()), "CONFLICT");
  });
});

// ---------------------------------------------------------------- messaging

describe("host and team messaging", () => {
  it("host and members share a team chat and get notified", async () => {
    const host = await makeHost("plus");
    const m = await join(host, await makePerson("chat"), ["messages.use"]);
    const [team] = await listConversations(host);
    expect(team.isTeam).toBe(true);
    await sendMessage(host, team.id, "Welcome aboard!");
    const memberView = await listConversations(m);
    expect(memberView.find((c) => c.isTeam)?.unread).toBe(1);
    const thread = await getThread(m, team.id);
    expect(thread.messages.map((x) => x.body)).toEqual(["Welcome aboard!"]);
    expect((await listConversations(m)).find((c) => c.isTeam)?.unread).toBe(0);
    const [n] = await db.select().from(notifications).where(and(eq(notifications.userId, m.id), eq(notifications.type, "message.new")));
    expect(n.body).toBe("Welcome aboard!");
  });

  it("one-to-one threads are private to the two people", async () => {
    const host = await makeHost("plus");
    const a = await join(host, await makePerson("dm-a"), ["messages.use"]);
    const b = await join(host, await makePerson("dm-b"), ["messages.use"]);
    const dm = await openDirectConversation(host, a.id);
    expect((await openDirectConversation(a, host.id)).id).toBe(dm.id); // same thread both ways
    await sendMessage(a, dm.id, "Private question");
    await expectAppError(getThread(b, dm.id), "NOT_FOUND");
    await expectAppError(sendMessage(b, dm.id, "eavesdrop"), "NOT_FOUND");
    expect((await listConversations(b)).map((c) => c.id)).not.toContain(dm.id);
  });

  it("members need messages.use", async () => {
    const host = await makeHost("plus");
    const m = await join(host, await makePerson("nomsg"), ["storage.view"]);
    await expectAppError(listConversations(m), "FORBIDDEN");
  });

  it("can't read or post in another account's conversations or DM outsiders", async () => {
    const hostA = await makeHost();
    const hostB = await makeHost();
    const [teamA] = await listConversations(hostA);
    await expectAppError(getThread(hostB, teamA.id), "NOT_FOUND");
    await expectAppError(sendMessage(hostB, teamA.id, "hi"), "NOT_FOUND");
    await expectAppError(openDirectConversation(hostB, hostA.id), "NOT_FOUND");
  });

  it("removed members can't read the team chat or receive previews", async () => {
    const host = await makeHost("plus");
    const person = await makePerson("gone");
    const m = await join(host, person, ["messages.use"]);
    const [team] = await listConversations(host);
    await removeMember(host, m.memberId, meta());
    await sendMessage(host, team.id, "After you left");
    await expectAppError(getThread(m, team.id), "FORBIDDEN");
    const previews = await db.select().from(notifications).where(and(eq(notifications.userId, person.id), eq(notifications.type, "message.new")));
    expect(previews).toHaveLength(0);
  });

  it("validates message length", async () => {
    const host = await makeHost();
    const [team] = await listConversations(host);
    await expectAppError(sendMessage(host, team.id, "   "), "VALIDATION");
    await expectAppError(sendMessage(host, team.id, "x".repeat(5001)), "VALIDATION");
  });
});

describe("verification side effect", () => {
  it("markEmailVerified is idempotent", async () => {
    const p = await makePerson("v");
    await markEmailVerified(p.id);
    const first = (await findUserById(p.id))!.emailVerifiedAt;
    await markEmailVerified(p.id);
    expect((await findUserById(p.id))!.emailVerifiedAt).toEqual(first);
  });
});
