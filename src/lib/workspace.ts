// Workspace page: columns of widgets, the app icon bar and the page theme. Pure logic, shared by
// the client editor, the server action that saves it and the tests.
//
// Fixed (owner spec): the logo, app names, widget names, theme names and the storage drive name.
// Editable: column names, column width, minimized state, widget size and widget content.
import { z } from "zod";
import { BUILT_IN_THEMES, DEFAULT_THEME } from "./app-icons";

export const MAX_COLUMNS = 3;
export const MAX_WIDGETS_PER_COLUMN = 12;

export const WIDGET_TYPES = ["clock", "weather", "todo", "notes", "messages", "notifications", "support", "quick-links", "storage"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

/** Widgets that come with every workspace. Names are fixed; content and size are not. */
export const BUILT_IN_WIDGETS: { type: WidgetType; name: string; description: string }[] = [
  { type: "clock", name: "Clock", description: "The time and date where you are." },
  { type: "weather", name: "Weather", description: "Today's weather where you are." },
  { type: "todo", name: "To-do", description: "A simple checklist." },
  { type: "notes", name: "Notes", description: "A scratchpad that saves as you type." },
  { type: "messages", name: "Messages", description: "Your latest team chats." },
  { type: "notifications", name: "Notifications", description: "What's new for you." },
  { type: "support", name: "Support", description: "Your help requests and their status." },
  { type: "quick-links", name: "My Apps", description: "Shortcuts to the apps you pick." },
  { type: "storage", name: "Storage", description: "How much of your drive is used." },
];

export const widgetName = (type: WidgetType) => BUILT_IN_WIDGETS.find((w) => w.type === type)!.name;

export const WIDGET_SIZES = ["s", "m", "l"] as const;
export const COLUMN_WIDTHS = ["narrow", "normal", "wide"] as const;

const id = z.string().regex(/^[a-z0-9]{6,24}$/);

const todoItem = z.object({ id, text: z.string().trim().min(1).max(200), done: z.boolean() });

export const widgetSettingsSchema = z.object({
  text: z.string().max(5000).optional(),
  items: z.array(todoItem).max(50).optional(),
  apps: z.array(z.string().max(40)).max(12).optional(),
  hour12: z.boolean().optional(),
  /** Weather: a city the person typed (otherwise their location is used) and the unit. */
  city: z.string().trim().max(80).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  unit: z.enum(["f", "c"]).optional(),
});
export type WidgetSettings = z.infer<typeof widgetSettingsSchema>;

const widgetSchema = z.object({
  id,
  type: z.enum(WIDGET_TYPES),
  size: z.enum(WIDGET_SIZES),
  minimized: z.boolean(),
  settings: widgetSettingsSchema,
});
export type WidgetInstance = z.infer<typeof widgetSchema>;

const columnSchema = z.object({
  id,
  label: z.string().trim().max(40),
  width: z.enum(COLUMN_WIDTHS),
  minimized: z.boolean(),
  widgets: z.array(widgetSchema).max(MAX_WIDGETS_PER_COLUMN),
});
export type Column = z.infer<typeof columnSchema>;

const themeSlug = z.string().refine((s) => BUILT_IN_THEMES.some((t) => t.slug === s), "Unknown theme.");

export const MAX_PAGES = 20;

const pageSchema = z.object({
  id,
  name: z.string().trim().min(1).max(40),
  theme: themeSlug,
  /** For "Revert to last". */
  previousTheme: themeSlug.nullable(),
  columns: z.array(columnSchema).min(1).max(MAX_COLUMNS),
});
export type WorkspacePage = z.infer<typeof pageSchema>;

export const DASHBOARD_VIEWS = ["messages", "notifications", "support"] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number] | "none";

export const layoutSchema = z.object({
  version: z.literal(2),
  pages: z.array(pageSchema).min(1).max(MAX_PAGES),
  appOrder: z.array(z.string().max(40)).max(40),
  /** Which panel shows under the Messages / Notifications / Support icons (remembered). */
  dashboardView: z.enum([...DASHBOARD_VIEWS, "none"]).default("notifications"),
});
export type WorkspaceLayout = z.infer<typeof layoutSchema>;

/** The first saved format: one page. Upgraded on read. */
const layoutV1Schema = z.object({
  version: z.literal(1),
  theme: themeSlug,
  columns: z.array(columnSchema).min(1).max(MAX_COLUMNS),
  appOrder: z.array(z.string().max(40)).max(40),
});

/** Anything with columns (a page). Column and widget edits work on this. */
type Board = { columns: Column[] };

/** Random id for columns/widgets (client and server). */
export function newId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

export function newWidget(type: WidgetType): WidgetInstance {
  const settings: WidgetSettings =
    type === "notes"
      ? { text: "" }
      : type === "todo"
        ? { items: [] }
        : type === "quick-links"
          ? { apps: ["storage", "calendar", "messages", "wordbase", "spreadsheets", "codebase"] }
          : type === "clock"
            ? { hour12: true }
            : type === "weather"
              ? { unit: "f" }
              : {};
  return { id: newId(), type, size: "m", minimized: false, settings };
}

const emptyColumn = (): Column => ({ id: newId(), label: "", width: "normal", minimized: false, widgets: [] });

export function defaultLayout(appSlugs: string[]): WorkspaceLayout {
  return {
    version: 2,
    appOrder: appSlugs,
    dashboardView: "notifications",
    pages: [
      {
        id: newId(),
        name: "Home",
        theme: DEFAULT_THEME.slug,
        previousTheme: null,
        columns: [
          { id: newId(), label: "", width: "normal", minimized: false, widgets: [newWidget("clock"), newWidget("weather"), newWidget("todo")] },
          { id: newId(), label: "", width: "wide", minimized: false, widgets: [newWidget("quick-links"), newWidget("messages"), newWidget("support")] },
        ],
      },
    ],
  };
}

/** Stored JSON -> a valid layout (upgrades old saves; falls back to the default if broken). */
export function parseLayout(stored: unknown, appSlugs: string[]): WorkspaceLayout {
  const parsed = layoutSchema.safeParse(stored);
  if (parsed.success) return { ...parsed.data, appOrder: orderApps(parsed.data.appOrder, appSlugs) };
  const v1 = layoutV1Schema.safeParse(stored);
  if (v1.success) {
    return {
      version: 2,
      dashboardView: "notifications",
      appOrder: orderApps(v1.data.appOrder, appSlugs),
      pages: [{ id: newId(), name: "Home", theme: v1.data.theme, previousTheme: null, columns: v1.data.columns }],
    };
  }
  return defaultLayout(appSlugs);
}

/** Keeps the user's order for apps they still have, appends new apps, drops removed ones. */
export function orderApps(saved: string[], available: string[]) {
  const kept = saved.filter((s) => available.includes(s));
  return [...kept, ...available.filter((a) => !kept.includes(a))];
}

// ---------------------------------------------------------------- edits (pure, return new layout)

const mapColumn = <T extends Board>(l: T, columnId: string, fn: (c: Column) => Column): T => ({
  ...l,
  columns: l.columns.map((c) => (c.id === columnId ? fn(c) : c)),
});

export function addColumn<T extends Board>(l: T): T {
  if (l.columns.length >= MAX_COLUMNS) return l;
  return { ...l, columns: [...l.columns, emptyColumn()] };
}

export function duplicateColumn<T extends Board>(l: T, columnId: string): T {
  if (l.columns.length >= MAX_COLUMNS) return l;
  const i = l.columns.findIndex((c) => c.id === columnId);
  if (i < 0) return l;
  const src = l.columns[i];
  const copy: Column = { ...src, id: newId(), label: src.label ? `${src.label} copy`.slice(0, 40) : "", minimized: false, widgets: src.widgets.map((w) => ({ ...structuredClone(w), id: newId() })) };
  return { ...l, columns: [...l.columns.slice(0, i + 1), copy, ...l.columns.slice(i + 1)] };
}

export function removeColumn<T extends Board>(l: T, columnId: string): T {
  if (l.columns.length <= 1) return l;
  return { ...l, columns: l.columns.filter((c) => c.id !== columnId) };
}

export function updateColumn<T extends Board>(l: T, columnId: string, patch: Partial<Pick<Column, "label" | "width" | "minimized">>): T {
  return mapColumn(l, columnId, (c) => ({ ...c, ...patch, label: (patch.label ?? c.label).slice(0, 40) }));
}

export function addWidget<T extends Board>(l: T, columnId: string, type: WidgetType, index?: number): T {
  return mapColumn(l, columnId, (c) => {
    if (c.widgets.length >= MAX_WIDGETS_PER_COLUMN) return c;
    const widgets = [...c.widgets];
    widgets.splice(index ?? widgets.length, 0, newWidget(type));
    return { ...c, minimized: false, widgets };
  });
}

export function findWidget(l: Board, widgetId: string) {
  for (const c of l.columns) {
    const i = c.widgets.findIndex((w) => w.id === widgetId);
    if (i >= 0) return { column: c, index: i, widget: c.widgets[i] };
  }
  return null;
}

export function updateWidget<T extends Board>(l: T, widgetId: string, patch: Partial<Pick<WidgetInstance, "size" | "minimized" | "settings">>): T {
  return { ...l, columns: l.columns.map((c) => ({ ...c, widgets: c.widgets.map((w) => (w.id === widgetId ? { ...w, ...patch } : w)) })) };
}

export function removeWidget<T extends Board>(l: T, widgetId: string): T {
  return { ...l, columns: l.columns.map((c) => ({ ...c, widgets: c.widgets.filter((w) => w.id !== widgetId) })) };
}

export function duplicateWidget<T extends Board>(l: T, widgetId: string): T {
  const found = findWidget(l, widgetId);
  if (!found || found.column.widgets.length >= MAX_WIDGETS_PER_COLUMN) return l;
  return mapColumn(l, found.column.id, (c) => {
    const widgets = [...c.widgets];
    widgets.splice(found.index + 1, 0, { ...structuredClone(found.widget), id: newId() });
    return { ...c, widgets };
  });
}

/** Move a widget to another column (or another spot in the same one). */
export function moveWidget<T extends Board>(l: T, widgetId: string, toColumnId: string, toIndex: number): T {
  const found = findWidget(l, widgetId);
  const target = l.columns.find((c) => c.id === toColumnId);
  if (!found || !target) return l;
  if (target.id !== found.column.id && target.widgets.length >= MAX_WIDGETS_PER_COLUMN) return l;
  const without = removeWidget(l, widgetId);
  return mapColumn(without, toColumnId, (c) => {
    const widgets = [...c.widgets];
    let at = toIndex;
    if (c.id === found.column.id && found.index < toIndex) at -= 1;
    widgets.splice(Math.max(0, Math.min(at, widgets.length)), 0, found.widget);
    return { ...c, widgets };
  });
}

export function moveApp(l: WorkspaceLayout, slug: string, toIndex: number): WorkspaceLayout {
  const order = l.appOrder.filter((s) => s !== slug);
  if (order.length === l.appOrder.length) return l;
  order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, slug);
  return { ...l, appOrder: order };
}

// ---------------------------------------------------------------- pages

export function getPage(l: WorkspaceLayout, pageId: string | null | undefined) {
  return l.pages.find((p) => p.id === pageId) ?? l.pages[0];
}

export function updatePage(l: WorkspaceLayout, pageId: string, fn: (p: WorkspacePage) => WorkspacePage): WorkspaceLayout {
  let changed = false;
  const pages = l.pages.map((p) => {
    if (p.id !== pageId) return p;
    const next = fn(p);
    if (next !== p) changed = true;
    return next;
  });
  return changed ? { ...l, pages } : l;
}

/** "Page 2", "Page 3"… not already taken. */
function nextPageName(l: WorkspaceLayout, base = "Page") {
  for (let n = l.pages.length + 1; ; n++) {
    const name = `${base} ${n}`;
    if (!l.pages.some((p) => p.name === name)) return name;
  }
}

/** A blank page: two empty columns, default theme. Returns the layout and the new page id. */
export function addPage(l: WorkspaceLayout): { layout: WorkspaceLayout; pageId: string | null } {
  if (l.pages.length >= MAX_PAGES) return { layout: l, pageId: null };
  const page: WorkspacePage = { id: newId(), name: nextPageName(l), theme: DEFAULT_THEME.slug, previousTheme: null, columns: [emptyColumn(), { ...emptyColumn(), width: "wide" }] };
  return { layout: { ...l, pages: [...l.pages, page] }, pageId: page.id };
}

/** Insert a copy of `source` (from this layout or the clipboard) after `afterId`, with fresh ids. */
export function pastePage(l: WorkspaceLayout, source: WorkspacePage, afterId?: string): { layout: WorkspaceLayout; pageId: string | null } {
  if (l.pages.length >= MAX_PAGES) return { layout: l, pageId: null };
  const parsed = pageSchema.safeParse(source);
  if (!parsed.success) return { layout: l, pageId: null };
  const base = parsed.data;
  let name = `${base.name} copy`.slice(0, 40);
  for (let n = 2; l.pages.some((p) => p.name === name); n++) name = `${base.name} copy ${n}`.slice(0, 40);
  const copy: WorkspacePage = {
    ...structuredClone(base),
    id: newId(),
    name,
    columns: base.columns.map((c) => ({ ...structuredClone(c), id: newId(), widgets: c.widgets.map((w) => ({ ...structuredClone(w), id: newId() })) })),
  };
  const i = afterId ? l.pages.findIndex((p) => p.id === afterId) : l.pages.length - 1;
  const pages = [...l.pages];
  pages.splice((i < 0 ? l.pages.length - 1 : i) + 1, 0, copy);
  return { layout: { ...l, pages }, pageId: copy.id };
}

export function duplicatePage(l: WorkspaceLayout, pageId: string) {
  const src = l.pages.find((p) => p.id === pageId);
  return src ? pastePage(l, src, pageId) : { layout: l, pageId: null };
}

export function renamePage(l: WorkspaceLayout, pageId: string, name: string): WorkspaceLayout {
  const clean = name.slice(0, 40);
  return updatePage(l, pageId, (p) => ({ ...p, name: clean }));
}

/** Move a page one place left (-1) or right (+1) in the Pages menu. */
export function movePage(l: WorkspaceLayout, pageId: string, by: -1 | 1): WorkspaceLayout {
  const i = l.pages.findIndex((p) => p.id === pageId);
  const j = i + by;
  if (i < 0 || j < 0 || j >= l.pages.length) return l;
  const pages = [...l.pages];
  [pages[i], pages[j]] = [pages[j], pages[i]];
  return { ...l, pages };
}

/** Put a page back to the starting widgets and columns (keeps its name and theme). */
export function resetPage(l: WorkspaceLayout, pageId: string): WorkspaceLayout {
  const fresh = defaultLayout([]).pages[0];
  return updatePage(l, pageId, (p) => ({ ...p, columns: fresh.columns }));
}

export function setDashboardView(l: WorkspaceLayout, view: DashboardView): WorkspaceLayout {
  return l.dashboardView === view ? l : { ...l, dashboardView: view };
}

export function removePage(l: WorkspaceLayout, pageId: string): WorkspaceLayout {
  if (l.pages.length <= 1) return l;
  return { ...l, pages: l.pages.filter((p) => p.id !== pageId) };
}

/** Change a page's theme, remembering the old one for "Revert to last". */
export function setPageTheme(l: WorkspaceLayout, pageId: string, slug: string): WorkspaceLayout {
  if (!BUILT_IN_THEMES.some((t) => t.slug === slug)) return l;
  return updatePage(l, pageId, (p) => (p.theme === slug ? p : { ...p, previousTheme: p.theme, theme: slug }));
}

export function revertPageTheme(l: WorkspaceLayout, pageId: string, to: "last" | "default"): WorkspaceLayout {
  return updatePage(l, pageId, (p) => {
    const target = to === "default" ? DEFAULT_THEME.slug : p.previousTheme;
    if (!target || target === p.theme) return p;
    return { ...p, theme: target, previousTheme: p.theme };
  });
}

/** Blank names aren't saved: fall back to "Page N". */
export function normalizePageNames(l: WorkspaceLayout): WorkspaceLayout {
  if (l.pages.every((p) => p.name.trim())) return l;
  return { ...l, pages: l.pages.map((p, i) => (p.name.trim() ? p : { ...p, name: i === 0 ? "Home" : `Page ${i + 1}` })) };
}

/** The column the search bar and the Apps / Widgets / Page buttons sit on: the widest open one, the middle on a tie. */
export function mainColumnId(columns: Column[]): string {
  const open = columns.filter((c) => !c.minimized);
  if (open.length === 0) return columns[0].id;
  const rank = { narrow: 0, normal: 1, wide: 2 };
  const widest = Math.max(...open.map((c) => rank[c.width]));
  const candidates = open.filter((c) => rank[c.width] === widest);
  if (candidates.length === 1) return candidates[0].id;
  if (columns.length === 3 && candidates.some((c) => c.id === columns[1].id)) return columns[1].id;
  return candidates[candidates.length - 1].id;
}

/** CSS variables that recolor buttons/accents (`brand-*`) for a theme. */
export function themeStyle(accent: string): Record<string, string> {
  return {
    "--color-brand-50": `color-mix(in srgb, ${accent} 8%, white)`,
    "--color-brand-100": `color-mix(in srgb, ${accent} 18%, white)`,
    "--color-brand-500": `color-mix(in srgb, ${accent} 85%, white)`,
    "--color-brand-600": accent,
    "--color-brand-700": `color-mix(in srgb, ${accent} 82%, black)`,
  };
}
