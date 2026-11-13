// System health for Admin (home widget and Console), plus the system events Console shows:
// health color changes and support tickets left unanswered for 24 / 48 / 72 hours.
import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, pingDatabase } from "@/db";
import { auditLogs, supportTickets, systemStatus } from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { computeHealth, type HealthLevel } from "@/lib/health";
import { ticketAgeBuckets, TICKET_REMINDER_HOURS } from "@/lib/admin-dashboard";
import { recordAudit } from "./audit";

const log = logger.child({ module: "system" });

/** Open tickets nobody from Garwin AI has answered yet, with their age in hours. */
async function unansweredTickets() {
  return db
    .select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      ageHours: sql<number>`extract(epoch from (now() - ${supportTickets.createdAt})) / 3600`,
    })
    .from(supportTickets)
    .where(and(inArray(supportTickets.status, ["open", "pending"]), isNull(supportTickets.firstResponseAt)));
}

export async function getSystemHealth() {
  const config = env();
  const [online, tickets] = await Promise.all([pingDatabase(), unansweredTickets().catch(() => [])]);
  const oldest = tickets.length ? Math.max(...tickets.map((t) => Number(t.ageHours))) : null;
  const health = computeHealth({
    online,
    critical: false,
    significantIssue: false,
    paymentsConfigured: Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET),
    assistantConfigured: Boolean(config.ASSISTANT_API_KEY),
    oldestOpenTicketHours: oldest,
  });
  return { ...health, tickets: ticketAgeBuckets(tickets.map((t) => Number(t.ageHours))), ticketList: tickets };
}

/**
 * Logs what changed since the last check: the health color, and tickets crossing 24/48/72 hours
 * unanswered (each once). Called when Admin home or Console loads. Never throws.
 */
export async function runSystemChecks() {
  try {
    const health = await getSystemHealth();
    await recordHealthChange(health.level, health.reasons);
    await recordTicketReminders(health.ticketList);
    return health;
  } catch (err) {
    log.error("system.checks_failed", { err });
    return null;
  }
}

async function recordHealthChange(level: HealthLevel, reasons: string[]) {
  const [previous] = await db.select({ value: systemStatus.value }).from(systemStatus).where(eq(systemStatus.key, "health"));
  if (previous?.value === level) return;
  await db
    .insert(systemStatus)
    .values({ key: "health", value: level })
    .onConflictDoUpdate({ target: systemStatus.key, set: { value: level, updatedAt: new Date() } });
  await recordAudit({
    accountId: null,
    actorUserId: null,
    actorType: "system",
    action: "system.health_changed",
    metadata: { from: previous?.value ?? null, to: level, reasons },
  });
}

async function recordTicketReminders(tickets: { id: string; subject: string; ageHours: number }[]) {
  for (const t of tickets) {
    const due = TICKET_REMINDER_HOURS.filter((h) => Number(t.ageHours) >= h);
    if (due.length === 0) continue;
    const done = await db
      .select({ hours: sql<string>`${auditLogs.metadata}->>'hours'` })
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "support_ticket.overdue"), eq(auditLogs.targetId, t.id)));
    // Only move forward: a ticket first noticed at 50 h gets the 48 h reminder, never 24 h after it.
    const highestSeen = Math.max(0, ...done.map((d) => Number(d.hours)));
    const hours = due.at(-1)!;
    if (hours <= highestSeen) continue;
    await recordAudit({
      accountId: null,
      actorUserId: null,
      actorType: "system",
      action: "support_ticket.overdue",
      targetType: "support_ticket",
      targetId: t.id,
      metadata: { hours, subject: t.subject },
    });
  }
}
