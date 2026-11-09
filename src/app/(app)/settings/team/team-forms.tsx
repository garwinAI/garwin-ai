"use client";

import { useActionState, useState } from "react";
import { MessageSquare } from "lucide-react";
import type { Permission } from "@/db/schema/accounts";
import { PERMISSION_GROUPS } from "@/lib/permission-labels";
import {
  inviteAction,
  leaveTeamAction,
  openDirectAction,
  removeMemberAction,
  resendInviteAction,
  revokeInviteAction,
  setPermissionsAction,
} from "@/lib/team/actions";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { TextField } from "@/components/ui/field";

function PermissionCheckboxes({ idPrefix, checked }: { idPrefix: string; checked: readonly Permission[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {PERMISSION_GROUPS.map((group) => (
        <fieldset key={group.app}>
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">{group.app}</legend>
          <div className="space-y-1.5">
            {group.items.map((item) => (
              <label key={item.id} htmlFor={`${idPrefix}-${item.id}`} className="flex items-start gap-2 text-sm">
                <input
                  id={`${idPrefix}-${item.id}`}
                  type="checkbox"
                  name="permissions"
                  value={item.id}
                  defaultChecked={checked.includes(item.id)}
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300 accent-brand-600"
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

/** Stays mounted when the team fills up (disabled) so the confirmation message remains visible. */
export function InviteForm({ smsAvailable, defaults, full }: { smsAvailable: boolean; defaults: Permission[]; full: boolean }) {
  const [state, action] = useActionState(inviteAction, undefined);
  const [channel, setChannel] = useState<"email" | "sms">("email");
  return (
    <form action={action} className="space-y-5">
      <FormMessage state={state} />
      <fieldset disabled={full} className="space-y-5 disabled:opacity-60">
      <fieldset>
        <legend className="label">Send the invitation by</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="channel" value="email" checked={channel === "email"} onChange={() => setChannel("email")} className="accent-brand-600" /> Email
          </label>
          <label className={`flex items-center gap-2 ${smsAvailable ? "" : "text-neutral-400"}`}>
            <input type="radio" name="channel" value="sms" checked={channel === "sms"} onChange={() => setChannel("sms")} disabled={!smsAvailable} className="accent-brand-600" />
            Text message {smsAvailable ? "" : "(not set up yet)"}
          </label>
        </div>
      </fieldset>
      {channel === "email" ? (
        <TextField id="invite-email" name="email" type="email" label="Email address" required autoComplete="off" defaultValue={state?.values?.email} className="max-w-md" />
      ) : (
        <TextField id="invite-phone" name="phone" type="tel" label="Mobile number" required placeholder="+1 555 123 4567" hint="Include the country code." defaultValue={state?.values?.phone} className="max-w-md" />
      )}
      <div>
        <p className="label">What can they do?</p>
        <PermissionCheckboxes idPrefix="invite" checked={defaults} />
      </div>
      </fieldset>
      <SubmitButton pendingText="Sending…" disabled={full}>Send invitation</SubmitButton>
    </form>
  );
}

export function MemberPermissionsForm({ memberId, name, granted }: { memberId: string; name: string; granted: Permission[] }) {
  const [state, action] = useActionState(setPermissionsAction, undefined);
  return (
    <details className="mt-3 rounded-lg border border-neutral-200 p-3">
      <summary className="cursor-pointer text-sm font-medium text-brand-700">
        Permissions for {name} ({granted.length})
      </summary>
      <form action={action} className="mt-3 space-y-4" aria-label={`Permissions for ${name}`}>
        <input type="hidden" name="memberId" value={memberId} />
        <FormMessage state={state} />
        <PermissionCheckboxes idPrefix={`m-${memberId}`} checked={granted} />
        <SubmitButton className="btn-primary px-3 py-1.5 text-sm" pendingText="Saving…">Save permissions</SubmitButton>
      </form>
    </details>
  );
}

export function RemoveMemberButton({ memberId, name }: { memberId: string; name: string }) {
  const [state, action] = useActionState(removeMemberAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Remove ${name} from your team? They'll lose access immediately.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="memberId" value={memberId} />
      <SubmitButton className="btn-danger px-3 py-1.5 text-sm" pendingText="Removing…">
        <span aria-hidden="true">Remove</span>
        <span className="sr-only">Remove {name}</span>
      </SubmitButton>
      {state?.error && <span role="alert" className="ml-2 text-xs text-red-700">{state.error}</span>}
    </form>
  );
}

export function MessageMemberButton({ userId, name }: { userId: string; name: string }) {
  return (
    <form action={openDirectAction.bind(null, userId)}>
      <SubmitButton className="btn-secondary px-3 py-1.5 text-sm" pendingText="Opening…">
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        <span aria-hidden="true">Message</span>
        <span className="sr-only">Message {name}</span>
      </SubmitButton>
    </form>
  );
}

export function PendingInviteActions({ invitationId }: { invitationId: string }) {
  const [resendState, resend] = useActionState(resendInviteAction, undefined);
  const [revokeState, revoke] = useActionState(revokeInviteAction, undefined);
  const message = resendState?.ok ?? resendState?.error ?? revokeState?.error;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <form action={resend}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <SubmitButton className="btn-secondary px-3 py-1.5 text-sm" pendingText="Sending…">Resend</SubmitButton>
        </form>
        <form action={revoke}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <SubmitButton className="btn-danger px-3 py-1.5 text-sm" pendingText="Canceling…">Cancel</SubmitButton>
        </form>
      </div>
      {message && <span role="status" className="text-xs text-neutral-600">{message}</span>}
    </div>
  );
}

export function LeaveTeamButton() {
  const [state, action] = useActionState(leaveTeamAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Leave this team? You'll lose access to this workspace.")) e.preventDefault();
      }}
    >
      <FormMessage state={state} />
      <SubmitButton className="btn-danger" pendingText="Leaving…">Leave team</SubmitButton>
    </form>
  );
}
