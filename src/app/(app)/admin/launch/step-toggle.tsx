"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { toggleLaunchStepAction } from "./actions";

export function StepToggle({ stepKey, done, title }: { stepKey: string; done: boolean; title: string }) {
  const [state, action] = useActionState(toggleLaunchStepAction, undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="key" value={stepKey} />
      <input type="hidden" name="done" value={done ? "false" : "true"} />
      <SubmitButton className={done ? "btn text-sm text-neutral-600 hover:bg-neutral-100" : "btn-secondary text-sm"} pendingText="Saving…">
        {done ? "Undo" : "Mark done"}
        <span className="sr-only">: {title}</span>
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
