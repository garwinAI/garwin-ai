// Fixed-window rate limiting stored in Postgres (works across serverless instances).
// One atomic upsert per check, so concurrent requests can't slip past the limit.
import "server-only";
import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "rate-limit" });

export type Limit = { limit: number; windowSec: number };

/**
 * Limits per action. Login uses three keys so an attacker can't lock a victim out from one IP
 * (the per-email cap is high and only stops distributed guessing).
 */
export const LIMITS = {
  loginPerIp: { limit: 30, windowSec: 15 * 60 },
  loginPerEmailAndIp: { limit: 5, windowSec: 15 * 60 },
  loginPerEmail: { limit: 50, windowSec: 60 * 60 },
  signupPerIp: { limit: 5, windowSec: 60 * 60 },
  resetRequestPerIp: { limit: 10, windowSec: 60 * 60 },
  resetRequestPerEmail: { limit: 3, windowSec: 60 * 60 },
  resetSubmitPerIp: { limit: 10, windowSec: 15 * 60 },
  verifyResendPerUser: { limit: 3, windowSec: 60 * 60 },
  passwordChangePerUser: { limit: 5, windowSec: 15 * 60 },
  appUpdatePerUser: { limit: 10, windowSec: 60 * 60 },
  appSchedulePerUser: { limit: 30, windowSec: 60 * 60 },
  siteEditPerUser: { limit: 30, windowSec: 60 * 60 },
  checkoutPerUser: { limit: 10, windowSec: 60 * 60 },
  supportTicketPerUser: { limit: 10, windowSec: 60 * 60 },
} satisfies Record<string, Limit>;

export type RateResult = { allowed: boolean; count: number; retryAfterSec: number };

/** Count one attempt against `key` and report whether it is within the limit. */
export async function hit(key: string, { limit, windowSec }: Limit): Promise<RateResult> {
  const interval = sql.raw(`interval '${Math.floor(windowSec)} seconds'`);
  const expired = sql`${rateLimits.windowStart} <= now() - ${interval}`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: sql`now()` })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${expired} then now() else ${rateLimits.windowStart} end`,
      },
    })
    .returning({
      count: rateLimits.count,
      retryAfterSec: sql<number>`greatest(0, ceil(extract(epoch from (${rateLimits.windowStart} + ${interval} - now()))))::int`,
    });

  // Occasionally clear out old counters.
  if (Math.random() < 0.01) {
    db.delete(rateLimits).where(lt(rateLimits.windowStart, sql`now() - interval '1 day'`)).catch(() => {});
  }

  const allowed = row.count <= limit;
  if (!allowed) log.warn("rate_limit.blocked", { key: redactKey(key), count: row.count });
  return { allowed, count: row.count, retryAfterSec: row.retryAfterSec };
}

/** Throw a user-safe RATE_LIMITED error when the limit is exceeded. */
export async function enforce(key: string, limit: Limit, message?: string) {
  const r = await hit(key, limit);
  if (!r.allowed) {
    const minutes = Math.max(1, Math.ceil(r.retryAfterSec / 60));
    throw new AppError("RATE_LIMITED", message ?? `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }
  return r;
}

export async function resetLimit(key: string) {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

// Keys contain emails/IPs; keep logs free of them.
function redactKey(key: string) {
  return key.split(":")[0] + ":…";
}
