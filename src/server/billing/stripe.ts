import "server-only";
import Stripe from "stripe";

let client: Stripe | null | undefined;

/**
 * The Stripe client, or null when STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET aren't set.
 * STRIPE_API_BASE points the client at the fake Stripe server in tests; env.ts refuses it in production.
 */
export function getStripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !process.env.STRIPE_WEBHOOK_SECRET) return (client = null);

  const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
  client = new Stripe(key, {
    appInfo: { name: "Garwin AI" },
    maxNetworkRetries: 2,
    ...(base && {
      host: base.hostname,
      port: base.port || (base.protocol === "https:" ? 443 : 80),
      protocol: base.protocol === "https:" ? "https" : "http",
    }),
  });
  return client;
}

export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  return stripe;
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}
