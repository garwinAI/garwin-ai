// Plan limits and features from the product spec. Prices are NOT here:
// Admin controls prices (stored in the database, wired to Stripe in Phase 2).

export type PlanId = "free" | "starter" | "plus" | "pro";

export type Plan = {
  id: PlanId;
  name: string;
  storageGb: number;
  teamMembers: number;
  /** null = unlimited eligible AppZone downloads */
  appZoneDownloads: number | null;
  includedApps: string[];
  billing: "none" | "monthly-or-yearly";
};

const CORE_APPS = ["Assistant", "Storage", "Calendar", "Messages", "Contacts"];
const PRO_APPS = [...CORE_APPS, "Wordbase", "Codebase", "Spreadsheets"];

export const PLANS: Record<PlanId, Plan> = {
  free: { id: "free", name: "Free", storageGb: 1, teamMembers: 0, appZoneDownloads: 10, includedApps: CORE_APPS, billing: "none" },
  starter: { id: "starter", name: "Starter", storageGb: 20, teamMembers: 1, appZoneDownloads: null, includedApps: PRO_APPS, billing: "monthly-or-yearly" },
  plus: { id: "plus", name: "Plus", storageGb: 50, teamMembers: 3, appZoneDownloads: null, includedApps: PRO_APPS, billing: "monthly-or-yearly" },
  pro: { id: "pro", name: "Pro", storageGb: 100, teamMembers: 10, appZoneDownloads: null, includedApps: PRO_APPS, billing: "monthly-or-yearly" },
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "plus", "pro"];
