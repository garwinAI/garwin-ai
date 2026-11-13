// Admin Console: the last known system health (so changes can be logged) and saved recordings.
// The Console's event stream itself is the append-only audit_logs table.
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, ts, updatedAt } from "./_shared";
import { users } from "./auth";
import { storageObjects } from "./storage";

/** One row per tracked value, e.g. key "health" → "green". */
export const systemStatus = pgTable("system_status", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});

/** A Console recording. Its text lives here; a matching file appears in the Admin's Storage, and deleting that file deletes the recording. */
export const consoleRecordings = pgTable(
  "console_recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id").references(() => users.id, { onDelete: "set null" }),
    storageObjectId: uuid("storage_object_id").references(() => storageObjects.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    lineCount: integer("line_count").notNull(),
    startedAt: ts("started_at").notNull(),
    endedAt: ts("ended_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("console_recordings_size", sql`octet_length(${t.content}) <= 2000000`),
    check("console_recordings_order", sql`${t.endedAt} >= ${t.startedAt}`),
    index("console_recordings_admin_idx").on(t.adminId, t.createdAt),
  ],
);
