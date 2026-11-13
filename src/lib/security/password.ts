// Password policy and hashing. bcrypt with cost 12; hashes are upgraded on login if the cost changes.
import bcrypt from "bcryptjs";
import { z } from "zod";

export const BCRYPT_COST = 12;
export const PASSWORD_MIN = 10;
/** bcrypt only uses the first 72 bytes; longer input would be silently truncated, so we reject it. */
export const PASSWORD_MAX_BYTES = 72;

// A short list of passwords that meet the length rule but are still trivially guessable.
const COMMON = new Set([
  "1234567890", "12345678910", "0123456789", "1111111111", "0000000000", "qwertyuiop", "password12",
  "password123", "password1234", "passw0rd123", "iloveyou123", "letmein123", "welcome123", "admin12345",
  "qwerty1234", "qwerty12345", "abcdefghij", "abc1234567", "1q2w3e4r5t", "1qaz2wsx3edc", "trustno1234",
  "football123", "baseball123", "monkey12345", "dragon12345", "sunshine123", "princess123", "garwinai123",
]);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`)
  .refine((p) => Buffer.byteLength(p, "utf8") <= PASSWORD_MAX_BYTES, "Password is too long (72 characters max).")
  .refine((p) => !COMMON.has(p.toLowerCase()), "That password is too common. Choose something harder to guess.")
  .refine((p) => new Set(p).size >= 4, "That password is too easy to guess. Use more varied characters.");

/** Extra check that needs context: the password must not contain the user's email name. */
export function passwordMentionsEmail(password: string, email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  return local.length >= 4 && password.toLowerCase().includes(local);
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function needsRehash(hash: string): boolean {
  try {
    const rounds = bcrypt.getRounds(hash);
    // getRounds returns NaN (not an error) for strings that aren't bcrypt hashes.
    return !Number.isFinite(rounds) || rounds < BCRYPT_COST;
  } catch {
    return true;
  }
}

// Compared against when an email isn't registered, so response time doesn't reveal which emails exist.
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  return (dummy ??= bcrypt.hash("garwin-timing-guard", BCRYPT_COST));
}
