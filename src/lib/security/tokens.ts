// Random secrets for sessions and email links, and the keyed hash we store instead of them.
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** 256-bit URL-safe random token. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * HMAC-SHA256 of a token, keyed with AUTH_SECRET. Stored in the database instead of the token,
 * so leaked rows can't be replayed and can't be brute-forced without the server secret.
 */
export function hashToken(token: string): string {
  return createHmac("sha256", env().AUTH_SECRET).update(token).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Basic shape check before touching the database (43 chars of base64url for 32 bytes). */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
