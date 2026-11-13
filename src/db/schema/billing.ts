// Plans, prices, subscriptions and the payment ledger.
//
// Plan LIMITS are product rules (seeded by migration, checked against the spec in tests).
// PRICES are set by Admin (plan_prices). An account's plan = its current subscription's plan,
// or "free" when it has none.
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, ts, updatedAt } from "./_shared";
import { users } from "./auth";
import { accounts } from "./accounts";

export const plans = pgTable(
  "plans",
  {
    id: text("id").primaryKey(), // free | starter | plus | pro
    name: text("name").notNull(),
    storageBytes: bigint("storage_bytes", { mode: "number" }).notNull(),
    teamMemberLimit: integer("team_member_limit").notNull(),
    /** Lifetime number of FREE AppZone items the account may acquire; null = unlimited. */
    freeAppzoneDownloadLimit: integer("free_appzone_download_limit"),
    isPaid: boolean("is_paid").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("plans_storage_positive", sql`${t.storageBytes} > 0`),
    check("plans_team_nonnegative", sql`${t.teamMemberLimit} >= 0`),
    check("plans_download_limit_nonnegative", sql`${t.freeAppzoneDownloadLimit} is null or ${t.freeAppzoneDownloadLimit} >= 0`),
  ],
);

/** Built-in apps included in each plan (app slugs from src/lib/apps.ts). */
export const planApps = pgTable(
  "plan_apps",
  {
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    appSlug: text("app_slug").notNull(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.appSlug] })],
);

export const billingInterval = pgEnum("billing_interval", ["month", "year"]);

/** Admin-controlled prices. Old prices are deactivated, never edited, so history stays accurate. */
export const planPrices = pgTable(
  "plan_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    interval: billingInterval("interval").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    stripePriceId: text("stripe_price_id").unique(),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    check("plan_prices_amount_positive", sql`${t.amountCents} > 0`),
    check("plan_prices_currency_format", sql`${t.currency} ~ '^[a-z]{3}$'`),
    uniqueIndex("plan_prices_one_active_idx").on(t.planId, t.interval, t.currency).where(sql`${t.active}`),
  ],
);

export const subscriptionStatus = pgEnum("subscription_status", [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
]);
/** "stripe" = paid through Stripe; "admin" = granted by an Admin (comp/test accounts). */
export const subscriptionSource = pgEnum("subscription_source", ["stripe", "admin"]);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    priceId: uuid("price_id").references(() => planPrices.id, { onDelete: "restrict" }),
    source: subscriptionSource("source").notNull(),
    status: subscriptionStatus("status").notNull(),
    interval: billingInterval("interval"),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    currentPeriodStart: ts("current_period_start"),
    currentPeriodEnd: ts("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    canceledAt: ts("canceled_at"),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("subscriptions_paid_plan_only", sql`${t.planId} <> 'free'`),
    check(
      "subscriptions_stripe_fields",
      sql`(${t.source} = 'stripe' and ${t.stripeSubscriptionId} is not null and ${t.interval} is not null) or (${t.source} = 'admin' and ${t.stripeSubscriptionId} is null)`,
    ),
    check("subscriptions_period_order", sql`${t.currentPeriodEnd} is null or ${t.currentPeriodStart} is null or ${t.currentPeriodEnd} > ${t.currentPeriodStart}`),
    // At most one subscription that grants access per account.
    uniqueIndex("subscriptions_one_current_idx")
      .on(t.accountId)
      .where(sql`${t.status} in ('incomplete', 'trialing', 'active', 'past_due')`),
    index("subscriptions_account_idx").on(t.accountId),
  ],
);

export const paymentKind = pgEnum("payment_kind", ["subscription", "appzone_purchase", "upload_fee", "refund"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "succeeded", "failed", "refunded"]);

/** Ledger of money movements. Written only from verified Stripe webhooks (the source of truth). */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: paymentKind("kind").notNull(),
    status: paymentStatus("status").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
    stripeInvoiceId: text("stripe_invoice_id").unique(),
    stripeChargeId: text("stripe_charge_id"),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("payments_amount_nonnegative", sql`${t.amountCents} >= 0`),
    check("payments_currency_format", sql`${t.currency} ~ '^[a-z]{3}$'`),
    check("payments_has_stripe_reference", sql`${t.stripePaymentIntentId} is not null or ${t.stripeInvoiceId} is not null`),
    index("payments_account_idx").on(t.accountId, t.createdAt),
  ],
);

/** Every Stripe webhook event we have processed. The primary key makes processing idempotent. */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(), // Stripe event id (evt_...)
  type: text("type").notNull(),
  receivedAt: ts("received_at").notNull().defaultNow(),
  processedAt: ts("processed_at"),
  error: text("error"),
  payload: jsonb("payload").notNull(),
});

export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
