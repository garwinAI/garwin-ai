"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction } from "@/lib/auth/actions";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { TextField } from "@/components/ui/field";
import { useFragmentToken } from "@/components/auth/token-from-hash";

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, undefined);
  // The token travels in the URL fragment so it never reaches servers or logs.
  // undefined = still reading the link, null = no valid token in the link.
  const token = useFragmentToken();

  if (token === undefined) return <p className="mt-6 text-sm text-neutral-500">Checking your link…</p>;
  if (token === null) {
    return (
      <div className="mt-6 space-y-4">
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          This reset link is incomplete. Open the link from your email again, or request a new one.
        </p>
        <Link href="/forgot-password" className="btn-primary w-full">Request a new link</Link>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage state={state} />
      {state?.error?.includes("expired") && (
        <Link href="/forgot-password" className="btn-secondary w-full">Request a new link</Link>
      )}
      <input type="hidden" name="token" value={token} />
      <TextField id="password" name="password" type="password" label="New password" autoComplete="new-password" minLength={10} required hint="At least 10 characters. Avoid common passwords." />
      <TextField id="confirm" name="confirm" type="password" label="Confirm new password" autoComplete="new-password" minLength={10} required />
      <SubmitButton className="btn-primary w-full" pendingText="Saving…">Save new password</SubmitButton>
    </form>
  );
}
