"use client";

import { useActionState } from "react";
import { updateProfile } from "@/lib/auth/actions";
import { FormMessage, SubmitButton } from "@/components/form";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="max-w-md space-y-4">
      <FormMessage state={state} />
      <div>
        <label htmlFor="name" className="label">Name</label>
        <input id="name" name="name" defaultValue={name} required className="input" />
      </div>
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" value={email} disabled className="input bg-neutral-50 text-neutral-500" />
        <p className="mt-1 text-xs text-neutral-500">Email changes with verification are coming later.</p>
      </div>
      <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
    </form>
  );
}
