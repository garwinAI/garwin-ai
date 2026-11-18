import { Calculator, CalendarDays, Eye, FileText, HardDrive, MessageSquare, Sheet, Sparkles, SquareTerminal, Users, type LucideIcon } from "lucide-react";
import { WIDGET_ICON_BG, widgetIconText, type AppIconSpec, type IconGlyph } from "@/lib/app-icons";
import { cn } from "@/components/ui/cn";

const GLYPHS: Record<Exclude<IconGlyph, "viewer">, LucideIcon> = {
  assistant: Sparkles,
  drive: HardDrive,
  calendar: CalendarDays,
  messages: MessageSquare,
  contacts: Users,
  letter: FileText,
  terminal: SquareTerminal,
  spreadsheet: Sheet,
  calculator: Calculator,
};

const SIZES = {
  sm: { tile: "h-8 w-8 rounded-lg", glyph: "h-4 w-4", text: "text-[10px]", pad: "p-1" },
  md: { tile: "h-12 w-12 rounded-xl", glyph: "h-6 w-6", text: "text-xs", pad: "p-1.5" },
  lg: { tile: "h-20 w-20 rounded-2xl", glyph: "h-10 w-10", text: "text-base", pad: "p-2.5" },
  xl: { tile: "h-32 w-32 rounded-3xl", glyph: "h-16 w-16", text: "text-2xl", pad: "p-4" },
};
export type IconSize = keyof typeof SIZES;

/** Decorative: the app's name is always shown next to it. */
export function AppIcon({ spec, size = "md", dimmed, className }: { spec: AppIconSpec; size?: IconSize; dimmed?: boolean; className?: string }) {
  const s = SIZES[size];
  const glyph =
    spec.glyph === "viewer" ? (
      <span className={cn("relative inline-block", s.glyph)}>
        <FileText className="h-full w-full" />
        <Eye className="absolute -bottom-1 -right-1.5 h-[55%] w-[55%] rounded-full" style={spec.bg ? { backgroundColor: spec.bg } : undefined} />
      </span>
    ) : (
      (() => {
        const G = GLYPHS[spec.glyph];
        return <G className={s.glyph} />;
      })()
    );
  if (spec.bg === null) {
    return (
      <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center text-neutral-700", s.tile, dimmed && "opacity-40", className)}>
        {glyph}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center text-white shadow-sm", s.tile, dimmed && "opacity-40 grayscale", className)}
      style={{ backgroundColor: spec.bg }}
    >
      {glyph}
    </span>
  );
}

/** Widgets: always grey with white writing. */
export function WidgetIcon({ name, size = "md", className }: { name: string; size?: IconSize; className?: string }) {
  const s = SIZES[size];
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center font-semibold text-white", s.tile, s.text, className)} style={{ backgroundColor: WIDGET_ICON_BG }}>
      {widgetIconText(name)}
    </span>
  );
}

/**
 * Page themes: a small snapshot of the site on the accent color. With no uploaded snapshot this
 * draws the standard layout (sidebar, header, content) in white.
 */
export function ThemeIcon({ accent, snapshotUrl, size = "md", className }: { accent: string; snapshotUrl?: string | null; size?: IconSize; className?: string }) {
  const s = SIZES[size];
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center", s.tile, s.pad, className)} style={{ backgroundColor: accent }}>
      {snapshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={snapshotUrl} alt="" className="h-full w-full rounded-sm object-cover shadow" />
      ) : (
        <span className="flex h-full w-full gap-0.5 rounded-sm bg-white/95 p-0.5 shadow">
          <span className="w-[22%] rounded-[2px]" style={{ backgroundColor: accent, opacity: 0.35 }} />
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="h-1/5 rounded-[2px] bg-neutral-300" />
            <span className="flex-1 rounded-[2px] bg-neutral-200" />
          </span>
        </span>
      )}
    </span>
  );
}

/** AppZone apps: the developer's uploaded icon on the item's main color. */
export function UploadedIcon({ src, bg, size = "md", className }: { src: string; bg: string; size?: IconSize; className?: string }) {
  const s = SIZES[size];
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden", s.tile, className)} style={{ backgroundColor: bg }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />
    </span>
  );
}
