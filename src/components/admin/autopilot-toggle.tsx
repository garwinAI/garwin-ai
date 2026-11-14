"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FormMessage } from "@/components/ui/form";
import { cn } from "@/components/ui/cn";
import { autopilotAction } from "@/app/(app)/admin/support/actions";

function Buttons({ on, canTurnOn }: { on: boolean; canTurnOn: boolean }) {
  const { pending } = useFormStatus();
  const base = "px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed";
  return (
    <div role="group" aria-label="Auto Pilot" className="inline-flex overflow-hidden rounded-lg ring-1 ring-neutral-300">
      <button type="submit" name="state" value="on" aria-pressed={on} disabled={pending || on || !canTurnOn} className={cn(base, on ? "bg-green-600 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50 disabled:text-neutral-400")}>
        On
      </button>
      <button type="submit" name="state" value="off" aria-pressed={!on} disabled={pending || !on} className={cn(base, !on ? "bg-neutral-800 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50")}>
        Off
      </button>
    </div>
  );
}

export function AutopilotToggle({ on, canTurnOn }: { on: boolean; canTurnOn: boolean }) {
  const [state, action] = useActionState(autopilotAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <Buttons on={on} canTurnOn={canTurnOn} />
      <FormMessage state={state} />
    </form>
  );
}
