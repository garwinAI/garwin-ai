// SMS delivery through Twilio's REST API (no SDK needed). In development without Twilio, the
// message is printed to the terminal. In production without Twilio, SMS is unavailable and
// callers must check smsAvailable() first (the invite form hides the SMS option).
import "server-only";
import { appendFile } from "node:fs/promises";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "sms" });

export type SmsMessage = { to: string; body: string; tag: "team_invite" };

export function smsAvailable(): boolean {
  const e = env();
  return Boolean(e.TWILIO_ACCOUNT_SID) || e.NODE_ENV !== "production";
}

export async function sendSms(message: SmsMessage): Promise<void> {
  const e = env();
  if (e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_FROM) {
    const body = new URLSearchParams({ To: message.to, Body: message.body });
    body.set(e.TWILIO_FROM.startsWith("MG") ? "MessagingServiceSid" : "From", e.TWILIO_FROM);
    const res = await fetch(`${e.TWILIO_API_BASE}/2010-04-01/Accounts/${e.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(`Twilio rejected SMS (${res.status}): ${detail}`);
    }
  } else if (e.NODE_ENV !== "production") {
    console.log(`\n--- sms (dev) to ${message.to}\n${message.body}\n---\n`);
  } else {
    throw new Error("SMS is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)");
  }
  if (e.MAIL_LOG_FILE && e.NODE_ENV !== "production") {
    await appendFile(e.MAIL_LOG_FILE, JSON.stringify({ to: message.to, subject: "sms", text: message.body, tag: message.tag, at: new Date().toISOString() }) + "\n");
  }
  // Never log the body: it contains a single-use invitation link.
  log.info("sms.sent", { tag: message.tag });
}
