// Support tickets and admin support-access grants.
//
// Support access (spec): visible to the user, requested with a reason, explicitly approved,
// time-limited, least-privilege, audited. There is no impersonation: an approved grant lets the
// named admin perform the listed scopes on that account until it expires, and every action is
// written to audit_logs with the grant id.
import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, ts, updatedAt } from "./_shared";
import { users } from "./auth";
import { accounts } from "./accounts";
import { conversations } from "./messaging";

export const ticketStatus = pgEnum("ticket_status", ["open", "pending", "resolved", "closed"]);
export const ticketPriority = pgEnum("ticket_priority", ["low", "normal", "high", "urgent"]);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    openedBy: uuid("opened_by").references(() => users.id, { onDelete: "set null" }),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    // The message thread for this ticket.
    conversationId: uuid("conversation_id")
      .notNull()
      .unique()
      .references(() => conversations.id, { onDelete: "restrict" }),
    subject: text("subject").notNull(),
    status: ticketStatus("status").notNull().default("open"),
    priority: ticketPriority("priority").notNull().default("normal"),
    firstResponseAt: ts("first_response_at"),
    resolvedAt: ts("resolved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("support_tickets_subject_length", sql`length(${t.subject}) between 1 and 200`),
    // Admin health uses the age of the oldest open ticket.
    index("support_tickets_open_idx").on(t.createdAt).where(sql`${t.status} in ('open', 'pending')`),
    index("support_tickets_account_idx").on(t.accountId, t.createdAt),
  ],
);

export const supportAccessStatus = pgEnum("support_access_status", ["requested", "approved", "denied", "revoked", "expired"]);
export const supportAccessScope = pgEnum("support_access_scope", [
  "account.view",
  "storage.view",
  "apps.view",
  "billing.view",
  "messages.view",
  "notifications.view",
]);

export const supportAccessGrants = pgTable(
  "support_access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id").references(() => supportTickets.id, { onDelete: "set null" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    status: supportAccessStatus("status").notNull().default("requested"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    expiresAt: ts("expires_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("support_access_reason_length", sql`length(${t.reason}) between 10 and 1000`),
    check("support_access_approved_fields", sql`${t.status} <> 'approved' or (${t.decidedAt} is not null and ${t.expiresAt} is not null)`),
    // Never longer than 24 hours.
    check("support_access_max_24h", sql`${t.expiresAt} is null or ${t.decidedAt} is null or ${t.expiresAt} <= ${t.decidedAt} + interval '24 hours'`),
    uniqueIndex("support_access_one_open_idx").on(t.accountId, t.requestedBy).where(sql`${t.status} in ('requested', 'approved')`),
    index("support_access_account_idx").on(t.accountId, t.createdAt),
  ],
);

/** Least privilege: the exact scopes a grant allows. */
export const supportAccessGrantScopes = pgTable(
  "support_access_grant_scopes",
  {
    grantId: uuid("grant_id")
      .notNull()
      .references(() => supportAccessGrants.id, { onDelete: "cascade" }),
    scope: supportAccessScope("scope").notNull(),
  },
  (t) => [primaryKey({ columns: [t.grantId, t.scope] })],
);
