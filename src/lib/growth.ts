// Pure rules for the growth widgets: what counts as an upgrade, and the time windows.

export const PERIODS = { day: 1, week: 7, month: 30, year: 365 } as const;
export type Period = keyof typeof PERIODS;

const RANK: Record<string, number> = { free: 0, starter: 1, plus: 2, pro: 3 };
const PAYING = new Set(["trialing", "active", "past_due"]);

/**
 * An upgrade is a workspace starting a paid plan (Free → paid) or moving to a higher plan.
 * Status flips on the same plan (e.g. a retried card) and downgrades don't count.
 */
export function isUpgradeEvent(action: string, m: Record<string, unknown>): boolean {
  if (action === "subscription.plan_changed") return (RANK[String(m.to)] ?? 0) > (RANK[String(m.from)] ?? 0);
  if (action !== "subscription.synced" || !PAYING.has(String(m.status))) return false;
  const wasPaying = PAYING.has(String(m.previousStatus ?? ""));
  if (!wasPaying) return true;
  return (RANK[String(m.planId)] ?? 0) > (RANK[String(m.previousPlanId)] ?? 0);
}

/** The last `n` UTC days as "YYYY-MM-DD", oldest first, ending today. */
export function lastNDays(n: number, today: Date): string[] {
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** "1.2 GB", "340 MB", "12 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
