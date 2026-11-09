// Account security activity: sign-ins, password changes, verification, session revocations.
import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { loginEvents, type SecurityEvent } from "@/db/schema";

export type RequestMeta = { ip: string | null; userAgent: string | null };

export async function recordSecurityEvent(
  input: { userId: string | null; email: string; event: SecurityEvent; success?: boolean } & RequestMeta,
) {
  await db.insert(loginEvents).values({ success: true, ...input });
}

export async function listSecurityEvents(userId: string, limit = 50) {
  return db
    .select()
    .from(loginEvents)
    .where(eq(loginEvents.userId, userId))
    .orderBy(desc(loginEvents.createdAt))
    .limit(limit);
}
