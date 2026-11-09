// Single source of truth for environment variables. Server-side only.
// Validated once on server start (see src/instrumentation.ts) and on first use.
// Never read process.env directly elsewhere in app code; add the variable here instead.
import { z } from "zod";

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Postgres connection string)"),
    // Keys the hashes of session and email tokens stored in the database.
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

    // Email. "resend" sends real email; "console" prints emails to the server log (development only).
    EMAIL_TRANSPORT: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["resend", "console"]).optional()),
    EMAIL_FROM: z.string().trim().default("Garwin AI <no-reply@garwinai.com>"),
    RESEND_API_KEY: optional,
    // Override only for tests (points e2e runs at a local fake Resend server).
    RESEND_API_URL: z.url().default("https://api.resend.com/emails"),
    // Development/test only: also append sent emails as JSON lines to this file (used by e2e tests).
    MAIL_LOG_FILE: optional,

    // Integrations added in later phases. Optional until their phase ships.
    STRIPE_SECRET_KEY: optional,
    STRIPE_WEBHOOK_SECRET: optional,
    ASSISTANT_API_KEY: optional,
  })
  .transform((e) => ({ ...e, EMAIL_TRANSPORT: e.EMAIL_TRANSPORT ?? (e.RESEND_API_KEY ? "resend" : "console") }))
  .superRefine((e, ctx) => {
    if (e.EMAIL_TRANSPORT === "resend" && !e.RESEND_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "RESEND_API_KEY is required when EMAIL_TRANSPORT=resend" });
    }
    if (e.NODE_ENV === "production" && e.EMAIL_TRANSPORT === "console") {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "Production needs a real email provider: set RESEND_API_KEY (password reset and verification send email)",
      });
    }
    if (e.NODE_ENV === "production" && e.MAIL_LOG_FILE) {
      ctx.addIssue({ code: "custom", path: ["MAIL_LOG_FILE"], message: "MAIL_LOG_FILE must not be set in production (it would write emails with secret links to disk)" });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests only. */
export function resetEnvCache() {
  cached = undefined;
}
