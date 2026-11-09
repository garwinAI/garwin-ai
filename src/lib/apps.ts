import { z } from "zod";
import { PLANS, type PlanId } from "./plans";

/** A setting an app exposes in Settings → Apps → [app] → Settings. */
export type AppSettingField = {
  name: string;
  label: string;
  hint?: string;
  type: "select";
  options: { value: string; label: string }[];
};

export type AppSettingsDefinition = {
  /** Parses stored JSON; unknown or missing values fall back to defaults. */
  schema: z.ZodType<Record<string, unknown>>;
  fields: AppSettingField[];
};

// First-party apps. Marketplace (AppZone) items come from the database in Phase 5.
export type BuiltInApp = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** Route that GO/Open takes the user to, or null when the app isn't built yet */
  href: string | null;
  /** Assistant must always stay reachable (spec), so it cannot be deactivated */
  canDeactivate: boolean;
  settings?: AppSettingsDefinition;
  color: string; // gradient used for the hero image placeholder
};

export const calendarSettingsSchema = z.object({
  weekStartsOn: z.enum(["sunday", "monday"]).catch("sunday"),
});
export type CalendarSettings = z.infer<typeof calendarSettingsSchema>;

export const BUILT_IN_APPS: BuiltInApp[] = [
  {
    slug: "assistant",
    name: "Assistant",
    tagline: "Your AI helper, everywhere.",
    description: "Ask questions, draft content and get things done across your workspace. Always one click away from the floating button.",
    href: "/assistant",
    canDeactivate: false,
    color: "from-orange-400 to-orange-600",
  },
  {
    slug: "storage",
    name: "Storage",
    tagline: "Files for you and your team.",
    description: "Upload, organize and share files. Your team shares your plan's storage, and only you can permanently delete.",
    href: "/storage",
    canDeactivate: true,
    color: "from-neutral-500 to-neutral-800",
  },
  {
    slug: "calendar",
    name: "Calendar",
    tagline: "Plan your days.",
    description: "See your schedule at a glance and keep events alongside your work.",
    href: "/calendar",
    canDeactivate: true,
    settings: {
      schema: calendarSettingsSchema,
      fields: [
        {
          name: "weekStartsOn",
          label: "Week starts on",
          type: "select",
          options: [
            { value: "sunday", label: "Sunday" },
            { value: "monday", label: "Monday" },
          ],
        },
      ],
    },
    color: "from-blue-400 to-blue-700",
  },
  {
    slug: "messages",
    name: "Messages",
    tagline: "Team and support chat.",
    description: "Talk with your team members and Garwin AI support, with notifications and tickets.",
    href: "/messages",
    canDeactivate: true,
    color: "from-sky-400 to-blue-600",
  },
  {
    slug: "contacts",
    name: "Contacts",
    tagline: "Everyone you work with.",
    description: "Keep the people you work with organized in one place.",
    href: "/contacts",
    canDeactivate: true,
    color: "from-neutral-400 to-neutral-600",
  },
  { slug: "wordbase", name: "Wordbase", tagline: "Documents, written with AI.", description: "Write and format documents with the Assistant built in.", href: null, canDeactivate: true, color: "from-blue-500 to-indigo-700" },
  { slug: "codebase", name: "Codebase", tagline: "Code with an AI pair.", description: "Write, organize and run code snippets with AI help.", href: null, canDeactivate: true, color: "from-neutral-700 to-neutral-950" },
  { slug: "spreadsheets", name: "Spreadsheets", tagline: "Numbers, made easy.", description: "Build spreadsheets with formulas and let the Assistant analyze them.", href: null, canDeactivate: true, color: "from-orange-300 to-amber-600" },
];

export function appIncludedInPlan(app: BuiltInApp, plan: PlanId) {
  return PLANS[plan].includedApps.includes(app.name);
}

export function getBuiltInApp(slug: string) {
  return BUILT_IN_APPS.find((a) => a.slug === slug);
}

/** Resolve stored settings for an app, applying defaults. Returns {} for apps without settings. */
export function resolveAppSettings(app: BuiltInApp, stored: unknown): Record<string, unknown> {
  if (!app.settings) return {};
  const parsed = app.settings.schema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : app.settings.schema.parse({});
}
