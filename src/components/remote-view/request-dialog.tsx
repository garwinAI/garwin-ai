"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { ShieldAlert } from "lucide-react";
import { FormMessage } from "@/components/ui/form";
import { decideRemoteViewAction } from "@/lib/remote-view-actions";

/** Pop-up asking the user to accept or deny an Admin's remote view request. */
export function RemoteViewRequestDialog({ grantId, adminName, reason, minutes }: { grantId: string; adminName: string; reason: string; minutes: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action] = useActionState(decideRemoteViewAction, undefined);
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="remote-view-request-title"
      aria-describedby="remote-view-request-body"
      // Must be answered: Escape doesn't dismiss it (they can also answer later from Notifications).
      onCancel={(e) => e.preventDefault()}
      className="w-[min(32rem,calc(100vw-2rem))] rounded-2xl p-0 shadow-xl backdrop:bg-neutral-900/50"
    >
      <form action={action} className="space-y-4 p-6">
        <input type="hidden" name="grantId" value={grantId} />
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-accent-600" aria-hidden="true" />
          <div>
            <h2 id="remote-view-request-title" className="text-lg font-semibold">
              Admin {adminName} is requesting permission to view your account
            </h2>
            <div id="remote-view-request-body" className="mt-2 space-y-2 text-sm text-neutral-600">
              <p>Reason: {reason}</p>
              <p>
                If you accept, they can see your account, storage, apps, messages and notifications for {minutes} minutes. They can&apos;t
                change anything, and you can end it at any time.
              </p>
            </div>
          </div>
        </div>
        <FormMessage state={state} />
        <div className="flex flex-wrap justify-end gap-2">
          <DecisionButtons />
        </div>
      </form>
    </dialog>
  );
}

function DecisionButtons() {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" name="decision" value="deny" className="btn-secondary" disabled={pending}>
        Deny
      </button>
      <button type="submit" name="decision" value="accept" className="btn-primary" disabled={pending}>
        Accept
      </button>
    </>
  );
}
