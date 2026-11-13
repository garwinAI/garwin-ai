"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword } from "@/lib/auth/actions";
import { TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="max-w-md space-y-4">
      <FormMessage state={state} />
      <TextField id="current" name="current" type="password" label="Current password" autoComplete="current-password" required />
      <TextField id="next" name="next" type="password" label="New password" autoComplete="new-password" minLength={10} required hint="At least 10 characters." />
      <TextField id="confirm" name="confirm" type="password" label="Confirm new password" autoComplete="new-password" minLength={10} required />
      <SubmitButton pendingText="Updating…">Update password</SubmitButton>
    </form>
  );
}
