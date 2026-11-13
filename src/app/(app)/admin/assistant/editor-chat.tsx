"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowUp, Info } from "lucide-react";
import type { ChatTurn, EditResult, SiteEditorStatus } from "@/lib/site-editor";
import { editSiteAction } from "./actions";

type Entry = { id: number; role: "user" | "assistant"; text: string; commit?: EditResult["commit"]; tokens?: number };

const ACTION_LABEL = { created: "Added", updated: "Changed", deleted: "Removed" } as const;

/** Chat with the Admin Assistant. The conversation lives in this tab only; saved work is the commits on dev. */
export function EditorChat({ status }: { status: SiteEditorStatus }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nextId = useRef(1);
  const disabled = !status.available || pending;

  function send() {
    const prompt = draft.trim();
    if (!prompt || disabled) return;
    const history: ChatTurn[] = entries.slice(-40).map((e) => ({ role: e.role, text: e.text.slice(0, 8000) }));
    setEntries((list) => [...list, { id: nextId.current++, role: "user", text: prompt }]);
    setDraft("");
    setError(null);
    startTransition(async () => {
      const res = await editSiteAction({ prompt, history });
      if (res.ok) {
        setEntries((list) => [...list, { id: nextId.current++, role: "assistant", text: res.result.reply, commit: res.result.commit, tokens: res.result.tokens }]);
      } else {
        // Take the unanswered request back out of the conversation and return it to the box.
        setEntries((list) => list.slice(0, -1));
        setDraft(prompt);
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {!status.available && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
          {status.reason}
        </p>
      )}

      <ol aria-label="Conversation" aria-live="polite" className="flex flex-col gap-3">
        {entries.map((e) => (
          <li key={e.id} className={e.role === "user" ? "ml-auto max-w-[85%] rounded-xl bg-brand-600 px-3.5 py-2.5 text-sm text-white" : "card max-w-full px-4 py-3 text-sm"}>
            <span className="sr-only">{e.role === "user" ? "You: " : "Assistant: "}</span>
            <p className="whitespace-pre-wrap break-words">{e.text}</p>
            {e.commit && (
              <div className="mt-3 rounded-lg bg-neutral-50 p-3">
                <p className="font-medium text-neutral-900">Saved to dev</p>
                <ul className="mt-1 space-y-0.5 text-neutral-700">
                  {e.commit.files.map((f) => (
                    <li key={f.path} className="break-all">
                      {ACTION_LABEL[f.action]}: <code>{f.path}</code>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-neutral-600">
                  The dev site rebuilds in a few minutes. The live site changes only when you press Update App on the Admin page.{" "}
                  <a href={e.commit.url} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline">
                    View the change on GitHub
                  </a>
                </p>
              </div>
            )}
            {e.role === "assistant" && typeof e.tokens === "number" && <p className="mt-2 text-xs text-neutral-500">{e.tokens.toLocaleString()} tokens used</p>}
          </li>
        ))}
        {pending && (
          <li className="card px-4 py-3 text-sm text-neutral-600" role="status">
            Working on it… this can take a few minutes. Keep this page open.
          </li>
        )}
      </ol>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          send();
        }}
        className="flex items-end gap-2"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="editor-input" className="label">
            What would you like to change?
          </label>
          <textarea
            id="editor-input"
            rows={3}
            maxLength={4000}
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            disabled={disabled}
            placeholder={status.available ? "Example: Change the welcome heading on the home page to “Your workspace, organized.”" : "Not set up yet"}
            className="input resize-y disabled:cursor-not-allowed disabled:bg-neutral-50"
          />
        </div>
        <button type="submit" className="btn-primary h-10 w-10 shrink-0 p-0" aria-label="Send" disabled={disabled || !draft.trim()}>
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
