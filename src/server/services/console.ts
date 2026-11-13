// Admin Console: the live event stream (from the append-only audit log) and saved recordings.
import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, auditLogs, consoleRecordings, storageObjects, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { toConsoleLine, type ConsoleLine } from "@/lib/console-log";
import { recordAudit } from "./audit";
import { assertAdmin } from "./admin-users";
import { releaseStorage, reserveStorage } from "./entitlements";
import type { RequestMeta } from "./security-events";

type Admin = { id: string; role: string };

export const RECORDINGS_FOLDER = "Console recordings";
export const MAX_RECORDING_BYTES = 2_000_000;

type AuditRow = typeof auditLogs.$inferSelect;

async function toLines(rows: AuditRow[]): Promise<ConsoleLine[]> {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.actorUserId) ids.add(r.actorUserId);
    if (r.targetType === "user" && r.targetId) ids.add(r.targetId);
  }
  const names = ids.size ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...ids])) : [];
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  return rows.map((r) =>
    toConsoleLine({
      id: r.id,
      createdAt: r.createdAt,
      action: r.action,
      actorType: r.actorType,
      actorName: r.actorUserId ? (nameOf.get(r.actorUserId) ?? "Deleted user") : null,
      targetType: r.targetType,
      targetName:
        r.targetType === "user" && r.targetId
          ? (nameOf.get(r.targetId) ?? (r.metadata?.name as string | undefined) ?? "a user")
          : ((r.metadata?.name as string | undefined) ?? r.targetId ?? null),
      metadata: r.metadata ?? null,
    }),
  );
}

/**
 * Console lines, oldest first. Without `after`: the latest `limit` events. With `after` (the last
 * line the Console has): only newer events, for polling.
 */
export async function consoleEvents(admin: Admin, opts: { afterId?: string; limit?: number } = {}) {
  assertAdmin(admin);
  const limit = Math.min(opts.limit ?? 200, 500);
  // Compare against the stored row itself: Postgres keeps microseconds, JavaScript dates only
  // milliseconds, so a timestamp from the browser can't be used as the cursor.
  const where = opts.afterId
    ? sql`(${auditLogs.createdAt}, ${auditLogs.id}) > (select a.created_at, a.id from audit_logs a where a.id = ${opts.afterId})`
    : undefined;
  const rows = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(limit);
  return toLines(rows.reverse());
}

/** Recent events by or about one user (Admin → user page). */
export async function eventsForUser(admin: Admin, userId: string, limit = 20) {
  assertAdmin(admin);
  const rows = await db
    .select()
    .from(auditLogs)
    .where(or(eq(auditLogs.actorUserId, userId), and(eq(auditLogs.targetType, "user"), eq(auditLogs.targetId, userId))))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  return toLines(rows);
}

async function ownAccountId(userId: string) {
  const [a] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.ownerUserId, userId));
  if (!a) throw new AppError("NOT_FOUND", "Your workspace wasn't found.");
  return a.id;
}

/**
 * Saves a recording as a text file in the Admin's own Storage, in a "Console recordings" folder.
 * The text is kept in console_recordings (object storage isn't connected yet) and counts against
 * the Admin's storage quota like any file.
 */
export async function saveRecording(
  admin: Admin,
  input: { text: string; lineCount: number; startedAt: Date; endedAt: Date },
  meta?: RequestMeta,
) {
  assertAdmin(admin);
  const bytes = Buffer.byteLength(input.text, "utf8");
  if (bytes === 0) throw new AppError("VALIDATION", "Nothing was recorded.");
  if (bytes > MAX_RECORDING_BYTES) throw new AppError("VALIDATION", "That recording is too long to save (2 MB limit). Record a shorter stretch.");
  if (input.endedAt < input.startedAt) throw new AppError("VALIDATION", "The recording times don't make sense. Try again.");

  const accountId = await ownAccountId(admin.id);
  const actor = { id: admin.id, accountId };
  await reserveStorage(actor, bytes);
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: storageObjects.id })
        .from(storageObjects)
        .where(
          and(
            eq(storageObjects.accountId, accountId),
            isNull(storageObjects.parentId),
            eq(storageObjects.kind, "folder"),
            sql`lower(${storageObjects.name}) = lower(${RECORDINGS_FOLDER})`,
          ),
        );
      const folderId =
        existing?.id ??
        (await tx.insert(storageObjects).values({ accountId, kind: "folder", name: RECORDINGS_FOLDER, createdBy: admin.id }).returning({ id: storageObjects.id }))[0].id;

      const recordingId = randomUUID();
      const stamp = input.startedAt.toISOString().slice(0, 19).replace("T", " ").replace(/:/g, "-");
      const [file] = await tx
        .insert(storageObjects)
        .values({
          accountId,
          parentId: folderId,
          kind: "file",
          name: `Console ${stamp} UTC (${recordingId.slice(0, 4)}).txt`,
          sizeBytes: bytes,
          mimeType: "text/plain",
          storageKey: `console-recording:${recordingId}`,
          createdBy: admin.id,
        })
        .returning();
      await tx.insert(consoleRecordings).values({
        id: recordingId,
        adminId: admin.id,
        storageObjectId: file.id,
        content: input.text,
        lineCount: input.lineCount,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
      });
      await recordAudit(
        {
          accountId,
          actorUserId: admin.id,
          actorType: "admin",
          action: "console.recording_saved",
          targetType: "storage_object",
          targetId: file.id,
          metadata: { name: file.name, lines: input.lineCount, bytes },
          meta,
        },
        tx,
      );
      return { id: recordingId, fileName: file.name };
    });
  } catch (err) {
    await releaseStorage(accountId, bytes);
    throw err;
  }
}

/** The Admin's own recordings, newest first. */
export async function listRecordings(admin: Admin) {
  assertAdmin(admin);
  return db
    .select({ id: consoleRecordings.id, lineCount: consoleRecordings.lineCount, startedAt: consoleRecordings.startedAt, fileName: storageObjects.name })
    .from(consoleRecordings)
    .leftJoin(storageObjects, eq(storageObjects.id, consoleRecordings.storageObjectId))
    .where(eq(consoleRecordings.adminId, admin.id))
    .orderBy(desc(consoleRecordings.createdAt))
    .limit(20);
}

/** One of the Admin's own recordings (another Admin's looks missing). */
export async function getRecording(admin: Admin, id: string) {
  assertAdmin(admin);
  const [row] = await db
    .select({ content: consoleRecordings.content, fileName: storageObjects.name })
    .from(consoleRecordings)
    .leftJoin(storageObjects, eq(storageObjects.id, consoleRecordings.storageObjectId))
    .where(and(eq(consoleRecordings.id, id), eq(consoleRecordings.adminId, admin.id)));
  if (!row) throw new AppError("NOT_FOUND", "That recording doesn't exist.");
  return row;
}
