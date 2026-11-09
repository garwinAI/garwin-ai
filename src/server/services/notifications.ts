// In-app notifications. Always addressed to specific users; listing is scoped to the reader.
import "server-only";
import { and, desc, eq, isNull, count } from "drizzle-orm";
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
