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
    // Null until the user clicks the link in the verification email.
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_host_idx").on(t.hostId)],
);

export const SECURITY_EVENTS = [
  "signup",
  "login",
  "logout",
  "password_changed",
  "password_reset_requested",
  "password_reset",
  "email_verification_sent",
  "email_verified",
  "session_revoked",
  "sessions_revoked",
] as const;
export type SecurityEvent = (typeof SECURITY_EVENTS)[number];

// Account security activity (shown in Settings → IP History). Historical name: login_events.
export const loginEvents = pgTable(
  "login_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    event: text("event").$type<SecurityEvent>().notNull().default("login"),
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

// Server-side sessions. The cookie holds a random token; only its keyed hash is stored here,
// so a database leak doesn't expose usable session tokens.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const authTokenPurpose = pgEnum("auth_token_purpose", ["email_verification", "password_reset"]);

// Single-use tokens sent by email. Only the keyed hash is stored.
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: authTokenPurpose("purpose").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_user_purpose_idx").on(t.userId, t.purpose)],
);

// Fixed-window rate limit counters, updated atomically with a single upsert.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AppInstallation = typeof appInstallations.$inferSelect;
export type LoginEvent = typeof loginEvents.$inferSelect;
