// People and sign-in. A user is a person; what they can use comes from their account (accounts.ts).
import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, uuid, boolean } from "drizzle-orm/pg-core";
import { createdAt, ts, updatedAt } from "./_shared";

/** Platform role. "admin" = Garwin AI staff. Workspace roles live on account_members. */
export const userRole = pgEnum("user_role", ["member", "admin"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("member"),
    // Null until the user clicks the link in the verification email.
    emailVerifiedAt: ts("email_verified_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("users_email_lowercase", sql`${t.email} = lower(${t.email})`)],
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
    createdAt: createdAt(),
  },
  (t) => [
    index("login_events_user_idx").on(t.userId, t.createdAt),
    index("login_events_email_idx").on(t.email, t.createdAt),
  ],
);

// Server-side sessions. The cookie holds a random token; only its keyed hash is stored here.
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
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    // Which workspace this session is viewing. Re-validated against membership on every request.
    // (FK declared in SQL: accounts.ts imports this file, so a Drizzle reference would be circular.)
    activeAccountId: uuid("active_account_id"),
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
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("auth_tokens_user_purpose_idx").on(t.userId, t.purpose)],
);

// Fixed-window rate limit counters, updated atomically with a single upsert.
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    windowStart: ts("window_start").notNull(),
  },
  (t) => [index("rate_limits_window_idx").on(t.windowStart)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
