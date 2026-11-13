"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/form";
import { markAllReadAction } from "./actions";

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState(markAllReadAction, undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <SubmitButton className="btn-secondary px-3 py-1.5 text-sm" pendingText="Marking…" disabled={disabled}>
        Mark all as read
      </SubmitButton>
      {state?.error && <span role="alert" className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
