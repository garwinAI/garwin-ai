"use client";

import { useActionState } from "react";
import { updateProfile } from "@/lib/auth/actions";
import { TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="max-w-md space-y-4">
      <FormMessage state={state} />
      <TextField id="name" name="name" label="Name" defaultValue={name} autoComplete="name" required maxLength={80} />
      <TextField id="email" label="Email" value={email} disabled readOnly hint="Changing your email (with verification) is coming later." />
      <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
    </form>
  );
}
