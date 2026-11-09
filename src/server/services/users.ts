// Data access for users. Route handlers and actions call services; services own the queries.
import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

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

/** Replaces the password and invalidates every existing session. Returns the updated user. */
export async function setPasswordAndRevokeSessions(id: string, passwordHash: string) {
  const [user] = await db
    .update(users)
    .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return user;
}

export async function revokeAllSessions(id: string) {
  await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
    .where(eq(users.id, id));
}
