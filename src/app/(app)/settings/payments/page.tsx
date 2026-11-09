import type { Metadata } from "next";
import { Check } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { CardSection } from "@/components/ui/card";
import { Badge, PlannedBadge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsSettings() {
  const user = await requireUser();
  const { plan: currentPlan, canManageBilling } = await getEntitlements(user);
  return (
    <>
      <CardSection
        id="plans"
        title="Plans"
        description={canManageBilling ? "Paid plans bill monthly or yearly. Prices are set by Admin." : "Your account host manages the plan for your team."}
        actions={<PlannedBadge phase={2} />}
      >
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Plans">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const current = id === currentPlan.id;
            return (
              <li key={id} className={cn("rounded-xl border p-4", current ? "border-brand-600 ring-2 ring-brand-100" : "border-neutral-200")}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{plan.name}</p>
                  {current && <Badge tone="brand">Current plan</Badge>}
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-neutral-600">
                  {[
                    `${plan.storageGb} GB storage`,
                    plan.appZoneDownloads === null ? "Unlimited eligible AppZone downloads" : `${plan.appZoneDownloads} free AppZone downloads`,
                    plan.teamMembers === 0 ? "No team members" : `Up to ${plan.teamMembers} team member${plan.teamMembers > 1 ? "s" : ""}`,
                    plan.includedApps.join(", "),
                  ].map((line) => (
                    <li key={line} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-500" aria-hidden="true" />
                      {line}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-sm text-neutral-500">Changing plans opens with Stripe checkout in Phase 2.</p>
      </CardSection>
      <CardSection id="billing-history" title="Billing history">
        <p className="text-sm text-neutral-500">Invoices will appear here once billing is live.</p>
      </CardSection>
    </>
  );
}
