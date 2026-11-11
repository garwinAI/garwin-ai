import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
  primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["member", "admin"]);
export const planTier = pgEnum("plan_tier", ["free", "starter", "plus", "pro"]);
export const developerStatus = pgEnum("developer_status", ["none", "pending", "approved", "denied"]);
export const billingInterval = pgEnum("billing_interval", ["month", "year"]);

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
    // Stripe customer, created the first time the user opens checkout or manages cards.
    stripeCustomerId: text("stripe_customer_id").unique(),
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

// Prices for paid plans, set by Admin. Stripe prices can't be edited, so each change creates a new
// Stripe price; existing subscribers keep the price they signed up with.
export const planPrices = pgTable(
  "plan_prices",
  {
    plan: planTier("plan").notNull(),
    interval: billingInterval("interval").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    stripeProductId: text("stripe_product_id"),
    // Null until the price has been created in Stripe; checkout is unavailable until then.
    stripePriceId: text("stripe_price_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.plan, t.interval] })],
);

// Mirror of each user's current Stripe subscription, kept up to date by the webhook.
export const subscriptions = pgTable(
  "subscriptions",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripePriceId: text("stripe_price_id").notNull(),
    plan: planTier("plan").notNull(),
    interval: billingInterval("interval").notNull(),
    // Stripe status: active, trialing, past_due, canceled, unpaid, incomplete, ...
    status: text("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subscriptions_customer_idx").on(t.stripeCustomerId)],
);

// Stripe webhook events already handled, so retries are processed once.
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type PlanPrice = typeof planPrices.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type LoginEvent = typeof loginEvents.$inferSelect;
