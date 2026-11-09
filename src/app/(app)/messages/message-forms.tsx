"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { sendMessageAction } from "@/lib/team/actions";
import { SubmitButton } from "@/components/ui/form";

export function Composer({ conversationId, title }: { conversationId: string; title: string }) {
  const [state, action] = useActionState(sendMessageAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="sticky bottom-0 border-t border-neutral-200 bg-white p-3 pr-24 sm:pr-28">
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="flex items-end gap-2">
        <label htmlFor="message-body" className="sr-only">Message {title}</label>
        <textarea
          id="message-body"
          name="body"
          required
          maxLength={5000}
          rows={1}
          placeholder={`Message ${title}…`}
          className="input max-h-40 min-h-[40px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
        />
        <SubmitButton className="btn-primary h-10 w-10 shrink-0 p-0" pendingText="…">
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Send</span>
        </SubmitButton>
      </div>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-700">{state.error}</p>}
    </form>
  );
}

/** Polls for new messages while the tab is visible (real-time delivery comes with a realtime provider). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
