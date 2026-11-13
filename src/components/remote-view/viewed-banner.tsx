"use client";

import { useActionState } from "react";
import { Eye } from "lucide-react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { LocalTime } from "@/components/ui/local-time";
import { endRemoteViewAction } from "@/lib/remote-view-actions";

/** Shown to a user while an Admin is viewing their account. */
export function BeingViewedBanner({ grantId, adminName, until }: { grantId: string; adminName: string; until: string }) {
  const [state, action] = useActionState(endRemoteViewAction, undefined);
  return (
    <form action={action} role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-accent-100 bg-accent-50 px-4 py-2 text-sm text-accent-700 sm:px-6">
      <input type="hidden" name="grantId" value={grantId} />
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
        Admin {adminName} can view your account (read-only) until <LocalTime iso={until} />.
      </span>
      <SubmitButton className="btn text-sm text-accent-700 hover:bg-accent-100" pendingText="Ending…">
        End remote view
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
