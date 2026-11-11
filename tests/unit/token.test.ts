import { beforeAll, describe, expect, it } from "vitest";
import { signSession, verifySession } from "@/lib/auth/token";

beforeAll(() => {
  process.env.AUTH_SECRET = "unit-test-secret-".padEnd(48, "x");
});

describe("session tokens", () => {
  it("round-trips the claims", async () => {
    const token = await signSession({ sub: "user-1", role: "admin", sv: 3 });
    expect(await verifySession(token)).toEqual({ sub: "user-1", role: "admin", sv: 3 });
  });

  it("rejects missing, tampered and foreign tokens", async () => {
    const token = await signSession({ sub: "user-1", role: "member", sv: 0 });
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession(token.slice(0, -2) + "xx")).toBeNull();
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "another-secret-".padEnd(48, "y");
    expect(await verifySession(token)).toBeNull();
    process.env.AUTH_SECRET = original;
  });
});
