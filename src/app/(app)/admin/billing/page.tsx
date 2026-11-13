import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { PAID_PLANS, stripeMode, WEBHOOK_EVENTS, type BillingInterval } from "@/lib/billing";
import { PLAN_SPEC } from "@/lib/plans";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/billing/action-button";
import { listActivePrices, subscriptionCounts } from "@/server/services/billing";
import { stripeConfigured } from "@/server/stripe/client";
import { pushPricesToStripeAction } from "./actions";
import { PriceForm, type PriceRow } from "./price-form";

export const metadata: Metadata = { title: "Billing · Admin" };

export default async function AdminBilling() {
  const admin = await requireAdmin();
  const config = env();
  const stripeReady = stripeConfigured();
  const mode = stripeMode(config.STRIPE_SECRET_KEY);
  const [prices, counts] = await Promise.all([listActivePrices(), subscriptionCounts(admin)]);
  const webhookUrl = `${config.APP_URL}/api/stripe/webhook`;

  const rows: PriceRow[] = PAID_PLANS.map((plan) => {
    const cell = (interval: BillingInterval) => {
      const p = prices.find((x) => x.planId === plan && x.interval === interval);
      return p ? { value: (p.amountCents / 100).toFixed(2), inStripe: Boolean(p.stripePriceId) } : null;
    };
    return { plan, name: PLAN_SPEC[plan].name, month: cell("month"), year: cell("year") };
  });
  const missing = prices.some((p) => !p.stripePriceId);

  return (
    <>
      <PageHeader
        title="Billing"
        description="Plan prices, the Stripe connection and subscriptions."
        actions={
          <ButtonLink href="/admin" variant="secondary">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Admin
          </ButtonLink>
        }
      />
      <PageBody>
        <CardSection
          id="stripe"
          title="Stripe connection"
          actions={stripeReady ? <Badge tone={mode === "live" ? "success" : "warning"}>{mode === "live" ? "Live mode" : "Test mode"}</Badge> : <Badge>Not connected</Badge>}
        >
          {stripeReady ? (
            <p className="text-sm">
              Connected in <strong>{mode === "live" ? "live" : "test"} mode</strong>.
              {mode === "test" ? " Payments use Stripe test cards; nobody is really charged." : " Real cards are charged."}
            </p>
          ) : (
            <p className="text-sm text-neutral-700">
              Not connected. Add <code>STRIPE_SECRET_KEY</code> and <code>STRIPE_WEBHOOK_SECRET</code> in Vercel → Settings → Environment
              Variables, then redeploy. Keys are never stored in the database or shown here.
            </p>
          )}
          <div className="mt-4 rounded-lg bg-neutral-50 p-4 text-sm">
            <h3 className="font-medium">Webhook endpoint</h3>
            <p className="mt-1">In Stripe → Developers → Webhooks → Add endpoint, use this URL:</p>
            <code className="mt-1 block break-all rounded bg-white px-2 py-1 ring-1 ring-neutral-200">{webhookUrl}</code>
            <p className="mt-3">and select these events:</p>
            <ul className="mt-1 grid gap-x-4 font-mono text-xs sm:grid-cols-2">
              {WEBHOOK_EVENTS.map((e) => <li key={e} className="break-all">{e}</li>)}
            </ul>
            <p className="mt-3">Stripe then shows a signing secret (<code>whsec_…</code>). That is your <code>STRIPE_WEBHOOK_SECRET</code>.</p>
          </div>
        </CardSection>

        <CardSection
          id="prices"
          title="Plans & prices"
          description="Free is always free. Changing a price only affects new subscribers; existing subscribers keep the price they signed up at."
        >
          <PriceForm rows={rows} stripeReady={stripeReady} />
          {stripeReady && prices.length > 0 && (
            <div className={`mt-4 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm ${missing ? "border-yellow-200 bg-yellow-50 text-yellow-900" : "border-neutral-200 text-neutral-700"}`}>
              <p className="min-w-0 flex-1">
                {missing ? "Some prices were saved before Stripe was connected, so they can't be bought yet." : "Switched Stripe accounts, or from test to live keys? Check that every price exists in Stripe."}
              </p>
              <ActionButton action={pushPricesToStripeAction} className="btn-secondary" pendingText="Checking…">
                {missing ? "Send to Stripe" : "Check prices in Stripe"}
              </ActionButton>
            </div>
          )}
        </CardSection>

        <CardSection id="subscriptions" title="Subscriptions">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Active", counts.active],
              ["Payment failed", counts.pastDue],
              ["Canceled", counts.canceled],
              ["Other", counts.other],
            ].map(([label, n]) => (
              <div key={label} className="rounded-lg bg-neutral-50 p-3">
                <dt className="text-xs text-neutral-600">{label}</dt>
                <dd className="text-lg font-semibold">{n}</dd>
              </div>
            ))}
          </dl>
        </CardSection>
      </PageBody>
    </>
  );
}
