// Shared input schemas. Validate every server action and API input with zod;
// reuse these building blocks so rules stay consistent across the app.
import { z } from "zod";
import { AppError } from "./errors";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

// Password rules live with the hashing code so they can't drift apart.
export { passwordSchema } from "./security/password";

export const nameSchema = z.string().trim().min(1, "Enter your name.").max(80, "Name is too long.");

export const uuidSchema = z.uuid();

/** Parse FormData (or a plain object) against a schema, throwing a user-safe AppError. */
export function parseInput<T extends z.ZodType>(schema: T, input: FormData | Record<string, unknown>): z.infer<T> {
  const data = input instanceof FormData ? Object.fromEntries(input) : input;
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError("VALIDATION", result.error.issues[0]?.message ?? "Check the form and try again.");
  }
  return result.data;
}
