"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Maximize2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { AssistantChat } from "./assistant-chat";

/** Persistent floating Assistant button, available on every page except the full Assistant page. */
export function AssistantFab({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname.startsWith("/assistant")) return null;

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Assistant"
          className="fixed bottom-24 right-6 z-50 flex h-[min(560px,calc(100vh-8rem))] w-[min(400px,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-accent-500" /> Assistant
            </span>
            <span className="flex gap-1">
              <Link href="/assistant" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100" aria-label="Open full Assistant">
                <Maximize2 className="h-4 w-4" />
              </Link>
              <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100" aria-label="Close Assistant">
                <X className="h-4 w-4" />
              </button>
            </span>
          </div>
          <AssistantChat compact userName={userName} />
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Assistant" : "Open Assistant"}
        aria-expanded={open}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white transition-transform hover:scale-105 hover:bg-brand-700"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
        {!open && <span className="absolute right-1 top-1 h-3 w-3 rounded-full bg-accent-500 ring-2 ring-white" />}
      </button>
    </>
  );
}
