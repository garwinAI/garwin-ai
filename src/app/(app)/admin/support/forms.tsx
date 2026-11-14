"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FormMessage } from "@/components/ui/form";
import { adminReplyAction, ticketStatusAction } from "./actions";

function ChoiceButtons({ choices, name }: { name: string; choices: { value: string; label: string; primary?: boolean }[] }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-2">
      {choices.map((c) => (
        <button key={c.value} type="submit" name={name} value={c.value} disabled={pending} className={c.primary ? "btn-primary" : "btn-secondary"}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function AdminReplyForm({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState(adminReplyAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormMessage state={state} />
      <label htmlFor="admin-reply" className="label">Your reply</label>
      <textarea id="admin-reply" name="body" rows={4} maxLength={5000} required className="input" />
      <ChoiceButtons
        name="then"
        choices={[
          { value: "resolve", label: "Send and resolve", primary: true },
          { value: "wait", label: "Send and wait for reply" },
        ]}
      />
    </form>
  );
}

export function TicketStatusButtons({ ticketId, status, escalated }: { ticketId: string; status: string; escalated: boolean }) {
  const [state, action] = useActionState(ticketStatusAction, undefined);
  const choices = [
    ...(!escalated && (status === "open" || status === "pending") ? [{ value: "escalate", label: "Escalate" }] : []),
    ...(status === "closed" ? [{ value: "reopen", label: "Reopen" }] : [{ value: "close", label: "Close ticket" }]),
  ];
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <ChoiceButtons name="op" choices={choices} />
      <FormMessage state={state} />
    </form>
  );
}
