// Billing rules that don't touch the database or Stripe, so they're easy to unit test.
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

/**
 * Stripe statuses that still give the user their paid plan. `past_due` keeps access while Stripe
 * retries the card; once retries run out Stripe moves the subscription to `canceled` or `unpaid`.
 */
const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

export function isEntitledStatus(status: string) {
  return ENTITLED_STATUSES.has(status);
}

/** The plan a user should have for a subscription in this state. */
export function entitledPlan(status: string, plan: PaidPlanId): PlanId {
  return isEntitledStatus(status) ? plan : "free";
}

const MAX_CENTS = 1_000_000; // $10,000

/** Parses an Admin-entered amount like "12", "12.5" or "$1,299.99" into cents. */
export function parsePriceInput(raw: string): { cents: number } | { error: string } {
  const cleaned = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { error: "Enter an amount like 12 or 12.99." };
  const [whole, fraction = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents < 50) return { error: "Stripe's minimum charge is $0.50." };
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
  if (full <= 0 || yearlyCents >= full) return 0;
  return Math.round(((full - yearlyCents) / full) * 100);
}

export function stripeMode(secretKey: string | undefined): "test" | "live" | null {
  if (!secretKey) return null;
  return /^(sk|rk)_live_/.test(secretKey) ? "live" : "test";
}
