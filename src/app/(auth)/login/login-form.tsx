"use client";

import { useActionState } from "react";
import { logIn } from "@/lib/auth/actions";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { TextField } from "@/components/ui/field";

export function LoginForm() {
  const [state, action] = useActionState(logIn, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage state={state} />
      <TextField id="email" label="Email" name="email" defaultValue={state?.values?.email} type="email" autoComplete="email" required />
      <TextField id="password" label="Password" name="password" type="password" autoComplete="current-password" required />
      <SubmitButton className="btn-primary w-full" pendingText="Logging in…">
        Log in
      </SubmitButton>
    </form>
  );
}
