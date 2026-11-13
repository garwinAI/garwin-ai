// Stripe → Garwin AI webhook. Public (Stripe has no session), so the Stripe signature over the raw
// body is the authentication. Not an isSameOrigin() route: requests come from Stripe's servers.
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getStripe } from "@/server/stripe/client";
import { handleStripeEvent } from "@/server/services/billing";

export const dynamic = "force-dynamic";

const log = logger.child({ module: "stripe-webhook" });

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("Stripe is not configured", { status: 503 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret);
  } catch {
    log.warn("webhook.rejected", { reason: "bad signature" });
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event);
    return Response.json({ received: true, result });
  } catch (err) {
    // 500 makes Stripe retry later; handleStripeEvent stored the error on the event row.
    log.error("webhook.failed", { eventId: event.id, type: event.type, err });
    return new Response("Webhook handler failed", { status: 500 });
  }
}
