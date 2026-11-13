import { describe, expect, it } from "vitest";
import { formatPrice, pricesForPlan, type PlanPrice } from "@/lib/pricing";

describe("formatPrice", () => {
  it("formats integer cents as currency, dropping .00", () => {
    expect(formatPrice(1999)).toBe("$19.99");
    expect(formatPrice(19900)).toBe("$199");
    expect(formatPrice(500, "USD")).toBe("$5");
  });
});

describe("pricesForPlan", () => {
  const prices: PlanPrice[] = [
    { planId: "starter", interval: "month", amountCents: 999, currency: "usd" },
    { planId: "starter", interval: "year", amountCents: 9900, currency: "usd" },
    { planId: "plus", interval: "month", amountCents: 1999, currency: "eur" },
  ];

  it("returns the monthly and yearly price of a plan", () => {
    const { month, year } = pricesForPlan(prices, "starter");
    expect(month?.amountCents).toBe(999);
    expect(year?.amountCents).toBe(9900);
  });

  it("returns nothing when Admin has not set a price in that currency", () => {
    expect(pricesForPlan(prices, "pro")).toEqual({ month: undefined, year: undefined });
    expect(pricesForPlan(prices, "plus")).toEqual({ month: undefined, year: undefined });
  });
});
