// Data access for users. Route handlers and actions call services; services own the queries.
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

/** A user without secrets. Never send a full User row to the client. */
export type PublicUser = Omit<User, "passwordHash">;

export function toPublicUser(user: User): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...rest } = user;
  return rest;
}

export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function findUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user ?? null;
}

export async function createUser(input: { name: string; email: string; passwordHash: string }) {
  const [user] = await db.insert(users).values(input).returning();
  return user;
}

export async function updateUserName(id: string, name: string) {
  await db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function setPasswordHash(id: string, passwordHash: string) {
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));
}

/** Marks the email verified (idempotent; keeps the first verification time). */
export async function markEmailVerified(id: string) {
  const [user] = await db.select({ at: users.emailVerifiedAt }).from(users).where(eq(users.id, id));
  if (user && !user.at) {
    await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, id));
  }
}
