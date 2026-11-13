import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { PAID_PLAN_IDS, STRIPE_WEBHOOK_EVENTS, stripeMode } from "@/lib/billing";
import { PLAN_SPEC } from "@/lib/plans";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardSection } from "@/components/ui/card";
import { ActionButton } from "@/components/billing/action-button";
import { listAdminPrices, subscriptionCounts } from "@/server/services/billing";
import { stripeConfigured } from "@/server/stripe/client";
import { syncPricesAction } from "./actions";
import { PriceForm, type PriceRow } from "./price-form";

export const metadata: Metadata = { title: "Billing · Admin" };

export default async function AdminBillingPage() {
  await requireAdmin();
  const config = env();
  const stripeReady = stripeConfigured();
  const mode = stripeMode(config.STRIPE_SECRET_KEY);
  const [prices, counts] = await Promise.all([listAdminPrices(), subscriptionCounts()]);

  const rows: PriceRow[] = PAID_PLAN_IDS.map((plan) => {
    const cell = (interval: "month" | "year") => {
      const p = prices.find((x) => x.planId === plan && x.interval === interval && x.currency === "usd");
      return p ? { value: (p.amountCents / 100).toFixed(2), inStripe: Boolean(p.stripePriceId) } : null;
    };
    return { plan, name: PLAN_SPEC[plan].name, month: cell("month"), year: cell("year") };
  });
  const missing = prices.some((p) => !p.stripePriceId);
  const other = Object.entries(counts)
    .filter(([s]) => !["active", "trialing", "past_due", "canceled"].includes(s))
    .reduce((n, [, c]) => n + (c ?? 0), 0);

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
          actions={stripeReady ? <Badge tone={mode === "live" ? "success" : "warning"}>{mode === "live" ? "Live mode" : "Test mode"}</Badge> : <Badge tone="danger">Not connected</Badge>}
        >
          {stripeReady ? (
            <p className="text-sm">
              Connected in <strong>{mode === "live" ? "live" : "test"} mode</strong>.
              {mode === "test" && " Checkout uses Stripe test cards; nobody is charged."}
            </p>
          ) : (
            <p className="text-sm text-neutral-600">
              Add <code>STRIPE_SECRET_KEY</code> and <code>STRIPE_WEBHOOK_SECRET</code> in Vercel → Settings → Environment Variables and
              redeploy. Keys are never stored in the database. Step-by-step: README → &quot;Set up payments (Stripe)&quot;.
            </p>
          )}
          <div className="mt-4 rounded-lg bg-neutral-50 p-4 text-sm">
            <p className="font-medium">Webhook endpoint</p>
            <p className="mt-1">In Stripe → Developers → Webhooks → Add destination, use this URL:</p>
            <code className="mt-1 block break-all rounded bg-white px-2 py-1 ring-1 ring-neutral-200">{config.APP_URL}/api/stripe/webhook</code>
            <p className="mt-3">and select these events:</p>
            <ul className="mt-1 grid gap-x-4 font-mono text-xs sm:grid-cols-2">
              {STRIPE_WEBHOOK_EVENTS.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        </CardSection>

        <CardSection
          id="prices"
          title="Plans & prices"
          description="Free is always free. A new price applies to new subscribers; existing subscribers keep theirs."
        >
          <PriceForm rows={rows} stripeReady={stripeReady} />
          {stripeReady && prices.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 p-3 text-sm text-neutral-700">
              <span className="flex-1">
                {missing
                  ? "Some prices were saved before Stripe was connected."
                  : "Switched Stripe accounts or from test to live keys? Make sure every price exists in Stripe."}
              </span>
              <ActionButton action={syncPricesAction} className="btn-secondary" pendingText="Checking…">
                {missing ? "Send prices to Stripe" : "Check prices in Stripe"}
              </ActionButton>
            </div>
          )}
        </CardSection>

        <CardSection id="subscriptions" title="Stripe subscriptions">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Active", (counts.active ?? 0) + (counts.trialing ?? 0)],
              ["Payment failed", counts.past_due ?? 0],
              ["Canceled", counts.canceled ?? 0],
              ["Other", other],
            ].map(([label, n]) => (
              <div key={label} className="rounded-lg bg-neutral-50 p-3">
                <p className="text-xs text-neutral-500">{label}</p>
                <p className="text-lg font-semibold">{n}</p>
              </div>
            ))}
          </div>
        </CardSection>
      </PageBody>
    </>
  );
}
