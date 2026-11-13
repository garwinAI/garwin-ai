// The Stripe client. The secret key is read only here and is never logged or returned.
import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";

let client: Stripe | null | undefined;

export const stripeConfigured = () => {
  const config = env();
  return Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET);
};

/** The Stripe client, or null when Stripe isn't configured. */
export function getStripe(): Stripe | null {
  if (client !== undefined) return client;
  const config = env();
  if (!config.STRIPE_SECRET_KEY || !config.STRIPE_WEBHOOK_SECRET) return (client = null);
  const base = config.STRIPE_API_BASE ? new URL(config.STRIPE_API_BASE) : null;
  client = new Stripe(config.STRIPE_SECRET_KEY, {
    appInfo: { name: "Garwin AI" },
    maxNetworkRetries: 2,
    timeout: 20_000,
    ...(base && {
      host: base.hostname,
      port: base.port || (base.protocol === "https:" ? 443 : 80),
      protocol: base.protocol === "https:" ? "https" : "http",
    }),
  });
  return client;
}

/** Stripe "resource_missing": the object doesn't exist in the connected account. */
export function isMissing(err: unknown) {
  return (err as { code?: string } | null)?.code === "resource_missing";
}

/** For tests only. */
export function resetStripeClient() {
  client = undefined;
}
