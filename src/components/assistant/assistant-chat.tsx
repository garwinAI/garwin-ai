"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";

type Message = { id: number; role: "user" | "assistant"; text: string };

// UI is complete; responses are stubbed until Admin connects the Assistant API (Phase 7).
const NOT_CONNECTED =
  "I'm not connected to an AI model yet. Once an Admin adds the Assistant API key in Admin → Assistant, I'll be able to answer here.";

export function AssistantChat({ compact = false, userName }: { compact?: boolean; userName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setMessages((m) => [
      ...m,
      { id: nextId.current++, role: "user", text },
      { id: nextId.current++, role: "assistant", text: NOT_CONNECTED },
    ]);
  }

  const firstName = userName.split(" ")[0];

  return (
    <div className="flex h-full flex-col">
      <div className={`flex-1 overflow-y-auto ${compact ? "p-4" : "px-6 py-8"}`}>
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50">
              <Sparkles className="h-6 w-6 text-accent-500" />
            </span>
            <p className={`font-semibold ${compact ? "text-base" : "text-xl"}`}>Hi {firstName}, how can I help?</p>
            <p className="mt-1 max-w-sm text-sm text-neutral-500">
              Ask about your files, schedule, messages or anything in your workspace.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user" ? "bg-brand-600 text-white" : "border border-neutral-200 bg-white text-neutral-800"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <form onSubmit={send} className={`border-t border-neutral-200 bg-white ${compact ? "p-3" : "p-4"}`}>
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <label htmlFor={compact ? "assistant-panel-input" : "assistant-input"} className="sr-only">Message the Assistant</label>
          <textarea
            id={compact ? "assistant-panel-input" : "assistant-input"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            rows={1}
            placeholder="Message the Assistant…"
            className="input max-h-40 min-h-[40px] resize-none"
          />
          <button type="submit" className="btn-primary h-10 w-10 shrink-0 p-0" aria-label="Send" disabled={!draft.trim()}>
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
