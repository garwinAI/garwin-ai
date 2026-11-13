// Append-only audit trail for sensitive actions (team, permissions, deletions, billing, admin).
import "server-only";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { RequestMeta } from "./security-events";

type Exec = Pick<typeof db, "insert">;

export async function recordAudit(
  entry: {
    accountId: string | null;
    actorUserId: string | null;
    actorType?: "user" | "admin" | "support" | "system" | "stripe";
    action: string; // noun.verb
    targetType?: string;
    targetId?: string;
    supportGrantId?: string;
    metadata?: Record<string, unknown>;
    meta?: RequestMeta;
  },
  exec: Exec = db,
) {
  await exec.insert(auditLogs).values({
    accountId: entry.accountId,
    actorUserId: entry.actorUserId,
    actorType: entry.actorType ?? "user",
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    supportGrantId: entry.supportGrantId,
    metadata: entry.metadata,
    ip: entry.meta?.ip ?? null,
    userAgent: entry.meta?.userAgent ?? null,
  });
}
