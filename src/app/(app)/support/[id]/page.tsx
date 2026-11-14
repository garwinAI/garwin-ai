import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { uuidSchema } from "@/lib/validation";
import { getMyTicket } from "@/server/services/support";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { CardSection } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { STATUS_TEXT, TicketThread } from "@/components/support/ticket-thread";
import { RefreshUntilUpdated } from "@/components/billing/refresh-until";
import { getAutopilot } from "@/server/services/autopilot";
import { ReplyForm } from "../forms";

export const metadata: Metadata = { title: "Support ticket" };
export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  let data;
  try {
    data = await getMyTicket(user, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const status = STATUS_TEXT[data.ticket.status];
  // Auto Pilot answers a moment after the customer writes; refresh briefly so it appears.
  const awaitingAutopilot =
    data.ticket.status === "open" && !data.ticket.escalatedAt && data.messages.at(-1)?.senderId === user.id && (await getAutopilot()).on;
  return (
    <>
      <PageHeader title={data.ticket.subject} actions={<ButtonLink href="/support" variant="secondary" size="sm">All tickets</ButtonLink>} />
      <PageBody>
        <CardSection id="conversation" title="Conversation" actions={<Badge tone={status.tone}>{status.label}</Badge>}>
          <TicketThread messages={data.messages} customerId={user.id} />
          {awaitingAutopilot && (
            <>
              <p role="status" className="mt-4 text-sm text-neutral-600">Garwin AI Support is writing a reply…</p>
              <RefreshUntilUpdated />
            </>
          )}
          {data.ticket.escalatedAt && data.ticket.status === "open" && (
            <p className="mt-4 text-sm text-neutral-600">A person from Garwin AI will reply here.</p>
          )}
        </CardSection>
        {data.ticket.status !== "closed" ? (
          <CardSection id="reply" title={data.ticket.status === "resolved" ? "Still need help?" : "Reply"}>
            <ReplyForm ticketId={id} />
          </CardSection>
        ) : (
          <p className="text-sm text-neutral-500">This ticket is closed. Open a new one from Help &amp; support if you need more help.</p>
        )}
      </PageBody>
    </>
  );
}
