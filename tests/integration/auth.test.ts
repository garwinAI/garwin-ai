import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { authTokens, loginEvents, rateLimits, sessions, users } from "@/db/schema";
import {
  authenticate,
  changePassword,
  registerUser,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  sendVerificationEmail,
  signOutOtherSessions,
  signOutSession,
  verifyEmail,
} from "@/server/services/auth";
import { createSession, listActiveSessions, revokeSession, validateSessionToken } from "@/server/services/sessions";
import { consumeToken, issueToken } from "@/server/services/auth-tokens";
import { hit } from "@/server/services/rate-limit";
import { findUserById, toPublicUser } from "@/server/services/users";
import { AppError } from "@/lib/errors";
import { hashToken } from "@/lib/security/tokens";
import { freshMeta, latestToken, mailsTo, STRONG, uniqueEmail } from "./helpers";

async function newUser(tag = "u") {
  const email = uniqueEmail(tag);
  const user = await registerUser({ name: "Test User", email, password: STRONG }, freshMeta());
  return { user, email };
}

const rejects = async (p: Promise<unknown>, code: AppError["code"], message?: RegExp) => {
  const err = await p.then(() => null, (e) => e);
  expect(err, "expected an AppError").toBeInstanceOf(AppError);
  expect(err.code).toBe(code);
  if (message) expect(err.publicMessage).toMatch(message);
};

describe("registration", () => {
  it("creates an unverified user with a bcrypt hash, never the plain password", async () => {
    const { user } = await newUser();
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(user.passwordHash).not.toContain(STRONG);
    expect(toPublicUser(user)).not.toHaveProperty("passwordHash");
  });

  it("rejects a duplicate email", async () => {
    const { email } = await newUser();
    await rejects(registerUser({ name: "Again", email, password: STRONG }, freshMeta()), "CONFLICT");
  });

  it("rejects weak passwords and passwords containing the email", async () => {
    await rejects(registerUser({ name: "W", email: uniqueEmail(), password: "password123" }, freshMeta()), "VALIDATION", /common/);
    const email = uniqueEmail("zelda");
    await rejects(registerUser({ name: "W", email, password: `${email.split("@")[0]}!!x` }, freshMeta()), "VALIDATION", /email/);
  });

  it("limits sign-ups per IP", async () => {
    const meta = freshMeta();
    for (let i = 0; i < 5; i++) await registerUser({ name: "R", email: uniqueEmail("rl"), password: STRONG }, meta);
    await rejects(registerUser({ name: "R", email: uniqueEmail("rl"), password: STRONG }, meta), "RATE_LIMITED");
  });
});

describe("login", () => {
  it("succeeds with the right password and records the IP", async () => {
    const { email, user } = await newUser();
    const meta = freshMeta();
    const signedIn = await authenticate({ email, password: STRONG }, meta);
    expect(signedIn.id).toBe(user.id);
    const [event] = await db.select().from(loginEvents).where(eq(loginEvents.userId, user.id)).orderBy(sql`created_at desc`).limit(1);
    expect(event).toMatchObject({ event: "login", success: true, ip: meta.ip });
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const { email } = await newUser();
    await rejects(authenticate({ email, password: "wrong-password-1" }, freshMeta()), "UNAUTHENTICATED", /^Incorrect email or password\.$/);
    await rejects(authenticate({ email: uniqueEmail("nobody"), password: STRONG }, freshMeta()), "UNAUTHENTICATED", /^Incorrect email or password\.$/);
  });

  it("records failed attempts", async () => {
    const { email, user } = await newUser();
    await authenticate({ email, password: "wrong-password-1" }, freshMeta()).catch(() => {});
    const rows = await db.select().from(loginEvents).where(eq(loginEvents.userId, user.id));
    expect(rows.some((r) => r.event === "login" && !r.success)).toBe(true);
  });

  it("blocks after 5 attempts for the same email from one IP, even with the right password", async () => {
    const { email } = await newUser();
    const meta = freshMeta();
    for (let i = 0; i < 5; i++) await authenticate({ email, password: "wrong-password-1" }, meta).catch(() => {});
    await rejects(authenticate({ email, password: STRONG }, meta), "RATE_LIMITED");
    // A different network is unaffected, so an attacker can't lock the real owner out.
    const ok = await authenticate({ email, password: STRONG }, freshMeta());
    expect(ok.email).toBe(email);
  });

  it("clears the per-device counter after a successful login", async () => {
    const { email } = await newUser();
    const meta = freshMeta();
    for (let i = 0; i < 4; i++) await authenticate({ email, password: "wrong-password-1" }, meta).catch(() => {});
    await authenticate({ email, password: STRONG }, meta);
    for (let i = 0; i < 4; i++) await authenticate({ email, password: "wrong-password-1" }, meta).catch(() => {});
    expect((await authenticate({ email, password: STRONG }, meta)).email).toBe(email);
  });

  it("upgrades an old, weaker password hash on login", async () => {
    const { email, user } = await newUser();
    await db.update(users).set({ passwordHash: await bcrypt.hash(STRONG, 10) }).where(eq(users.id, user.id));
    await authenticate({ email, password: STRONG }, freshMeta());
    expect(bcrypt.getRounds((await findUserById(user.id))!.passwordHash)).toBe(12);
  });
});

describe("sessions", () => {
  it("stores only a keyed hash of the token", async () => {
    const { user } = await newUser();
    const { token, session } = await createSession(user.id, freshMeta());
    expect(session.tokenHash).not.toBe(token);
    expect(session.tokenHash).toBe(hashToken(token));
    expect((await validateSessionToken(token))?.user.id).toBe(user.id);
  });

  it("rejects garbage, revoked, expired and idle sessions", async () => {
    const { user } = await newUser();
    expect(await validateSessionToken("not-a-token")).toBeNull();
    expect(await validateSessionToken(undefined)).toBeNull();

    const a = await createSession(user.id, freshMeta());
    await revokeSession(user.id, a.session.id);
    expect(await validateSessionToken(a.token)).toBeNull();

    const b = await createSession(user.id, freshMeta());
    await db.update(sessions).set({ expiresAt: sql`now() - interval '1 minute'` }).where(eq(sessions.id, b.session.id));
    expect(await validateSessionToken(b.token)).toBeNull();

    const c = await createSession(user.id, freshMeta());
    await db.update(sessions).set({ lastSeenAt: sql`now() - interval '8 days'` }).where(eq(sessions.id, c.session.id));
    expect(await validateSessionToken(c.token)).toBeNull();
  });

  it("can't revoke another user's session", async () => {
    const alice = await newUser("alice");
    const bob = await newUser("bob");
    const bobs = await createSession(bob.user.id, freshMeta());
    expect(await revokeSession(alice.user.id, bobs.session.id)).toBe(false);
    expect(await validateSessionToken(bobs.token)).not.toBeNull();
    await rejects(signOutSession(toPublicUser(alice.user), bobs.session.id, freshMeta()), "NOT_FOUND");
  });

  it("signs out other devices but keeps the current one", async () => {
    const { user } = await newUser();
    const current = await createSession(user.id, freshMeta());
    const other1 = await createSession(user.id, freshMeta());
    const other2 = await createSession(user.id, freshMeta());
    expect(await signOutOtherSessions(toPublicUser(user), current.session.id, freshMeta())).toBe(2);
    expect(await validateSessionToken(current.token)).not.toBeNull();
    expect(await validateSessionToken(other1.token)).toBeNull();
    expect(await validateSessionToken(other2.token)).toBeNull();
    expect((await listActiveSessions(user.id)).map((s) => s.id)).toEqual([current.session.id]);
  });
});

describe("email verification", () => {
  it("verifies with the emailed link, once", async () => {
    const { user, email } = await newUser("verify");
    await sendVerificationEmail(user, freshMeta());
    const token = latestToken(email, "verify_email");

    expect(await verifyEmail(token, freshMeta())).toBe(true);
    expect((await findUserById(user.id))!.emailVerifiedAt).not.toBeNull();
    expect(await verifyEmail(token, freshMeta())).toBe(false); // single use
  });

  it("rejects expired, malformed and wrong-purpose tokens", async () => {
    const { user } = await newUser();
    expect(await verifyEmail("x".repeat(43), freshMeta())).toBe(false);
    expect(await verifyEmail("<script>", freshMeta())).toBe(false);

    const expired = await issueToken(user.id, "email_verification");
    await db.update(authTokens).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(authTokens.tokenHash, hashToken(expired)));
    expect(await verifyEmail(expired, freshMeta())).toBe(false);

    const reset = await issueToken(user.id, "password_reset");
    expect(await verifyEmail(reset, freshMeta())).toBe(false);
  });

  it("invalidates the previous link when a new one is sent", async () => {
    const { user } = await newUser();
    const first = await issueToken(user.id, "email_verification");
    const second = await issueToken(user.id, "email_verification");
    expect(await consumeToken(first, "email_verification")).toBeNull();
    expect(await consumeToken(second, "email_verification")).not.toBeNull();
  });

  it("lets only one of two simultaneous uses succeed", async () => {
    const { user } = await newUser();
    const token = await issueToken(user.id, "email_verification");
    const results = await Promise.all([consumeToken(token, "email_verification"), consumeToken(token, "email_verification")]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("limits resends and refuses once verified", async () => {
    const { user } = await newUser();
    const pub = toPublicUser(user);
    for (let i = 0; i < 3; i++) await resendVerification(pub, freshMeta());
    await rejects(resendVerification(pub, freshMeta()), "RATE_LIMITED");
    await rejects(resendVerification({ ...pub, emailVerifiedAt: new Date() }, freshMeta()), "CONFLICT");
  });
});

describe("password reset", () => {
  it("sends nothing for unknown emails (and doesn't throw)", async () => {
    const email = uniqueEmail("ghost");
    await requestPasswordReset(email, freshMeta());
    expect(mailsTo(email)).toHaveLength(0);
  });

  it("resets the password, signs out every session and verifies the email", async () => {
    const { user, email } = await newUser("reset");
    const session = await createSession(user.id, freshMeta());
    await requestPasswordReset(email, freshMeta());
    const token = latestToken(email, "password_reset");

    await resetPassword(token, "new-river-stones-88", freshMeta());

    expect(await validateSessionToken(session.token)).toBeNull();
    expect((await findUserById(user.id))!.emailVerifiedAt).not.toBeNull();
    await rejects(authenticate({ email, password: STRONG }, freshMeta()), "UNAUTHENTICATED");
    expect((await authenticate({ email, password: "new-river-stones-88" }, freshMeta())).id).toBe(user.id);
    expect(mailsTo(email).some((m) => m.tag === "password_changed")).toBe(true);
  });

  it("can't reuse a reset link", async () => {
    const { email } = await newUser();
    await requestPasswordReset(email, freshMeta());
    const token = latestToken(email, "password_reset");
    await resetPassword(token, "new-river-stones-88", freshMeta());
    await rejects(resetPassword(token, "another-strong-pass-9", freshMeta()), "VALIDATION", /invalid or has expired/);
  });

  it("doesn't burn the link when the new password is too weak", async () => {
    const { email } = await newUser();
    await requestPasswordReset(email, freshMeta());
    const token = latestToken(email, "password_reset");
    await rejects(resetPassword(token, "password123", freshMeta()), "VALIDATION", /common/);
    await resetPassword(token, "new-river-stones-88", freshMeta());
  });

  it("rejects an expired link", async () => {
    const { email } = await newUser();
    await requestPasswordReset(email, freshMeta());
    const token = latestToken(email, "password_reset");
    await db.update(authTokens).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(authTokens.tokenHash, hashToken(token)));
    await rejects(resetPassword(token, "new-river-stones-88", freshMeta()), "VALIDATION", /expired/);
  });

  it("caps reset emails per address without revealing it", async () => {
    const { email } = await newUser();
    for (let i = 0; i < 5; i++) await requestPasswordReset(email, freshMeta());
    expect(mailsTo(email).filter((m) => m.tag === "password_reset")).toHaveLength(3);
  });
});

describe("changing password while signed in", () => {
  it("requires the current password", async () => {
    const { user } = await newUser();
    const s = await createSession(user.id, freshMeta());
    await rejects(changePassword(toPublicUser(user), { current: "wrong-pass-123", next: "new-river-stones-88" }, s.session.id, freshMeta()), "VALIDATION", /incorrect/);
  });

  it("rejects reusing the same password", async () => {
    const { user } = await newUser();
    const s = await createSession(user.id, freshMeta());
    await rejects(changePassword(toPublicUser(user), { current: STRONG, next: STRONG }, s.session.id, freshMeta()), "VALIDATION");
  });

  it("changes it, keeps this device and signs out the others", async () => {
    const { user, email } = await newUser();
    const here = await createSession(user.id, freshMeta());
    const there = await createSession(user.id, freshMeta());
    const n = await changePassword(toPublicUser(user), { current: STRONG, next: "new-river-stones-88" }, here.session.id, freshMeta());
    expect(n).toBe(1);
    expect(await validateSessionToken(here.token)).not.toBeNull();
    expect(await validateSessionToken(there.token)).toBeNull();
    expect((await authenticate({ email, password: "new-river-stones-88" }, freshMeta())).id).toBe(user.id);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit, then blocks until the window passes", async () => {
    const key = `test:${Math.random()}`;
    const limit = { limit: 2, windowSec: 60 };
    expect((await hit(key, limit)).allowed).toBe(true);
    expect((await hit(key, limit)).allowed).toBe(true);
    const blocked = await hit(key, limit);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);

    await db.update(rateLimits).set({ windowStart: sql`now() - interval '2 minutes'` }).where(eq(rateLimits.key, key));
    expect((await hit(key, limit)).allowed).toBe(true);
  });

  it("counts concurrent requests exactly", async () => {
    const key = `test:${Math.random()}`;
    const results = await Promise.all(Array.from({ length: 10 }, () => hit(key, { limit: 3, windowSec: 60 })));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });
});
