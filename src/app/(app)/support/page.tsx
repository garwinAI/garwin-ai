import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listMyTickets } from "@/server/services/support";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { CardSection } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/ui/local-time";
import { STATUS_TEXT } from "@/components/support/ticket-thread";
import { NewTicketForm } from "./forms";

export const metadata: Metadata = { title: "Help & support" };

export default async function SupportPage() {
  const user = await requireUser();
  const tickets = await listMyTickets(user);
  return (
    <>
      <PageHeader title="Help & support" description="Ask Garwin AI anything. Simple questions are often answered in seconds." />
      <PageBody>
        <CardSection id="new-ticket" title="New question">
          <NewTicketForm />
        </CardSection>
        <CardSection id="my-tickets" title="Your tickets">
          {tickets.length === 0 ? (
            <p className="text-sm text-neutral-500">You haven&apos;t contacted support yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {tickets.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <Link href={`/support/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.subject}</Link>
                  <span className="flex items-center gap-3 text-sm text-neutral-500">
                    <Badge tone={STATUS_TEXT[t.status].tone}>{STATUS_TEXT[t.status].label}</Badge>
                    <LocalTime iso={t.updatedAt.toISOString()} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardSection>
      </PageBody>
    </>
  );
}
