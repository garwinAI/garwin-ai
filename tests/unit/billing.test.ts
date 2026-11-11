import { describe, expect, it } from "vitest";
import {
  entitledPlan,
  formatMoney,
  isInterval,
  isPaidPlan,
  parsePriceInput,
  stripeMode,
  yearlySavingsPercent,
} from "@/lib/billing";

describe("parsePriceInput", () => {
  it("accepts whole and decimal amounts with optional $ and commas", () => {
    expect(parsePriceInput("12")).toEqual({ cents: 1200 });
    expect(parsePriceInput("12.5")).toEqual({ cents: 1250 });
    expect(parsePriceInput(" $1,299.99 ")).toEqual({ cents: 129999 });
  });

  it("rejects junk, too many decimals, and amounts Stripe won't charge", () => {
    expect(parsePriceInput("abc")).toHaveProperty("error");
    expect(parsePriceInput("1.999")).toHaveProperty("error");
    expect(parsePriceInput("-5")).toHaveProperty("error");
    expect(parsePriceInput("0.49")).toEqual({ error: "Stripe's minimum charge is $0.50." });
    expect(parsePriceInput("10001")).toEqual({ error: "Amount is too large." });
  });
});

describe("entitledPlan", () => {
  it("keeps the paid plan while active, trialing or retrying a failed payment", () => {
    for (const status of ["active", "trialing", "past_due"]) expect(entitledPlan(status, "plus")).toBe("plus");
  });

  it("drops to Free once the subscription has ended or never started", () => {
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
      expect(entitledPlan(status, "plus")).toBe("free");
    }
  });
});

describe("helpers", () => {
  it("formats money", () => {
    expect(formatMoney(1200)).toBe("$12");
    expect(formatMoney(1299)).toBe("$12.99");
  });

  it("computes yearly savings", () => {
    expect(yearlySavingsPercent(1000, 10000)).toBe(17);
    expect(yearlySavingsPercent(1000, 12000)).toBe(0);
    expect(yearlySavingsPercent(0, 10000)).toBe(0);
  });

  it("recognizes plans, intervals and key modes", () => {
    expect(isPaidPlan("pro")).toBe(true);
    expect(isPaidPlan("free")).toBe(false);
    expect(isInterval("year")).toBe(true);
    expect(isInterval("week")).toBe(false);
    expect(stripeMode("sk_live_abc")).toBe("live");
    expect(stripeMode("sk_test_abc")).toBe("test");
    expect(stripeMode(undefined)).toBeNull();
  });
});
