"use client";

import { ArrowUp, Info, Sparkles } from "lucide-react";
import { cn } from "@/components/ui/cn";

export type AssistantAvailability = { available: false; reason: string } | { available: true };

/**
 * Assistant conversation view. While no AI provider is connected it shows that state plainly
 * and disables input. It never fabricates replies.
 */
export function AssistantChat({
  compact = false,
  userName,
  status,
}: {
  compact?: boolean;
  userName: string;
  status: AssistantAvailability;
}) {
  const inputId = compact ? "assistant-panel-input" : "assistant-input";
  const statusId = `${inputId}-status`;
  const firstName = userName.split(" ")[0];

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex flex-1 flex-col items-center justify-center overflow-y-auto text-center", compact ? "p-4" : "px-6 py-8")}>
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50">
          <Sparkles className="h-6 w-6 text-accent-500" aria-hidden="true" />
        </span>
        <p className={cn("font-semibold", compact ? "text-base" : "text-xl")}>Hi {firstName}, how can I help?</p>
        <p className="mt-1 max-w-sm text-sm text-neutral-500">
          Ask about your files, schedule, messages or anything in your workspace.
        </p>
        {!status.available && (
          <p id={statusId} role="status" className="mt-5 flex max-w-sm items-start gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-left text-sm text-neutral-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            {status.reason}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => e.preventDefault()}
        className={cn("border-t border-neutral-200 bg-white", compact ? "p-3" : "p-4")}
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <label htmlFor={inputId} className="sr-only">Message the Assistant</label>
          <textarea
            id={inputId}
            rows={1}
            disabled={!status.available}
            aria-describedby={!status.available ? statusId : undefined}
            placeholder={status.available ? "Message the Assistant…" : "Assistant not connected yet"}
            className="input max-h-40 min-h-[40px] resize-none disabled:cursor-not-allowed disabled:bg-neutral-50"
          />
          <button type="submit" className="btn-primary h-10 w-10 shrink-0 p-0" aria-label="Send" disabled={!status.available}>
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
