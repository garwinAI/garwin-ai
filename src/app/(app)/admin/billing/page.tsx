import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { PAID_PLANS, stripeMode } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { PageHeader } from "@/components/page-header";
import { ActionButton } from "@/components/billing/action-button";
import { isStripeConfigured } from "@/server/billing/stripe";
import { listPlanPrices, subscriptionCounts } from "@/server/billing/service";
import { pushPricesToStripe } from "@/server/billing/actions";
import { PriceForm, type PriceRow } from "./price-form";

export const metadata: Metadata = { title: "Billing · Admin" };

const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
];

export default async function AdminBilling() {
  await requireAdmin();
  const stripeReady = isStripeConfigured();
  const mode = stripeMode(process.env.STRIPE_SECRET_KEY);
  const [prices, counts] = await Promise.all([listPlanPrices(), subscriptionCounts()]);
  const webhookUrl = `${process.env.APP_URL || "http://localhost:3000"}/api/stripe/webhook`;

  const rows: PriceRow[] = PAID_PLANS.map((plan) => {
    const cell = (interval: "month" | "year") => {
      const p = prices.find((x) => x.plan === plan && x.interval === interval);
      return p ? { value: (p.amountCents / 100).toFixed(2), synced: Boolean(p.stripePriceId) } : null;
    };
    return { plan, name: PLANS[plan].name, month: cell("month"), year: cell("year") };
  });
  const unsynced = prices.some((p) => !p.stripePriceId);

  return (
    <>
      <PageHeader
        title="Billing"
        description="Plan prices, Stripe connection and subscriptions."
        actions={
          <Link href="/admin" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" /> Admin
          </Link>
        }
      />
      <div className="space-y-6 p-8">
        <section className="card p-5">
          <h2 className="font-semibold">Stripe connection</h2>
          {stripeReady ? (
            <p className="mt-2 text-sm">
              Connected in <strong>{mode === "live" ? "live" : "test"} mode</strong>.
              {mode === "test" && " Payments use Stripe test cards; nobody is really charged."}
            </p>
          ) : (
            <p className="mt-2 text-sm text-neutral-600">
              Not connected. Add <code>STRIPE_SECRET_KEY</code> and <code>STRIPE_WEBHOOK_SECRET</code> in Vercel → Settings →
              Environment Variables, then redeploy. Keys are never stored in the database.
            </p>
          )}
          <div className="mt-4 rounded-lg bg-neutral-50 p-4 text-sm">
            <p className="font-medium">Webhook endpoint</p>
            <p className="mt-1">In Stripe → Developers → Webhooks → Add endpoint, use this URL:</p>
            <code className="mt-1 block break-all rounded bg-white px-2 py-1 ring-1 ring-neutral-200">{webhookUrl}</code>
            <p className="mt-3">and select these events:</p>
            <ul className="mt-1 grid gap-x-4 font-mono text-xs sm:grid-cols-2">
              {WEBHOOK_EVENTS.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Plans &amp; prices</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Free is always free. Changing a price only affects new subscribers; existing subscribers keep their price.
          </p>
          <div className="mt-4">
            <PriceForm rows={rows} stripeReady={stripeReady} />
          </div>
          {stripeReady && prices.length > 0 && (
            <div
              className={`mt-4 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm ${
                unsynced ? "border-yellow-200 bg-yellow-50 text-yellow-900" : "border-neutral-200 text-neutral-600"
              }`}
            >
              {unsynced
                ? "Some prices were saved before Stripe was connected."
                : "Switched Stripe accounts or test/live keys? Check that every price exists in Stripe."}
              <ActionButton action={pushPricesToStripe} className="btn-secondary" pendingText="Checking…">
                {unsynced ? "Send to Stripe" : "Check prices in Stripe"}
              </ActionButton>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Subscriptions</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Active", (counts.active ?? 0) + (counts.trialing ?? 0)],
              ["Payment failed", counts.past_due ?? 0],
              ["Canceled", counts.canceled ?? 0],
              ["Other", Object.entries(counts).filter(([s]) => !["active", "trialing", "past_due", "canceled"].includes(s)).reduce((n, [, c]) => n + c, 0)],
            ].map(([label, n]) => (
              <div key={label} className="rounded-lg bg-neutral-50 p-3">
                <p className="text-xs text-neutral-500">{label}</p>
                <p className="text-lg font-semibold">{n}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
