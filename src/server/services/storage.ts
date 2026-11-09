// Shared storage for an account: folders now, files when object storage (R2) is connected.
//
// Every function is scoped to the actor's CURRENT account. An id from another account behaves
// exactly like a missing id (NOT_FOUND), so nothing about other accounts leaks.
// Team members can mark items for deletion; only the host can delete permanently.
import "server-only";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, storageObjects, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { recordAudit } from "./audit";
import { assertPermission, getEntitlements, releaseStorage } from "./entitlements";
import { notify } from "./notifications";
import type { RequestMeta } from "./security-events";

type Actor = { id: string; accountId?: string | null };

export function validateName(raw: string) {
  const name = raw.trim();
  if (!name) throw new AppError("VALIDATION", "Enter a name.");
  if (name.length > 255) throw new AppError("VALIDATION", "That name is too long.");
  if (/[/\\]/.test(name)) throw new AppError("VALIDATION", "Names can't contain / or \\.");
  if (name === "." || name === "..") throw new AppError("VALIDATION", "That name isn't allowed.");
  return name;
}

async function objectInAccount(accountId: string, id: string) {
  const [obj] = await db.select().from(storageObjects).where(and(eq(storageObjects.id, id), eq(storageObjects.accountId, accountId)));
  if (!obj) throw new AppError("NOT_FOUND", "That item doesn't exist.");
  return obj;
}

export async function listFolder(actor: Actor, parentId: string | null) {
  const ent = await assertPermission(actor, "storage.view");
  if (parentId) {
    const parent = await objectInAccount(ent.accountId, parentId);
    if (parent.kind !== "folder") throw new AppError("NOT_FOUND", "That folder doesn't exist.");
  }
  const items = await db
    .select({ obj: storageObjects, markedByName: users.name })
    .from(storageObjects)
    .leftJoin(users, eq(users.id, storageObjects.markedForDeletionBy))
    .where(and(eq(storageObjects.accountId, ent.accountId), parentId ? eq(storageObjects.parentId, parentId) : isNull(storageObjects.parentId)))
    .orderBy(sql`${storageObjects.kind} = 'folder' desc`, asc(sql`lower(${storageObjects.name})`));
  return { items: items.map((r) => ({ ...r.obj, markedByName: r.markedByName })), breadcrumbs: parentId ? await breadcrumbs(ent.accountId, parentId) : [] };
}

async function breadcrumbs(accountId: string, id: string) {
  const res = await db.execute<{ id: string; name: string; depth: number }>(sql`
    with recursive chain as (
      select id, name, parent_id, 0 as depth from storage_objects where id = ${id} and account_id = ${accountId}
      union all
      select s.id, s.name, s.parent_id, c.depth + 1 from storage_objects s join chain c on s.id = c.parent_id
      where s.account_id = ${accountId} and c.depth < 50
    )
    select id, name, depth from chain order by depth desc`);
  return res.rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function createFolder(actor: Actor, parentId: string | null, rawName: string, meta: RequestMeta) {
  const ent = await assertPermission(actor, "storage.upload");
  const name = validateName(rawName);
  if (parentId) {
    const parent = await objectInAccount(ent.accountId, parentId);
    if (parent.kind !== "folder") throw new AppError("VALIDATION", "You can only create folders inside folders.");
    if (parent.markedForDeletionAt) throw new AppError("VALIDATION", "That folder is marked for deletion.");
  }
  const [folder] = await db
    .insert(storageObjects)
    .values({ accountId: ent.accountId, parentId, kind: "folder", name, createdBy: actor.id })
    .onConflictDoNothing()
    .returning();
  if (!folder) throw new AppError("CONFLICT", "Something with that name already exists here.");
  await recordAudit({ accountId: ent.accountId, actorUserId: actor.id, action: "storage.folder_created", targetType: "storage_object", targetId: folder.id, meta });
  return folder;
}

/** Team members (with permission) and the host can mark items. The host is notified. */
export async function markForDeletion(actor: Actor, id: string, meta: RequestMeta) {
  const ent = await assertPermission(actor, "storage.mark_for_deletion");
  const obj = await objectInAccount(ent.accountId, id);
  if (obj.markedForDeletionAt) return obj;
  const [updated] = await db
    .update(storageObjects)
    .set({ markedForDeletionAt: sql`now()`, markedForDeletionBy: actor.id, updatedAt: new Date() })
    .where(and(eq(storageObjects.id, id), eq(storageObjects.accountId, ent.accountId)))
    .returning();
  await recordAudit({ accountId: ent.accountId, actorUserId: actor.id, action: "storage.marked_for_deletion", targetType: "storage_object", targetId: id, meta });
  if (ent.isTeamMember) {
    const [account] = await db.select({ ownerUserId: accounts.ownerUserId }).from(accounts).where(eq(accounts.id, ent.accountId));
    await notify([account.ownerUserId], { type: "storage.marked", title: `"${obj.name}" was marked for deletion`, body: "Review it in Storage.", link: "/storage?view=marked" });
  }
  return updated;
}

/** The host, or the member who marked it, can unmark. */
export async function unmarkForDeletion(actor: Actor, id: string, meta: RequestMeta) {
  const ent = await assertPermission(actor, "storage.mark_for_deletion");
  const obj = await objectInAccount(ent.accountId, id);
  if (!obj.markedForDeletionAt) return obj;
  if (!ent.canPermanentlyDelete && obj.markedForDeletionBy !== actor.id) {
    throw new AppError("FORBIDDEN", "Only the host or the person who marked this can unmark it.");
  }
  const [updated] = await db
    .update(storageObjects)
    .set({ markedForDeletionAt: null, markedForDeletionBy: null, updatedAt: new Date() })
    .where(and(eq(storageObjects.id, id), eq(storageObjects.accountId, ent.accountId)))
    .returning();
  await recordAudit({ accountId: ent.accountId, actorUserId: actor.id, action: "storage.unmarked", targetType: "storage_object", targetId: id, meta });
  return updated;
}

/** Host only. Deletes the item and everything inside it, and returns their bytes to the quota. */
export async function deletePermanently(actor: Actor, id: string, meta: RequestMeta) {
  const ent = await getEntitlements(actor);
  if (!ent.canPermanentlyDelete) throw new AppError("FORBIDDEN", "Only the host can delete permanently. Mark it for deletion instead.");
  const obj = await objectInAccount(ent.accountId, id);

  await db.transaction(async (tx) => {
    const sizeRes = await tx.execute<{ bytes: string }>(sql`
      with recursive tree as (
        select id, size_bytes from storage_objects where id = ${id} and account_id = ${ent.accountId}
        union all
        select s.id, s.size_bytes from storage_objects s join tree t on s.parent_id = t.id where s.account_id = ${ent.accountId}
      )
      select coalesce(sum(size_bytes), 0)::text as bytes from tree`);
    const bytes = Number(sizeRes.rows[0]?.bytes ?? 0);
    await tx.delete(storageObjects).where(and(eq(storageObjects.id, id), eq(storageObjects.accountId, ent.accountId)));
    if (bytes > 0) await releaseStorage(ent.accountId, bytes, tx);
    // TODO(Phase 3, R2): queue deletion of the underlying objects by storage_key.
    await recordAudit({ accountId: ent.accountId, actorUserId: actor.id, action: "storage.deleted", targetType: "storage_object", targetId: id, metadata: { name: obj.name, kind: obj.kind, bytes }, meta }, tx);
  });
}

/** Host's review list of everything team members marked. */
export async function listMarkedForDeletion(actor: Actor) {
  const ent = await assertPermission(actor, "storage.view");
  const rows = await db
    .select({ obj: storageObjects, markedByName: users.name })
    .from(storageObjects)
    .leftJoin(users, eq(users.id, storageObjects.markedForDeletionBy))
    .where(and(eq(storageObjects.accountId, ent.accountId), isNotNull(storageObjects.markedForDeletionAt)))
    .orderBy(asc(storageObjects.markedForDeletionAt));
  return rows.map((r) => ({ ...r.obj, markedByName: r.markedByName }));
}
