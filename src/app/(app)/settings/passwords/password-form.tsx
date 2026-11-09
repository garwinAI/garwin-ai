"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword } from "@/lib/auth/actions";
import { FormMessage, SubmitButton } from "@/components/form";

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="max-w-md space-y-4">
      <FormMessage state={state} />
      <div>
        <label htmlFor="current" className="label">Current password</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required className="input" />
      </div>
      <div>
        <label htmlFor="next" className="label">New password</label>
        <input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required className="input" />
      </div>
      <div>
        <label htmlFor="confirm" className="label">Confirm new password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required className="input" />
      </div>
      <SubmitButton pendingText="Updating…">Update password</SubmitButton>
    </form>
  );
}
