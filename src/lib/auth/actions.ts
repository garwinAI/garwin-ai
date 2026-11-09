"use server";

// Thin wrappers: parse input, call the auth service, manage the cookie, redirect.
// CSRF: Server Actions only accept POSTs whose Origin matches the Host (built into Next.js),
// and the session cookie is SameSite=Lax.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { emailSchema, nameSchema, parseInput, uuidSchema } from "@/lib/validation";
import { safeNextPath } from "@/lib/security/redirect";
import {
  authenticate,
  changePassword as changePasswordFlow,
  logout,
  registerUser,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  sendVerificationEmail,
  signOutEverywhere,
  signOutOtherSessions,
  signOutSession,
  verifyEmail,
} from "@/server/services/auth";
import { enforce, LIMITS } from "@/server/services/rate-limit";
import { updateUserName } from "@/server/services/users";
import { clearSessionCookie, getCurrentSession, requestMeta, requireSession, startSession } from "./session";

export type { FormState };

const log = logger.child({ module: "auth-actions" });

// ---------------------------------------------------------------- sign up / in / out

const signUpSchema = z.object({ name: nameSchema, email: emailSchema, password: z.string(), next: z.string().optional() });

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const values = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  const result = await runAction(
    "signUp",
    async () => {
      const input = parseInput(signUpSchema, form);
      const meta = await requestMeta();
      const user = await registerUser({ name: input.name, email: input.email, password: input.password }, meta);
      await startSession(user.id, meta);
      // Send after the response so a slow or failing email provider doesn't block sign-up.
      after(() => sendVerificationEmail(user, meta).catch((err) => log.error("verification_email.failed", { err })));
    },
    values,
  );
  if (result) return result;
  redirect(safeNextPath(form.get("next")));
}

const logInSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.").max(1000), next: z.string().optional() });

export async function logIn(_: FormState, form: FormData): Promise<FormState> {
  const values = { email: String(form.get("email") ?? "") };
  const result = await runAction(
    "logIn",
    async () => {
      const input = parseInput(logInSchema, form);
      const meta = await requestMeta();
      const user = await authenticate({ email: input.email, password: input.password }, meta);
      await startSession(user.id, meta);
    },
    values,
  );
  if (result) return result;
  redirect(safeNextPath(form.get("next")));
}

export async function logOut(form?: FormData) {
  const current = await getCurrentSession();
  if (current) await logout(current.user, current.session.id, await requestMeta());
  await clearSessionCookie();
  const next = safeNextPath(form?.get("next"), "");
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}

// ---------------------------------------------------------------- password reset (signed out)

const forgotSchema = z.object({ email: emailSchema });

export async function requestPasswordResetAction(_: FormState, form: FormData): Promise<FormState> {
  const values = { email: String(form.get("email") ?? "") };
  return runAction(
    "requestPasswordReset",
    async () => {
      const { email } = parseInput(forgotSchema, form);
      const meta = await requestMeta();
      await enforce(`reset-req:ip:${meta.ip ?? "unknown"}`, LIMITS.resetRequestPerIp);
      // Do the lookup and sending after responding, so response time is identical whether or not
      // the account exists.
      after(() => requestPasswordReset(email, meta).catch((err) => log.error("password_reset_request.failed", { err })));
      return { ok: "If an account exists for that email, we've sent a link to reset the password. It expires in 30 minutes." };
    },
    values,
  );
}

const resetSchema = z
  .object({ token: z.string().max(100), password: z.string().max(1000), confirm: z.string().max(1000) })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match." });

export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const result = await runAction("resetPassword", async () => {
    const input = parseInput(resetSchema, form);
    await resetPassword(input.token, input.password, await requestMeta());
    // Any session in this browser belonged to the old password.
    await clearSessionCookie();
  });
  if (result) return result;
  redirect("/login?reset=1");
}

// ---------------------------------------------------------------- email verification

export async function verifyEmailAction(token: string): Promise<{ ok: boolean }> {
  try {
    const ok = await verifyEmail(token, await requestMeta());
    if (ok) revalidatePath("/", "layout");
    return { ok };
  } catch (err) {
    log.error("verify_email.failed", { err });
    return { ok: false };
  }
}

export async function resendVerificationAction(_: FormState): Promise<FormState> {
  return runAction("resendVerification", async () => {
    const { user } = await requireSession();
    await resendVerification(user, await requestMeta());
    return { ok: `Verification email sent to ${user.email}.` };
  });
}

// ---------------------------------------------------------------- signed-in account security

const profileSchema = z.object({ name: nameSchema });

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  return runAction("updateProfile", async () => {
    const { user } = await requireSession();
    const input = parseInput(profileSchema, form);
    await updateUserName(user.id, input.name);
    revalidatePath("/", "layout");
    return { ok: "Saved." };
  });
}

const changePasswordSchema = z
  .object({ current: z.string().min(1, "Enter your current password.").max(1000), next: z.string().max(1000), confirm: z.string().max(1000) })
  .refine((v) => v.next === v.confirm, { message: "New passwords don't match." });

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  return runAction("changePassword", async () => {
    const { user, session } = await requireSession();
    const input = parseInput(changePasswordSchema, form);
    const signedOut = await changePasswordFlow(user, input, session.id, await requestMeta());
    revalidatePath("/settings", "layout");
    return {
      ok: signedOut > 0
        ? `Password changed. ${signedOut} other device${signedOut === 1 ? " was" : "s were"} signed out.`
        : "Password changed.",
    };
  });
}

const sessionIdSchema = z.object({ sessionId: uuidSchema });

export async function signOutSessionAction(_: FormState, form: FormData): Promise<FormState> {
  let signedOutSelf = false;
  const result = await runAction("signOutSession", async () => {
    const { user, session } = await requireSession();
    const { sessionId } = parseInput(sessionIdSchema, form);
    await signOutSession(user, sessionId, await requestMeta());
    if (sessionId === session.id) {
      signedOutSelf = true;
      await clearSessionCookie();
      return;
    }
    revalidatePath("/settings/security");
    return { ok: "Device signed out." };
  });
  if (signedOutSelf) redirect("/login");
  return result;
}

export async function signOutOtherSessionsAction(_: FormState): Promise<FormState> {
  return runAction("signOutOtherSessions", async () => {
    const { user, session } = await requireSession();
    const n = await signOutOtherSessions(user, session.id, await requestMeta());
    revalidatePath("/settings/security");
    return { ok: n === 0 ? "No other devices were signed in." : `Signed out ${n} other device${n === 1 ? "" : "s"}.` };
  });
}

export async function logOutEverywhere() {
  const { user } = await requireSession();
  await signOutEverywhere(user, await requestMeta());
  await clearSessionCookie();
  redirect("/login");
}
