"use client";

import { useActionState } from "react";
import { signUp } from "@/lib/auth/actions";
import { FormMessage, SubmitButton } from "@/components/form";

export function SignupForm() {
  const [state, action] = useActionState(signUp, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage state={state} />
      <div>
        <label htmlFor="name" className="label">Name</label>
        <input id="name" name="name" defaultValue={state?.values?.name} autoComplete="name" required className="input" />
      </div>
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" defaultValue={state?.values?.email} type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="input" />
        <p className="mt-1 text-xs text-neutral-500">At least 10 characters.</p>
      </div>
      <SubmitButton className="btn-primary w-full" pendingText="Creating account…">
        Create free account
      </SubmitButton>
    </form>
  );
}
