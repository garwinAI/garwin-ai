import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  formatMoney,
  isCurrentStatus,
  isInterval,
  isPaidPlan,
  mapStripeStatus,
  parsePriceInput,
  stripeMode,
  yearlySavingsPercent,
} from "@/lib/billing";
import { grantsAccess } from "@/lib/entitlements";
import { encodeForm, verifyWebhook } from "@/server/stripe/client";

describe("parsePriceInput", () => {
  it("accepts whole and decimal amounts with optional $ and commas", () => {
    expect(parsePriceInput("12")).toEqual({ cents: 1200 });
    expect(parsePriceInput("12.5")).toEqual({ cents: 1250 });
    expect(parsePriceInput(" $1,299.99 ")).toEqual({ cents: 129999 });
    expect(parsePriceInput("19.99")).toEqual({ cents: 1999 }); // no floating point drift
  });

  it("rejects junk, too many decimals, and amounts Stripe won't charge", () => {
    expect(parsePriceInput("abc")).toHaveProperty("error");
    expect(parsePriceInput("1.999")).toHaveProperty("error");
    expect(parsePriceInput("-5")).toHaveProperty("error");
    expect(parsePriceInput("1e3")).toHaveProperty("error");
    expect(parsePriceInput("")).toHaveProperty("error");
    expect(parsePriceInput("0.49")).toEqual({ error: "Stripe's minimum charge is $0.50." });
    expect(parsePriceInput("10001")).toEqual({ error: "Amount is too large." });
  });
});

describe("subscription statuses", () => {
  it("maps Stripe's statuses onto ours, treating unknown ones as no access", () => {
    for (const s of ["incomplete", "trialing", "active", "past_due", "unpaid", "canceled"]) expect(mapStripeStatus(s)).toBe(s);
    expect(mapStripeStatus("incomplete_expired")).toBe("canceled");
    expect(mapStripeStatus("paused")).toBe("unpaid");
    expect(mapStripeStatus("something_new")).toBe("unpaid");
  });

  it("keeps the plan while active, trialing or retrying a failed payment, and not otherwise", () => {
    for (const s of ["active", "trialing", "past_due"]) expect(grantsAccess(mapStripeStatus(s))).toBe(true);
    for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) expect(grantsAccess(mapStripeStatus(s))).toBe(false);
  });

  it("knows which statuses hold the account's one current-subscription slot", () => {
    for (const s of ["incomplete", "trialing", "active", "past_due"]) expect(isCurrentStatus(s)).toBe(true);
    for (const s of ["unpaid", "canceled"]) expect(isCurrentStatus(s)).toBe(false);
  });
});

describe("helpers", () => {
  it("formats money", () => {
    expect(formatMoney(1200)).toBe("$12");
    expect(formatMoney(1299)).toBe("$12.99");
    expect(formatMoney(1250)).toBe("$12.50");
  });

  it("computes yearly savings", () => {
    expect(yearlySavingsPercent(1000, 10000)).toBe(17);
    expect(yearlySavingsPercent(1000, 12000)).toBe(0);
    expect(yearlySavingsPercent(0, 10000)).toBe(0);
    expect(yearlySavingsPercent(1000, 0)).toBe(0);
  });

  it("recognizes plans, intervals and key modes", () => {
    expect(isPaidPlan("pro")).toBe(true);
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan(undefined)).toBe(false);
    expect(isInterval("year")).toBe(true);
    expect(isInterval("week")).toBe(false);
    expect(stripeMode("sk_live_abc")).toBe("live");
    expect(stripeMode("rk_live_abc")).toBe("live");
    expect(stripeMode("sk_test_abc")).toBe("test");
    expect(stripeMode(undefined)).toBeNull();
  });
});

describe("encodeForm", () => {
  it("writes nested objects and arrays the way Stripe expects", () => {
    const encoded = encodeForm({ mode: "subscription", line_items: [{ price: "price_1", quantity: 1 }], subscription_data: { metadata: { accountId: "a b" } }, skip: undefined, also: null, flag: true });
    expect(decodeURIComponent(encoded).replace(/\+/g, " ")).toBe("mode=subscription&line_items[0][price]=price_1&line_items[0][quantity]=1&subscription_data[metadata][accountId]=a b&flag=true");
  });
});

describe("verifyWebhook", () => {
  const secret = "whsec_unit_not_real";
  const now = 1_800_000_000;
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid", data: { object: { id: "in_1" } } });
  const sign = (payload: string, key = secret, t = now) => `t=${t},v1=${createHmac("sha256", key).update(`${t}.${payload}`).digest("hex")}`;

  it("accepts a correctly signed, recent event", () => {
    expect(verifyWebhook(body, sign(body), secret, now)).toMatchObject({ id: "evt_1", type: "invoice.paid" });
  });

  it("accepts when any of several v1 signatures matches (secret rotation)", () => {
    expect(verifyWebhook(body, `${sign(body)},v1=${"0".repeat(64)}`, secret, now)?.id).toBe("evt_1");
  });

  it("rejects a wrong secret, a changed body, and a missing or malformed header", () => {
    expect(verifyWebhook(body, sign(body, "whsec_other"), secret, now)).toBeNull();
    expect(verifyWebhook(body.replace("in_1", "in_2"), sign(body), secret, now)).toBeNull();
    expect(verifyWebhook(body, null, secret, now)).toBeNull();
    expect(verifyWebhook(body, "", secret, now)).toBeNull();
    expect(verifyWebhook(body, "t=abc,v1=zz", secret, now)).toBeNull();
    expect(verifyWebhook(body, `t=${now},v1=abcd`, secret, now)).toBeNull();
    expect(verifyWebhook(body, sign(body), "", now)).toBeNull();
  });

  it("rejects events outside the five-minute window (replay protection)", () => {
    expect(verifyWebhook(body, sign(body, secret, now - 301), secret, now)).toBeNull();
    expect(verifyWebhook(body, sign(body, secret, now - 299), secret, now)).not.toBeNull();
  });

  it("rejects a signed body that isn't an event", () => {
    for (const bad of ["not json", "{}", JSON.stringify({ id: "evt_1", type: "x", data: {} })]) {
      expect(verifyWebhook(bad, sign(bad), secret, now)).toBeNull();
    }
  });
});
