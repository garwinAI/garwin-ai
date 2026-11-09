// Authentication flows. Framework-independent (request metadata is passed in), so they can be
// tested directly against the database. Server actions in src/lib/auth/actions.ts call these.
import "server-only";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  dummyHash,
  hashPassword,
  needsRehash,
  passwordMentionsEmail,
  passwordSchema,
  verifyPassword,
} from "@/lib/security/password";
import { sendEmail } from "@/server/email/send";
import { passwordChangedMessage, passwordResetMessage, verifyEmailMessage } from "@/server/email/templates";
import type { User } from "@/db/schema";
import { consumeToken, issueToken, peekToken } from "./auth-tokens";
import { enforce, hit, LIMITS, resetLimit } from "./rate-limit";
import { recordSecurityEvent, type RequestMeta } from "./security-events";
import { revokeAllSessions, revokeSession } from "./sessions";
import { createUser, findUserByEmail, findUserById, markEmailVerified, setPasswordHash, type PublicUser } from "./users";

const log = logger.child({ module: "auth" });
const ipKey = (meta: RequestMeta) => meta.ip ?? "unknown";

function checkPassword(password: string, email: string) {
  const policy = passwordSchema.safeParse(password);
  if (!policy.success) throw new AppError("VALIDATION", policy.error.issues[0].message);
  if (passwordMentionsEmail(password, email)) {
    throw new AppError("VALIDATION", "Your password can't contain your email address.");
  }
}

function link(path: string, token: string) {
  // The token goes in the URL fragment (#), which browsers never send to servers, proxies or
  // analytics, and never include in the Referer header.
  return `${env().APP_URL}${path}#token=${token}`;
}

// ---------------------------------------------------------------- registration

export async function registerUser(input: { name: string; email: string; password: string }, meta: RequestMeta) {
  await enforce(`signup:ip:${ipKey(meta)}`, LIMITS.signupPerIp, "Too many sign-ups from this network. Try again later.");
  checkPassword(input.password, input.email);
  if (await findUserByEmail(input.email)) {
    throw new AppError("CONFLICT", "An account with that email already exists.");
  }
  const user = await createUser({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password) });
  await recordSecurityEvent({ userId: user.id, email: user.email, event: "signup", ...meta });
  log.info("user.signed_up", { userId: user.id });
  return user;
}

// ---------------------------------------------------------------- sign in

export async function authenticate(input: { email: string; password: string }, meta: RequestMeta): Promise<User> {
  const tooMany = "Too many sign-in attempts. Try again in a few minutes.";
  await enforce(`login:ip:${ipKey(meta)}`, LIMITS.loginPerIp, tooMany);
  await enforce(`login:email-ip:${input.email}|${ipKey(meta)}`, LIMITS.loginPerEmailAndIp, tooMany);
  await enforce(`login:email:${input.email}`, LIMITS.loginPerEmail, tooMany);

  const user = await findUserByEmail(input.email);
  const valid = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash()));
  await recordSecurityEvent({ userId: user?.id ?? null, email: input.email, event: "login", success: Boolean(user && valid), ...meta });
  if (!user || !valid) throw new AppError("UNAUTHENTICATED", "Incorrect email or password.");

  await resetLimit(`login:email-ip:${input.email}|${ipKey(meta)}`);
  if (needsRehash(user.passwordHash)) await setPasswordHash(user.id, await hashPassword(input.password));
  return user;
}

export async function logout(user: PublicUser, sessionId: string, meta: RequestMeta) {
  await revokeSession(user.id, sessionId);
  await recordSecurityEvent({ userId: user.id, email: user.email, event: "logout", ...meta });
}

// ---------------------------------------------------------------- email verification

export async function sendVerificationEmail(user: Pick<User, "id" | "email" | "name">, meta: RequestMeta) {
  const token = await issueToken(user.id, "email_verification");
  await sendEmail(verifyEmailMessage(user.email, user.name, link("/verify-email", token)));
  await recordSecurityEvent({ userId: user.id, email: user.email, event: "email_verification_sent", ...meta });
}

export async function resendVerification(user: PublicUser, meta: RequestMeta) {
  if (user.emailVerifiedAt) throw new AppError("CONFLICT", "Your email is already verified.");
  await enforce(`verify-resend:user:${user.id}`, LIMITS.verifyResendPerUser, "You've asked for several emails already. Check your inbox and spam folder, or try again later.");
  await sendVerificationEmail(user, meta);
}

/** Returns true when the token was valid and the email is now verified. */
export async function verifyEmail(token: unknown, meta: RequestMeta) {
  const used = await consumeToken(token, "email_verification");
  if (!used) return false;
  const user = await findUserById(used.userId);
  if (!user) return false;
  await markEmailVerified(user.id);
  await recordSecurityEvent({ userId: user.id, email: user.email, event: "email_verified", ...meta });
  return true;
}

// ---------------------------------------------------------------- password reset

/**
 * Sends a reset link if the account exists. Always behaves the same from the caller's point of
 * view, so it can't be used to discover which emails are registered.
 */
export async function requestPasswordReset(email: string, meta: RequestMeta) {
  const perEmail = await hit(`reset-req:email:${email}`, LIMITS.resetRequestPerEmail);
  if (!perEmail.allowed) return;
  const user = await findUserByEmail(email);
  if (!user) return;
  const token = await issueToken(user.id, "password_reset");
  await sendEmail(passwordResetMessage(user.email, user.name, link("/reset-password", token)));
  await recordSecurityEvent({ userId: user.id, email: user.email, event: "password_reset_requested", ...meta });
}

export async function isResetTokenValid(token: unknown) {
  return (await peekToken(token, "password_reset")) !== null;
}

export async function resetPassword(token: unknown, newPassword: string, meta: RequestMeta) {
  await enforce(`reset-submit:ip:${ipKey(meta)}`, LIMITS.resetSubmitPerIp);
  const expired = "This reset link is invalid or has expired. Request a new one.";

  // Validate the new password BEFORE using up the token, so a weak password doesn't burn the link.
  const pending = await peekToken(token, "password_reset");
  if (!pending) throw new AppError("VALIDATION", expired);
  const user = await findUserById(pending.userId);
  if (!user) throw new AppError("VALIDATION", expired);
  checkPassword(newPassword, user.email);

  const used = await consumeToken(token, "password_reset");
  if (!used || used.userId !== user.id) throw new AppError("VALIDATION", expired);

  await setPasswordHash(user.id, await hashPassword(newPassword));
  await revokeAllSessions(user.id);
  // Receiving the reset email proves the user controls the address.
  await markEmailVerified(user.id);
  await recordSecurityEvent({ userId: user.id, email: user.email, event: "password_reset", ...meta });
  await notifyPasswordChanged(user, meta);
  log.info("auth.password_reset", { userId: user.id });
}

// ---------------------------------------------------------------- signed-in account security

export async function changePassword(
  user: PublicUser,
  input: { current: string; next: string },
  currentSessionId: string,
  meta: RequestMeta,
) {
  await enforce(`pwchange:user:${user.id}`, LIMITS.passwordChangePerUser);
  const full = await findUserById(user.id);
  if (!full || !(await verifyPassword(input.current, full.passwordHash))) {
    throw new AppError("VALIDATION", "Current password is incorrect.");
  }
  if (input.current === input.next) throw new AppError("VALIDATION", "Choose a password you haven't just used.");
  checkPassword(input.next, full.email);

  await setPasswordHash(user.id, await hashPassword(input.next));
  const signedOut = await revokeAllSessions(user.id, currentSessionId);
  await recordSecurityEvent({ userId: user.id, email: user.email, event: "password_changed", ...meta });
  await notifyPasswordChanged(full, meta);
  log.info("auth.password_changed", { userId: user.id, otherSessionsRevoked: signedOut });
  return signedOut;
}

export async function signOutSession(user: PublicUser, sessionId: string, meta: RequestMeta) {
  const ok = await revokeSession(user.id, sessionId);
  if (!ok) throw new AppError("NOT_FOUND", "That session has already ended.");
  await recordSecurityEvent({ userId: user.id, email: user.email, event: "session_revoked", ...meta });
}

export async function signOutOtherSessions(user: PublicUser, currentSessionId: string, meta: RequestMeta) {
  const n = await revokeAllSessions(user.id, currentSessionId);
  await recordSecurityEvent({ userId: user.id, email: user.email, event: "sessions_revoked", ...meta });
  return n;
}

export async function signOutEverywhere(user: PublicUser, meta: RequestMeta) {
  await revokeAllSessions(user.id);
  await recordSecurityEvent({ userId: user.id, email: user.email, event: "sessions_revoked", ...meta });
}

async function notifyPasswordChanged(user: Pick<User, "email" | "name">, meta: RequestMeta) {
  try {
    await sendEmail(passwordChangedMessage(user.email, user.name, new Date(), meta.ip, `${env().APP_URL}/settings/security`));
  } catch (err) {
    // The password change already happened; a failed notice must not undo or hide it.
    log.error("email.password_changed_failed", { err });
  }
}
