// Saved Admin Assistant conversations ("View chat log"). Each Admin sees their own.
import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./_shared";
import { users } from "./auth";

export const assistantRole = pgEnum("assistant_role", ["user", "assistant"]);

export const assistantChatMessages = pgTable(
  "assistant_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: assistantRole("role").notNull(),
    text: text("text").notNull(),
    // The dev-branch commit this reply made, if any.
    commitSha: text("commit_sha"),
    createdAt: createdAt(),
  },
  (t) => [
    check("assistant_chat_text_length", sql`length(${t.text}) between 1 and 20000`),
    index("assistant_chat_admin_idx").on(t.adminId, t.createdAt),
  ],
);
