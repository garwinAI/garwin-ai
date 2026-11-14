"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { TextField } from "@/components/ui/field";
import { openTicketAction, replyTicketAction } from "./actions";

export function NewTicketForm() {
  const [state, action] = useActionState(openTicketAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <TextField id="ticket-subject" name="subject" label="Subject" maxLength={200} required defaultValue={state?.values?.subject} />
      <div>
        <label htmlFor="ticket-body" className="label">How can we help?</label>
        <textarea id="ticket-body" name="body" rows={5} maxLength={5000} required defaultValue={state?.values?.body} className="input" />
      </div>
      <SubmitButton pendingText="Sending…">Send to support</SubmitButton>
    </form>
  );
}

/** Reply box. After sending, refreshes a few times so an Auto Pilot answer shows up. */
export function ReplyForm({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState(replyTicketAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!state?.ok) return;
    ref.current?.reset();
    let n = 0;
    const timer = setInterval(() => {
      router.refresh();
      if (++n >= 5) clearInterval(timer);
    }, 2000);
    return () => clearInterval(timer);
  }, [state, router]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormMessage state={state} />
      <label htmlFor="ticket-reply" className="label">Reply</label>
      <textarea id="ticket-reply" name="body" rows={3} maxLength={5000} required className="input" />
      <SubmitButton pendingText="Sending…">Send reply</SubmitButton>
    </form>
  );
}
