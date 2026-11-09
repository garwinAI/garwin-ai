"use client";

import Link from "next/link";
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
      <div>
        <TextField id="password" label="Password" name="password" type="password" autoComplete="current-password" required />
        <p className="mt-1.5 text-right text-sm">
          <Link href="/forgot-password" className="font-medium text-brand-600 hover:underline">Forgot password?</Link>
        </p>
      </div>
      <SubmitButton className="btn-primary w-full" pendingText="Logging in…">
        Log in
      </SubmitButton>
    </form>
  );
}
