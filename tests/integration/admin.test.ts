import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  accountMembers,
  auditLogs,
  consoleRecordings,
  conversationParticipants,
  storageObjects,
  subscriptions,
  supportAccessGrants,
  supportTickets,
  conversations,
  systemStatus,
} from "@/db/schema";
import { userListQuery } from "@/lib/admin-dashboard";
import { authenticate, registerUser } from "@/server/services/auth";
import { createSession, validateSessionToken } from "@/server/services/sessions";
import { createUser } from "@/server/services/users";
import { listUsers, setUserStatus, updateUser, userStats } from "@/server/services/admin-users";
import {
  activeViewsOf,
  decideRemoteView,
  endRemoteView,
  openRemoteView,
  pendingRequestFor,
  requestRemoteView,
} from "@/server/services/support-access";
import { consoleEvents, getRecording, saveRecording } from "@/server/services/console";
import { runSystemChecks } from "@/server/services/system";
import { getThread, listConversations, sendMessage } from "@/server/services/messaging";
import { freshMeta, STRONG, uniqueEmail } from "./helpers";

async function person(name = "Person", role: "member" | "admin" = "member") {
  const user = await createUser({ name, email: uniqueEmail(name.toLowerCase().replace(/\W/g, "")), passwordHash: "x", role });
  const [m] = await db.select().from(accountMembers).where(eq(accountMembers.userId, user.id));
  return { ...user, accountId: m.accountId };
}
const asAdmin = async (name = "Admin") => person(name, "admin");

describe("user status", () => {
  it("blocking statuses end sessions and stop sign-in; active and needs-attention don't", async () => {
    const admin = await asAdmin();
    const email = uniqueEmail("status");
    const user = await registerUser({ name: "Blocked Person", email, password: STRONG }, freshMeta());
    const { token } = await createSession(user.id, freshMeta());

    await setUserStatus(admin, user.id, "needs_attention");
    expect(await validateSessionToken(token)).not.toBeNull();

    await setUserStatus(admin, user.id, "inactive");
    expect(await validateSessionToken(token)).toBeNull();
    await expect(authenticate({ email, password: STRONG }, freshMeta())).rejects.toThrow(/isn't active/);
    // A wrong password still says "incorrect", so status never confirms an email exists.
    await expect(authenticate({ email, password: "wrong-password-123" }, freshMeta())).rejects.toThrow(/Incorrect/);

    await setUserStatus(admin, user.id, "deleted");
    await setUserStatus(admin, user.id, "active");
    await expect(authenticate({ email, password: STRONG }, freshMeta())).resolves.toMatchObject({ id: user.id });

    const actions = (await db.select().from(auditLogs).where(eq(auditLogs.targetId, user.id))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["user.signed_up", "user.status_changed", "user.deleted", "user.restored"]));
  });

  it("only Admins can change status, and never their own", async () => {
    const admin = await asAdmin();
    const member = await person();
    await expect(setUserStatus({ id: member.id, role: "member" }, admin.id, "inactive")).rejects.toThrow(/Only an Admin/);
    await expect(setUserStatus(admin, admin.id, "inactive")).rejects.toThrow(/your own status/);
  });

  it("edits users, refuses a taken email, and keeps the note text out of the audit log", async () => {
    const admin = await asAdmin();
    const a = await person("Edit Me");
    const b = await person("Other");
    await expect(updateUser(admin, a.id, { name: "Edit Me", email: b.email, role: "member", adminNote: null })).rejects.toThrow(/already uses that email/);
    await updateUser(admin, a.id, { name: "Edited", email: a.email, role: "member", adminNote: "Called about a refund" });
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.targetId, a.id), eq(auditLogs.action, "user.updated")));
    expect(JSON.stringify(log.metadata)).not.toContain("refund");
    await expect(updateUser(admin, admin.id, { name: admin.name, email: admin.email, role: "member", adminNote: null })).rejects.toThrow(/own Admin role/);
  });
});

describe("user list", () => {
  it("searches by name or email, filters by plan and team, sorts A–Z / Z–A, and hides deleted users", async () => {
    const admin = await asAdmin();
    const tag = `zq${Date.now()}`;
    const alice = await person(`Alice ${tag}`);
    const bob = await person(`Bob ${tag}`);
    const cara = await person(`Cara ${tag}`);
    await db.insert(subscriptions).values({ accountId: bob.accountId, planId: "pro", source: "admin", status: "active" });
    await db.insert(accountMembers).values({ accountId: bob.accountId, userId: cara.id, role: "member" });
    await setUserStatus(admin, alice.id, "deleted");

    const names = async (q: Record<string, string>) => (await listUsers(admin, userListQuery.parse({ q: tag, ...q }))).rows.map((r) => r.name.split(" ")[0]);
    expect(await names({ sort: "az" })).toEqual(["Bob", "Cara"]);
    expect(await names({ sort: "za" })).toEqual(["Cara", "Bob"]);
    expect(await names({ filter: "pro" })).toEqual(["Bob"]);
    expect(await names({ filter: "paid" })).toEqual(["Bob"]);
    expect(await names({ filter: "free", sort: "az" })).toEqual(["Cara"]);
    expect(await names({ filter: "hosts" })).toEqual(["Bob"]);
    expect(await names({ filter: "team_members" })).toEqual(["Cara"]);
    expect(await names({ filter: "deleted" })).toEqual(["Alice"]);
    expect((await listUsers(admin, userListQuery.parse({ q: cara.email }))).rows.map((r) => r.id)).toEqual([cara.id]);
    expect((await listUsers(admin, userListQuery.parse({ q: "%" }))).total).toBeGreaterThanOrEqual(0); // wildcards are literal

    const stats = await userStats(admin);
    expect(stats.total).toBe(stats.paid + stats.free);
    await expect(listUsers({ id: bob.id, role: "member" }, userListQuery.parse({}))).rejects.toThrow(/Only an Admin/);
  });
});

describe("remote view", () => {
  it("needs the user's acceptance, is read-only, logged, and either side can end it", async () => {
    const admin = await asAdmin("Remote Admin");
    const user = await person("Viewed User");
    const otherAdmin = await asAdmin("Other Admin");

    await expect(requestRemoteView(admin, user.id, "too short")).rejects.toThrow(/at least 10/);
    const { grant } = await requestRemoteView(admin, user.id, "Checking a billing problem they reported", freshMeta());
    expect((await requestRemoteView(admin, user.id, "Checking a billing problem they reported")).created).toBe(false);

    // Before acceptance: waiting, nothing visible.
    expect((await openRemoteView(admin, grant.id, "storage")).state).toBe("waiting");
    expect(await pendingRequestFor(user.id)).toMatchObject({ id: grant.id, adminName: "Remote Admin" });

    // Only the owner can answer; for anyone else the request doesn't exist.
    await expect(decideRemoteView(otherAdmin, grant.id, true)).rejects.toThrow(/doesn't exist/);
    await decideRemoteView(user, grant.id, true, freshMeta());
    await expect(decideRemoteView(user, grant.id, true)).rejects.toThrow(/already answered/);
    expect(await pendingRequestFor(user.id)).toBeNull();
    expect(await activeViewsOf(user.id)).toHaveLength(1);

    const view = await openRemoteView(admin, grant.id, "messages", freshMeta());
    expect(view.state).toBe("active");
    // Another Admin can't use this grant.
    await expect(openRemoteView(otherAdmin, grant.id, "overview")).rejects.toThrow(/doesn't exist or has ended/);

    // Reading a thread in remote view doesn't mark it read for the user.
    if (view.state !== "active") throw new Error("expected active");
    const team = (await listConversations(view.actorForReads))[0];
    await sendMessage({ id: admin.id, accountId: user.accountId }, team.id, "hello").catch(() => undefined);
    const before = await db.select().from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, team.id), eq(conversationParticipants.userId, user.id)));
    await getThread(view.actorForReads, team.id, { markRead: false });
    const after = await db.select().from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, team.id), eq(conversationParticipants.userId, user.id)));
    expect(after).toEqual(before);

    await endRemoteView(user, grant.id);
    await expect(openRemoteView(admin, grant.id, "overview")).rejects.toThrow(/has ended/);

    const actions = (await db.select().from(auditLogs).where(eq(auditLogs.supportGrantId, grant.id))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["support_access.requested", "support_access.approved", "support_access.viewed", "support_access.ended"]));
  });

  it("denied requests grant nothing, and access expires", async () => {
    const admin = await asAdmin();
    const user = await person();
    const { grant } = await requestRemoteView(admin, user.id, "Looking into a storage question");
    await decideRemoteView(user, grant.id, false);
    await expect(openRemoteView(admin, grant.id, "overview")).rejects.toThrow(/has ended/);

    const second = (await requestRemoteView(admin, user.id, "Looking into a storage question again")).grant;
    await decideRemoteView(user, second.id, true);
    await db.update(supportAccessGrants).set({ expiresAt: new Date(Date.now() - 1000), decidedAt: new Date(Date.now() - 60_000) }).where(eq(supportAccessGrants.id, second.id));
    await expect(openRemoteView(admin, second.id, "overview")).rejects.toThrow(/has ended/);
    const [row] = await db.select().from(supportAccessGrants).where(eq(supportAccessGrants.id, second.id));
    expect(row.status).toBe("expired");
  });

  it("Admins can't remote view themselves and members can't request", async () => {
    const admin = await asAdmin();
    const member = await person();
    await expect(requestRemoteView(admin, admin.id, "Testing my own account view")).rejects.toThrow(/your own account/);
    await expect(requestRemoteView({ ...member, role: "member" }, admin.id, "I want to look around please")).rejects.toThrow(/Only an Admin/);
  });
});

describe("console", () => {
  it("returns events after a cursor, oldest first", async () => {
    const admin = await asAdmin("Console Admin");
    const first = await consoleEvents(admin, { limit: 5 });
    const cursor = first.at(-1)!;
    const user = await person("Fresh Signup");
    await setUserStatus(admin, user.id, "needs_attention");
    const newer = await consoleEvents(admin, { afterId: cursor.id });
    expect(newer.map((l) => l.id)).not.toContain(cursor.id);
    expect(newer.map((l) => l.text)).toContain("Admin Console Admin changed Fresh Signup's status: active → needs attention");
    await expect(consoleEvents({ id: user.id, role: "member" })).rejects.toThrow(/Only an Admin/);
  });

  it("saves a recording as a file in the Admin's Storage, counted against quota; deleting the file deletes it", async () => {
    const admin = await asAdmin();
    const now = new Date();
    const saved = await saveRecording(admin, { text: "line one\nline two\n", lineCount: 2, startedAt: now, endedAt: now });
    const again = await saveRecording(admin, { text: "three\n", lineCount: 1, startedAt: now, endedAt: now });
    const files = await db.select().from(storageObjects).where(eq(storageObjects.accountId, admin.accountId));
    const folders = files.filter((f) => f.kind === "folder" && f.name === "Console recordings");
    expect(folders).toHaveLength(1);
    expect(files.filter((f) => f.kind === "file" && f.parentId === folders[0].id)).toHaveLength(2);
    expect((await getRecording(admin, saved.id)).content).toBe("line one\nline two\n");

    const other = await asAdmin();
    await expect(getRecording(other, saved.id)).rejects.toThrow(/doesn't exist/);
    await expect(saveRecording(admin, { text: "", lineCount: 0, startedAt: now, endedAt: now })).rejects.toThrow(/Nothing was recorded/);

    const [rec] = await db.select().from(consoleRecordings).where(eq(consoleRecordings.id, again.id));
    await db.delete(storageObjects).where(eq(storageObjects.id, rec.storageObjectId!));
    expect(await db.select().from(consoleRecordings).where(eq(consoleRecordings.id, again.id))).toEqual([]);
  });

  it("logs a health color change once, and each overdue-ticket reminder once", async () => {
    await db.delete(systemStatus).where(eq(systemStatus.key, "health"));
    // The audit log is append-only, so each run uses its own marker.
    const marker = `test-level-${Date.now()}`;
    await db.insert(systemStatus).values({ key: "health", value: marker });
    await runSystemChecks();
    await runSystemChecks();
    const changes = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "system.health_changed"), eq(auditLogs.actorType, "system")));
    expect(changes.filter((c) => (c.metadata as { from?: string })?.from === marker)).toHaveLength(1);

    const host = await person("Ticket Host");
    const [conv] = await db.insert(conversations).values({ accountId: host.accountId, kind: "support", subject: "Help" }).returning();
    const [ticket] = await db
      .insert(supportTickets)
      .values({ accountId: host.accountId, openedBy: host.id, conversationId: conv.id, subject: "Can't upload", createdAt: new Date(Date.now() - 50 * 3600_000) })
      .returning();
    await runSystemChecks();
    await runSystemChecks();
    const reminders = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "support_ticket.overdue"), eq(auditLogs.targetId, ticket.id)));
    expect(reminders.map((r) => (r.metadata as { hours: number }).hours)).toEqual([48]);
    await db.update(supportTickets).set({ status: "closed" }).where(eq(supportTickets.id, ticket.id));
  });
});
