// The plan limits from the product spec. The database (`plans`, `plan_apps`) is what the app
// reads at runtime; this constant is the reviewed specification it must match. A test compares
// the two, so changing limits means a migration AND an update here.
//
// Prices are NOT here: Admin controls them (`plan_prices`).

export type PlanId = "free" | "starter" | "plus" | "pro";

export type PlanSpec = {
  id: PlanId;
  name: string;
  storageGb: number;
  teamMembers: number;
  /** Lifetime free AppZone downloads; null = unlimited eligible (free-priced) downloads */
  freeAppzoneDownloads: number | null;
  /** Built-in app slugs (see src/lib/apps.ts) */
  includedApps: string[];
  isPaid: boolean;
};

const CORE_APPS = ["assistant", "storage", "calendar", "messages", "contacts"];
const STARTER_APPS = [...CORE_APPS, "wordbase", "codebase", "spreadsheets"];

export const PLAN_SPEC: Record<PlanId, PlanSpec> = {
  free: { id: "free", name: "Free", storageGb: 1, teamMembers: 0, freeAppzoneDownloads: 10, includedApps: CORE_APPS, isPaid: false },
  starter: { id: "starter", name: "Starter", storageGb: 20, teamMembers: 1, freeAppzoneDownloads: null, includedApps: STARTER_APPS, isPaid: true },
  plus: { id: "plus", name: "Plus", storageGb: 50, teamMembers: 3, freeAppzoneDownloads: null, includedApps: STARTER_APPS, isPaid: true },
  pro: { id: "pro", name: "Pro", storageGb: 100, teamMembers: 10, freeAppzoneDownloads: null, includedApps: STARTER_APPS, isPaid: true },
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "plus", "pro"];

export const GB = 1024 ** 3;

export const isPlanId = (v: string): v is PlanId => (PLAN_ORDER as string[]).includes(v);
