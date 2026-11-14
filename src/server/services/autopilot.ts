// Auto Pilot: while ON, every support ticket waiting on Garwin AI gets an answer from Claude, and is
// then closed (simple questions) or escalated to Admins (everything else). It only ever writes a
// reply and changes the ticket's status; it can't touch accounts, billing or code.
import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, messages, supportTickets, systemStatus, users } from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AUTOPILOT_SYSTEM, AUTOPILOT_TOOL, FALLBACK_DECISION, parseDecision, type AutopilotState } from "@/lib/autopilot";
import { callModel, type ModelMessage } from "@/server/site-editor/anthropic";
import { recordAudit } from "./audit";
import { assertAdmin } from "./admin-users";
import { notify } from "./notifications";
import type { RequestMeta } from "./security-events";
import { listAdminIds } from "./users";

const log = logger.child({ module: "autopilot" });
const KEY = "autopilot";

export const autopilotConfigured = () => Boolean(env().ASSISTANT_API_KEY);

export async function getAutopilot(): Promise<AutopilotState> {
  const [row] = await db.select().from(systemStatus).where(eq(systemStatus.key, KEY));
  return { on: row?.value === "on", since: row?.updatedAt ?? null };
}

export async function setAutopilot(admin: { id: string; role: string }, on: boolean, meta?: RequestMeta) {
  assertAdmin(admin);
  const current = await getAutopilot();
  if (current.on === on) return current;
  const value = on ? "on" : "off";
  await db.insert(systemStatus).values({ key: KEY, value }).onConflictDoUpdate({ target: systemStatus.key, set: { value, updatedAt: new Date() } });
  await recordAudit({ accountId: null, actorUserId: admin.id, actorType: "admin", action: on ? "autopilot.turned_on" : "autopilot.turned_off", meta });
  return getAutopilot();
}

/** Today's Auto Pilot work, for the Admin Assistant widget. */
export async function autopilotStats() {
  const rows = await db
    .select({ decision: sql<string>`${auditLogs.metadata}->>'decision'`, n: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "support_ticket.autopilot_answered"), sql`${auditLogs.createdAt} > now() - interval '1 day'`))
    .groupBy(sql`${auditLogs.metadata}->>'decision'`);
  const by = Object.fromEntries(rows.map((r) => [r.decision, r.n]));
  return { closed: by.close ?? 0, escalated: by.escalate ?? 0 };
}

/** Tickets Auto Pilot should answer: open, not escalated, and the customer wrote last. */
async function ticketsWaiting(limit: number) {
  return db
    .select({ id: supportTickets.id })
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.status, "open"),
        isNull(supportTickets.escalatedAt),
        sql`(select m.sender_user_id from messages m where m.conversation_id = ${supportTickets.conversationId} order by m.created_at desc, m.id desc limit 1) = ${supportTickets.openedBy}`,
      ),
    )
    .orderBy(asc(supportTickets.createdAt))
    .limit(limit);
}

/** Answers waiting tickets while Auto Pilot is on. Never throws. Returns how many it handled. */
export async function runAutopilot(limit = 3) {
  try {
    if (!autopilotConfigured() || !(await getAutopilot()).on) return 0;
    let handled = 0;
    for (const t of await ticketsWaiting(limit)) {
      if (await answerTicket(t.id)) handled++;
    }
    return handled;
  } catch (err) {
    log.error("autopilot.run_failed", { err });
    return 0;
  }
}

/** Answers one ticket if it still needs it. Returns true when a reply was posted. */
export async function answerTicket(ticketId: string): Promise<boolean> {
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
  if (!ticket || ticket.status !== "open" || ticket.escalatedAt || !ticket.openedBy) return false;
  const history = await db
    .select({ id: messages.id, body: messages.body, sender: messages.senderUserId, role: users.role })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.senderUserId))
    .where(eq(messages.conversationId, ticket.conversationId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
  const last = history.at(-1);
  if (!last || last.sender !== ticket.openedBy) return false;

  // Customer messages are "user" turns; Garwin AI's (Auto Pilot or Admin) are "assistant" turns.
  const turns: ModelMessage[] = [];
  for (const m of history) {
    const role = m.sender === ticket.openedBy ? "user" : "assistant";
    const text = m.sender === ticket.openedBy ? m.body : `[Garwin AI${m.sender ? " staff" : ""}] ${m.body}`;
    const prev = turns.at(-1);
    if (prev && prev.role === role && typeof prev.content === "string") prev.content += `\n\n${text}`;
    else turns.push({ role, content: text });
  }
  turns[0] = { role: "user", content: `Subject: ${ticket.subject}\n\n${turns[0].content as string}` };

  let decision = FALLBACK_DECISION;
  try {
    const reply = await callModel({ system: AUTOPILOT_SYSTEM, tools: [AUTOPILOT_TOOL], toolChoice: { type: "tool", name: AUTOPILOT_TOOL.name }, messages: turns, timeoutMs: 60_000, maxTokens: 1500 });
    decision = parseDecision(reply.content as { type: string; name?: string; input?: unknown }[]);
  } catch (err) {
    log.warn("autopilot.model_failed", { ticketId, err });
  }

  const posted = await db.transaction(async (tx) => {
    // Lock the ticket and make sure nobody answered while the model was thinking.
    await tx.execute(sql`select 1 from support_tickets where id = ${ticketId} for update`);
    const [still] = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
    const [newest] = await tx.select({ id: messages.id }).from(messages).where(eq(messages.conversationId, ticket.conversationId)).orderBy(desc(messages.createdAt), desc(messages.id)).limit(1);
    if (!still || still.status !== "open" || still.escalatedAt || newest?.id !== last.id) return false;

    const [m] = await tx.insert(messages).values({ conversationId: ticket.conversationId, senderUserId: null, body: decision.reply }).returning();
    await tx.execute(sql`update conversations set last_message_at = ${m.createdAt} where id = ${ticket.conversationId}`);
    const now = new Date();
    await tx
      .update(supportTickets)
      .set(
        decision.decision === "close"
          ? { status: "resolved", resolvedAt: now, firstResponseAt: still.firstResponseAt ?? now, updatedAt: now }
          : { escalatedAt: now, priority: "high", firstResponseAt: still.firstResponseAt ?? now, updatedAt: now },
      )
      .where(eq(supportTickets.id, ticketId));
    await recordAudit(
      {
        accountId: ticket.accountId,
        actorUserId: null,
        actorType: "system",
        action: "support_ticket.autopilot_answered",
        targetType: "support_ticket",
        targetId: ticketId,
        metadata: { subject: ticket.subject, decision: decision.decision, reason: decision.reason },
      },
      tx,
    );
    return true;
  });
  if (!posted) return false;

  await notify([ticket.openedBy], { type: "support.replied", title: `Support replied: ${ticket.subject}`, body: decision.reply.slice(0, 140), link: `/support/${ticketId}` });
  if (decision.decision === "escalate") {
    await notify(await listAdminIds(), {
      type: "support.escalated",
      title: `Auto Pilot escalated: ${ticket.subject}`,
      body: decision.reason || "Needs a person.",
      link: `/admin/support/${ticketId}`,
    });
  }
  log.info("autopilot.answered", { ticketId, decision: decision.decision });
  return true;
}

/** Marks tickets escalated by an Admin by hand (Auto Pilot then leaves them alone). */
export async function escalateTicket(admin: { id: string; role: string }, ticketId: string, meta?: RequestMeta) {
  assertAdmin(admin);
  const rows = await db
    .update(supportTickets)
    .set({ escalatedAt: new Date(), priority: "high", updatedAt: new Date() })
    .where(and(eq(supportTickets.id, ticketId), isNull(supportTickets.escalatedAt), inArray(supportTickets.status, ["open", "pending"])))
    .returning({ subject: supportTickets.subject, accountId: supportTickets.accountId });
  if (rows[0]) {
    await recordAudit({ accountId: rows[0].accountId, actorUserId: admin.id, actorType: "admin", action: "support_ticket.escalated", targetType: "support_ticket", targetId: ticketId, metadata: { subject: rows[0].subject }, meta });
  }
}
