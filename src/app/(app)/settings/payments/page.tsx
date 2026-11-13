import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements, listPlans } from "@/server/services/entitlements";
import { confirmCheckout, getBillingOverview } from "@/server/services/billing";
import { stripeConfigured } from "@/server/stripe/client";
import { CardSection } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { LocalTime } from "@/components/ui/local-time";
import { ActionButton } from "@/components/billing/action-button";
import { getBuiltInApp } from "@/lib/apps";
import { formatMoney, isCurrentStatus, isPaidPlan, STATUS_TEXT, yearlySavingsPercent, type BillingInterval } from "@/lib/billing";
import { grantsAccess } from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import { PLAN_ORDER, PLAN_SPEC, type PlanId } from "@/lib/plans";
import { openBillingPortalAction, startCheckoutAction, switchPlanAction } from "./actions";

export const metadata: Metadata = { title: "Payments" };

const PAYMENT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  succeeded: { label: "Paid", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  pending: { label: "Pending", tone: "neutral" },
  refunded: { label: "Refunded", tone: "neutral" },
};

type Search = { interval?: string; checkout?: string; session_id?: string; switched?: string };

export default async function PaymentsSettings({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const ent = await getEntitlements(user);
  const { canManageBilling } = ent;
  // Only the host manages billing. Members with billing.view may see it, nothing else.
  if (!canManageBilling && !ent.can("billing.view")) {
    return (
      <CardSection id="billing" title="Billing">
        <p className="text-sm text-neutral-600">Your account host manages the plan and billing for this workspace.</p>
      </CardSection>
    );
  }

  // Back from Stripe Checkout: ask Stripe (not the URL) what was bought, so the plan shows now
  // instead of a few seconds later when the webhook arrives. A failure here is harmless.
  if (params.checkout === "success" && params.session_id) {
    await confirmCheckout(user, params.session_id).catch((err) => logger.warn("checkout.confirm_failed", { err }));
  }

  const [allPlans, { subscription, prices, payments }] = await Promise.all([listPlans(), getBillingOverview(user)]);
  const stripeReady = stripeConfigured();
  const current = subscription && isCurrentStatus(subscription.status) ? subscription : null;
  // Read after confirmCheckout, so a checkout confirmed just above is already reflected.
  const planId: PlanId = current && grantsAccess(current.status) && isPaidPlan(current.planId) ? current.planId : "free";
  const viaStripe = current?.source === "stripe";
  const interval: BillingInterval = params.interval === "year" || params.interval === "month" ? params.interval : (current?.interval ?? "month");
  const priceFor = (id: PlanId, i: BillingInterval) => prices.find((p) => p.planId === id && p.interval === i);

  return (
    <>
      {params.checkout === "success" && (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {planId === "free"
            ? "Thanks! Stripe is confirming your payment. Your plan will update here in a few seconds; reload the page to check."
            : `Thanks! Your payment went through and you're on ${PLAN_SPEC[planId].name}.`}
        </p>
      )}
      {isPaidPlan(params.switched) && planId === params.switched && (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          You&apos;re now on {PLAN_SPEC[params.switched].name}.
        </p>
      )}
      {params.checkout === "canceled" && (
        <p role="status" className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
          Checkout was canceled. You haven&apos;t been charged.
        </p>
      )}

      <CardSection
        id="plans"
        title="Your plan"
        description={canManageBilling ? "Paid plans bill monthly or yearly. Prices are set by Admin." : "Your account host manages the plan for your team."}
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-neutral-50 p-4">
          <div>
            <p className="font-semibold">{PLAN_SPEC[planId].name}</p>
            {subscription && (
              <p className="mt-0.5 text-sm text-neutral-600">
                {STATUS_TEXT[subscription.status]}
                {current?.currentPeriodEnd && grantsAccess(current.status) && (
                  <>
                    {" · "}
                    {current.cancelAtPeriodEnd ? "Ends" : "Renews"} <LocalTime iso={current.currentPeriodEnd.toISOString()} dateOnly />
                  </>
                )}
              </p>
            )}
            {current?.source === "admin" && <p className="mt-0.5 text-sm text-neutral-600">This plan was set up by Garwin AI. Contact support to change it.</p>}
          </div>
          {canManageBilling && stripeReady && subscription?.source === "stripe" && (
            <ActionButton action={openBillingPortalAction} className="btn-secondary">
              Manage billing
            </ActionButton>
          )}
        </div>

        {current?.status === "past_due" && (
          <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Your last payment failed. Update your card under Manage billing to keep your plan.
          </p>
        )}

        <nav aria-label="Billing period" className="mb-4 inline-flex rounded-lg bg-neutral-100 p-1 text-sm">
          {(["month", "year"] as const).map((i) => (
            <Link
              key={i}
              href={`/settings/payments?interval=${i}`}
              aria-current={interval === i ? "true" : undefined}
              className={cn("rounded-md px-3 py-1.5", interval === i ? "bg-white font-medium shadow-sm" : "text-neutral-700")}
            >
              {i === "month" ? "Monthly" : "Yearly"}
            </Link>
          ))}
        </nav>

        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Plans">
          {allPlans.map((plan) => {
            const id = plan.id;
            const price = isPaidPlan(id) ? priceFor(id, interval) : undefined;
            const isCurrent = id === planId && (id === "free" || !viaStripe || current?.interval === interval);
            const savings = isPaidPlan(id) && interval === "year" ? yearlySavingsPercent(priceFor(id, "month")?.amountCents ?? 0, priceFor(id, "year")?.amountCents ?? 0) : 0;
            return (
              <li key={id} data-testid={`plan-${id}`} className={cn("flex flex-col rounded-xl border p-4", isCurrent ? "border-brand-600 ring-2 ring-brand-100" : "border-neutral-200")}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{plan.name}</p>
                  {isCurrent && <Badge tone="brand">Current plan</Badge>}
                </div>
                <p className="mt-1 text-2xl font-semibold">
                  {id === "free" ? "Free" : price ? formatMoney(price.amountCents, price.currency) : "Price not set"}
                  {price && <span className="text-sm font-normal text-neutral-600"> / {interval}</span>}
                </p>
                {savings > 0 && <p className="text-xs font-medium text-green-800">Save {savings}% vs monthly</p>}
                <ul className="mt-3 flex-1 space-y-1.5 text-sm text-neutral-600">
                  {[
                    `${plan.storageGb} GB storage`,
                    plan.freeAppzoneDownloadLimit === null ? "Unlimited free AppZone items" : `${plan.freeAppzoneDownloadLimit} free AppZone downloads (lifetime)`,
                    plan.teamMemberLimit === 0 ? "No team members" : `Up to ${plan.teamMemberLimit} team member${plan.teamMemberLimit > 1 ? "s" : ""}`,
                    plan.includedApps.map((slug) => getBuiltInApp(slug)?.name ?? slug).join(", "),
                  ].map((line) => (
                    <li key={line} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-500" aria-hidden="true" />
                      {line}
                    </li>
                  ))}
                </ul>
                {canManageBilling && !isCurrent && current?.source !== "admin" && (
                  <div className="mt-4">
                    <PlanButton
                      id={id}
                      name={plan.name}
                      interval={interval}
                      subscribed={viaStripe}
                      canSwitch={current?.status === "active" || current?.status === "trialing"}
                      available={Boolean(stripeReady && price?.stripePriceId)}
                      upgrade={PLAN_ORDER.indexOf(id) > PLAN_ORDER.indexOf(planId)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-sm text-neutral-600">
          {viaStripe ? "Switching plans is prorated: you're charged or credited the difference right away. " : ""}
          {!stripeReady ? "Online payments aren't switched on yet. " : ""}
          Paid AppZone items are bought separately on any plan.
        </p>
      </CardSection>

      <CardSection id="billing-history" title="Billing history" description="Payments confirmed by Stripe. Open Manage billing for invoices and receipts.">
        {payments.length === 0 ? (
          <p className="text-sm text-neutral-600">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-neutral-600">
                <tr>
                  <th scope="col" className="pb-2 pr-4 font-medium">Date</th>
                  <th scope="col" className="pb-2 pr-4 font-medium">Description</th>
                  <th scope="col" className="pb-2 pr-4 font-medium">Amount</th>
                  <th scope="col" className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {payments.map((p) => {
                  const status = PAYMENT_STATUS[p.status] ?? PAYMENT_STATUS.pending;
                  return (
                    <tr key={p.id}>
                      <td className="py-2 pr-4 whitespace-nowrap"><LocalTime iso={p.createdAt.toISOString()} dateOnly /></td>
                      <td className="py-2 pr-4">{p.description ?? "Subscription"}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{formatMoney(p.amountCents, p.currency)}</td>
                      <td className="py-2"><Badge tone={status.tone}>{status.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardSection>
    </>
  );
}

function PlanButton({
  id,
  name,
  interval,
  subscribed,
  canSwitch,
  available,
  upgrade,
}: {
  id: PlanId;
  name: string;
  interval: BillingInterval;
  subscribed: boolean;
  canSwitch: boolean;
  available: boolean;
  upgrade: boolean;
}) {
  if (id === "free") {
    // Going back to Free means cancelling, which happens in Stripe's billing portal.
    return subscribed ? (
      <ActionButton action={openBillingPortalAction} className="btn-secondary w-full">
        Cancel subscription
      </ActionButton>
    ) : null;
  }
  if (!available) {
    return <p className="rounded-lg bg-neutral-50 px-3 py-2 text-center text-sm text-neutral-600">Not available to buy yet</p>;
  }
  const fields = { plan: id, interval };
  if (!subscribed) {
    return (
      <ActionButton action={startCheckoutAction} fields={fields}>
        Upgrade to {name}
      </ActionButton>
    );
  }
  if (!canSwitch) return null; // payment failing: fix the card first (see the alert above)
  return (
    <ActionButton action={switchPlanAction} fields={fields} pendingText="Switching…" className={upgrade ? "btn-primary w-full" : "btn-secondary w-full"}>
      Switch to {name}
    </ActionButton>
  );
}
