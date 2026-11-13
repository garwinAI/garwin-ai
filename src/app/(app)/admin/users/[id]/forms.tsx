"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { SelectField, TextField } from "@/components/ui/field";
import { requestRemoteViewAction, updateUserAction } from "../actions";

export function EditUserForm({ user, isSelf }: { user: { id: string; name: string; email: string; role: "member" | "admin"; adminNote: string | null }; isSelf: boolean }) {
  const [state, action] = useActionState(updateUserAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="userId" value={user.id} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="edit-name" name="name" label="Name" defaultValue={state?.values?.name ?? user.name} required />
        <TextField id="edit-email" name="email" type="email" label="Email" defaultValue={state?.values?.email ?? user.email} hint="Changing it asks them to verify the new address." required />
      </div>
      <SelectField
        id="edit-role"
        name="role"
        label="Role"
        defaultValue={user.role}
        disabled={isSelf}
        hint={isSelf ? "You can't change your own role." : "Admins can see and run everything in Admin."}
        options={[
          { value: "member", label: "Member" },
          { value: "admin", label: "Admin" },
        ]}
      />
      {isSelf && <input type="hidden" name="role" value={user.role} />}
      <div>
        <label htmlFor="edit-note" className="label">Admin note (private)</label>
        <textarea id="edit-note" name="adminNote" rows={3} maxLength={2000} defaultValue={state?.values?.adminNote ?? user.adminNote ?? ""} className="input" aria-describedby="edit-note-hint" />
        <p id="edit-note-hint" className="mt-1 text-xs text-neutral-500">Only Admins see this. Up to 2000 characters.</p>
      </div>
      <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
    </form>
  );
}

export function RemoteViewForm({ userId, name, minutes }: { userId: string; name: string; minutes: number }) {
  const [state, action] = useActionState(requestRemoteViewAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-sm text-neutral-600">
        {name} gets a pop-up asking to accept or deny. If they accept, you can see (not change) their account, storage, apps, messages and
        notifications for {minutes} minutes. Both of you see a banner, either can end it, and everything is logged.
      </p>
      <FormMessage state={state} />
      <div>
        <label htmlFor="remote-reason" className="label">Reason (shown to {name})</label>
        <textarea id="remote-reason" name="reason" rows={2} minLength={10} maxLength={1000} required defaultValue={state?.values?.reason} className="input" />
      </div>
      <SubmitButton pendingText="Sending request…">Request remote view</SubmitButton>
    </form>
  );
}
