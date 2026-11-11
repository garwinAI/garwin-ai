import { describe, expect, it } from "vitest";
import { EnvError, validateEnv } from "@/lib/env";

const base = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/garwin",
  AUTH_SECRET: "x".repeat(40),
};

describe("validateEnv", () => {
  it("accepts the minimum config and applies defaults", () => {
    const env = validateEnv(base);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it("treats blank optional values as unset", () => {
    expect(validateEnv({ ...base, STRIPE_SECRET_KEY: "" }).STRIPE_SECRET_KEY).toBeUndefined();
  });

  it("lists every problem at once", () => {
    try {
      validateEnv({ DATABASE_URL: "mysql://nope", AUTH_SECRET: "short" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      const problems = (err as EnvError).problems.join("\n");
      expect(problems).toContain("DATABASE_URL");
      expect(problems).toContain("AUTH_SECRET");
    }
  });

  it("requires all Twilio variables together", () => {
    expect(() => validateEnv({ ...base, TWILIO_ACCOUNT_SID: "AC123" })).toThrow(/TWILIO/);
  });

  it("rejects an unsafe AppZone sandbox origin", () => {
    expect(() =>
      validateEnv({ ...base, APP_URL: "https://dev.garwinai.com", APPZONE_SANDBOX_ORIGIN: "https://garwinai.com" }),
    ).toThrow(/APPZONE_SANDBOX_ORIGIN/);
  });

  it("checks the Stripe keys", () => {
    expect(() => validateEnv({ ...base, STRIPE_SECRET_KEY: "sk_test_abc" })).toThrow(/together/);
    expect(() => validateEnv({ ...base, STRIPE_SECRET_KEY: "pk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_x" })).toThrow(/sk_test_/);
    expect(() => validateEnv({ ...base, STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "nope" })).toThrow(/whsec_/);
    expect(validateEnv({ ...base, STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_x" }).STRIPE_SECRET_KEY).toBe("sk_test_abc");
  });

  it("refuses the test-only Stripe server setting in production", () => {
    const prod = { ...base, NODE_ENV: "production" };
    expect(() => validateEnv({ ...prod, STRIPE_API_BASE: "https://evil.example" })).toThrow(/STRIPE_API_BASE/);
    expect(validateEnv({ ...prod, STRIPE_API_BASE: "http://localhost:3199" }).STRIPE_API_BASE).toBe("http://localhost:3199");
  });
});
