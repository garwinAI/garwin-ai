import { afterEach, describe, expect, it, vi } from "vitest";
import { passwordMentionsEmail, passwordSchema, needsRehash } from "@/lib/security/password";
import { isSameOrigin } from "@/lib/security/origin";
import { tokenFromHash } from "@/components/auth/token-from-hash";
import { escapeHtml, passwordResetMessage, verifyEmailMessage } from "@/server/email/templates";
import { describeAgent } from "@/lib/user-agent";
import { env, resetEnvCache } from "@/lib/env";

describe("password policy", () => {
  const ok = (p: string) => passwordSchema.safeParse(p).success;

  it("accepts a reasonable password", () => {
    expect(ok("purple-otter-sings-42")).toBe(true);
  });

  it.each([
    ["too short", "short1"],
    ["common", "password123"],
    ["common, different case", "PassWord123"],
    ["too few distinct characters", "aaaaaaaaaaab"],
    ["over 72 bytes (bcrypt would truncate)", "x1".repeat(37)],
    ["over 72 bytes with multi-byte characters", "🔒a".repeat(19)],
  ])("rejects %s", (_label, p) => {
    expect(ok(p)).toBe(false);
  });

  it("rejects passwords containing the email name", () => {
    expect(passwordMentionsEmail("stephen-rocks-2026", "stephen@example.com")).toBe(true);
    expect(passwordMentionsEmail("blue-harbor-lights", "stephen@example.com")).toBe(false);
  });

  it("flags hashes below the current bcrypt cost for upgrade", () => {
    expect(needsRehash("$2b$10$abcdefghijklmnopqrstuuJ4E6cFqqxSZG4xKsqE3hQ4uK0f2Hj2")).toBe(true);
    expect(needsRehash("$2b$12$abcdefghijklmnopqrstuuJ4E6cFqqxSZG4xKsqE3hQ4uK0f2Hj2")).toBe(false);
    expect(needsRehash("not-a-hash")).toBe(true);
  });
});

describe("CSRF origin check for route handlers", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  const app = "https://dev.garwinai.com";

  it("allows safe methods without an Origin", () => {
    expect(isSameOrigin("GET", h({}), app)).toBe(true);
  });
  it("allows same-origin POST", () => {
    expect(isSameOrigin("POST", h({ origin: app, host: "dev.garwinai.com" }), app)).toBe(true);
  });
  it("rejects cross-origin POST", () => {
    expect(isSameOrigin("POST", h({ origin: "https://evil.example", host: "dev.garwinai.com" }), app)).toBe(false);
  });
  it("rejects POST with no Origin", () => {
    expect(isSameOrigin("DELETE", h({ host: "dev.garwinai.com" }), app)).toBe(false);
  });
});

describe("email links", () => {
  it("reads only well-formed tokens from the fragment", () => {
    const t = "A".repeat(43);
    expect(tokenFromHash(`#token=${t}`)).toBe(t);
    expect(tokenFromHash("#token=short")).toBeNull();
    expect(tokenFromHash("#token=<script>alert(1)</script>")).toBeNull();
    expect(tokenFromHash("")).toBeNull();
  });

  it("escapes user-controlled values in HTML emails", () => {
    expect(escapeHtml(`<img src=x onerror="a">&'`)).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;");
    const msg = verifyEmailMessage("a@b.c", "<b>Eve</b>", "https://x/verify-email#token=t");
    expect(msg.html).not.toContain("<b>Eve</b>");
    expect(msg.html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
  });

  it("states expiry in reset emails", () => {
    expect(passwordResetMessage("a@b.c", "Al", "https://x").text).toContain("30 minutes");
  });
});

describe("user agent description", () => {
  it("names common browsers", () => {
    expect(describeAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(describeAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iOS");
    expect(describeAgent(null)).toBe("Unknown device");
  });
});

describe("email configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });
  const base = () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("AUTH_SECRET", "x".repeat(40));
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_TRANSPORT", "");
    vi.stubEnv("MAIL_LOG_FILE", "");
  };

  it("uses the console transport in development without a key", () => {
    base();
    vi.stubEnv("NODE_ENV", "development");
    resetEnvCache();
    expect(env().EMAIL_TRANSPORT).toBe("console");
  });

  it("uses Resend when a key is present", () => {
    base();
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    resetEnvCache();
    expect(env().EMAIL_TRANSPORT).toBe("resend");
  });

  it("refuses to start in production without a real email provider", () => {
    base();
    vi.stubEnv("NODE_ENV", "production");
    resetEnvCache();
    expect(() => env()).toThrowError(/RESEND_API_KEY/);
  });

  it("refuses MAIL_LOG_FILE in production", () => {
    base();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_live_123");
    vi.stubEnv("MAIL_LOG_FILE", "/tmp/mail.log");
    resetEnvCache();
    expect(() => env()).toThrowError(/MAIL_LOG_FILE/);
  });
});
