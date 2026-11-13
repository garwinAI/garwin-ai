// Runs once when the Next.js server starts. Fails fast on bad configuration
// instead of erroring on the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("@/lib/env");
  const { logger } = await import("@/lib/logger");
  try {
    const e = env();
    logger.info("server.start", { nodeEnv: e.NODE_ENV, appUrl: e.APP_URL });
  } catch (err) {
    logger.error("server.config_invalid", { err });
    throw err;
  }
}
