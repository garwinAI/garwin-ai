import "dotenv/config";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

// Capture outgoing email in a temp file instead of printing it, and keep logs quiet.
process.env.MAIL_LOG_FILE = join(mkdtempSync(join(tmpdir(), "garwin-mail-")), "mail.jsonl");
process.env.EMAIL_TRANSPORT = "console";
process.env.LOG_LEVEL = "error";

const realLog = console.log;
console.log = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("--- email (dev)")) return;
  realLog(...args);
};

afterAll(async () => {
  const { closeDatabase } = await import("@/db");
  await closeDatabase();
});
