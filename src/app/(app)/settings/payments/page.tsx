import type { Metadata } from "next";
import { Check } from "lucide-react";
import { ComingSoon } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { Section } from "../section";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsSettings() {
  const user = await requireUser();
  const { plan: currentPlan } = await getEntitlements(user);
  return (
    <>
      <Section title="Your plan" description="Paid plans bill monthly or yearly. Prices are set by Admin.">
        <div className="grid gap-3 sm:grid-cols-2">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const current = id === currentPlan.id;
            return (
              <div key={id} className={`rounded-xl border p-4 ${current ? "border-brand-600 ring-2 ring-brand-100" : "border-neutral-200"}`}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{plan.name}</p>
                  {current && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">Current</span>}
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-neutral-600">
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-accent-500" />{plan.storageGb} GB storage</li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-accent-500" />
                    {plan.appZoneDownloads === null ? "Unlimited eligible AppZone downloads" : `${plan.appZoneDownloads} free AppZone downloads`}
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-accent-500" />
                    {plan.teamMembers === 0 ? "No team members" : `Up to ${plan.teamMembers} team member${plan.teamMembers > 1 ? "s" : ""}`}
                  </li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-accent-500" />{plan.includedApps.join(", ")}</li>
                </ul>
                {!current && (
                  <button className="btn-primary mt-4 w-full" disabled>
                    {PLAN_ORDER.indexOf(id) > PLAN_ORDER.indexOf(currentPlan.id) ? "Upgrade" : "Switch"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
          Checkout with Stripe <ComingSoon phase={2} />
        </p>
      </Section>
      <Section title="Billing history">
        <p className="text-sm text-neutral-500">No invoices yet.</p>
      </Section>
    </>
  );
}
