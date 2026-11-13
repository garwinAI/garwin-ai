// Admin launch checklist (see src/lib/launch-checklist.ts).
import "server-only";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { launchChecklist, planPrices, stripeEvents } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { PAID_PLAN_IDS, stripeMode } from "@/lib/billing";
import { isManualStep, launchItems, type LaunchFacts } from "@/lib/launch-checklist";
import { recordAudit } from "./audit";
import type { RequestMeta } from "./security-events";

type Admin = { id: string; role: string };

function assertAdmin(user: Admin) {
  if (user.role !== "admin") throw new AppError("FORBIDDEN", "Only an Admin can do that.");
}

async function detectFacts(): Promise<LaunchFacts> {
  const config = env();
  const [[prices], [events]] = await Promise.all([
    db
      .select({ plans: sql<number>`count(distinct ${planPrices.planId})::int` })
      .from(planPrices)
      .where(and(eq(planPrices.active, true), isNotNull(planPrices.stripePriceId), inArray(planPrices.planId, PAID_PLAN_IDS))),
    db.select({ n: sql<number>`count(*)::int` }).from(stripeEvents).where(isNotNull(stripeEvents.processedAt)),
  ]);
  return {
    stripeKeys: Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET),
    stripeMode: stripeMode(config.STRIPE_SECRET_KEY),
    pricesInStripe: prices.plans === PAID_PLAN_IDS.length,
    webhookReceived: events.n > 0,
    assistantKey: Boolean(config.ASSISTANT_API_KEY),
    githubToken: Boolean(config.GITHUB_TOKEN),
    email: Boolean(config.RESEND_API_KEY),
  };
}

export async function getLaunchChecklist(user: Admin) {
  assertAdmin(user);
  const [facts, rows] = await Promise.all([detectFacts(), db.select().from(launchChecklist)]);
  return launchItems(facts, new Map(rows.map((r) => [r.key, r.completedAt])));
}

/** Ticks or unticks a manual step. Auto steps can't be ticked by hand. */
export async function setLaunchStep(user: Admin, key: string, done: boolean, meta?: RequestMeta) {
  assertAdmin(user);
  if (!isManualStep(key)) throw new AppError("VALIDATION", "That step is checked automatically.");
  if (done) {
    await db.insert(launchChecklist).values({ key, completedBy: user.id }).onConflictDoNothing();
  } else {
    await db.delete(launchChecklist).where(eq(launchChecklist.key, key));
  }
  await recordAudit({ accountId: null, actorUserId: user.id, actorType: "admin", action: done ? "launch_step.done" : "launch_step.undone", targetType: "launch_step", targetId: key, meta });
}
