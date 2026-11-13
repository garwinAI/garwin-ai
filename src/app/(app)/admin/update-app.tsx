"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { updateAppAction } from "./actions";

/**
 * Publishes dev to live. Stays mounted and greyed out when there is nothing to publish, with the
 * reason shown next to it. The server re-checks everything; the disabled state is only a courtesy.
 */
export function UpdateAppButton({ devSha, blockedReason }: { devSha: string | null; blockedReason: string | null }) {
  const [state, action] = useActionState(updateAppAction, undefined);
  const disabled = !devSha || Boolean(blockedReason);
  return (
    <form action={action} className="flex flex-col gap-3">
      {devSha && <input type="hidden" name="sha" value={devSha} />}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Updating…" disabled={disabled}>
          Update App
        </SubmitButton>
        {blockedReason && !state?.ok && <p className="text-sm text-neutral-600">{blockedReason}</p>}
      </div>
      <FormMessage state={state} />
    </form>
  );
}
