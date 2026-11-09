// Files and folders in an account's shared storage. Bytes live in object storage (R2/S3) under
// `storage_key`; this table holds metadata. Team members can mark items for deletion; only the
// host can delete permanently (enforced in the entitlement/storage services).
import { sql } from "drizzle-orm";
import { bigint, check, index, pgEnum, pgTable, text, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createdAt, ts, updatedAt } from "./_shared";
import { users } from "./auth";
import { accounts } from "./accounts";

export const storageObjectKind = pgEnum("storage_object_kind", ["file", "folder"]);

export const storageObjects = pgTable(
  "storage_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => storageObjects.id, { onDelete: "cascade" }),
    kind: storageObjectKind("kind").notNull(),
    name: text("name").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    mimeType: text("mime_type"),
    storageKey: text("storage_key").unique(),
    sha256: text("sha256"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    markedForDeletionAt: ts("marked_for_deletion_at"),
    markedForDeletionBy: uuid("marked_for_deletion_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("storage_objects_size_nonnegative", sql`${t.sizeBytes} >= 0`),
    check("storage_objects_name_valid", sql`length(${t.name}) between 1 and 255 and ${t.name} !~ '[/\\\\]'`),
    check(
      "storage_objects_kind_fields",
      sql`(${t.kind} = 'folder' and ${t.sizeBytes} = 0 and ${t.storageKey} is null) or (${t.kind} = 'file' and ${t.storageKey} is not null)`,
    ),
    check("storage_objects_not_own_parent", sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
    // no two items with the same name in the same folder (root = parent null)
    uniqueIndex("storage_objects_unique_name_idx").on(t.accountId, sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`lower(${t.name})`),
    index("storage_objects_parent_idx").on(t.accountId, t.parentId),
    index("storage_objects_marked_idx").on(t.accountId).where(sql`${t.markedForDeletionAt} is not null`),
  ],
);

export type StorageObject = typeof storageObjects.$inferSelect;
