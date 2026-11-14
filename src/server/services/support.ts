// Support tickets. Users open tickets and reply; Admins (or Auto Pilot) answer, escalate and close.
// A ticket's messages live in a "support" conversation. Users only ever see tickets they opened.
import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { accountMembers, conversationParticipants, conversations, messages, supportTickets, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { recordAudit } from "./audit";
import { assertAdmin } from "./admin-users";
import { notify } from "./notifications";
import { enforce, LIMITS } from "./rate-limit";
import type { RequestMeta } from "./security-events";
import { listAdminIds } from "./users";

type Actor = { id: string; name: string; accountId?: string | null };
type Admin = { id: string; name: string; role: string };
type TicketStatus = "open" | "pending" | "resolved" | "closed";

const notFound = () => new AppError("NOT_FOUND", "That ticket doesn't exist.");

function cleanBody(raw: string) {
  const body = raw.trim();
  if (!body) throw new AppError("VALIDATION", "Write a message.");
  if (body.length > 5000) throw new AppError("VALIDATION", "Messages can be up to 5000 characters.");
  return body;
}

async function ownAccountId(userId: string, accountId?: string | null) {
  if (accountId) return accountId;
  const [m] = await db.select({ accountId: accountMembers.accountId }).from(accountMembers).where(and(eq(accountMembers.userId, userId), eq(accountMembers.role, "owner")));
  if (!m) throw new AppError("NOT_FOUND", "Your workspace wasn't found.");
  return m.accountId;
}

/** Messages of a ticket, oldest first, with who sent them. Null sender = Garwin AI Support (Auto Pilot). */
async function thread(conversationId: string) {
  return db
    .select({ id: messages.id, body: messages.body, createdAt: messages.createdAt, senderId: messages.senderUserId, senderName: users.name, senderRole: users.role })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.senderUserId))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
}

async function addMessage(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], conversationId: string, senderUserId: string | null, body: string) {
  const [m] = await tx.insert(messages).values({ conversationId, senderUserId, body }).returning();
  await tx.update(conversations).set({ lastMessageAt: m.createdAt }).where(eq(conversations.id, conversationId));
  return m;
}

// ---------------------------------------------------------------- users

export async function openTicket(user: Actor, input: { subject: string; body: string }, meta?: RequestMeta) {
  const subject = input.subject.trim();
  if (subject.length < 1 || subject.length > 200) throw new AppError("VALIDATION", "Give your question a short subject (up to 200 characters).");
  const body = cleanBody(input.body);
  await enforce(`support:${user.id}`, LIMITS.supportTicketPerUser, "You've opened a lot of tickets recently. Please wait a little before opening another.");
  const accountId = await ownAccountId(user.id, user.accountId);

  const ticket = await db.transaction(async (tx) => {
    const [conv] = await tx.insert(conversations).values({ accountId, kind: "support", subject, createdBy: user.id }).returning();
    await tx.insert(conversationParticipants).values({ conversationId: conv.id, userId: user.id, lastReadAt: new Date() });
    await addMessage(tx, conv.id, user.id, body);
    const [t] = await tx.insert(supportTickets).values({ accountId, openedBy: user.id, conversationId: conv.id, subject }).returning();
    await recordAudit({ accountId, actorUserId: user.id, action: "support_ticket.opened", targetType: "support_ticket", targetId: t.id, metadata: { subject }, meta }, tx);
    return t;
  });
  await notify(await listAdminIds(), { type: "support.ticket_opened", title: `New support ticket: ${subject}`, body: `From ${user.name}`, link: `/admin/support/${ticket.id}` });
  return ticket;
}

export async function listMyTickets(user: { id: string }) {
  return db
    .select({ id: supportTickets.id, subject: supportTickets.subject, status: supportTickets.status, createdAt: supportTickets.createdAt, updatedAt: supportTickets.updatedAt })
    .from(supportTickets)
    .where(eq(supportTickets.openedBy, user.id))
    .orderBy(desc(supportTickets.updatedAt));
}

export async function getMyTicket(user: { id: string }, id: string) {
  const [t] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, id), eq(supportTickets.openedBy, user.id)));
  if (!t) throw notFound();
  return { ticket: t, messages: await thread(t.conversationId) };
}

/** The user writes again. A resolved ticket reopens; a closed one can't be replied to. */
export async function replyAsUser(user: Actor, id: string, raw: string, meta?: RequestMeta) {
  const body = cleanBody(raw);
  const { ticket } = await getMyTicket(user, id);
  if (ticket.status === "closed") throw new AppError("CONFLICT", "This ticket is closed. Open a new one if you still need help.");
  await db.transaction(async (tx) => {
    await addMessage(tx, ticket.conversationId, user.id, body);
    await tx.update(supportTickets).set({ status: "open", resolvedAt: null, updatedAt: new Date() }).where(eq(supportTickets.id, id));
    await recordAudit({ accountId: ticket.accountId, actorUserId: user.id, action: "support_ticket.user_replied", targetType: "support_ticket", targetId: id, metadata: { subject: ticket.subject }, meta }, tx);
  });
  if (ticket.escalatedAt || ticket.assignedTo) {
    await notify(ticket.assignedTo ? [ticket.assignedTo] : await listAdminIds(), { type: "support.user_replied", title: `Reply on "${ticket.subject}"`, body: `From ${user.name}`, link: `/admin/support/${id}` });
  }
}

// ---------------------------------------------------------------- Admins

export const TICKET_VIEWS = ["needs_reply", "escalated", "waiting", "done", "all"] as const;
export type TicketView = (typeof TICKET_VIEWS)[number];

export async function listTickets(admin: Admin, view: TicketView = "needs_reply") {
  assertAdmin(admin);
  const where =
    view === "escalated"
      ? and(sql`${supportTickets.escalatedAt} is not null`, inArray(supportTickets.status, ["open", "pending"]))
      : view === "waiting"
        ? eq(supportTickets.status, "pending")
        : view === "done"
          ? inArray(supportTickets.status, ["resolved", "closed"])
          : view === "needs_reply"
            ? eq(supportTickets.status, "open")
            : undefined;
  return db
    .select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      escalatedAt: supportTickets.escalatedAt,
      firstResponseAt: supportTickets.firstResponseAt,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      openedByName: users.name,
    })
    .from(supportTickets)
    .leftJoin(users, eq(users.id, supportTickets.openedBy))
    .where(where)
    .orderBy(desc(sql`${supportTickets.escalatedAt} is not null`), asc(supportTickets.createdAt))
    .limit(100);
}

export async function getTicket(admin: Admin, id: string) {
  assertAdmin(admin);
  const [row] = await db
    .select({ ticket: supportTickets, openedByName: users.name, openedByEmail: users.email })
    .from(supportTickets)
    .leftJoin(users, eq(users.id, supportTickets.openedBy))
    .where(eq(supportTickets.id, id));
  if (!row) throw notFound();
  return { ...row, messages: await thread(row.ticket.conversationId) };
}

/** An Admin answers. `then` decides the status: wait for the user, resolve, or close. */
export async function replyAsAdmin(admin: Admin, id: string, raw: string, then: "wait" | "resolve", meta?: RequestMeta) {
  assertAdmin(admin);
  const body = cleanBody(raw);
  const { ticket } = await getTicket(admin, id);
  const status: TicketStatus = then === "resolve" ? "resolved" : "pending";
  await db.transaction(async (tx) => {
    await addMessage(tx, ticket.conversationId, admin.id, body);
    await tx
      .update(supportTickets)
      .set({
        status,
        assignedTo: ticket.assignedTo ?? admin.id,
        firstResponseAt: ticket.firstResponseAt ?? new Date(),
        resolvedAt: status === "resolved" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.id, id));
    await recordAudit(
      {
        accountId: ticket.accountId,
        actorUserId: admin.id,
        actorType: "admin",
        action: status === "resolved" ? "support_ticket.cleared" : "support_ticket.replied",
        targetType: "support_ticket",
        targetId: id,
        metadata: { subject: ticket.subject },
        meta,
      },
      tx,
    );
  });
  if (ticket.openedBy) {
    await notify([ticket.openedBy], { type: "support.replied", title: `Support replied: ${ticket.subject}`, body: body.slice(0, 140), link: `/support/${id}` });
  }
}

export async function setTicketStatus(admin: Admin, id: string, status: "closed" | "open", meta?: RequestMeta) {
  assertAdmin(admin);
  const { ticket } = await getTicket(admin, id);
  if (ticket.status === status) return;
  await db
    .update(supportTickets)
    .set({ status, resolvedAt: status === "closed" ? new Date() : null, updatedAt: new Date() })
    .where(eq(supportTickets.id, id));
  await recordAudit({
    accountId: ticket.accountId,
    actorUserId: admin.id,
    actorType: "admin",
    action: status === "closed" ? "support_ticket.cleared" : "support_ticket.reopened",
    targetType: "support_ticket",
    targetId: id,
    metadata: { subject: ticket.subject },
    meta,
  });
}

/** Latest open tickets for the Admin home widget. */
export async function ticketSummary(admin: Admin) {
  assertAdmin(admin);
  const [counts] = await db
    .select({
      open: sql<number>`count(*) filter (where ${supportTickets.status} = 'open')::int`,
      escalated: sql<number>`count(*) filter (where ${supportTickets.escalatedAt} is not null and ${supportTickets.status} in ('open','pending'))::int`,
      waiting: sql<number>`count(*) filter (where ${supportTickets.status} = 'pending')::int`,
      resolvedToday: sql<number>`count(*) filter (where ${supportTickets.status} in ('resolved','closed') and ${supportTickets.resolvedAt} > now() - interval '1 day')::int`,
    })
    .from(supportTickets);
  const latest = await listTickets(admin, "needs_reply");
  return { ...counts, latest: latest.slice(0, 4) };
}
