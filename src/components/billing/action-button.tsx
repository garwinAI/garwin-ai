"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import type { FormState } from "@/lib/auth/actions";

/** A one-button form for a billing server action, showing its error or success message. */
export function ActionButton({
  action,
  fields = {},
  children,
  pendingText,
  className = "btn-primary w-full",
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields?: Record<string, string>;
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <FormMessage state={state} />
      <SubmitButton className={className} pendingText={pendingText ?? "Opening Stripe…"}>
        {children}
      </SubmitButton>
    </form>
  );
}
