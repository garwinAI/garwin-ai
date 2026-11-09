"use client";

import { useActionState } from "react";
import { createFolderAction, deletePermanentlyAction, markForDeletionAction, unmarkAction } from "@/lib/team/actions";
import { SubmitButton } from "@/components/ui/form";

export function CreateFolderForm({ parentId }: { parentId: string }) {
  const [state, action] = useActionState(createFolderAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="parentId" value={parentId} />
      <label htmlFor="folder-name" className="sr-only">New folder name</label>
      <input id="folder-name" name="name" required maxLength={255} placeholder="New folder name" className="input w-48 py-1.5" />
      <SubmitButton className="btn-primary px-3 py-1.5 text-sm" pendingText="Creating…">Create folder</SubmitButton>
      {state?.error && <p role="alert" className="basis-full text-xs text-red-700">{state.error}</p>}
    </form>
  );
}

type Can = { upload: boolean; mark: boolean; delete: boolean };

/**
 * Buttons reflect what the server allows; the server checks again on every click.
 * Team members can mark/unmark (their own marks); only the host sees "Delete permanently".
 */
export function ItemActions({ id, name, marked, markedByMe, can }: { id: string; name: string; marked: boolean; markedByMe: boolean; can: Can }) {
  const [markState, mark] = useActionState(markForDeletionAction, undefined);
  const [unmarkState, unmark] = useActionState(unmarkAction, undefined);
  const [deleteState, del] = useActionState(deletePermanentlyAction, undefined);
  const error = markState?.error ?? unmarkState?.error ?? deleteState?.error;

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {!marked && can.mark && (
          <form action={mark}>
            <input type="hidden" name="objectId" value={id} />
            <SubmitButton className="btn-secondary px-3 py-1.5 text-sm" pendingText="Marking…">
              <span aria-hidden="true">Mark for deletion</span>
              <span className="sr-only">Mark {name} for deletion</span>
            </SubmitButton>
          </form>
        )}
        {marked && (can.delete || (can.mark && markedByMe)) && (
          <form action={unmark}>
            <input type="hidden" name="objectId" value={id} />
            <SubmitButton className="btn-secondary px-3 py-1.5 text-sm" pendingText="Saving…">
              <span aria-hidden="true">Keep</span>
              <span className="sr-only">Keep {name} (unmark)</span>
            </SubmitButton>
          </form>
        )}
        {can.delete && (
          <form
            action={del}
            onSubmit={(e) => {
              if (!confirm(`Delete "${name}" and everything in it permanently? This can't be undone.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="objectId" value={id} />
            <SubmitButton className="btn-danger px-3 py-1.5 text-sm" pendingText="Deleting…">
              <span aria-hidden="true">Delete permanently</span>
              <span className="sr-only">Delete {name} permanently</span>
            </SubmitButton>
          </form>
        )}
      </div>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
