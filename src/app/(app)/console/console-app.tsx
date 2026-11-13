"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Circle, Square, Trash2, X, Settings2 } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { FormMessage } from "@/components/ui/form";
import type { FormState } from "@/lib/actions";
import { lineToText, type ConsoleCategory, type ConsoleLine } from "@/lib/console-log";
import { saveRecordingAction } from "./actions";

const CATEGORIES: ConsoleCategory[] = ["USER", "BILLING", "APPZONE", "SYSTEM", "SUPPORT", "ADMIN", "STORAGE", "TEAM", "CALENDAR", "DEPLOY"];

const THEMES = {
  classic: { label: "Classic green", text: "text-green-300", levels: { info: "text-green-300", good: "text-emerald-300", warn: "text-yellow-300", alert: "text-red-400" } },
  amber: { label: "Amber", text: "text-amber-300", levels: { info: "text-amber-300", good: "text-amber-200", warn: "text-orange-300", alert: "text-red-400" } },
  white: { label: "White", text: "text-neutral-100", levels: { info: "text-neutral-100", good: "text-neutral-100", warn: "text-yellow-200", alert: "text-red-300" } },
  blue: { label: "Blue", text: "text-sky-300", levels: { info: "text-sky-300", good: "text-cyan-200", warn: "text-yellow-300", alert: "text-rose-400" } },
} as const;
const SIZES = { small: "text-xs", medium: "text-sm", large: "text-base" } as const;
const WINDOWS = { normal: "h-[60vh]", tall: "h-[78vh]", full: "fixed inset-0 z-50 h-auto rounded-none" } as const;

type Settings = {
  theme: keyof typeof THEMES;
  size: keyof typeof SIZES;
  window: keyof typeof WINDOWS;
  timestamps: boolean;
  hidden: ConsoleCategory[];
};
const DEFAULTS: Settings = { theme: "classic", size: "small", window: "normal", timestamps: true, hidden: [] };
const STORAGE_KEY = "garwin-console-settings";
const POLL_MS = 3000;
const MAX_LINES = 2000;

// Settings are remembered on this device (localStorage), read through useSyncExternalStore so the
// server render and first client render agree.
const SETTINGS_EVENT = "garwin-console-settings";
function subscribe(onChange: () => void) {
  window.addEventListener(SETTINGS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SETTINGS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
const readSettings = () => localStorage.getItem(STORAGE_KEY) ?? "{}";
function parseSettings(raw: string): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function ConsoleApp({ initialLines }: { initialLines: ConsoleLine[] }) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [clearedAfter, setClearedAfter] = useState<string | null>(null);
  const rawSettings = useSyncExternalStore(subscribe, readSettings, () => "{}");
  const settings = useMemo(() => parseSettings(rawSettings), [rawSettings]);
  const [recording, setRecording] = useState<{ startedAt: string; lines: ConsoleLine[] } | null>(null);
  const [saveState, setSaveState] = useState<FormState>(undefined);
  const [saving, startSaving] = useTransition();
  const [offline, setOffline] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const last = useRef(initialLines.at(-1) ?? null);

  const update = (patch: Partial<Settings>) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, ...patch }));
    window.dispatchEvent(new Event(SETTINGS_EVENT));
  };

  const poll = useCallback(async () => {
    const qs = last.current ? `?afterId=${last.current.id}` : "";
    try {
      const res = await fetch(`/api/admin/console${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const { lines: fresh } = (await res.json()) as { lines: ConsoleLine[] };
      setOffline(false);
      if (fresh.length === 0) return;
      last.current = fresh.at(-1)!;
      setLines((prev) => [...prev, ...fresh].slice(-MAX_LINES));
      setRecording((r) => (r ? { ...r, lines: [...r.lines, ...fresh] } : r));
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  const visible = lines.filter((l) => (!clearedAfter || l.at > clearedAfter) && !settings.hidden.includes(l.category));
  // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect may only
  // return a cleanup function.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [visible.length]);

  function stopRecording() {
    if (!recording) return;
    const ended = new Date().toISOString();
    const header = `Garwin AI Console recording\nStarted ${recording.startedAt}\nEnded   ${ended}\n${"-".repeat(60)}\n`;
    const fd = new FormData();
    fd.set("text", header + recording.lines.map(lineToText).join("\n") + "\n");
    fd.set("lineCount", String(recording.lines.length));
    fd.set("startedAt", recording.startedAt);
    fd.set("endedAt", ended);
    setRecording(null);
    startSaving(async () => setSaveState(await saveRecordingAction(undefined, fd)));
  }

  const theme = THEMES[settings.theme];
  const btn = "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

  return (
    <div className="space-y-3">
      <section aria-label="Console" className={cn("flex flex-col overflow-hidden rounded-xl bg-black shadow-xl ring-1 ring-neutral-800", WINDOWS[settings.window])}>
        {/* Title bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 bg-neutral-950 px-3 py-2">
          <p className="flex items-center gap-2 font-mono text-xs text-neutral-300">
            <span className="flex gap-1" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            </span>
            garwin@console: ~/events
            {recording && (
              <span className="ml-2 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                <Circle className="h-2 w-2 fill-current motion-safe:animate-pulse" aria-hidden="true" /> REC {recording.lines.length}
              </span>
            )}
            {offline && <span className="rounded bg-yellow-500 px-1.5 py-0.5 text-[10px] font-bold text-black">RECONNECTING</span>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {recording ? (
              <button type="button" onClick={stopRecording} className={cn(btn, "bg-red-600 text-white hover:bg-red-500")}>
                <Square className="h-3 w-3 fill-current" aria-hidden="true" /> Stop Recording
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setSaveState(undefined);
                  setRecording({ startedAt: new Date().toISOString(), lines: [] });
                }}
                className={cn(btn, "bg-neutral-800 text-white hover:bg-neutral-700 disabled:opacity-50")}
              >
                <Circle className="h-3 w-3 fill-red-500 text-red-500" aria-hidden="true" /> {saving ? "Saving…" : "Record"}
              </button>
            )}
            <button type="button" onClick={() => setClearedAfter(lines.at(-1)?.at ?? new Date().toISOString())} className={cn(btn, "bg-neutral-800 text-white hover:bg-neutral-700")}>
              <Trash2 className="h-3 w-3" aria-hidden="true" /> Clear
            </button>
            <button type="button" onClick={() => router.push("/apps")} className={cn(btn, "bg-neutral-800 text-white hover:bg-neutral-700")}>
              <X className="h-3 w-3" aria-hidden="true" /> Close
            </button>
          </div>
        </div>

        {/* Output */}
        <div role="log" aria-label="Console output" tabIndex={0} className={cn("flex-1 overflow-y-auto p-3 font-mono leading-relaxed", SIZES[settings.size], theme.text)}>
          {visible.length === 0 && <p className="text-neutral-400">Waiting for events…</p>}
          {visible.map((l) => (
            <p key={l.id} className={cn("whitespace-pre-wrap break-words", theme.levels[l.level])} data-level={l.level}>
              {settings.timestamps && <span className="text-neutral-400">{new Date(l.at).toLocaleTimeString()} </span>}
              <span className="font-bold">{l.category.padEnd(8)}</span> {l.text}
            </p>
          ))}
          <p aria-hidden="true" className="text-neutral-400">
            $ <span className="motion-safe:animate-pulse">▋</span>
          </p>
          <div ref={bottom} />
        </div>
      </section>

      {settings.window === "full" && (
        <p className="sr-only">The Console fills the screen. Change Window in View settings to make it smaller.</p>
      )}

      <FormMessage state={saveState} />
      {saveState?.ok && (
        <p className="text-sm">
          <a href="/storage" className="text-brand-700 hover:underline">Open Storage</a>
        </p>
      )}

      <details className={cn("card p-4", settings.window === "full" && "fixed bottom-4 right-4 z-[60] max-w-sm")}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <Settings2 className="h-4 w-4" aria-hidden="true" /> View settings
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="label">Color theme</span>
            <select className="input" value={settings.theme} onChange={(e) => update({ theme: e.target.value as Settings["theme"] })}>
              {Object.entries(THEMES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Text size</span>
            <select className="input" value={settings.size} onChange={(e) => update({ size: e.target.value as Settings["size"] })}>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Window</span>
            <select className="input" value={settings.window} onChange={(e) => update({ window: e.target.value as Settings["window"] })}>
              <option value="normal">Normal</option>
              <option value="tall">Tall</option>
              <option value="full">Full screen</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={settings.timestamps} onChange={(e) => update({ timestamps: e.target.checked })} />
            Show times
          </label>
        </div>
        <fieldset className="mt-4">
          <legend className="label">Show events</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!settings.hidden.includes(c)}
                  onChange={(e) => update({ hidden: e.target.checked ? settings.hidden.filter((h) => h !== c) : [...settings.hidden, c] })}
                />
                {c[0] + c.slice(1).toLowerCase()}
              </label>
            ))}
          </div>
        </fieldset>
      </details>
    </div>
  );
}
