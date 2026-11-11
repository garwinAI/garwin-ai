import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/plans";
import { formatMoney, isEntitledStatus, isPaidPlan, yearlySavingsPercent, type BillingInterval } from "@/lib/billing";
import { isStripeConfigured } from "@/server/billing/stripe";
import { confirmCheckout, getSubscription, listInvoices, listPlanPrices } from "@/server/billing/service";
import { openBillingPortal, startCheckout, switchPlan } from "@/server/billing/actions";
import { ActionButton } from "@/components/billing/action-button";
import { LocalTime } from "@/components/local-time";
import { Section } from "../section";

export const metadata: Metadata = { title: "Payments" };

const STATUS_TEXT: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment failed: update your card",
  canceled: "Canceled",
  unpaid: "Unpaid",
  incomplete: "Waiting for payment",
  incomplete_expired: "Expired",
  paused: "Paused",
};

export default async function PaymentsSettings({
  searchParams,
}: {
  searchParams: Promise<{ interval?: string; checkout?: string; session_id?: string; switched?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  if (params.checkout === "success" && params.session_id) {
    await confirmCheckout(user.id, params.session_id).catch((err) => console.error("[billing] confirm", err));
  }

  const stripeReady = isStripeConfigured();
  const [subscription, prices, invoices] = await Promise.all([
    getSubscription(user.id),
    listPlanPrices(),
    listInvoices(user).catch(() => []),
  ]);
  const subscribed = Boolean(subscription && isEntitledStatus(subscription.status));
  // The subscription is read fresh, so it already reflects a checkout confirmed just above.
  const plan: PlanId = subscribed ? subscription!.plan : user.plan;
  const interval: BillingInterval = params.interval === "year" || params.interval === "month" ? params.interval : (subscription?.interval ?? "month");
  const priceFor = (id: PlanId, i: BillingInterval) => prices.find((p) => p.plan === id && p.interval === i);
  const isTeamMember = Boolean(user.hostId);

  return (
    <>
      {params.checkout === "success" && (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Thanks! Your payment went through. Your plan is updated below (it can take a few seconds).
        </p>
      )}
      {isPaidPlan(params.switched) && subscribed && subscription!.plan === params.switched && (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          You&apos;re now on {PLANS[params.switched].name}.
        </p>
      )}
      {params.checkout === "canceled" && (
        <p role="status" className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
          Checkout was canceled. You haven&apos;t been charged.
        </p>
      )}

      <Section title="Your plan" description="Paid plans bill monthly or yearly. Prices are set by Admin.">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-neutral-50 p-4">
          <div>
            <p className="font-semibold">{PLANS[plan].name}</p>
            {subscription && (
              <p className="mt-0.5 text-sm text-neutral-600">
                {STATUS_TEXT[subscription.status] ?? subscription.status}
                {subscription.currentPeriodEnd && isEntitledStatus(subscription.status) && (
                  <>
                    {" · "}
                    {subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} <LocalTime iso={subscription.currentPeriodEnd.toISOString()} dateOnly />
                  </>
                )}
              </p>
            )}
            {isTeamMember && <p className="mt-0.5 text-sm text-neutral-600">Your plan is managed by your team&apos;s host.</p>}
          </div>
          {!isTeamMember && stripeReady && subscription && (
            <ActionButton action={openBillingPortal} className="btn-secondary">
              Manage billing
            </ActionButton>
          )}
        </div>

        {subscription?.status === "past_due" && (
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
              className={`rounded-md px-3 py-1.5 ${interval === i ? "bg-white font-medium shadow-sm" : "text-neutral-600"}`}
            >
              {i === "month" ? "Monthly" : "Yearly"}
            </Link>
          ))}
        </nav>

        <div className="grid gap-3 sm:grid-cols-2">
          {PLAN_ORDER.map((id) => {
            const details = PLANS[id];
            const price = isPaidPlan(id) ? priceFor(id, interval) : undefined;
            const isCurrent = id === plan && (!subscribed || id === "free" || subscription?.interval === interval);
            const savings =
              isPaidPlan(id) && interval === "year"
                ? yearlySavingsPercent(priceFor(id, "month")?.amountCents ?? 0, priceFor(id, "year")?.amountCents ?? 0)
                : 0;
            return (
              <div
                key={id}
                data-testid={`plan-${id}`}
                className={`flex flex-col rounded-xl border p-4 ${isCurrent ? "border-brand-600 ring-2 ring-brand-100" : "border-neutral-200"}`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{details.name}</p>
                  {isCurrent && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">Current</span>}
                </div>
                <p className="mt-1 text-2xl font-semibold">
                  {id === "free" ? "Free" : price ? formatMoney(price.amountCents, price.currency) : "—"}
                  {price && <span className="text-sm font-normal text-neutral-500"> / {interval}</span>}
                </p>
                {savings > 0 && <p className="text-xs font-medium text-green-700">Save {savings}% vs monthly</p>}
                <ul className="mt-3 flex-1 space-y-1.5 text-sm text-neutral-600">
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-accent-500" />{details.storageGb} GB storage</li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-accent-500" />
                    {details.appZoneDownloads === null ? "Unlimited eligible AppZone downloads" : `${details.appZoneDownloads} free AppZone downloads`}
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-accent-500" />
                    {details.teamMembers === 0 ? "No team members" : `Up to ${details.teamMembers} team member${details.teamMembers > 1 ? "s" : ""}`}
                  </li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-accent-500" />{details.includedApps.join(", ")}</li>
                </ul>
                <div className="mt-4">
                  <PlanButton
                    id={id}
                    interval={interval}
                    isCurrent={isCurrent}
                    subscribed={subscribed}
                    available={Boolean(stripeReady && price?.stripePriceId)}
                    isTeamMember={isTeamMember}
                    upgrade={PLAN_ORDER.indexOf(id) > PLAN_ORDER.indexOf(plan)}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {subscribed && <p className="mt-4 text-sm text-neutral-500">Switching plans is prorated: you&apos;re charged or credited the difference right away.</p>}
        {!stripeReady && <p className="mt-4 text-sm text-neutral-500">Online payments aren&apos;t switched on yet.</p>}
      </Section>

      <Section title="Billing history">
        {invoices.length === 0 ? (
          <p className="text-sm text-neutral-500">No invoices yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-neutral-500">
              <tr>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Amount</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium"><span className="sr-only">Invoice</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-2"><LocalTime iso={inv.created.toISOString()} dateOnly /></td>
                  <td className="py-2">{formatMoney(inv.amountCents, inv.currency)}</td>
                  <td className="py-2 capitalize">{inv.status}</td>
                  <td className="py-2 text-right">
                    {inv.url && (
                      <a href={inv.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                        View{inv.number ? ` ${inv.number}` : ""}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}

function PlanButton({
  id,
  interval,
  isCurrent,
  subscribed,
  available,
  isTeamMember,
  upgrade,
}: {
  id: PlanId;
  interval: BillingInterval;
  isCurrent: boolean;
  subscribed: boolean;
  available: boolean;
  isTeamMember: boolean;
  upgrade: boolean;
}) {
  if (isCurrent || isTeamMember) return null;
  const name = PLANS[id].name;
  if (id === "free") {
    // Downgrading to Free = cancelling, which happens in Stripe's billing portal.
    return subscribed ? (
      <ActionButton action={openBillingPortal} className="btn-secondary w-full">
        Cancel subscription
      </ActionButton>
    ) : null;
  }
  if (!available) {
    return <button className="btn-primary w-full" disabled>Not available yet</button>;
  }
  const fields = { plan: id, interval };
  return subscribed ? (
    <ActionButton action={switchPlan} fields={fields} pendingText="Switching…" className={upgrade ? "btn-primary w-full" : "btn-secondary w-full"}>
      Switch to {name}
    </ActionButton>
  ) : (
    <ActionButton action={startCheckout} fields={fields}>
      Upgrade to {name}
    </ActionButton>
  );
}
