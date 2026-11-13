import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createLogger, redact } from "@/lib/logger";
import { AppError, GENERIC_ERROR, statusFor } from "@/lib/errors";
import { emailSchema, parseInput, passwordSchema } from "@/lib/validation";
import { runAction } from "@/lib/actions";
import { env, resetEnvCache } from "@/lib/env";

describe("logger", () => {
  it("redacts sensitive keys at any depth", () => {
    const out = redact({ user: { email: "a@b.c", password: "x", nested: { apiKey: "k", authorization: "Bearer y" } } });
    expect(out).toEqual({ user: { email: "a@b.c", password: "[redacted]", nested: { apiKey: "[redacted]", authorization: "[redacted]" } } });
  });

  it("serializes errors without losing the message", () => {
    const out = redact({ err: new Error("boom") }) as { err: { message: string } };
    expect(out.err.message).toBe("boom");
  });

  it("respects LOG_LEVEL and includes child context", () => {
    vi.stubEnv("LOG_LEVEL", "warn");
    const lines: string[] = [];
    const log = createLogger({ app: "t" }, (l) => lines.push(l)).child({ module: "m" });
    log.info("hidden");
    log.warn("shown", { token: "secret-value" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("shown");
    expect(lines[0]).toContain('"module":"m"');
    expect(lines[0]).not.toContain("secret-value");
  });
});

describe("validation", () => {
  it("normalizes email", () => {
    expect(emailSchema.parse("  Stephen@Example.COM ")).toBe("stephen@example.com");
  });

  it("enforces password length", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("long-enough-1").success).toBe(true);
  });

  it("parseInput throws a user-safe AppError with the first issue", () => {
    const fd = new FormData();
    fd.set("email", "nope");
    expect(() => parseInput(z.object({ email: emailSchema }), fd)).toThrowError("Enter a valid email address.");
  });
});

describe("runAction", () => {
  it("returns the public message for AppError", async () => {
    const r = await runAction("t", async () => {
      throw new AppError("CONFLICT", "Already exists.");
    }, { email: "a@b.c" });
    expect(r).toEqual({ error: "Already exists.", values: { email: "a@b.c" } });
  });

  it("hides internal errors behind a generic message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runAction("t", async () => {
      throw new Error("database password is hunter2");
    });
    expect(r?.error).toBe(GENERIC_ERROR);
  });

  it("maps error codes to HTTP statuses", () => {
    expect(statusFor("RATE_LIMITED")).toBe(429);
    expect(statusFor("PLAN_LIMIT")).toBe(403);
  });
});

describe("env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it("rejects a short AUTH_SECRET with a helpful message", () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("AUTH_SECRET", "too-short");
    resetEnvCache();
    expect(() => env()).toThrowError(/AUTH_SECRET/);
  });

  it("needs both Stripe keys or neither", () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("AUTH_SECRET", "x".repeat(40));
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_not_a_real_key");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    resetEnvCache();
    expect(() => env()).toThrowError(/STRIPE_WEBHOOK_SECRET/);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_not_a_real_secret");
    resetEnvCache();
    expect(env().STRIPE_API_URL).toBe("https://api.stripe.com");
  });

  it("treats blank optional integrations as unset", () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("AUTH_SECRET", "x".repeat(40));
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    resetEnvCache();
    expect(env().STRIPE_SECRET_KEY).toBeUndefined();
  });
});
