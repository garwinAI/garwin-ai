// Host ↔ team messaging inside one account: an account-wide team chat plus one-to-one threads.
//
// Access rule (checked on every read and write): the conversation must belong to the actor's
// CURRENT account, the actor must have messages.use, and for one-to-one threads the actor must
// be one of the two people. Anything else is NOT_FOUND, so other accounts' threads can't be probed.
import "server-only";
import { and, desc, eq, gt, inArray, isNull, ne, or, sql, count } from "drizzle-orm";
import { db } from "@/db";
import { accountMembers, conversationParticipants, conversations, messages, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { assertPermission } from "./entitlements";
import { notify } from "./notifications";

type Actor = { id: string; accountId?: string | null };

export const MAX_MESSAGE_LENGTH = 5000;
const TEAM_CHANNEL = "all";
const directKey = (a: string, b: string) => `direct:${[a, b].sort().join(":")}`;

async function teamConversation(accountId: string) {
  await db.insert(conversations).values({ accountId, kind: "team", channelKey: TEAM_CHANNEL, subject: "Team" }).onConflictDoNothing();
  const [c] = await db.select().from(conversations).where(and(eq(conversations.accountId, accountId), eq(conversations.channelKey, TEAM_CHANNEL)));
  return c;
}

/** Loads a conversation the actor may access in their current account, or NOT_FOUND. */
async function accessibleConversation(actor: Actor, conversationId: string) {
  const ent = await assertPermission(actor, "messages.use");
  const [c] = await db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.accountId, ent.accountId), eq(conversations.kind, "team")));
  const isDirect = c?.channelKey?.startsWith("direct:");
  if (!c || (isDirect && !c.channelKey!.split(":").includes(actor.id))) {
    throw new AppError("NOT_FOUND", "That conversation doesn't exist.");
  }
  return { conversation: c, accountId: ent.accountId, isDirect: Boolean(isDirect) };
}

/** Opens (creating if needed) the one-to-one thread with another member of the same account. */
export async function openDirectConversation(actor: Actor, otherUserId: string) {
  const ent = await assertPermission(actor, "messages.use");
  if (otherUserId === actor.id) throw new AppError("VALIDATION", "You can't message yourself.");
  const [other] = await db.select({ id: accountMembers.id }).from(accountMembers).where(and(eq(accountMembers.accountId, ent.accountId), eq(accountMembers.userId, otherUserId)));
  if (!other) throw new AppError("NOT_FOUND", "That person isn't on your team.");
  const key = directKey(actor.id, otherUserId);
  await db.insert(conversations).values({ accountId: ent.accountId, kind: "team", channelKey: key, createdBy: actor.id }).onConflictDoNothing();
  const [c] = await db.select().from(conversations).where(and(eq(conversations.accountId, ent.accountId), eq(conversations.channelKey, key)));
  return c;
}

/** Team chat and the actor's one-to-one threads, with the other person's name and unread counts. */
export async function listConversations(actor: Actor) {
  const ent = await assertPermission(actor, "messages.use");
  const team = await teamConversation(ent.accountId);
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.accountId, ent.accountId),
        eq(conversations.kind, "team"),
        or(eq(conversations.id, team.id), sql`${conversations.channelKey} like ${"direct:%" + actor.id + "%"}`),
      ),
    )
    .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`));

  const otherIds = rows.filter((r) => r.channelKey?.startsWith("direct:")).map((r) => r.channelKey!.split(":").slice(1).find((id) => id !== actor.id)!);
  const names = otherIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, otherIds)) : [];

  const reads = await db
    .select()
    .from(conversationParticipants)
    .where(and(eq(conversationParticipants.userId, actor.id), inArray(conversationParticipants.conversationId, rows.map((r) => r.id))));

  return Promise.all(
    rows.map(async (c) => {
      const lastRead = reads.find((r) => r.conversationId === c.id)?.lastReadAt ?? null;
      const [{ unread }] = await db
        .select({ unread: count() })
        .from(messages)
        .where(and(eq(messages.conversationId, c.id), ne(sql`coalesce(${messages.senderUserId}, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`${actor.id}::uuid`), lastRead ? gt(messages.createdAt, lastRead) : undefined));
      const otherId = c.channelKey?.startsWith("direct:") ? c.channelKey.split(":").slice(1).find((id) => id !== actor.id) : undefined;
      return {
        id: c.id,
        isTeam: c.channelKey === TEAM_CHANNEL,
        title: c.channelKey === TEAM_CHANNEL ? "Team" : (names.find((n) => n.id === otherId)?.name ?? "Former member"),
        lastMessageAt: c.lastMessageAt,
        unread,
      };
    }),
  );
}

/**
 * Messages in a conversation (newest 100), oldest first. Marks the conversation read, except for
 * Admin remote view (`markRead: false`), which must never change the user's data.
 */
export async function getThread(actor: Actor, conversationId: string, opts: { markRead?: boolean } = {}) {
  const { conversation } = await accessibleConversation(actor, conversationId);
  const rows = await db
    .select({ id: messages.id, body: messages.body, createdAt: messages.createdAt, senderId: messages.senderUserId, senderName: users.name })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.senderUserId))
    .where(and(eq(messages.conversationId, conversation.id), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt))
    .limit(100);
  if (opts.markRead === false) return { conversation, messages: rows.reverse() };
  await db
    .insert(conversationParticipants)
    .values({ conversationId: conversation.id, userId: actor.id, lastReadAt: new Date() })
    .onConflictDoUpdate({ target: [conversationParticipants.conversationId, conversationParticipants.userId], set: { lastReadAt: new Date() } });
  return { conversation, messages: rows.reverse() };
}

export async function sendMessage(actor: Actor, conversationId: string, rawBody: string) {
  const body = rawBody.trim();
  if (!body) throw new AppError("VALIDATION", "Write a message first.");
  if (body.length > MAX_MESSAGE_LENGTH) throw new AppError("VALIDATION", `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`);
  const { conversation, accountId, isDirect } = await accessibleConversation(actor, conversationId);

  const message = await db.transaction(async (tx) => {
    const [m] = await tx.insert(messages).values({ conversationId: conversation.id, senderUserId: actor.id, body }).returning();
    await tx.update(conversations).set({ lastMessageAt: m.createdAt }).where(eq(conversations.id, conversation.id));
    await tx
      .insert(conversationParticipants)
      .values({ conversationId: conversation.id, userId: actor.id, lastReadAt: m.createdAt })
      .onConflictDoUpdate({ target: [conversationParticipants.conversationId, conversationParticipants.userId], set: { lastReadAt: m.createdAt } });

    // Notify the other person (direct) or the rest of the team, but only people who are still
    // members of this account: a removed member must not receive message previews.
    const currentMembers = (
      await tx.select({ userId: accountMembers.userId }).from(accountMembers).where(and(eq(accountMembers.accountId, accountId), ne(accountMembers.userId, actor.id)))
    ).map((r) => r.userId);
    const recipients = isDirect
      ? conversation.channelKey!.split(":").slice(1).filter((id) => id !== actor.id && currentMembers.includes(id))
      : currentMembers;
    const [sender] = await tx.select({ name: users.name }).from(users).where(eq(users.id, actor.id));
    await notify(recipients, { type: "message.new", title: isDirect ? `New message from ${sender.name}` : `${sender.name} posted in Team`, body: body.slice(0, 140), link: `/messages?c=${conversation.id}` }, tx);
    return m;
  });
  return message;
}
