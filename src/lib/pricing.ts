// Display helpers for plan prices on the public site. Prices themselves are Admin-controlled
// (`plan_prices`); nothing here invents an amount.
import type { PlanId } from "./plans";

export type PlanPrice = { planId: PlanId; interval: "month" | "year"; amountCents: number; currency: string };

/** "$19.99", "$199" (no trailing .00). Money is integer cents. */
export function formatPrice(amountCents: number, currency = "usd", locale = "en-US"): string {
  const whole = amountCents % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amountCents / 100);
}

/** The active monthly and yearly price of one plan, if Admin has set them. */
export function pricesForPlan(prices: PlanPrice[], planId: PlanId, currency = "usd") {
  const find = (interval: PlanPrice["interval"]) =>
    prices.find((p) => p.planId === planId && p.interval === interval && p.currency === currency);
  return { month: find("month"), year: find("year") };
}
