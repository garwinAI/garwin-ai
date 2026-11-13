// Stripe -> Garwin AI. Add this URL as a webhook endpoint in Stripe (Admin -> Billing shows the
// URL and the events to select). It is public: the signature check on the RAW body is what makes
// it safe, so nothing here trusts the payload until verifyWebhook() has accepted it.
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { handleStripeEvent } from "@/server/services/billing";
import { verifyWebhook } from "@/server/stripe/client";

export const dynamic = "force-dynamic";

const log = logger.child({ module: "stripe-webhook" });

/** Real events are a few KB. Refuse anything huge before reading it into memory. */
const MAX_BODY_BYTES = 1_000_000;

export async function POST(req: Request) {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret || !env().STRIPE_SECRET_KEY) return new Response("Stripe is not configured", { status: 503 });

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });

  const event = verifyWebhook(raw, req.headers.get("stripe-signature"), secret);
  if (!event) return new Response("Invalid signature", { status: 400 });

  try {
    const result = await handleStripeEvent(event);
    return Response.json({ received: true, result });
  } catch (err) {
    // 500 makes Stripe retry later; the event stays unprocessed in stripe_events until it succeeds.
    log.error("webhook.failed", { eventId: event.id, type: event.type, err });
    return new Response("Webhook handler failed", { status: 500 });
  }
}
