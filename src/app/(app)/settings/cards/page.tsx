import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { CardSection } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/billing/action-button";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";
import { listCards } from "@/server/services/billing";
import { stripeConfigured } from "@/server/stripe/client";
import { openPortalAction } from "../payments/actions";

export const metadata: Metadata = { title: "Cards" };

export default async function CardsSettings() {
  const user = await requireUser();
  const ent = await getEntitlements(user);
  if (!ent.canManageBilling) {
    return (
      <CardSection id="cards" title="Payment cards">
        <p className="text-sm text-neutral-600">Only your account host can manage payment cards for this workspace.</p>
      </CardSection>
    );
  }
  const stripeReady = stripeConfigured();
  const cards = await listCards(user);
  return (
    <CardSection id="cards" title="Payment cards" description="Cards are stored by Stripe. Garwin AI never sees or stores full card numbers.">
      {cards.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <CreditCard className="h-8 w-8 text-neutral-300" aria-hidden="true" />
          <p className="mt-3 text-sm text-neutral-500">No cards on file.</p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100" aria-label="Saved cards">
          {cards.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-neutral-500" aria-hidden="true" />
                <span><span className="capitalize">{c.brand}</span> ending in {c.last4}</span>
                {c.isDefault && <Badge tone="brand">Default</Badge>}
              </span>
              <span className="text-neutral-500">Expires {String(c.expMonth).padStart(2, "0")}/{c.expYear}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-center">
        {stripeReady ? (
          <ActionButton action={openPortalAction} fields={{ from: "cards" }} className="btn-primary">
            {cards.length ? "Add or change cards" : "Add a card"}
          </ActionButton>
        ) : (
          <p className="text-sm text-neutral-500">Online payments aren&apos;t switched on yet.</p>
        )}
      </div>
    </CardSection>
  );
}
