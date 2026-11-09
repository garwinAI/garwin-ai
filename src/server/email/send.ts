// Email delivery. Production uses Resend's HTTPS API (no SDK needed). Development prints the
// email to the server log (and optionally a local file for e2e tests). Production refuses to
// start without a real provider; see src/lib/env.ts.
import "server-only";
import { appendFile } from "node:fs/promises";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { EmailMessage } from "./templates";

const log = logger.child({ module: "email" });

export async function sendEmail(message: EmailMessage): Promise<void> {
  const config = env();
  if (config.EMAIL_TRANSPORT === "resend") {
    await sendWithResend(message, config.EMAIL_FROM, config.RESEND_API_KEY!, config.RESEND_API_URL);
  } else {
    // Development only. Links are printed so you can click them locally.
    console.log(`\n--- email (dev) to ${message.to}: ${message.subject}\n${message.text}\n---\n`);
  }
  if (config.MAIL_LOG_FILE && config.NODE_ENV !== "production") {
    await appendFile(config.MAIL_LOG_FILE, JSON.stringify({ ...message, at: new Date().toISOString() }) + "\n");
  }
  // Never log the body or links: they contain single-use secrets.
  log.info("email.sent", { tag: message.tag, transport: config.EMAIL_TRANSPORT });
}

async function sendWithResend(message: EmailMessage, from: string, apiKey: string, url: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      tags: [{ name: "type", value: message.tag }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // Resend error bodies don't contain our secrets, but keep only the status and a short excerpt.
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`Resend rejected email (${res.status}): ${detail}`);
  }
}
