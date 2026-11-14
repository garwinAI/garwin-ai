// Auto Pilot's system-health job. While Auto Pilot is ON it watches health and applies ONLY the
// fixes listed in AUTOPILOT_FIXES (src/lib/autopilot.ts), each of which is a narrow, reversible
// repair written as plain code (no AI). Anything else is reported to Admins once a day.
// It never changes code, settings, users, plans, prices or money.
import "server-only";
import { and, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { planPrices, stripeEvents, systemStatus } from "@/db/schema";
import { logger } from "@/lib/logger";
import type Stripe from "stripe";
import { recordAudit } from "./audit";
import { handleStripeEvent, syncPricesToStripe } from "./billing";
import { getDeploySchedule } from "./app-update";
import { notifyOnce } from "./notifications";
import { expireOldGrants } from "./support-access";
import { getSystemHealth } from "./system";
import { listAdminIds } from "./users";
import { stripeConfigured } from "@/server/stripe/client";

const log = logger.child({ module: "autopilot-health" });
const LAST_RUN_KEY = "autopilot_health_at";
const MIN_INTERVAL_MS = 5 * 60_000;

export type HealthRunResult = { fixed: { fix: string; count: number }[]; alerted: string[] };

async function recordFix(fix: string, count: number, detail?: Record<string, unknown>) {
  await recordAudit({ accountId: null, actorUserId: null, actorType: "system", action: "autopilot.fixed", metadata: { fix, count, ...detail } });
}

/** Tells Admins about a problem Auto Pilot can't fix, at most once per problem per day. */
async function alert(problem: string, title: string, body: string, link: string) {
  const day = new Date().toISOString().slice(0, 10);
  const admins = await listAdminIds();
  await notifyOnce(admins, `${problem}:${day}`, { type: "autopilot.alert", title, body, link });
  const [seen] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from audit_logs where action = 'autopilot.alerted' and metadata->>'problem' = ${problem} and created_at > now() - interval '1 day'`,
  ).then((r) => r.rows);
  if (!seen?.n) await recordAudit({ accountId: null, actorUserId: null, actorType: "system", action: "autopilot.alerted", metadata: { problem, title } });
}

/**
 * Runs the health job if it hasn't run in the last 5 minutes. Never throws.
 * `force` skips the 5-minute spacing (tests).
 */
export async function runHealthAutopilot(opts: { force?: boolean } = {}): Promise<HealthRunResult | null> {
  try {
    if (!opts.force) {
      const [last] = await db.select().from(systemStatus).where(eq(systemStatus.key, LAST_RUN_KEY));
      if (last && Date.now() - last.updatedAt.getTime() < MIN_INTERVAL_MS) return null;
    }
    await db
      .insert(systemStatus)
      .values({ key: LAST_RUN_KEY, value: new Date().toISOString() })
      .onConflictDoUpdate({ target: systemStatus.key, set: { value: new Date().toISOString(), updatedAt: new Date() } });

    const result: HealthRunResult = { fixed: [], alerted: [] };
    const fixed = async (fix: string, count: number, detail?: Record<string, unknown>) => {
      if (count > 0) {
        result.fixed.push({ fix, count });
        await recordFix(fix, count, detail);
      }
    };

    // Fix 1: end remote views whose time is up.
    await fixed("expired_remote_views", await expireOldGrants());

    if (stripeConfigured()) {
      // Fix 2: retry Stripe webhook events that failed (Stripe also retries; this catches up sooner).
      const failed = await db
        .select({ id: stripeEvents.id, payload: stripeEvents.payload })
        .from(stripeEvents)
        .where(and(isNull(stripeEvents.processedAt), isNotNull(stripeEvents.error), lt(stripeEvents.receivedAt, sql`now() - interval '2 minutes'`), gt(stripeEvents.receivedAt, sql`now() - interval '3 days'`)))
        .limit(5);
      let retried = 0;
      for (const e of failed) {
        try {
          // Already signature-checked when it arrived; handleStripeEvent re-reads everything from Stripe.
          await handleStripeEvent(e.payload as unknown as Stripe.Event);
          retried++;
        } catch (err) {
          log.warn("autopilot.retry_failed", { eventId: e.id, err });
        }
      }
      await fixed("stripe_events_retried", retried);

      // Fix 3: create Stripe prices that were saved but never reached Stripe.
      const [missing] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(planPrices)
        .where(and(eq(planPrices.active, true), isNull(planPrices.stripePriceId)));
      if (missing.n > 0) await fixed("stripe_prices_created", await syncPricesToStripe(null).catch(() => 0));
    }

    // Can't fix: report.
    const health = await getSystemHealth();
    for (const reason of health.reasons) {
      if (/Payments \(Stripe\) not configured/.test(reason)) {
        await alert("payments_unconfigured", "Payments aren't set up", "Auto Pilot can't fix this: Stripe keys must be added in Vercel. See the launch checklist.", "/admin/launch");
        result.alerted.push("payments_unconfigured");
      }
    }
    if (health.tickets.over48 + health.tickets.over72 > 0) {
      await alert("tickets_overdue", "Support tickets waiting over 48 hours", "Escalated tickets need a person. Open Support tickets → Escalated.", "/admin/support?view=escalated");
      result.alerted.push("tickets_overdue");
    }
    const schedule = await getDeploySchedule();
    if (schedule.failed.length > 0) {
      await alert("deploy_failed", "A scheduled deploy didn't go live", "Auto Pilot can't fix this: merge live into dev, then deploy again.", "/settings/general#deploy");
      result.alerted.push("deploy_failed");
    }
    return result;
  } catch (err) {
    log.error("autopilot.health_failed", { err });
    return null;
  }
}
