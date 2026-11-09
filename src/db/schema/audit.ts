// Append-only audit trail of sensitive actions (admin actions, support access, billing changes,
// permission changes, deletions). A database trigger rejects UPDATE and DELETE on this table.
import { index, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./_shared";

export const auditActorType = pgEnum("audit_actor_type", ["user", "admin", "support", "system", "stripe"]);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Deliberately NO foreign keys: audit history must survive deletion of the users/accounts it
    // describes, and the append-only trigger would block ON DELETE SET NULL updates anyway.
    accountId: uuid("account_id"),
    actorUserId: uuid("actor_user_id"),
    actorType: auditActorType("actor_type").notNull(),
    action: text("action").notNull(), // noun.verb, e.g. "member.invited", "subscription.granted"
    targetType: text("target_type"),
    targetId: text("target_id"),
    supportGrantId: uuid("support_grant_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_account_idx").on(t.accountId, t.createdAt),
    index("audit_logs_actor_idx").on(t.actorUserId, t.createdAt),
    index("audit_logs_action_idx").on(t.action, t.createdAt),
  ],
);
