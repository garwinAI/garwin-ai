import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { toPublicUser, type PublicUser } from "@/server/services/users";
import { createSession, SESSION_ABSOLUTE_SEC, validateSessionToken } from "@/server/services/sessions";
import type { RequestMeta } from "@/server/services/security-events";
import type { Session } from "@/db/schema";
import { clearedSessionCookie, sessionCookieAttributes, sessionCookieName } from "./cookie";

export type CurrentUser = PublicUser;

/** Creates a fresh server-side session for the user and sets the cookie. Call after every sign-in. */
export async function startSession(userId: string, meta: RequestMeta) {
  const { token, session } = await createSession(userId, meta);
  const jar = await cookies();
  jar.set(sessionCookieName(), token, sessionCookieAttributes(SESSION_ABSOLUTE_SEC));
  return session;
}

/** Deletes the session cookie. Revoking the DB row is the caller's job (see logOut). */
export async function clearSessionCookie() {
  (await cookies()).set(clearedSessionCookie());
}

/** The current session and user, verified against the database. Cached per request. */
export const getCurrentSession = cache(async (): Promise<{ user: CurrentUser; session: Session } | null> => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  const row = await validateSessionToken(token);
  return row ? { user: toPublicUser(row.user), session: row.session } : null;
});

export async function getCurrentUser() {
  return (await getCurrentSession())?.user ?? null;
}

/** Use in every page, action and route that needs a signed-in user. */
export async function requireSession() {
  const current = await getCurrentSession();
  if (!current) {
    // A cookie that is present but no longer valid must be cleared, or proxy.ts would loop.
    const hasCookie = (await cookies()).has(sessionCookieName());
    redirect(hasCookie ? "/api/auth/session-expired" : "/login");
  }
  return current;
}

export async function requireUser() {
  return (await requireSession()).user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/assistant");
  return user;
}

/**
 * Best-effort client IP and user agent.
 * NOTE: x-forwarded-for is trustworthy on Vercel (the platform overwrites it). On any other
 * host, configure the proxy to overwrite it, or this value can be spoofed by the client.
 */
export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent")?.slice(0, 300) || null,
  };
}
