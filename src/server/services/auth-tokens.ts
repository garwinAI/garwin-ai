// Single-use tokens for email verification and password reset.
import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { authTokens } from "@/db/schema";
import { generateToken, hashToken, looksLikeToken } from "@/lib/security/tokens";

export type TokenPurpose = "email_verification" | "password_reset";

export const TOKEN_TTL_SEC: Record<TokenPurpose, number> = {
  email_verification: 24 * 60 * 60,
  password_reset: 30 * 60,
};

/** Issues a new token and invalidates any earlier unused token for the same purpose. */
export async function issueToken(userId: string, purpose: TokenPurpose) {
  const token = generateToken();
  await db.transaction(async (tx) => {
    await tx
      .update(authTokens)
      .set({ usedAt: sql`now()` })
      .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
    await tx.insert(authTokens).values({
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_SEC[purpose] * 1000),
    });
  });
  return token;
}

/** Whether the token is currently valid, without using it up. */
export async function peekToken(token: unknown, purpose: TokenPurpose) {
  if (!looksLikeToken(token)) return null;
  const [row] = await db
    .select({ userId: authTokens.userId })
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(token)), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt), gt(authTokens.expiresAt, sql`now()`)));
  return row ?? null;
}

/**
 * Atomically marks the token used and returns its user id, or null if it is unknown, expired,
 * already used, or for a different purpose. Two simultaneous uses can't both succeed.
 */
export async function consumeToken(token: unknown, purpose: TokenPurpose) {
  if (!looksLikeToken(token)) return null;
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: sql`now()` })
    .where(and(eq(authTokens.tokenHash, hashToken(token)), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt), gt(authTokens.expiresAt, sql`now()`)))
    .returning({ userId: authTokens.userId });
  return row ?? null;
}
