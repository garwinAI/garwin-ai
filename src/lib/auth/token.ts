// Edge-safe session token helpers (used by both proxy.ts and server code).
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "garwin_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type SessionClaims = {
  sub: string; // user id
  role: "member" | "admin";
  sv: number; // session version, checked against the DB on every request
};

function secret() {
  return new TextEncoder().encode(env().AUTH_SECRET);
}

export async function signSession(claims: SessionClaims) {
  return new SignJWT({ role: claims.role, sv: claims.sv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    const role = payload.role === "admin" ? "admin" : "member";
    return { sub: payload.sub, role, sv: Number(payload.sv ?? 0) };
  } catch {
    return null;
  }
}
