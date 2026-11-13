import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { CardSection } from "@/components/ui/card";
import { PlannedBadge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";

export const metadata: Metadata = { title: "Cards" };

export default async function CardsSettings() {
  const ent = await getEntitlements(await requireUser());
  if (!ent.canManageBilling) {
    return (
      <CardSection id="cards" title="Payment cards">
        <p className="text-sm text-neutral-600">Only your account host can manage payment cards for this workspace.</p>
      </CardSection>
    );
  }
  return (
    <CardSection
      id="cards"
      title="Payment cards"
      description="Cards will be stored by Stripe. Garwin AI never sees or stores full card numbers."
      actions={<PlannedBadge phase={2} />}
    >
      <div className="flex flex-col items-center py-6 text-center">
        <CreditCard className="h-8 w-8 text-neutral-300" aria-hidden="true" />
        <p className="mt-3 text-sm text-neutral-500">Adding and managing cards arrives with billing.</p>
      </div>
    </CardSection>
  );
}
