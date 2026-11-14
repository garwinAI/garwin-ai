import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { listTickets, TICKET_VIEWS, type TicketView } from "@/server/services/support";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { CardSection } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Support tickets · Admin" };

const VIEW_LABELS: Record<TicketView, string> = { needs_reply: "Needs reply", escalated: "Escalated", waiting: "Waiting for customer", done: "Resolved & closed", all: "All" };

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const admin = await requireAdmin();
  const { view: raw } = await searchParams;
  const view: TicketView = (TICKET_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as TicketView) : "needs_reply";
  const tickets = await listTickets(admin, view);
  return (
    <>
      <PageHeader title="Support tickets" actions={<ButtonLink href="/admin" variant="secondary" size="sm">Admin</ButtonLink>} />
      <PageBody>
        <nav aria-label="Ticket views" className="flex flex-wrap gap-1">
          {TICKET_VIEWS.map((v) => (
            <Link
              key={v}
              href={`/admin/support?view=${v}`}
              aria-current={v === view ? "page" : undefined}
              className={cn("rounded-full px-3 py-1 text-sm", v === view ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200")}
            >
              {VIEW_LABELS[v]}
            </Link>
          ))}
        </nav>
        <CardSection id="tickets" title={VIEW_LABELS[view]}>
          {tickets.length === 0 ? (
            <p className="text-sm text-neutral-500">No tickets here.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {tickets.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <Link href={`/admin/support/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.subject}</Link>
                    <p className="text-xs text-neutral-500">
                      {t.openedByName ?? "Former user"} · opened <LocalTime iso={t.createdAt.toISOString()} />
                    </p>
                  </div>
                  <span className="flex flex-wrap gap-1.5">
                    {t.escalatedAt && <Badge tone="danger">Escalated</Badge>}
                    {!t.firstResponseAt && <Badge tone="warning">No reply yet</Badge>}
                    <Badge>{t.status}</Badge>
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
