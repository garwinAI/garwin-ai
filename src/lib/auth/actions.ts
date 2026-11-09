"use server";

import bcrypt from "bcryptjs";
import { and, eq, gte, or, count, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { loginEvents, users } from "@/db/schema";
import { endSession, requestMeta, requireUser, startSession } from "./session";

export type FormState = { error?: string; ok?: string; values?: Record<string, string> } | undefined;

const BCRYPT_ROUNDS = 12;
const LOCKOUT_WINDOW_MIN = 15;
const LOCKOUT_MAX_FAILS = 8;
// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("garwin-timing-guard", BCRYPT_ROUNDS));

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const password = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(200, "Password is too long.");

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  email,
  password,
});

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const values = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const { name, email: addr, password: pw } = parsed.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, addr));
  if (existing) return { error: "An account with that email already exists.", values };

  const [user] = await db
    .insert(users)
    .values({ name, email: addr, passwordHash: await bcrypt.hash(pw, BCRYPT_ROUNDS) })
    .returning();

  const meta = await requestMeta();
  await db.insert(loginEvents).values({ userId: user.id, email: addr, success: true, ...meta });
  await startSession(user);
  redirect("/assistant");
}

const logInSchema = z.object({ email, password: z.string().min(1, "Enter your password.") });

export async function logIn(_: FormState, form: FormData): Promise<FormState> {
  const values = { email: String(form.get("email") ?? "") };
  const parsed = logInSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const { email: addr, password: pw } = parsed.data;
  const meta = await requestMeta();

  // Throttle repeated failures for this email or IP.
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000);
  const [{ fails }] = await db
    .select({ fails: count() })
    .from(loginEvents)
    .where(
      and(
        eq(loginEvents.success, false),
        gte(loginEvents.createdAt, since),
        meta.ip ? or(eq(loginEvents.email, addr), eq(loginEvents.ip, meta.ip)) : eq(loginEvents.email, addr),
      ),
    );
  if (fails >= LOCKOUT_MAX_FAILS) {
    return { error: `Too many failed attempts. Try again in ${LOCKOUT_WINDOW_MIN} minutes.`, values };
  }

  const [user] = await db.select().from(users).where(eq(users.email, addr));
  const valid = await bcrypt.compare(pw, user?.passwordHash ?? (await getDummyHash()));

  await db.insert(loginEvents).values({ userId: user?.id ?? null, email: addr, success: Boolean(user && valid), ...meta });
  if (!user || !valid) return { error: "Incorrect email or password.", values };

  await startSession(user);
  redirect("/assistant");
}

export async function logOut() {
  await endSession();
  redirect("/login");
}

export async function logOutEverywhere() {
  const user = await requireUser();
  await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await endSession();
  redirect("/login");
}

const profileSchema = z.object({ name: z.string().trim().min(1, "Enter your name.").max(80) });

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.update(users).set({ name: parsed.data.name, updatedAt: new Date() }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

const changePasswordSchema = z
  .object({ current: z.string().min(1, "Enter your current password."), next: password, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "New passwords don't match." });

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const current = await requireUser();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [user] = await db.select().from(users).where(eq(users.id, current.id));
  if (!(await bcrypt.compare(parsed.data.current, user.passwordHash))) {
    return { error: "Current password is incorrect." };
  }
  // New hash + bumped session version signs out every other device; this one gets a fresh session.
  const [updated] = await db
    .update(users)
    .set({
      passwordHash: await bcrypt.hash(parsed.data.next, BCRYPT_ROUNDS),
      sessionVersion: sql`${users.sessionVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();
  await startSession(updated);
  return { ok: "Password changed. Other devices have been signed out." };
}
