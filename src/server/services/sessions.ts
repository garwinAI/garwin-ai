// Database-backed sessions.
//  - The cookie carries a random 256-bit token; the DB stores only HMAC(token).
//  - Sessions expire after 7 days without use (idle) or 30 days in total (absolute).
//  - A new session is created on every sign-in (no session fixation).
import "server-only";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type Session } from "@/db/schema";
import { generateToken, hashToken, looksLikeToken } from "@/lib/security/tokens";
import type { RequestMeta } from "./security-events";

export const SESSION_ABSOLUTE_SEC = 30 * 24 * 60 * 60;
export const SESSION_IDLE_SEC = 7 * 24 * 60 * 60;
/** Don't write lastSeenAt on every request; once every few minutes is enough. */
const TOUCH_INTERVAL_SEC = 5 * 60;

export async function createSession(userId: string, meta: RequestMeta) {
  const token = generateToken();
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_SEC * 1000),
    })
    .returning();
  return { token, session };
}

/** Returns the session and its user if the token is valid, active and not idle-expired. */
export async function validateSessionToken(token: string | undefined) {
  if (!looksLikeToken(token)) return null;
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, sql`now()`),
        gt(sessions.lastSeenAt, sql`now() - ${sql.raw(`interval '${SESSION_IDLE_SEC} seconds'`)}`),
      ),
    );
  if (!row) return null;

  if (Date.now() - row.session.lastSeenAt.getTime() > TOUCH_INTERVAL_SEC * 1000) {
    await db.update(sessions).set({ lastSeenAt: sql`now()` }).where(eq(sessions.id, row.session.id));
  }
  return row;
}

export async function listActiveSessions(userId: string): Promise<Session[]> {
  return db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, sql`now()`),
        gt(sessions.lastSeenAt, sql`now() - ${sql.raw(`interval '${SESSION_IDLE_SEC} seconds'`)}`),
      ),
    )
    .orderBy(desc(sessions.lastSeenAt));
}

/** Revoke one session. Scoped by userId so nobody can revoke another person's session. Returns true if revoked. */
export async function revokeSession(userId: string, sessionId: string) {
  const rows = await db
    .update(sessions)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return rows.length > 0;
}

/** Revoke every session for the user, optionally keeping one (the current device). Returns how many. */
export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  const rows = await db
    .update(sessions)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
      ),
    )
    .returning({ id: sessions.id });
  return rows.length;
}

/** True if a cookie value refers to a session row that exists but is no longer usable. */
export async function isKnownButInvalid(token: string | undefined) {
  if (!looksLikeToken(token)) return true;
  return (await validateSessionToken(token)) === null;
}
