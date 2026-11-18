"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronsLeftRight,
  ClipboardCopy,
  ClipboardPaste,
  Columns3,
  Copy,
  FilePlus2,
  Files,
  LayoutGrid,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Move,
  PanelsTopLeft,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { AppIcon, ThemeIcon, WidgetIcon } from "@/components/app-icon";
import { cn } from "@/components/ui/cn";
import { BUILT_IN_THEMES, DRIVE_ICON, getTheme, type AppIconSpec } from "@/lib/app-icons";
import {
  addColumn,
  addWidget,
  BUILT_IN_WIDGETS,
  COLUMN_WIDTHS,
  duplicateColumn,
  duplicateWidget,
  MAX_COLUMNS,
  MAX_WIDGETS_PER_COLUMN,
  moveApp,
  moveWidget,
  newId,
  removeColumn,
  removeWidget,
  addPage,
  duplicatePage,
  getPage,
  mainColumnId,
  normalizePageNames,
  pastePage,
  removePage,
  renamePage,
  revertPageTheme,
  setPageTheme,
  updatePage,
  themeStyle,
  updateColumn,
  updateWidget,
  widgetName,
  type Column,
  type WidgetInstance,
  type WidgetSettings,
  type WidgetType,
  type WorkspaceLayout,
  type WorkspacePage,
} from "@/lib/workspace";
import { DEFAULT_THEME } from "@/lib/app-icons";
import { saveLayoutAction } from "@/app/(app)/workspace/actions";
import { toggleApp } from "@/app/(app)/settings/apps/actions";

type AppLink = { slug: string; name: string; href: string; icon: AppIconSpec };
/** Every base app with its state for the Apps panel. */
export type AppEntry = AppLink & { status: "active" | "deactivated" | "locked"; canDeactivate: boolean; built: boolean };
type StorageInfo = { usedBytes: number; limitGb: number; driveName: string };

/** What is waiting for the person to confirm. */
type Pending =
  | { kind: "add-widget"; type: WidgetType; columnId: string; index?: number }
  | { kind: "theme"; slug: string }
  | { kind: "remove-widget"; widgetId: string }
  | { kind: "remove-column"; columnId: string }
  | { kind: "remove-page"; pageId: string }
  | { kind: "toggle-app"; slug: string; activate: boolean };

const DRAG_MIME = "application/x-garwin";
type DragData = { kind: "new-widget"; type: WidgetType } | { kind: "theme"; slug: string } | { kind: "widget"; id: string } | { kind: "app"; slug: string };

const WIDTH_FR: Record<Column["width"], string> = { narrow: "1fr", normal: "1.5fr", wide: "2.25fr" };
const WIDTH_LABEL: Record<Column["width"], string> = { narrow: "Narrow", normal: "Normal", wide: "Wide" };
const SIZE_MIN_H: Record<WidgetInstance["size"], string> = { s: "min-h-24", m: "min-h-40", l: "min-h-72" };

function readDrag(e: React.DragEvent): DragData | null {
  try {
    return JSON.parse(e.dataTransfer.getData(DRAG_MIME)) as DragData;
  } catch {
    return null;
  }
}

function setDrag(e: React.DragEvent, data: DragData) {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(data));
  e.dataTransfer.effectAllowed = data.kind === "widget" || data.kind === "app" ? "move" : "copy";
}

function SmallButton({ label, icon: Icon, onClick, disabled, danger }: { label: string; icon: typeof X; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-brand-600",
        danger && "hover:bg-red-50 hover:text-red-700",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

// ---------------------------------------------------------------- confirm dialog

function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onCancel }: { title: string; body: React.ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} aria-labelledby="confirm-title" onClose={onCancel} className="m-auto w-[min(26rem,92vw)] rounded-xl bg-white p-0 shadow-2xl backdrop:bg-neutral-900/40">
      <div className="space-y-4 p-5">
        <h2 id="confirm-title" className="text-lg font-semibold">{title}</h2>
        <div className="text-sm text-neutral-600">{body}</div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------- pop-up pickers

function Picker({ title, hint, onClose, children }: { title: string; hint?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="card absolute inset-x-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <SmallButton label={`Close ${title.toLowerCase()}`} icon={X} onClick={onClose} />
      </div>
      {hint && <p className="mb-3 text-xs text-neutral-500">{hint}</p>}
      {children}
    </section>
  );
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500 first:mt-0">{children}</h3>;
}

function MenuButton({ icon: Icon, label, onClick, disabled, hint }: { icon: typeof X; label: string; onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={hint} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-neutral-100 disabled:opacity-40">
      <Icon className="h-4 w-4 text-neutral-500" aria-hidden="true" /> {label}
    </button>
  );
}

/** The grey Apps / Widgets / Page buttons. */
function ToolButton({ icon: Icon, label, open, onClick }: { icon: typeof X; label: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={cn("flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[11px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600", open ? "bg-neutral-700" : "bg-neutral-500 hover:bg-neutral-600")}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------- widgets

function ClockBody({ widget, onSettings }: { widget: WidgetInstance; onSettings: (s: WidgetSettings) => void }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const hour12 = widget.settings.hour12 ?? true;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 py-2 text-center">
      <p className="text-3xl font-semibold tabular-nums" suppressHydrationWarning>
        {now ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: widget.size === "s" ? undefined : "2-digit", hour12 }) : "--:--"}
      </p>
      <p className="text-sm text-neutral-500" suppressHydrationWarning>
        {now ? now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) : ""}
      </p>
      <button type="button" className="mt-1 text-xs text-brand-700 hover:underline" onClick={() => onSettings({ ...widget.settings, hour12: !hour12 })}>
        Use {hour12 ? "24-hour" : "12-hour"} time
      </button>
    </div>
  );
}

function NotesBody({ widget, onSettings }: { widget: WidgetInstance; onSettings: (s: WidgetSettings) => void }) {
  return (
    <>
      <label htmlFor={`notes-${widget.id}`} className="sr-only">Notes</label>
      <textarea
        id={`notes-${widget.id}`}
        className="input h-full min-h-20 resize-none"
        rows={widget.size === "l" ? 12 : widget.size === "m" ? 5 : 2}
        maxLength={5000}
        placeholder="Write anything…"
        value={widget.settings.text ?? ""}
        onChange={(e) => onSettings({ ...widget.settings, text: e.target.value })}
      />
    </>
  );
}

function TodoBody({ widget, onSettings }: { widget: WidgetInstance; onSettings: (s: WidgetSettings) => void }) {
  const items = widget.settings.items ?? [];
  const [draft, setDraft] = useState("");
  const set = (next: typeof items) => onSettings({ ...widget.settings, items: next });
  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text || items.length >= 50) return;
          set([...items, { id: newId(), text: text.slice(0, 200), done: false }]);
          setDraft("");
        }}
      >
        <label htmlFor={`todo-${widget.id}`} className="sr-only">New to-do</label>
        <input id={`todo-${widget.id}`} className="input" placeholder="Add a to-do" value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="btn-secondary px-3" aria-label="Add to-do">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing to do yet.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id} className="group flex items-center gap-2 text-sm">
              <input
                id={`todo-${it.id}`}
                type="checkbox"
                checked={it.done}
                onChange={() => set(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
                className="h-4 w-4 accent-brand-600"
              />
              <label htmlFor={`todo-${it.id}`} className={cn("flex-1 break-words", it.done && "text-neutral-400 line-through")}>{it.text}</label>
              <SmallButton label={`Delete "${it.text}"`} icon={X} onClick={() => set(items.filter((x) => x.id !== it.id))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function StorageBody({ storage }: { storage: StorageInfo }) {
  const pct = Math.min(100, (storage.usedBytes / (storage.limitGb * 1024 ** 3)) * 100);
  return (
    <Link href="/storage" className="block space-y-2 rounded-lg p-1 hover:bg-neutral-50">
      <p className="flex items-center gap-2 font-medium">
        <AppIcon spec={DRIVE_ICON} size="sm" /> {storage.driveName}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-label={`${storage.driveName} used`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(pct, 0.5)}%` }} />
      </div>
      <p className="text-sm text-neutral-500">{formatBytes(storage.usedBytes)} of {storage.limitGb} GB used</p>
    </Link>
  );
}

function QuickLinksBody({ widget, apps, onSettings }: { widget: WidgetInstance; apps: AppLink[]; onSettings: (s: WidgetSettings) => void }) {
  const [choosing, setChoosing] = useState(false);
  const picked = widget.settings.apps ?? [];
  const shown = apps.filter((a) => picked.includes(a.slug));
  if (choosing) {
    return (
      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-medium">Show these apps</legend>
        {apps.map((a) => (
          <label key={a.slug} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={picked.includes(a.slug)}
              onChange={() => onSettings({ ...widget.settings, apps: picked.includes(a.slug) ? picked.filter((p) => p !== a.slug) : [...picked, a.slug] })}
            />
            {a.name}
          </label>
        ))}
        <button type="button" className="btn-secondary mt-2 text-xs" onClick={() => setChoosing(false)}>Done</button>
      </fieldset>
    );
  }
  return (
    <div className="space-y-2">
      {shown.length === 0 ? (
        <p className="text-sm text-neutral-500">No apps picked.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {shown.map((a) => (
            <li key={a.slug}>
              <Link href={a.href} className="flex flex-col items-center gap-1 rounded-lg p-2 text-center text-xs hover:bg-neutral-50">
                <AppIcon spec={a.icon} size="md" />
                {a.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => setChoosing(true)}>Choose apps</button>
    </div>
  );
}

function WidgetCard({
  widget,
  column,
  columns,
  index,
  apps,
  storage,
  onChange,
  onAsk,
  onMove,
  onDuplicate,
}: {
  widget: WidgetInstance;
  column: Column;
  columns: Column[];
  index: number;
  apps: AppLink[];
  storage: StorageInfo;
  onChange: (patch: Partial<Pick<WidgetInstance, "size" | "minimized" | "settings">>) => void;
  onAsk: (p: Pending) => void;
  onMove: (toColumnId: string, toIndex: number) => void;
  onDuplicate: () => void;
}) {
  const name = widgetName(widget.type);
  const [tools, setTools] = useState(false);
  const colIndex = columns.findIndex((c) => c.id === column.id);
  const onSettings = (settings: WidgetSettings) => onChange({ settings });
  return (
    <article
      aria-label={`${name} widget`}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        setDrag(e, { kind: "widget", id: widget.id });
      }}
      className="card overflow-hidden"
    >
      <header className="border-b border-neutral-100 px-2 py-1.5">
        <div className="flex items-center gap-2">
          <Move className="h-4 w-4 shrink-0 cursor-grab text-neutral-400" aria-hidden="true" />
          <WidgetIcon name={name} size="sm" />
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{name}</h3>
          <SmallButton label={widget.minimized ? `Expand ${name}` : `Minimize ${name}`} icon={widget.minimized ? Maximize2 : Minimize2} onClick={() => onChange({ minimized: !widget.minimized })} />
          <button
            type="button"
            aria-expanded={tools}
            aria-controls={`tools-${widget.id}`}
            onClick={() => setTools(!tools)}
            aria-label={`${name} options`}
            title="Options"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {tools && (
          <div id={`tools-${widget.id}`} className="mt-1 flex flex-wrap items-center gap-0.5 border-t border-neutral-100 pt-1">
            <label className="sr-only" htmlFor={`size-${widget.id}`}>{name} size</label>
            <select
              id={`size-${widget.id}`}
              value={widget.size}
              onChange={(e) => onChange({ size: e.target.value as WidgetInstance["size"] })}
              className="h-8 rounded-md border border-neutral-200 bg-white px-1 text-xs text-neutral-700"
            >
              <option value="s">Small</option>
              <option value="m">Medium</option>
              <option value="l">Large</option>
            </select>
            <SmallButton label={`Move ${name} up`} icon={ArrowUp} disabled={index === 0} onClick={() => onMove(column.id, index - 1)} />
            <SmallButton label={`Move ${name} down`} icon={ArrowDown} disabled={index === column.widgets.length - 1} onClick={() => onMove(column.id, index + 2)} />
            <SmallButton label={`Move ${name} to the left column`} icon={ArrowLeft} disabled={colIndex <= 0} onClick={() => onMove(columns[colIndex - 1].id, columns[colIndex - 1].widgets.length)} />
            <SmallButton label={`Move ${name} to the right column`} icon={ArrowRight} disabled={colIndex >= columns.length - 1} onClick={() => onMove(columns[colIndex + 1].id, columns[colIndex + 1].widgets.length)} />
            <SmallButton label={`Duplicate ${name}`} icon={Copy} disabled={column.widgets.length >= MAX_WIDGETS_PER_COLUMN} onClick={onDuplicate} />
            <SmallButton label={`Remove ${name}`} icon={Trash2} danger onClick={() => onAsk({ kind: "remove-widget", widgetId: widget.id })} />
          </div>
        )}
      </header>
      {!widget.minimized && (
        <div className={cn("p-3", SIZE_MIN_H[widget.size])}>
          {widget.type === "clock" && <ClockBody widget={widget} onSettings={onSettings} />}
          {widget.type === "notes" && <NotesBody widget={widget} onSettings={onSettings} />}
          {widget.type === "todo" && <TodoBody widget={widget} onSettings={onSettings} />}
          {widget.type === "storage" && <StorageBody storage={storage} />}
          {widget.type === "quick-links" && <QuickLinksBody widget={widget} apps={apps} onSettings={onSettings} />}
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- the editor

const CLIPBOARD_KEY = "garwin.workspace.copiedPage";

function readClipboard(): WorkspacePage | null {
  try {
    const raw = window.localStorage.getItem(CLIPBOARD_KEY);
    return raw ? (JSON.parse(raw) as WorkspacePage) : null;
  } catch {
    return null;
  }
}

type SearchHit = { key: string; label: string; detail: string; href?: string; pageId?: string };

export function WorkspaceEditor({
  initial,
  initialPageId,
  apps,
  canManageApps,
  canManageBilling,
  storage,
}: {
  initial: WorkspaceLayout;
  initialPageId: string | null;
  apps: AppEntry[];
  canManageApps: boolean;
  canManageBilling: boolean;
  storage: StorageInfo;
}) {
  const router = useRouter();
  const [layout, setLayout] = useState(initial);
  const [pageId, setPageId] = useState(() => getPage(initial, initialPageId).id);
  // Follow the URL when a sidebar "Pages" link is used while this page is open.
  const [urlPage, setUrlPage] = useState(initialPageId);
  if (initialPageId !== urlPage) {
    setUrlPage(initialPageId);
    if (initialPageId) setPageId(initialPageId);
  }
  const [pending, setPending] = useState<Pending | null>(null);
  const [panel, setPanel] = useState<"apps" | "widgets" | "page" | null>(null);
  const [showThemes, setShowThemes] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [clipboard, setClipboard] = useState<WorkspacePage | null>(null);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(layout);
  const refreshAfter = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setClipboard(readClipboard()), 0);
    return () => clearTimeout(t);
  }, []);

  const save = useCallback(
    (next: WorkspaceLayout, opts?: { refresh?: boolean }) => {
      latest.current = next;
      if (opts?.refresh) refreshAfter.current = true;
      if (timer.current) clearTimeout(timer.current);
      setSaveState("saving");
      timer.current = setTimeout(() => {
        timer.current = null;
        startTransition(async () => {
          const res = await saveLayoutAction(JSON.stringify(normalizePageNames(latest.current)));
          if (res?.error) {
            setSaveState("error");
            setError(res.error);
          } else {
            setSaveState("saved");
            setError(null);
            if (refreshAfter.current) {
              refreshAfter.current = false;
              router.refresh();
            }
          }
        });
      }, 700);
    },
    [router],
  );

  const apply = (fn: (l: WorkspaceLayout) => WorkspaceLayout, opts?: { refresh?: boolean }) => {
    const prev = latest.current;
    const next = fn(prev);
    if (next === prev) return;
    latest.current = next;
    setLayout(next);
    save(next, opts);
  };

  const page = getPage(layout, pageId);
  /** Column and widget edits apply to the page on screen. */
  const applyPage = (fn: (p: WorkspacePage) => WorkspacePage) => apply((l) => updatePage(l, page.id, fn));

  const goToPage = (id: string) => {
    setPageId(id);
    setUrlPage(id);
    setPanel(null);
    router.replace(`/workspace?page=${id}`, { scroll: false });
  };

  const addPageAndGo = (result: { layout: WorkspaceLayout; pageId: string | null }, message: string) => {
    if (!result.pageId) {
      setNotice("You've reached the page limit.");
      return;
    }
    apply(() => result.layout, { refresh: true });
    setNotice(message);
    goToPage(result.pageId);
  };

  // Save anything still waiting if the page is left.
  useEffect(() => {
    const flush = () => {
      if (timer.current) void saveLayoutAction(JSON.stringify(normalizePageNames(latest.current)));
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  const activeApps = apps.filter((a) => a.status === "active");
  const orderedApps = layout.appOrder.map((s) => activeApps.find((a) => a.slug === s)).filter((a): a is AppEntry => Boolean(a));
  const theme = getTheme(page.theme);
  const mainId = mainColumnId(page.columns);

  const confirm = () => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    if (p.kind === "add-widget") applyPage((pg) => addWidget(pg, p.columnId, p.type, p.index));
    if (p.kind === "theme") {
      apply((l) => setPageTheme(l, page.id, p.slug), { refresh: true });
      setShowThemes(false);
      setPanel(null);
    }
    if (p.kind === "remove-widget") applyPage((pg) => removeWidget(pg, p.widgetId));
    if (p.kind === "remove-column") applyPage((pg) => removeColumn(pg, p.columnId));
    if (p.kind === "remove-page") {
      const rest = layout.pages.filter((x) => x.id !== p.pageId);
      apply((l) => removePage(l, p.pageId), { refresh: true });
      if (rest[0]) goToPage(rest[0].id);
    }
    if (p.kind === "toggle-app") {
      startTransition(async () => {
        const fd = new FormData();
        fd.set("slug", p.slug);
        fd.set("active", String(p.activate));
        const res = await toggleApp(undefined, fd);
        if (res?.error) setError(res.error);
        else {
          setNotice(res?.ok ?? null);
          router.refresh();
        }
      });
      return;
    }
    if (p.kind === "add-widget") setPanel(null);
  };

  const onDropColumn = (e: React.DragEvent, column: Column, index?: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const data = readDrag(e);
    if (!data) return;
    if (data.kind === "new-widget") setPending({ kind: "add-widget", type: data.type, columnId: column.id, index });
    if (data.kind === "theme") setPending({ kind: "theme", slug: data.slug });
    if (data.kind === "widget") applyPage((pg) => moveWidget(pg, data.id, column.id, index ?? column.widgets.length));
  };

  const firstOpenColumn = page.columns.find((c) => c.widgets.length < MAX_WIDGETS_PER_COLUMN) ?? page.columns[0];
  const gridTemplate = page.columns.map((c) => (c.minimized ? "3rem" : WIDTH_FR[c.width])).join(" ");

  // ------------------------------------------------ search: apps, pages, widgets and what's written in them
  const q = query.trim().toLowerCase();
  const hits: SearchHit[] = [];
  if (q.length >= 2) {
    for (const a of apps) if (a.name.toLowerCase().includes(q)) hits.push({ key: `app-${a.slug}`, label: a.name, detail: a.status === "active" ? "App" : a.status === "locked" ? "App · upgrade to use" : "App · deactivated", href: a.status === "active" ? a.href : `/apps/${a.slug}` });
    for (const p of layout.pages) {
      if (p.name.toLowerCase().includes(q)) hits.push({ key: `page-${p.id}`, label: p.name, detail: "Page", pageId: p.id });
      for (const c of p.columns)
        for (const w of c.widgets) {
          const text = [widgetName(w.type), w.settings.text ?? "", ...(w.settings.items ?? []).map((i) => i.text)].join(" \n ");
          if (text.toLowerCase().includes(q)) hits.push({ key: `w-${w.id}`, label: widgetName(w.type), detail: `Widget on ${p.name}`, pageId: p.id });
        }
    }
    hits.push({ key: "appzone", label: `Search AppZone for "${query.trim()}"`, detail: "AppZone", href: `/appzone?q=${encodeURIComponent(query.trim())}` });
  }

  const toolbar = (
    <div className="relative space-y-2">
      <form role="search" onSubmit={(e) => e.preventDefault()} className="relative">
        <label htmlFor="workspace-search" className="sr-only">Search apps, pages and widgets</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
        <input id="workspace-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search apps, pages, notes…" className="input pl-9" autoComplete="off" />
        {hits.length > 0 && (
          <ul className="card absolute inset-x-0 top-full z-40 mt-1 max-h-80 overflow-y-auto p-1 shadow-xl" aria-label="Search results">
            {hits.slice(0, 12).map((h) => (
              <li key={h.key}>
                {h.href ? (
                  <Link href={h.href} className="flex flex-col rounded-lg px-3 py-2 text-sm hover:bg-neutral-100">
                    <span className="font-medium">{h.label}</span>
                    <span className="text-xs text-neutral-500">{h.detail}</span>
                  </Link>
                ) : (
                  <button type="button" onClick={() => { goToPage(h.pageId!); setQuery(""); }} className="flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-100">
                    <span className="font-medium">{h.label}</span>
                    <span className="text-xs text-neutral-500">{h.detail}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </form>
      <div className="flex gap-2">
        <ToolButton icon={LayoutGrid} label="Apps" open={panel === "apps"} onClick={() => setPanel(panel === "apps" ? null : "apps")} />
        <ToolButton icon={PanelsTopLeft} label="Widgets" open={panel === "widgets"} onClick={() => setPanel(panel === "widgets" ? null : "widgets")} />
        <ToolButton icon={Files} label="Page" open={panel === "page"} onClick={() => { setPanel(panel === "page" ? null : "page"); setShowThemes(false); }} />
      </div>

      {panel === "apps" && (
        <Picker title="Apps" onClose={() => setPanel(null)}>
          <ul className="divide-y divide-neutral-100">
            {apps.map((a) => (
              <li key={a.slug} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                <span className="flex min-w-[10rem] flex-1 items-center gap-3">
                  <AppIcon spec={a.icon} size="md" dimmed={a.status !== "active"} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{a.name}</span>
                    <span className="block text-xs text-neutral-500">{a.status === "active" ? "Active" : a.status === "deactivated" ? "Deactivated" : "Paid plans"}</span>
                  </span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {a.status === "locked" && (canManageBilling ? <Link href="/settings/payments" className="btn-secondary px-2 py-1 text-xs">Upgrade</Link> : <span className="text-xs text-neutral-500">Ask your host</span>)}
                  {a.status !== "locked" && canManageApps && a.canDeactivate && (
                    <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setPending({ kind: "toggle-app", slug: a.slug, activate: a.status !== "active" })}>
                      {a.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  )}
                  <Link href={`/settings/apps/${a.slug}`} className="btn-secondary px-2 py-1 text-xs">Settings</Link>
                  {a.status === "active" && (a.built ? <Link href={a.href} className="btn-primary px-3 py-1 text-xs">GO</Link> : <span className="btn-primary cursor-not-allowed px-3 py-1 text-xs opacity-50" title="Coming soon">GO</span>)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">Other apps are subscribed to in <Link href="/appzone" className="text-brand-700 hover:underline">AppZone</Link>. You can delete a subscription here once you have one.</p>
        </Picker>
      )}

      {panel === "widgets" && (
        <Picker title="Widgets" hint="Drag a widget onto a column, or tap one. You'll be asked to activate it." onClose={() => setPanel(null)}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {BUILT_IN_WIDGETS.map((w) => (
              <li key={w.type}>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => setDrag(e, { kind: "new-widget", type: w.type })}
                  onClick={() => setPending({ kind: "add-widget", type: w.type, columnId: firstOpenColumn.id })}
                  className="flex w-full items-center gap-2 rounded-lg border border-neutral-200 p-2 text-left text-sm hover:border-brand-500 hover:bg-brand-50"
                >
                  <WidgetIcon name={w.name} size="md" />
                  <span className="min-w-0">
                    <span className="block font-medium">{w.name}</span>
                    <span className="block text-xs text-neutral-500">{w.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">More widgets come from <Link href="/appzone" className="text-brand-700 hover:underline">AppZone</Link>.</p>
        </Picker>
      )}

      {panel === "page" && (
        <Picker title="Page" onClose={() => setPanel(null)}>
          <PanelHeading>This page</PanelHeading>
          <div className="grid grid-cols-2 gap-1">
            <MenuButton icon={FilePlus2} label="Add new page" onClick={() => addPageAndGo(addPage(latest.current), "Blank page added.")} />
            <MenuButton icon={Copy} label="Duplicate" onClick={() => addPageAndGo(duplicatePage(latest.current, page.id), `Duplicated ${page.name}.`)} />
            <MenuButton
              icon={ClipboardCopy}
              label="Copy"
              onClick={() => {
                setClipboard(page);
                try {
                  window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(page));
                } catch {
                  /* storage unavailable: the copy still works until reload */
                }
                setNotice(`Copied ${page.name}. Paste makes a new page from it.`);
              }}
            />
            <MenuButton icon={ClipboardPaste} label="Paste" disabled={!clipboard} hint={clipboard ? undefined : "Copy a page first"} onClick={() => clipboard && addPageAndGo(pastePage(latest.current, clipboard, page.id), "Pasted as a new page.")} />
            <MenuButton icon={Columns3} label="Add column" disabled={page.columns.length >= MAX_COLUMNS} hint={page.columns.length >= MAX_COLUMNS ? "Up to 3 columns" : undefined} onClick={() => applyPage(addColumn)} />
            <MenuButton icon={Trash2} label="Delete page" disabled={layout.pages.length <= 1} onClick={() => setPending({ kind: "remove-page", pageId: page.id })} />
          </div>
          <div className="mt-2">
            <label htmlFor="page-name" className="label">Page name</label>
            <input
              id="page-name"
              className="input"
              maxLength={40}
              value={page.name}
              onChange={(e) => apply((l) => renamePage(l, page.id, e.target.value), { refresh: true })}
            />
          </div>

          <PanelHeading>Pages</PanelHeading>
          <ul className="space-y-0.5">
            {layout.pages.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => goToPage(p.id)} aria-current={p.id === page.id ? "page" : undefined} className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm", p.id === page.id ? "bg-neutral-100 font-medium" : "hover:bg-neutral-50")}>
                  <ThemeIcon accent={getTheme(p.theme).accent} size="sm" />
                  <span className="truncate">{p.name || "Untitled"}</span>
                </button>
              </li>
            ))}
          </ul>

          <PanelHeading>Page themes</PanelHeading>
          <div className="flex items-center gap-3 rounded-lg bg-neutral-50 p-2">
            <ThemeIcon accent={theme.accent} size="md" />
            <div className="min-w-0 text-sm">
              <p className="font-medium">{theme.name}</p>
              <p className="text-xs text-neutral-500">Current theme · {theme.layout} layout</p>
            </div>
          </div>
          <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-3">
            <MenuButton icon={Plus} label="Add new page theme" onClick={() => setShowThemes(!showThemes)} />
            <MenuButton
              icon={Undo2}
              label="Revert to last"
              disabled={!page.previousTheme || page.previousTheme === page.theme}
              hint={page.previousTheme ? `Back to ${getTheme(page.previousTheme).name}` : "No earlier theme"}
              onClick={() => apply((l) => revertPageTheme(l, page.id, "last"), { refresh: true })}
            />
            <MenuButton icon={RotateCcw} label="Revert to default" disabled={page.theme === DEFAULT_THEME.slug} onClick={() => apply((l) => revertPageTheme(l, page.id, "default"), { refresh: true })} />
          </div>
          {showThemes && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-neutral-500">Drag a theme onto the page, or tap one. You&apos;ll confirm first.</p>
              <ul className="grid grid-cols-2 gap-2">
                {BUILT_IN_THEMES.map((t) => (
                  <li key={t.slug}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => setDrag(e, { kind: "theme", slug: t.slug })}
                      onClick={() => t.slug !== page.theme && setPending({ kind: "theme", slug: t.slug })}
                      aria-current={t.slug === page.theme ? "true" : undefined}
                      className={cn("flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm hover:bg-neutral-50", t.slug === page.theme ? "border-neutral-900" : "border-neutral-200")}
                    >
                      <ThemeIcon accent={t.accent} size="md" />
                      <span className="min-w-0">
                        <span className="block font-medium">{t.name}</span>
                        <span className="block text-xs text-neutral-500">{t.slug === page.theme ? "In use" : "Standard layout"}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-neutral-500">More themes come from <Link href="/appzone" className="text-brand-700 hover:underline">AppZone</Link>.</p>
            </div>
          )}
        </Picker>
      )}
    </div>
  );

  return (
    <div style={themeStyle(theme.accent) as React.CSSProperties} className="min-h-full">
      <header className="border-b border-neutral-200 bg-white px-4 py-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">{page.name || "Untitled"}</h1>
            <p className="text-sm text-neutral-500" aria-live="polite">
              {theme.name} theme · {saveState === "saving" ? "Saving…" : saveState === "saved" ? "All changes saved" : saveState === "error" ? "Not saved" : "Changes save automatically"}
            </p>
          </div>
          {layout.pages.length > 1 && (
            <nav aria-label="Pages" className="flex max-w-full gap-1 overflow-x-auto">
              {layout.pages.map((p) => (
                <button key={p.id} type="button" onClick={() => goToPage(p.id)} aria-current={p.id === page.id ? "page" : undefined} className={cn("shrink-0 rounded-full border px-3 py-1 text-sm", p.id === page.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white")}>
                  {p.name || "Untitled"}
                </button>
              ))}
            </nav>
          )}
        </div>

        {/* App icons: drag (or use the arrows while arranging) to reorder. Names are fixed. */}
        <div className="mt-4 flex items-start gap-2">
          <ul className="flex flex-1 gap-3 overflow-x-auto pb-1" aria-label="Your apps">
            {orderedApps.map((a, i) => (
              <li
                key={a.slug}
                draggable={arranging}
                onDragStart={(e) => setDrag(e, { kind: "app", slug: a.slug })}
                onDragOver={(e) => arranging && e.preventDefault()}
                onDrop={(e) => {
                  const d = readDrag(e);
                  if (d?.kind === "app") {
                    e.preventDefault();
                    apply((l) => moveApp(l, d.slug, i));
                  }
                }}
                className={cn("flex w-16 shrink-0 flex-col items-center gap-1 text-center", arranging && "cursor-grab")}
              >
                {arranging ? (
                  <>
                    <AppIcon spec={a.icon} size="md" />
                    <span className="w-full truncate text-xs">{a.name}</span>
                    <span className="flex">
                      <SmallButton label={`Move ${a.name} left`} icon={ArrowLeft} disabled={i === 0} onClick={() => apply((l) => moveApp(l, a.slug, i - 1))} />
                      <SmallButton label={`Move ${a.name} right`} icon={ArrowRight} disabled={i === orderedApps.length - 1} onClick={() => apply((l) => moveApp(l, a.slug, i + 1))} />
                    </span>
                  </>
                ) : (
                  <Link href={a.built ? a.href : `/apps/${a.slug}`} className="flex w-full flex-col items-center gap-1 rounded-lg p-1 hover:bg-neutral-50">
                    <AppIcon spec={a.icon} size="md" />
                    <span className="w-full truncate text-xs">{a.name}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className={arranging ? "btn-primary" : "btn-secondary"} aria-pressed={arranging} onClick={() => setArranging(!arranging)}>
            {arranging ? <Check className="h-4 w-4" aria-hidden="true" /> : <ChevronsLeftRight className="h-4 w-4" aria-hidden="true" />}
            {arranging ? "Done" : "Arrange"}
          </button>
        </div>
      </header>

      {error && <p role="alert" className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-8">{error}</p>}
      {notice && (
        <p role="status" className="mx-4 mt-4 flex items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 sm:mx-8">
          {notice}
          <SmallButton label="Dismiss" icon={X} onClick={() => setNotice(null)} />
        </p>
      )}

      <div
        className="grid gap-4 p-4 pb-24 sm:p-8 sm:pb-24 max-lg:!grid-cols-1"
        style={{ gridTemplateColumns: gridTemplate }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          // Themes can be dropped anywhere on the page.
          const d = readDrag(e);
          if (d?.kind === "theme") {
            e.preventDefault();
            setPending({ kind: "theme", slug: d.slug });
          }
        }}
      >
        {page.columns.map((col, ci) => {
          const label = col.label || `Column ${ci + 1}`;
          const isMain = col.id === mainId;
          if (col.minimized) {
            return (
              <section key={col.id} aria-label={label} className="card flex flex-col items-center gap-2 py-3 max-lg:flex-row max-lg:px-3">
                <SmallButton label={`Expand ${label}`} icon={Maximize2} onClick={() => applyPage((pg) => updateColumn(pg, col.id, { minimized: false }))} />
                <span className="text-xs text-neutral-500 lg:[writing-mode:vertical-rl]">{label} · {col.widgets.length}</span>
              </section>
            );
          }
          return (
            <section
              key={col.id}
              aria-label={label}
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(col.id);
              }}
              onDragLeave={() => setDropTarget((t) => (t === col.id ? null : t))}
              onDrop={(e) => onDropColumn(e, col)}
              className={cn("min-w-0 space-y-3 rounded-xl border-2 border-dashed p-2 transition-colors", dropTarget === col.id ? "border-brand-500 bg-brand-50" : "border-transparent", isMain && "max-lg:order-first")}
            >
              {isMain && toolbar}
              <div className="flex flex-wrap items-center gap-1">
                <label htmlFor={`col-${col.id}`} className="sr-only">Column name</label>
                <input
                  id={`col-${col.id}`}
                  value={col.label}
                  placeholder={`Column ${ci + 1}`}
                  maxLength={40}
                  onChange={(e) => applyPage((pg) => updateColumn(pg, col.id, { label: e.target.value }))}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold hover:border-neutral-200 focus:border-brand-500 focus:outline-none"
                />
                <label htmlFor={`width-${col.id}`} className="sr-only">{label} width</label>
                <select
                  id={`width-${col.id}`}
                  value={col.width}
                  onChange={(e) => applyPage((pg) => updateColumn(pg, col.id, { width: e.target.value as Column["width"] }))}
                  className="h-8 rounded-md border-0 bg-transparent px-1 text-xs text-neutral-600 hover:bg-neutral-100 max-lg:hidden"
                >
                  {COLUMN_WIDTHS.map((w) => (
                    <option key={w} value={w}>{WIDTH_LABEL[w]}</option>
                  ))}
                </select>
                <SmallButton label={`Minimize ${label}`} icon={Minimize2} onClick={() => applyPage((pg) => updateColumn(pg, col.id, { minimized: true }))} />
                <SmallButton label={`Duplicate ${label}`} icon={Copy} disabled={page.columns.length >= MAX_COLUMNS} onClick={() => applyPage((pg) => duplicateColumn(pg, col.id))} />
                <SmallButton label={`Remove ${label}`} icon={Trash2} danger disabled={page.columns.length <= 1} onClick={() => setPending({ kind: "remove-column", columnId: col.id })} />
              </div>
              {col.widgets.map((w, wi) => (
                <div key={w.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDropColumn(e, col, wi)}>
                  <WidgetCard
                    widget={w}
                    column={col}
                    columns={page.columns}
                    index={wi}
                    apps={orderedApps}
                    storage={storage}
                    onChange={(patch) => applyPage((pg) => updateWidget(pg, w.id, patch))}
                    onAsk={setPending}
                    onMove={(to, idx) => applyPage((pg) => moveWidget(pg, w.id, to, idx))}
                    onDuplicate={() => applyPage((pg) => duplicateWidget(pg, w.id))}
                  />
                </div>
              ))}
              {col.widgets.length === 0 && (
                <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500">
                  Drop a widget here
                  <button type="button" className="text-brand-700 hover:underline" onClick={() => setPanel("widgets")}>or pick one</button>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {pending && (
        <ConfirmDialog
          onCancel={() => setPending(null)}
          onConfirm={confirm}
          danger={pending.kind === "remove-widget" || pending.kind === "remove-column" || pending.kind === "remove-page" || (pending.kind === "toggle-app" && !pending.activate)}
          {...(() => {
            const colName = (id: string) => {
              const i = page.columns.findIndex((c) => c.id === id);
              return page.columns[i]?.label || `Column ${i + 1}`;
            };
            switch (pending.kind) {
              case "add-widget": {
                const open = page.columns.filter((c) => c.widgets.length < MAX_WIDGETS_PER_COLUMN && !c.minimized);
                return {
                  title: `Activate ${widgetName(pending.type)}?`,
                  confirmLabel: "Activate widget",
                  body: (
                    <div className="space-y-3">
                      <p>The {widgetName(pending.type)} widget will be added to {page.name || "this page"}.</p>
                      {open.length > 1 && (
                        <div>
                          <label htmlFor="confirm-column" className="label">Column</label>
                          <select id="confirm-column" className="input" value={pending.columnId} onChange={(e) => setPending({ ...pending, columnId: e.target.value, index: undefined })}>
                            {open.map((c) => (
                              <option key={c.id} value={c.id}>{colName(c.id)}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ),
                };
              }
              case "theme": {
                const t = getTheme(pending.slug);
                return {
                  title: `Use the ${t.name} theme?`,
                  confirmLabel: "Apply theme",
                  body: (
                    <div className="flex items-center gap-3">
                      <ThemeIcon accent={t.accent} size="lg" />
                      <p>{t.description} Only {page.name || "this page"} changes. You can revert to the last or the default theme any time.</p>
                    </div>
                  ),
                };
              }
              case "remove-widget": {
                const w = page.columns.flatMap((c) => c.widgets).find((x) => x.id === pending.widgetId);
                return { title: `Remove ${w ? widgetName(w.type) : "widget"}?`, confirmLabel: "Remove", body: <p>Anything written in it is removed too.</p> };
              }
              case "remove-column":
                return { title: `Remove ${colName(pending.columnId)}?`, confirmLabel: "Remove column", body: <p>The column and every widget in it are removed.</p> };
              case "remove-page":
                return { title: `Delete ${page.name || "this page"}?`, confirmLabel: "Delete page", body: <p>The page and all of its widgets are deleted.</p> };
              case "toggle-app": {
                const a = apps.find((x) => x.slug === pending.slug);
                return pending.activate
                  ? { title: `Activate ${a?.name}?`, confirmLabel: "Activate", body: <p>{a?.name} comes back for everyone in your workspace.</p> }
                  : { title: `Deactivate ${a?.name}?`, confirmLabel: "Deactivate", body: <p>{a?.name} is hidden for everyone in your workspace. Its data is kept, and you can activate it again.</p> };
              }
            }
          })()}
        />
      )}
    </div>
  );
}
