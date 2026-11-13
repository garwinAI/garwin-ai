// Billing rules that don't touch the database or Stripe, so they're easy to unit test.
// Database + Stripe work lives in src/server/services/billing.ts.
import type { PlanId } from "./plans";

export type BillingInterval = "month" | "year";
export type PaidPlanId = Exclude<PlanId, "free">;

export const PAID_PLANS: PaidPlanId[] = ["starter", "plus", "pro"];
export const INTERVALS: BillingInterval[] = ["month", "year"];

export function isPaidPlan(value: unknown): value is PaidPlanId {
  return typeof value === "string" && (PAID_PLANS as string[]).includes(value);
}

export function isInterval(value: unknown): value is BillingInterval {
  return value === "month" || value === "year";
}

/** Our subscription statuses (the `subscription_status` enum). */
export type SubscriptionStatus = "incomplete" | "trialing" | "active" | "past_due" | "unpaid" | "canceled";

/**
 * Statuses that hold the account's one "current subscription" slot
 * (`subscriptions_one_current_idx`). `incomplete` holds the slot but doesn't grant the plan yet.
 */
export const CURRENT_STATUSES: SubscriptionStatus[] = ["incomplete", "trialing", "active", "past_due"];

export function isCurrentStatus(status: string): boolean {
  return (CURRENT_STATUSES as string[]).includes(status);
}

/**
 * Maps a Stripe subscription status onto ours. Stripe has two more than we store:
 * `incomplete_expired` (first payment never completed) is over, and `paused` gives no access.
 * Anything unknown is treated as no access rather than guessed at.
 */
export function mapStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "incomplete":
    case "trialing":
    case "active":
    case "past_due":
    case "unpaid":
    case "canceled":
      return status;
    case "incomplete_expired":
      return "canceled";
    default:
      return "unpaid";
  }
}

export const STATUS_TEXT: Record<SubscriptionStatus, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment failed",
  incomplete: "Waiting for payment",
  unpaid: "Unpaid",
  canceled: "Canceled",
};

const MIN_CENTS = 50; // Stripe's minimum charge in USD
const MAX_CENTS = 1_000_000; // $10,000

/** Parses an Admin-entered amount like "12", "12.5" or "$1,299.99" into integer cents. */
export function parsePriceInput(raw: string): { cents: number } | { error: string } {
  const cleaned = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { error: "Enter an amount like 12 or 12.99." };
  const [whole, fraction = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents < MIN_CENTS) return { error: "Stripe's minimum charge is $0.50." };
  if (cents > MAX_CENTS) return { error: "Amount is too large." };
  return { cents };
}

export function formatMoney(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Percentage saved by paying yearly instead of 12 monthly payments (0 when not cheaper). */
export function yearlySavingsPercent(monthlyCents: number, yearlyCents: number) {
  const full = monthlyCents * 12;
  if (full <= 0 || yearlyCents <= 0 || yearlyCents >= full) return 0;
  return Math.round(((full - yearlyCents) / full) * 100);
}

/** Whether a Stripe secret key charges real cards. Null when there is no key. */
export function stripeMode(secretKey: string | undefined): "test" | "live" | null {
  if (!secretKey) return null;
  return /^(sk|rk)_live_/.test(secretKey) ? "live" : "test";
}

/** The Stripe events the webhook endpoint must be subscribed to (shown to Admin). */
export const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
] as const;
