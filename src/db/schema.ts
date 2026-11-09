import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
  jsonb,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["member", "admin"]);
export const planTier = pgEnum("plan_tier", ["free", "starter", "plus", "pro"]);
export const developerStatus = pgEnum("developer_status", ["none", "pending", "approved", "denied"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("member"),
    plan: planTier("plan").notNull().default("free"),
    // Set when this user is a team member: points at the host account whose plan and storage they share.
    hostId: uuid("host_id").references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    developerStatus: developerStatus("developer_status").notNull().default("none"),
    // Bumping this invalidates every existing session for the user ("log out of all devices").
    sessionVersion: integer("session_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_host_idx").on(t.hostId)],
);

export const loginEvents = pgTable(
  "login_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_events_user_idx").on(t.userId, t.createdAt),
    index("login_events_email_idx").on(t.email, t.createdAt),
  ],
);

// Per-account app state. Built-in apps included in the plan are installed by default,
// so a row only exists once the host deactivates an app or changes its settings.
// `accountId` is always the HOST account: the team shares the host's apps.
export const appInstallations = pgTable(
  "app_installations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    appSlug: text("app_slug").notNull(),
    active: boolean("active").notNull().default(true),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("app_installations_account_app_idx").on(t.accountId, t.appSlug)],
);

export type User = typeof users.$inferSelect;
export type AppInstallation = typeof appInstallations.$inferSelect;
export type LoginEvent = typeof loginEvents.$inferSelect;
