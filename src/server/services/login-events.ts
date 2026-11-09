import "server-only";
import { and, count, desc, eq, gte, or } from "drizzle-orm";
import { db } from "@/db";
import { loginEvents } from "@/db/schema";

export type RequestMeta = { ip: string | null; userAgent: string | null };

export async function recordLoginEvent(input: { userId: string | null; email: string; success: boolean } & RequestMeta) {
  await db.insert(loginEvents).values(input);
}

/** Failed attempts for this email (or IP, when known) within the window. */
export async function countRecentFailures(email: string, ip: string | null, windowMinutes: number) {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const [{ fails }] = await db
    .select({ fails: count() })
    .from(loginEvents)
    .where(
      and(
        eq(loginEvents.success, false),
        gte(loginEvents.createdAt, since),
        ip ? or(eq(loginEvents.email, email), eq(loginEvents.ip, ip)) : eq(loginEvents.email, email),
      ),
    );
  return fails;
}

export async function listLoginEvents(userId: string, limit = 50) {
  return db
    .select()
    .from(loginEvents)
    .where(eq(loginEvents.userId, userId))
    .orderBy(desc(loginEvents.createdAt))
    .limit(limit);
}
