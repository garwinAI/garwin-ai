import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isCurrentStatus,
  isInterval,
  isPaidPlanId,
  parsePriceInput,
  stripeMode,
  toSubscriptionStatus,
  yearlySavingsPercent,
} from "@/lib/billing";
import { grantsAccess } from "@/lib/entitlements";
import { env, resetEnvCache } from "@/lib/env";

describe("parsePriceInput", () => {
  it("accepts whole and decimal amounts with an optional $ and commas", () => {
    expect(parsePriceInput("12")).toEqual({ cents: 1200 });
    expect(parsePriceInput("12.5")).toEqual({ cents: 1250 });
    expect(parsePriceInput(" $1,299.99 ")).toEqual({ cents: 129_999 });
  });

  it("rejects junk, too many decimals and amounts Stripe won't charge", () => {
    expect(parsePriceInput("abc")).toHaveProperty("error");
    expect(parsePriceInput("1.999")).toHaveProperty("error");
    expect(parsePriceInput("-5")).toHaveProperty("error");
    expect(parsePriceInput("0.49")).toEqual({ error: "Stripe's minimum charge is $0.50." });
    expect(parsePriceInput("10001")).toEqual({ error: "Amount is too large." });
  });
});

describe("subscription statuses", () => {
  it("maps Stripe's statuses onto ours", () => {
    for (const s of ["incomplete", "trialing", "active", "past_due", "unpaid", "canceled"]) expect(toSubscriptionStatus(s)).toBe(s);
    expect(toSubscriptionStatus("incomplete_expired")).toBe("canceled");
    expect(toSubscriptionStatus("paused")).toBe("unpaid");
    expect(toSubscriptionStatus("something_new")).toBe("canceled");
  });

  it("keeps the plan while active, on trial or while Stripe retries a failed payment", () => {
    expect(["trialing", "active", "past_due"].map((s) => grantsAccess(toSubscriptionStatus(s)))).toEqual([true, true, true]);
    expect(["incomplete", "unpaid", "canceled", "paused", "incomplete_expired"].map((s) => grantsAccess(toSubscriptionStatus(s)))).toEqual([false, false, false, false, false]);
  });

  it("knows which statuses occupy the account's one current-subscription slot", () => {
    expect(isCurrentStatus("incomplete")).toBe(true);
    expect(isCurrentStatus("past_due")).toBe(true);
    expect(isCurrentStatus("canceled")).toBe(false);
  });
});

describe("helpers", () => {
  it("computes yearly savings", () => {
    expect(yearlySavingsPercent(1000, 10_000)).toBe(17);
    expect(yearlySavingsPercent(1000, 12_000)).toBe(0);
    expect(yearlySavingsPercent(undefined, 10_000)).toBe(0);
  });

  it("recognizes paid plans, intervals and key modes", () => {
    expect(isPaidPlanId("pro")).toBe(true);
    expect(isPaidPlanId("free")).toBe(false);
    expect(isInterval("year")).toBe(true);
    expect(isInterval("week")).toBe(false);
    expect(stripeMode("sk_live_x")).toBe("live");
    expect(stripeMode("sk_test_x")).toBe("test");
    expect(stripeMode(undefined)).toBeNull();
  });
});

describe("Stripe settings", () => {
  const base = () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("AUTH_SECRET", "x".repeat(40));
  };
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it("needs both keys together", () => {
    base();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect(() => env()).toThrowError(/both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET/);
  });

  it("catches a publishable key or a wrong webhook secret", () => {
    base();
    vi.stubEnv("STRIPE_SECRET_KEY", "pk_test_abc");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_abc");
    expect(() => env()).toThrowError(/not a publishable key/);
    resetEnvCache();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "abc");
    expect(() => env()).toThrowError(/whsec_/);
  });

  it("refuses the test-only Stripe server setting in production unless it's local", () => {
    base();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubEnv("STRIPE_API_BASE", "https://evil.example");
    expect(() => env()).toThrowError(/STRIPE_API_BASE/);
    resetEnvCache();
    vi.stubEnv("STRIPE_API_BASE", "http://localhost:3199");
    expect(env().STRIPE_API_BASE).toBe("http://localhost:3199");
  });
});
