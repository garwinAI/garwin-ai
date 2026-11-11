import type Stripe from "stripe";
import { getStripe } from "@/server/billing/stripe";
import { handleStripeEvent } from "@/server/billing/service";

export const dynamic = "force-dynamic";

// Stripe → Garwin AI. Configure in Stripe → Developers → Webhooks (see Admin → Billing for the URL
// and event list). The signature check is what makes this public endpoint safe.
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("Stripe is not configured", { status: 503 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event);
    return Response.json({ received: true, result });
  } catch (err) {
    // 500 makes Stripe retry later.
    console.error(`[billing] Failed to handle ${event.type} ${event.id}`, err);
    return new Response("Webhook handler failed", { status: 500 });
  }
}
