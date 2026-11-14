// Saved Admin Assistant conversations ("View chat log"). Each Admin sees only their own.
import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assistantChatMessages } from "@/db/schema";
import { assertAdmin } from "./admin-users";

const clip = (s: string) => (s.length > 20_000 ? `${s.slice(0, 19_990)}…` : s) || "(empty)";

export async function saveChatExchange(admin: { id: string }, prompt: string, reply: string, commitSha?: string) {
  await db.insert(assistantChatMessages).values([
    { adminId: admin.id, role: "user", text: clip(prompt) },
    { adminId: admin.id, role: "assistant", text: clip(reply), commitSha: commitSha ?? null },
  ]);
}

/** Newest first. */
export async function listChatLog(admin: { id: string; role: string }, limit = 200) {
  assertAdmin(admin);
  return db
    .select()
    .from(assistantChatMessages)
    .where(eq(assistantChatMessages.adminId, admin.id))
    .orderBy(desc(assistantChatMessages.createdAt), desc(assistantChatMessages.role))
    .limit(limit);
}
