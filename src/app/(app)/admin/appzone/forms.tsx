"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form";
import { reviewDeveloperAction, reviewUploadAction } from "./actions";

/** Two buttons, one form: the clicked button's name/value says which decision. */
function DecisionButtons({ approveLabel }: { approveLabel: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="submit" name="decision" value="approve" className="btn-primary">{approveLabel}</button>
      <button type="submit" name="decision" value="deny" className="btn-danger">Deny</button>
    </div>
  );
}

export function UploadDecisionForm({ versionId, feeText }: { versionId: string; feeText: string }) {
  const [state, action, pending] = useActionState(reviewUploadAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="versionId" value={versionId} />
      <FormMessage state={state} />
      <div>
        <label htmlFor="note-upload" className="label">Note to the developer</label>
        <textarea id="note-upload" name="note" rows={3} maxLength={1000} className="input" aria-describedby="note-upload-hint" />
        <p id="note-upload-hint" className="mt-1 text-xs text-neutral-500">Required when denying. Optional when approving.</p>
      </div>
      <p className="text-sm text-neutral-600">{feeText}</p>
      <fieldset disabled={pending}>
        <DecisionButtons approveLabel="Approve and charge fee" />
      </fieldset>
      {pending && <p className="text-sm text-neutral-500" role="status">Working…</p>}
    </form>
  );
}

export function DeveloperDecisionForm({ profileId }: { profileId: string }) {
  const [state, action, pending] = useActionState(reviewDeveloperAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="profileId" value={profileId} />
      <FormMessage state={state} />
      <label htmlFor={`note-${profileId}`} className="sr-only">Note</label>
      <input id={`note-${profileId}`} name="note" maxLength={1000} placeholder="Note (required to deny)" className="input" />
      <fieldset disabled={pending}>
        <DecisionButtons approveLabel="Approve" />
      </fieldset>
    </form>
  );
}

