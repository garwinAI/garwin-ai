"use client";

import { useActionState } from "react";
import { signUp } from "@/lib/auth/actions";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { TextField } from "@/components/ui/field";

export function SignupForm() {
  const [state, action] = useActionState(signUp, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage state={state} />
      <TextField id="name" label="Name" name="name" defaultValue={state?.values?.name} autoComplete="name" required />
      <TextField id="email" label="Email" name="email" defaultValue={state?.values?.email} type="email" autoComplete="email" required />
      <TextField id="password" label="Password" name="password" type="password" autoComplete="new-password" minLength={10} required hint="At least 10 characters." />
      <SubmitButton className="btn-primary w-full" pendingText="Creating account…">
        Create free account
      </SubmitButton>
    </form>
  );
}
