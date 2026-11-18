// Icon rules (owner spec). Every app keeps ONE icon everywhere it appears:
//   - Built-in apps: a fixed background color with a white glyph (Wordbase blue + letter,
//     Codebase black + terminal, Spreadsheets tan + spreadsheet, Calculator dark grey +
//     calculator, Document Viewer dark purple + letter with an offset eye).
//   - Storage drives: the drive glyph only, no background.
//   - Page themes: a small snapshot of the site on the theme's accent color.
//   - Widgets: always grey with white writing (the widget's name).
//   - AppZone apps: the developer's uploaded icon on the item's main color.

export type IconGlyph =
  | "assistant"
  | "drive"
  | "calendar"
  | "messages"
  | "contacts"
  | "letter"
  | "terminal"
  | "spreadsheet"
  | "calculator"
  | "viewer";

/** `bg: null` = glyph only, no tile (drives). */
export type AppIconSpec = { glyph: IconGlyph; bg: string | null };

/** Garwin AI's own AppZone apps (subscribed to in AppZone, not built in). */
export const CALCULATOR_ICON: AppIconSpec = { glyph: "calculator", bg: "#404040" };
export const DOCUMENT_VIEWER_ICON: AppIconSpec = { glyph: "viewer", bg: "#3b0764" };

/** Every storage drive: the drive glyph only, no background. */
export const DRIVE_ICON: AppIconSpec = { glyph: "drive", bg: null };

/** Widgets: grey tile, white writing. */
export const WIDGET_ICON_BG = "#6b7280";

export const HEX_COLOR = /^#[0-9a-f]{6}$/;

/** White writing for a widget tile: initials, up to 3 ("Weather" -> "W", "To-do" -> "TD", "Quick links" -> "QL"). */
export function widgetIconText(name: string): string {
  const words = name.trim().split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return "W";
  return words
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export type ThemeLayout = "standard";

export type PageTheme = {
  slug: string;
  name: string;
  /** Accent color: buttons, links and the theme icon's background */
  accent: string;
  layout: ThemeLayout;
  description: string;
};

/** Page themes that come with every workspace. Garwin Blue is the default. */
export const BUILT_IN_THEMES: PageTheme[] = [
  { slug: "garwin-blue", name: "Garwin Blue", accent: "#2563eb", layout: "standard", description: "The default look: grayscale surfaces with blue for actions." },
  { slug: "graphite", name: "Graphite", accent: "#404040", layout: "standard", description: "Quiet and focused: everything in shades of grey." },
  { slug: "forest", name: "Forest", accent: "#15803d", layout: "standard", description: "Calm green accents on light surfaces." },
  { slug: "plum", name: "Plum", accent: "#7e22ce", layout: "standard", description: "Deep purple accents for a bolder workspace." },
  { slug: "sunset", name: "Sunset", accent: "#c2410c", layout: "standard", description: "Warm orange accents." },
];

export const DEFAULT_THEME = BUILT_IN_THEMES[0];

export const THEME_LAYOUTS: { value: ThemeLayout; label: string }[] = [{ value: "standard", label: "Standard" }];

export function getTheme(slug: string | null | undefined) {
  return BUILT_IN_THEMES.find((t) => t.slug === slug) ?? DEFAULT_THEME;
}
