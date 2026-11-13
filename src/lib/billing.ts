// Pure billing rules (no database, no Stripe). The billing service applies them; unit tests cover
// them directly. Money is integer cents.
import type { PlanId } from "./plans";

export type BillingInterval = "month" | "year";
export type PaidPlanId = Exclude<PlanId, "free">;
export type SubscriptionStatus = "incomplete" | "trialing" | "active" | "past_due" | "unpaid" | "canceled";

export const PAID_PLAN_IDS: PaidPlanId[] = ["starter", "plus", "pro"];
export const INTERVALS: BillingInterval[] = ["month", "year"];

export const isPaidPlanId = (v: unknown): v is PaidPlanId => typeof v === "string" && (PAID_PLAN_IDS as string[]).includes(v);
export const isInterval = (v: unknown): v is BillingInterval => v === "month" || v === "year";

/**
 * Stripe has a few statuses our enum doesn't: an expired first payment is simply canceled, and a
 * paused subscription (trial ended without a card) grants nothing, like unpaid.
 */
export function toSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case "incomplete":
    case "trialing":
    case "active":
    case "past_due":
    case "unpaid":
    case "canceled":
      return stripeStatus;
    case "paused":
      return "unpaid";
    default:
      return "canceled"; // incomplete_expired and anything new
  }
}

/** Statuses that occupy the account's single "current subscription" slot (DB unique index). */
export const CURRENT_STATUSES: SubscriptionStatus[] = ["incomplete", "trialing", "active", "past_due"];
export const isCurrentStatus = (s: string) => (CURRENT_STATUSES as string[]).includes(s);

const MIN_CENTS = 50; // Stripe's minimum USD charge
const MAX_CENTS = 1_000_000;

/** Parses an Admin-entered amount ("12", "12.5", "$1,299.99") into cents. */
export function parsePriceInput(raw: string): { cents: number } | { error: string } {
  const cleaned = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { error: "Enter an amount like 12 or 12.99." };
  const [whole, fraction = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents < MIN_CENTS) return { error: "Stripe's minimum charge is $0.50." };
  if (cents > MAX_CENTS) return { error: "Amount is too large." };
  return { cents };
}

/** Percentage saved by paying yearly instead of 12 monthly payments (0 when not cheaper). */
export function yearlySavingsPercent(monthlyCents: number | undefined, yearlyCents: number | undefined) {
  if (!monthlyCents || !yearlyCents) return 0;
  const full = monthlyCents * 12;
  return yearlyCents >= full ? 0 : Math.round(((full - yearlyCents) / full) * 100);
}

export function stripeMode(secretKey: string | undefined): "test" | "live" | null {
  if (!secretKey) return null;
  return /^(sk|rk)_live_/.test(secretKey) ? "live" : "test";
}

/** Webhook events the app handles; Admin → Billing lists them for the Stripe dashboard. */
export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
] as const;
