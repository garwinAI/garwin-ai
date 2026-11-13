import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { RequestMeta } from "@/server/services/security-events";

export const uniqueEmail = (tag = "u") => `it-${tag}-${randomUUID().slice(0, 8)}@test.garwinai.dev`;

/** A fresh fake client so rate-limit counters don't leak between tests. */
export const freshMeta = (): RequestMeta => ({
  ip: `10.${rand()}.${rand()}.${rand()}`,
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36",
});
const rand = () => Math.floor(Math.random() * 254) + 1;

export const STRONG = "blue-harbor-lights-7";

type Mail = { to: string; subject: string; text: string; tag: string };

export function mailsTo(email: string): Mail[] {
  const file = process.env.MAIL_LOG_FILE!;
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Mail)
    .filter((m) => m.to === email);
}

/** Extract the single-use token from the most recent email of a given type. */
export function latestToken(email: string, tag: string): string {
  const mail = mailsTo(email).filter((m) => m.tag === tag).at(-1);
  if (!mail) throw new Error(`No ${tag} email for ${email}`);
  const match = mail.text.match(/#token=([A-Za-z0-9_-]{43})/);
  if (!match) throw new Error("No token in email");
  return match[1];
}
