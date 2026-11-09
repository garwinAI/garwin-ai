"use client";

import { useActionState } from "react";
import { logIn } from "@/lib/auth/actions";
import { FormMessage, SubmitButton } from "@/components/form";

export function LoginForm() {
  const [state, action] = useActionState(logIn, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage state={state} />
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" defaultValue={state?.values?.email} type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <SubmitButton className="btn-primary w-full" pendingText="Logging in…">
        Log in
      </SubmitButton>
    </form>
  );
}
