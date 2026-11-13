// Conversations (host/team chats and support threads), messages and in-app notifications.
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, ts } from "./_shared";
import { users } from "./auth";
import { accounts } from "./accounts";

export const conversationKind = pgEnum("conversation_kind", ["team", "support"]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Team conversations belong to an account; support threads also carry the customer's account.
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: conversationKind("kind").notNull(),
    subject: text("subject"),
    // Kind "team": "all" = the account-wide team chat; "direct:<userA>:<userB>" (sorted ids) = a
    // one-to-one thread. Unique per account, so there's exactly one of each. Null for support.
    channelKey: text("channel_key"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    lastMessageAt: ts("last_message_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("conversations_account_idx").on(t.accountId, t.lastMessageAt),
    uniqueIndex("conversations_channel_idx").on(t.accountId, t.channelKey),
    check("conversations_team_has_channel", sql`${t.kind} <> 'team' or ${t.channelKey} is not null`),
  ],
);

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: ts("last_read_at"),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("conversation_participants_user_idx").on(t.userId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    // Null = system message.
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    editedAt: ts("edited_at"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    check("messages_body_length", sql`length(${t.body}) between 1 and 10000`),
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // e.g. "message.new", "ticket.reply", "invite.accepted"
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("notifications_link_relative", sql`${t.link} is null or ${t.link} ~ '^/[^/]'`),
    index("notifications_user_idx").on(t.userId, t.createdAt),
    index("notifications_unread_idx").on(t.userId).where(sql`${t.readAt} is null`),
  ],
);
