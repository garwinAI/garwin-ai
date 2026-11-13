"use client";

import { useActionState } from "react";
import { MailWarning } from "lucide-react";
import { resendVerificationAction } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/ui/form";

/** Shown at the top of the workspace until the user verifies their email. */
export function VerifyBanner({ email }: { email: string }) {
  const [state, action] = useActionState(resendVerificationAction, undefined);
  return (
    <section aria-label="Email verification" className="border-b border-accent-100 bg-accent-50 px-4 py-2.5 text-sm sm:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex items-center gap-2 text-neutral-800">
          <MailWarning className="h-4 w-4 shrink-0 text-accent-700" aria-hidden="true" />
          <span>
            Please verify <strong className="font-medium">{email}</strong>. Check your inbox for the link.
          </span>
        </p>
        <form action={action}>
          <SubmitButton className="btn-secondary px-3 py-1 text-xs" pendingText="Sending…">Resend email</SubmitButton>
        </form>
        {state?.ok && <p role="status" className="text-green-800">{state.ok}</p>}
        {state?.error && <p role="alert" className="text-red-700">{state.error}</p>}
      </div>
    </section>
  );
}
