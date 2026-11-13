// In-app notifications. Always addressed to specific users; listing is scoped to the reader.
import "server-only";
import { and, desc, eq, inArray, isNull, count, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";

type Exec = Pick<typeof db, "insert">;

export async function notify(
  userIds: string[],
  n: { type: string; title: string; body?: string; link?: string; data?: Record<string, unknown> },
  exec: Exec = db,
) {
  if (userIds.length === 0) return;
  await exec.insert(notifications).values(userIds.map((userId) => ({ userId, ...n })));
}

export async function listNotifications(userId: string, limit = 20) {
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadCount(userId: string) {
  const [{ n }] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return n;
}

export async function markAllRead(userId: string) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

/**
 * Like notify(), but skips users who already have a notification of this type with the same
 * `data.key` (read or not). Use for conditions that are checked repeatedly, e.g. "update available".
 */
export async function notifyOnce(
  userIds: string[],
  key: string,
  n: { type: string; title: string; body?: string; link?: string },
) {
  if (userIds.length === 0) return;
  const existing = await db
    .select({ userId: notifications.userId })
    .from(notifications)
    .where(and(inArray(notifications.userId, userIds), eq(notifications.type, n.type), sql`${notifications.data}->>'key' = ${key}`));
  const have = new Set(existing.map((r) => r.userId));
  await notify(userIds.filter((id) => !have.has(id)), { ...n, data: { key } });
}

/** Marks every unread notification of one type as read, for all users (the condition no longer applies). */
export async function markTypeRead(type: string) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.type, type), isNull(notifications.readAt)));
}
