"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Maximize2, Sparkles, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { AssistantChat, type AssistantAvailability } from "./assistant-chat";

/**
 * Persistent floating Assistant button. Opens a non-modal panel so the user can keep
 * working on the page behind it. Hidden on the full Assistant page.
 */
export function AssistantFab({ userName, status }: { userName: string; status: AssistantAvailability }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close when navigating to another page.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        fabRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname.startsWith("/assistant")) return null;

  function close() {
    setOpen(false);
    fabRef.current?.focus();
  }

  return (
    <>
      {open && (
        <div
          ref={panelRef}
          id="assistant-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="assistant-panel-title"
          tabIndex={-1}
          className="fixed inset-x-3 bottom-24 z-50 flex h-[min(560px,calc(100dvh-8rem))] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 shadow-2xl focus:outline-none sm:left-auto sm:right-6 sm:w-[400px]"
        >
          <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2">
            <h2 id="assistant-panel-title" className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-accent-500" aria-hidden="true" /> Assistant
            </h2>
            <span className="flex gap-1">
              <Link
                href="/assistant"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
                aria-label="Open full Assistant"
                title="Open full Assistant"
              >
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              </Link>
              <IconButton icon={X} label="Close Assistant" onClick={close} />
            </span>
          </div>
          <AssistantChat compact userName={userName} status={status} />
        </div>
      )}
      <button
        ref={fabRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? "Close Assistant" : "Open Assistant"}
        aria-expanded={open}
        aria-controls="assistant-panel"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white transition-transform hover:scale-105 hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600 sm:bottom-6 sm:right-6"
      >
        {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Sparkles className="h-6 w-6" aria-hidden="true" />}
        {!open && <span className="absolute right-1 top-1 h-3 w-3 rounded-full bg-accent-500 ring-2 ring-white" aria-hidden="true" />}
      </button>
    </>
  );
}
