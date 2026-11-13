import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listActivePlanPrices, listPlans } from "@/server/services/entitlements";
import { listAdminPrices, getBillingOverview } from "@/server/services/billing";
import { CardSection } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/ui/local-time";
import { cn } from "@/components/ui/cn";
import { ActionButton } from "@/components/billing/action-button";
import { RefreshUntilUpdated } from "@/components/billing/refresh-until";
import { getBuiltInApp } from "@/lib/apps";
import { formatPrice, pricesForPlan } from "@/lib/pricing";
import { isPaidPlanId, yearlySavingsPercent, type BillingInterval } from "@/lib/billing";
import { PLAN_ORDER, PLAN_SPEC, type PlanId } from "@/lib/plans";
import { openPortalAction, startCheckoutAction, switchPlanAction } from "./actions";

export const metadata: Metadata = { title: "Payments" };

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  active: { label: "Active", tone: "success" },
  trialing: { label: "Trial", tone: "success" },
  past_due: { label: "Payment failed", tone: "danger" },
  incomplete: { label: "Waiting for payment", tone: "warning" },
  unpaid: { label: "Unpaid", tone: "danger" },
  canceled: { label: "Canceled", tone: "neutral" },
};

export default async function PaymentsSettings({
  searchParams,
}: {
  searchParams: Promise<{ interval?: string; checkout?: string; switched?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const overview = await getBillingOverview(user);
  if (!overview) {
    return (
      <CardSection id="billing" title="Billing">
        <p className="text-sm text-neutral-600">Your account host manages the plan and billing for this workspace.</p>
      </CardSection>
    );
  }
  const { ent, subscription, hasCurrent, history, stripeReady } = overview;
  const [allPlans, prices, stripePrices] = await Promise.all([listPlans(), listActivePlanPrices(), listAdminPrices()]);
  const buyable = (planId: PlanId, interval: BillingInterval) =>
    stripeReady && stripePrices.some((p) => p.planId === planId && p.interval === interval && p.stripePriceId);

  const isHost = ent.canManageBilling;
  const viaStripe = hasCurrent && subscription?.source === "stripe";
  const grantedByAdmin = hasCurrent && subscription?.source === "admin";
  const interval: BillingInterval =
    params.interval === "year" || params.interval === "month" ? params.interval : ((viaStripe && subscription?.interval) || "month");
  const status = subscription ? STATUS[subscription.status] : undefined;
  const switched = isPaidPlanId(params.switched) && ent.plan.id === params.switched ? PLAN_SPEC[params.switched].name : null;
  const waitingForStripe = params.checkout === "success" && !hasCurrent;

  return (
    <>
      {params.checkout === "success" && (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {waitingForStripe
            ? "Thanks! Your payment is being confirmed by Stripe. This page updates in a few seconds."
            : `Thanks! You're on ${ent.plan.name}.`}
        </p>
      )}
      {waitingForStripe && <RefreshUntilUpdated />}
      {switched && (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          You&apos;re now on {switched}.
        </p>
      )}
      {params.checkout === "canceled" && (
        <p role="status" className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
          Checkout was canceled. You haven&apos;t been charged.
        </p>
      )}

      <CardSection
        id="plans"
        title="Plans"
        description={isHost ? "Paid plans bill monthly or yearly. Prices are set by Admin." : "Your account host manages the plan for your team."}
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-neutral-50 p-4">
          <div>
            <p className="font-semibold">
              {ent.plan.name} {status && hasCurrent && <Badge tone={status.tone}>{status.label}</Badge>}
            </p>
            {viaStripe && subscription?.currentPeriodEnd && (
              <p className="mt-0.5 text-sm text-neutral-600">
                {subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} <LocalTime iso={subscription.currentPeriodEnd.toISOString()} dateOnly />
                {subscription.interval && ` · billed ${subscription.interval === "month" ? "monthly" : "yearly"}`}
              </p>
            )}
            {grantedByAdmin && <p className="mt-0.5 text-sm text-neutral-600">Set by Garwin AI support. Contact support to change it.</p>}
            {!hasCurrent && subscription?.status === "canceled" && <p className="mt-0.5 text-sm text-neutral-600">Your previous subscription was canceled.</p>}
          </div>
          {isHost && stripeReady && subscription?.source === "stripe" && (
            <ActionButton action={openPortalAction} className="btn-secondary">
              Manage billing
            </ActionButton>
          )}
        </div>

        {subscription?.status === "past_due" && (
          <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Your last payment failed. {isHost ? "Update your card under Manage billing to keep your plan." : "Ask your account host to update the card."}
          </p>
        )}

        <nav aria-label="Billing period" className="mb-4 inline-flex rounded-lg bg-neutral-100 p-1 text-sm">
          {(["month", "year"] as const).map((i) => (
            <Link
              key={i}
              href={`/settings/payments?interval=${i}`}
              aria-current={interval === i ? "true" : undefined}
              className={cn("rounded-md px-3 py-1.5", interval === i ? "bg-white font-medium shadow-sm" : "text-neutral-600 hover:text-neutral-900")}
            >
              {i === "month" ? "Monthly" : "Yearly"}
            </Link>
          ))}
        </nav>

        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Plans">
          {allPlans.map((plan) => {
            const id = plan.id;
            const { month, year } = pricesForPlan(prices, id);
            const price = interval === "month" ? month : year;
            const current = id === ent.plan.id && (!viaStripe || id === "free" || subscription?.interval === interval);
            const savings = interval === "year" ? yearlySavingsPercent(month?.amountCents, year?.amountCents) : 0;
            return (
              <li
                key={id}
                data-testid={`plan-${id}`}
                className={cn("flex flex-col rounded-xl border p-4", current ? "border-brand-600 ring-2 ring-brand-100" : "border-neutral-200")}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{plan.name}</p>
                  {current && <Badge tone="brand">Current plan</Badge>}
                </div>
                <p className="mt-1 text-2xl font-semibold">
                  {!plan.isPaid ? "Free" : price ? formatPrice(price.amountCents, price.currency) : <span className="text-base font-medium text-neutral-500">Price not set yet</span>}
                  {plan.isPaid && price && <span className="text-sm font-normal text-neutral-500"> / {interval}</span>}
                </p>
                {savings > 0 && <p className="text-xs font-medium text-green-700">Save {savings}% compared with monthly</p>}
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
                {isHost && !current && !grantedByAdmin && (
                  <div className="mt-4">
                    <PlanAction
                      id={id}
                      interval={interval}
                      subscribed={Boolean(viaStripe && subscription?.status !== "incomplete")}
                      available={buyable(id, interval)}
                      upgrade={PLAN_ORDER.indexOf(id) > PLAN_ORDER.indexOf(ent.plan.id)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {isHost && viaStripe && <p className="mt-4 text-sm text-neutral-500">Switching is prorated: you&apos;re charged or credited the difference right away.</p>}
        {isHost && !stripeReady && <p className="mt-4 text-sm text-neutral-500">Online payments aren&apos;t switched on yet.</p>}
        <p className="mt-2 text-sm text-neutral-500">Paid AppZone items are bought separately on any plan.</p>
      </CardSection>

      <CardSection id="billing-history" title="Billing history">
        {history.length === 0 ? (
          <p className="text-sm text-neutral-500">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-neutral-500">
                <tr>
                  <th scope="col" className="pb-2 font-medium">Date</th>
                  <th scope="col" className="pb-2 font-medium">Description</th>
                  <th scope="col" className="pb-2 font-medium">Amount</th>
                  <th scope="col" className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {history.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2"><LocalTime iso={p.createdAt.toISOString()} dateOnly /></td>
                    <td className="py-2">{p.description}</td>
                    <td className="py-2">{formatPrice(p.amountCents, p.currency)}</td>
                    <td className="py-2 capitalize">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isHost && stripeReady && subscription?.source === "stripe" && (
          <p className="mt-3 text-sm text-neutral-500">Invoices and receipts are available under Manage billing.</p>
        )}
      </CardSection>
    </>
  );
}

function PlanAction({
  id,
  interval,
  subscribed,
  available,
  upgrade,
}: {
  id: PlanId;
  interval: BillingInterval;
  subscribed: boolean;
  available: boolean;
  upgrade: boolean;
}) {
  const name = PLAN_SPEC[id].name;
  if (id === "free") {
    // Moving to Free means cancelling, which happens in Stripe's billing portal.
    return subscribed ? (
      <ActionButton action={openPortalAction} className="btn-secondary w-full">
        Cancel subscription
      </ActionButton>
    ) : null;
  }
  if (!available) {
    return (
      <button type="button" className="btn-primary w-full" disabled>
        Not available yet
      </button>
    );
  }
  const fields = { plan: id, interval };
  return subscribed ? (
    <ActionButton action={switchPlanAction} fields={fields} pendingText="Switching…" className={upgrade ? "btn-primary w-full" : "btn-secondary w-full"}>
      Switch to {name}
    </ActionButton>
  ) : (
    <ActionButton action={startCheckoutAction} fields={fields}>
      Upgrade to {name}
    </ActionButton>
  );
}
