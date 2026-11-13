"use client";

import { useActionState } from "react";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { TextField } from "@/components/ui/field";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordResetAction, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage state={state} />
      <TextField id="email" label="Email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} />
      <SubmitButton className="btn-primary w-full" pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
