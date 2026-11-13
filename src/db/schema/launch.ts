// Admin launch checklist: which manual launch steps an Admin has marked done on this site.
// Steps the app can detect by itself (keys present, prices set...) are never stored here.
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { ts } from "./_shared";
import { users } from "./auth";

export const launchChecklist = pgTable("launch_checklist", {
  // Step key from src/lib/launch-checklist.ts
  key: text("key").primaryKey(),
  completedAt: ts("completed_at").notNull().defaultNow(),
  completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
});
