import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { isStripeConfigured } from "@/server/billing/stripe";
import { listCards } from "@/server/billing/service";
import { openBillingPortal } from "@/server/billing/actions";
import { ActionButton } from "@/components/billing/action-button";
import { Section } from "../section";

export const metadata: Metadata = { title: "Cards" };

export default async function CardsSettings() {
  const user = await requireUser();
  const stripeReady = isStripeConfigured();
  const cards = await listCards(user).catch(() => []);

  return (
    <Section title="Payment cards" description="Cards are stored securely by Stripe. Garwin AI never sees full card numbers.">
      {user.hostId ? (
        <p className="text-sm text-neutral-500">Your team&apos;s host pays for your plan, so you don&apos;t need a card.</p>
      ) : (
        <>
          {cards.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <CreditCard className="h-8 w-8 text-neutral-300" />
              <p className="mt-3 text-sm text-neutral-500">No cards on file.</p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {cards.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-neutral-500" />
                    <span className="capitalize">{c.brand}</span> ending {c.last4}
                    {c.isDefault && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">Default</span>}
                  </span>
                  <span className="text-neutral-500">
                    Expires {String(c.expMonth).padStart(2, "0")}/{c.expYear}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex justify-center">
            {stripeReady ? (
              <ActionButton action={openBillingPortal} fields={{ from: "cards" }} className="btn-primary">
                {cards.length ? "Add or change cards" : "Add card"}
              </ActionButton>
            ) : (
              <p className="text-sm text-neutral-500">Online payments aren&apos;t switched on yet.</p>
            )}
          </div>
        </>
      )}
    </Section>
  );
}
