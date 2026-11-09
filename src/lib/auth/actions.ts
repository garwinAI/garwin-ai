"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { emailSchema, nameSchema, parseInput, passwordSchema } from "@/lib/validation";
import { countRecentFailures, recordLoginEvent } from "@/server/services/login-events";
import {
  createUser,
  findUserByEmail,
  findUserById,
  revokeAllSessions,
  setPasswordAndRevokeSessions,
  updateUserName,
} from "@/server/services/users";
import { endSession, requestMeta, requireUser, startSession } from "./session";

export type { FormState };

const log = logger.child({ module: "auth" });

const BCRYPT_ROUNDS = 12;
const LOCKOUT_WINDOW_MIN = 15;
const LOCKOUT_MAX_FAILS = 8;

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("garwin-timing-guard", BCRYPT_ROUNDS));

const signUpSchema = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema });

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const values = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  const result = await runAction(
    "signUp",
    async () => {
      const input = parseInput(signUpSchema, form);
      if (await findUserByEmail(input.email)) {
        throw new AppError("CONFLICT", "An account with that email already exists.");
      }
      const user = await createUser({
        name: input.name,
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      });
      await recordLoginEvent({ userId: user.id, email: user.email, success: true, ...(await requestMeta()) });
      await startSession(user);
      log.info("user.signed_up", { userId: user.id });
    },
    values,
  );
  if (result) return result;
  redirect("/assistant");
}

const logInSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.") });

export async function logIn(_: FormState, form: FormData): Promise<FormState> {
  const values = { email: String(form.get("email") ?? "") };
  const result = await runAction(
    "logIn",
    async () => {
      const input = parseInput(logInSchema, form);
      const meta = await requestMeta();

      if ((await countRecentFailures(input.email, meta.ip, LOCKOUT_WINDOW_MIN)) >= LOCKOUT_MAX_FAILS) {
        log.warn("auth.throttled", { ip: meta.ip });
        throw new AppError("RATE_LIMITED", `Too many failed attempts. Try again in ${LOCKOUT_WINDOW_MIN} minutes.`);
      }

      const user = await findUserByEmail(input.email);
      const valid = await bcrypt.compare(input.password, user?.passwordHash ?? (await getDummyHash()));
      await recordLoginEvent({ userId: user?.id ?? null, email: input.email, success: Boolean(user && valid), ...meta });
      if (!user || !valid) throw new AppError("UNAUTHENTICATED", "Incorrect email or password.");

      await startSession(user);
    },
    values,
  );
  if (result) return result;
  redirect("/assistant");
}

export async function logOut() {
  await endSession();
  redirect("/login");
}

export async function logOutEverywhere() {
  const user = await requireUser();
  await revokeAllSessions(user.id);
  await endSession();
  log.info("auth.logged_out_everywhere", { userId: user.id });
  redirect("/login");
}

const profileSchema = z.object({ name: nameSchema });

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  return runAction("updateProfile", async () => {
    const user = await requireUser();
    const input = parseInput(profileSchema, form);
    await updateUserName(user.id, input.name);
    revalidatePath("/", "layout");
    return { ok: "Saved." };
  });
}

const changePasswordSchema = z
  .object({ current: z.string().min(1, "Enter your current password."), next: passwordSchema, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "New passwords don't match." });

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  return runAction("changePassword", async () => {
    const current = await requireUser();
    const input = parseInput(changePasswordSchema, form);
    const user = await findUserById(current.id);
    if (!user || !(await bcrypt.compare(input.current, user.passwordHash))) {
      throw new AppError("VALIDATION", "Current password is incorrect.");
    }
    // New hash + bumped session version signs out every other device; this one gets a fresh session.
    const updated = await setPasswordAndRevokeSessions(user.id, await bcrypt.hash(input.next, BCRYPT_ROUNDS));
    await startSession(updated);
    log.info("auth.password_changed", { userId: user.id });
    return { ok: "Password changed. Other devices have been signed out." };
  });
}
