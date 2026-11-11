import { z } from "zod";
import { parseSandboxOrigin } from "./appzone-sandbox";

// Every environment variable the app reads is declared here and listed in .env.example.
// validateEnv() runs at server start (src/instrumentation.ts) and lists every problem at once.

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z
      .string()
      .trim()
      .min(1, "is required")
      .refine((v) => /^postgres(ql)?:\/\//.test(v), "must start with postgres:// or postgresql://"),
    AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    APP_URL: z.string().trim().url("must be a full URL, e.g. https://dev.garwinai.com").default("http://localhost:3000"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    RESEND_API_KEY: optional,
    EMAIL_FROM: optional,
    TWILIO_ACCOUNT_SID: optional,
    TWILIO_AUTH_TOKEN: optional,
    TWILIO_FROM: optional,
    APPZONE_SANDBOX_ORIGIN: optional,
    STRIPE_SECRET_KEY: optional,
    STRIPE_WEBHOOK_SECRET: optional,
    // Tests only: send Stripe API calls to the fake server in tests/support. Refused in production.
    STRIPE_API_BASE: optional,
    ASSISTANT_API_KEY: optional,
  })
  .superRefine((env, ctx) => {
    const twilio = [env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_FROM].filter(Boolean).length;
    if (twilio !== 0 && twilio !== 3) {
      ctx.addIssue({ code: "custom", path: ["TWILIO_ACCOUNT_SID"], message: "set all three TWILIO_* variables or none" });
    }
    if (Boolean(env.STRIPE_SECRET_KEY) !== Boolean(env.STRIPE_WEBHOOK_SECRET)) {
      ctx.addIssue({ code: "custom", path: ["STRIPE_SECRET_KEY"], message: "set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET together" });
    }
    if (env.STRIPE_SECRET_KEY && !/^(sk|rk)_(test|live)_/.test(env.STRIPE_SECRET_KEY)) {
      ctx.addIssue({ code: "custom", path: ["STRIPE_SECRET_KEY"], message: "must start with sk_test_, sk_live_, rk_test_ or rk_live_" });
    }
    if (env.STRIPE_WEBHOOK_SECRET && !env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) {
      ctx.addIssue({ code: "custom", path: ["STRIPE_WEBHOOK_SECRET"], message: "must start with whsec_" });
    }
    if (env.STRIPE_API_BASE && env.NODE_ENV === "production" && !/^http:\/\/localhost:/.test(env.STRIPE_API_BASE)) {
      ctx.addIssue({ code: "custom", path: ["STRIPE_API_BASE"], message: "is for tests only; remove it" });
    }
    if (
      env.APPZONE_SANDBOX_ORIGIN &&
      !parseSandboxOrigin(env.APPZONE_SANDBOX_ORIGIN, env.APP_URL, env.NODE_ENV === "production")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["APPZONE_SANDBOX_ORIGIN"],
        message: "must be a bare https origin on a different domain from APP_URL",
      });
    }
  });

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  constructor(public problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "EnvError";
  }
}

export function validateEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvError(result.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`));
  }
  return result.data;
}

let cached: Env | undefined;
/** Validated environment. Throws EnvError listing every invalid variable. */
export function env(): Env {
  return (cached ??= validateEnv());
}
