import type { Metadata } from "next";
import { Check } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements, listPlans } from "@/server/services/entitlements";
import { CardSection } from "@/components/ui/card";
import { Badge, PlannedBadge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { getBuiltInApp } from "@/lib/apps";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsSettings() {
  const user = await requireUser();
  const [ent, allPlans] = await Promise.all([getEntitlements(user), listPlans()]);
  const { plan: currentPlan, canManageBilling } = ent;
  // Only the host manages billing. Members with billing.view may see the plan, nothing else.
  if (!canManageBilling && !ent.can("billing.view")) {
    return (
      <CardSection id="billing" title="Billing">
        <p className="text-sm text-neutral-600">Your account host manages the plan and billing for this workspace.</p>
      </CardSection>
    );
  }
  return (
    <>
      <CardSection
        id="plans"
        title="Plans"
        description={canManageBilling ? "Paid plans bill monthly or yearly. Prices are set by Admin." : "Your account host manages the plan for your team."}
        actions={<PlannedBadge phase={2} />}
      >
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Plans">
          {allPlans.map((plan) => {
            const id = plan.id;
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
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-sm text-neutral-500">Paid plans bill monthly or yearly. Paid AppZone items are bought separately on any plan. Changing plans opens with Stripe checkout in Phase 2.</p>
      </CardSection>
      <CardSection id="billing-history" title="Billing history">
        <p className="text-sm text-neutral-500">Invoices will appear here once billing is live.</p>
      </CardSection>
    </>
  );
}
