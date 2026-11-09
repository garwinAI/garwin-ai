import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@/db/schema";
import { env } from "@/lib/env";
import { findUserById, toPublicUser, type PublicUser } from "@/server/services/users";
import type { RequestMeta } from "@/server/services/login-events";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "./token";

export type CurrentUser = PublicUser;

export async function startSession(user: Pick<User, "id" | "role" | "sessionVersion">) {
  const token = await signSession({ sub: user.id, role: user.role, sv: user.sessionVersion });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, verified against the database. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const claims = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const user = await findUserById(claims.sub);
  // A changed sessionVersion means the user logged out everywhere or changed their password.
  if (!user || user.sessionVersion !== claims.sv) return null;
  return toPublicUser(user);
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    // A cookie that is present but no longer valid must be cleared, or proxy.ts loops.
    const hasCookie = (await cookies()).has(SESSION_COOKIE);
    redirect(hasCookie ? "/api/auth/session-expired" : "/login");
  }
  return user;
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
