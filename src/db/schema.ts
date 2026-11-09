import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
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

export type User = typeof users.$inferSelect;
export type LoginEvent = typeof loginEvents.$inferSelect;
