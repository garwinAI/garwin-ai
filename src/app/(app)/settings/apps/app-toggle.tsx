"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toggleApp } from "./actions";
import { buttonClasses } from "@/components/ui/button";

function ToggleButton({ active, appName, disabled }: { active: boolean; appName: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-label={`${active ? "Deactivate" : "Activate"} ${appName}`}
      className={buttonClasses(active ? "secondary" : "primary", "sm")}
    >
      {pending ? "Saving…" : active ? "Deactivate" : "Activate"}
    </button>
  );
}

/** Activate/deactivate an app. The server re-checks every rule; `disabled` only mirrors them. */
export function AppToggle({ slug, appName, active, disabled }: { slug: string; appName: string; active: boolean; disabled?: boolean }) {
  const [state, action] = useActionState(toggleApp, undefined);
  return (
    <form action={action} className="contents">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <ToggleButton active={active} appName={appName} disabled={disabled} />
      {state?.error && (
        <span role="alert" className="basis-full text-xs text-red-700">{state.error}</span>
      )}
    </form>
  );
}
