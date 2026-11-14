import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { uuidSchema } from "@/lib/validation";
import { getTicket } from "@/server/services/support";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { CardSection } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { TicketThread } from "@/components/support/ticket-thread";
import { AdminReplyForm, TicketStatusButtons } from "../forms";

export const metadata: Metadata = { title: "Support ticket · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  let data;
  try {
    data = await getTicket(admin, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const t = data.ticket;
  return (
    <>
      <PageHeader
        title={t.subject}
        description={
          <>
            From {t.openedBy ? <Link href={`/admin/users/${t.openedBy}`} className="text-brand-700 underline">{data.openedByName}</Link> : "a former user"}
            {data.openedByEmail && ` (${data.openedByEmail})`}
          </>
        }
        actions={<ButtonLink href="/admin/support" variant="secondary" size="sm">All tickets</ButtonLink>}
      />
      <PageBody>
        <CardSection
          id="conversation"
          title="Conversation"
          actions={
            <span className="flex flex-wrap gap-1.5">
              {t.escalatedAt && <Badge tone="danger">Escalated</Badge>}
              <Badge>{t.status}</Badge>
              <Badge tone={t.priority === "high" || t.priority === "urgent" ? "warning" : "neutral"}>{t.priority} priority</Badge>
            </span>
          }
        >
          <TicketThread messages={data.messages} customerId={t.openedBy} />
        </CardSection>
        <CardSection id="reply" title="Reply">
          <AdminReplyForm ticketId={id} />
        </CardSection>
        <CardSection id="ticket-status" title="Ticket">
          <TicketStatusButtons ticketId={id} status={t.status} escalated={Boolean(t.escalatedAt)} />
        </CardSection>
      </PageBody>
    </>
  );
}
