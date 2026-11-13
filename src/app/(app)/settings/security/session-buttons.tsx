"use client";

import { useActionState } from "react";
import { signOutOtherSessionsAction, signOutSessionAction } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/ui/form";

export function SignOutSessionButton({ sessionId, label }: { sessionId: string; label: string }) {
  const [state, action] = useActionState(signOutSessionAction, undefined);
  return (
    <form action={action} className="flex flex-col items-start gap-1 sm:items-end">
      <input type="hidden" name="sessionId" value={sessionId} />
      <SubmitButton className="btn-secondary px-3 py-1.5 text-sm" pendingText="Signing out…">
        <span aria-hidden="true">Sign out</span>
        <span className="sr-only">{label}</span>
      </SubmitButton>
      {state?.error && <span role="alert" className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}

/** Stays mounted (disabled when there's nothing to do) so its result message remains visible. */
export function SignOutOthersButton({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState(signOutOtherSessionsAction, undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <SubmitButton className="btn-secondary px-3 py-1.5 text-sm" pendingText="Signing out…" disabled={disabled}>
        Sign out other devices
      </SubmitButton>
      {state?.ok && <span role="status" className="text-xs text-green-800">{state.ok}</span>}
      {state?.error && <span role="alert" className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
