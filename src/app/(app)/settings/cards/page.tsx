import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { ComingSoon } from "@/components/page-header";
import { Section } from "../section";

export const metadata: Metadata = { title: "Cards" };

export default function CardsSettings() {
  return (
    <Section title="Payment cards" description="Cards are stored securely by Stripe. Garwin AI never sees full card numbers.">
      <div className="flex flex-col items-center py-6 text-center">
        <CreditCard className="h-8 w-8 text-neutral-300" />
        <p className="mt-3 text-sm text-neutral-500">No cards on file.</p>
        <div className="mt-4 flex items-center gap-3">
          <button className="btn-primary" disabled>Add card</button>
          <ComingSoon phase={2} />
        </div>
      </div>
    </Section>
  );
}
