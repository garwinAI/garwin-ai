// Built-in app state per account (activation + settings). Built-in apps included in the plan are
// installed by default, so a row only exists once the host deactivates an app or changes settings.
import { sql } from "drizzle-orm";
import { boolean, check, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./_shared";
import { users } from "./auth";
import { accounts } from "./accounts";

export const appInstallations = pgTable(
  "app_installations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    appSlug: text("app_slug").notNull(),
    active: boolean("active").notNull().default(true),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("app_installations_account_app_idx").on(t.accountId, t.appSlug),
    check("app_installations_settings_object", sql`jsonb_typeof(${t.settings}) = 'object'`),
  ],
);

export type AppInstallation = typeof appInstallations.$inferSelect;
