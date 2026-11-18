// Each person's workspace page (columns, widgets, app icon order, page theme) per workspace.
// Validated by layoutSchema (src/lib/workspace.ts) before every save.
import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./_shared";
import { users } from "./auth";
import { accounts } from "./accounts";

export const workspaceLayouts = pgTable(
  "workspace_layouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    layout: jsonb("layout").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("workspace_layouts_user_account_idx").on(t.userId, t.accountId),
    check("workspace_layouts_layout_object", sql`jsonb_typeof(${t.layout}) = 'object'`),
    check("workspace_layouts_layout_size", sql`octet_length(${t.layout}::text) <= 200000`),
  ],
);
