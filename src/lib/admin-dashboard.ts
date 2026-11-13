// Pure rules behind the Admin home page: ticket age colors and the user / AppZone list options.
import { z } from "zod";

/** Console logs a reminder when an unanswered support ticket reaches each of these ages. */
export const TICKET_REMINDER_HOURS = [24, 48, 72] as const;

export type TicketBuckets = { total: number; under24: number; over24: number; over48: number; over72: number };

/** Unanswered tickets grouped by age. "over24" means 24–48 h, "over48" 48–72 h, "over72" 72 h+. */
export function ticketAgeBuckets(ageHours: number[]): TicketBuckets {
  const b: TicketBuckets = { total: ageHours.length, under24: 0, over24: 0, over48: 0, over72: 0 };
  for (const h of ageHours) {
    if (h >= 72) b.over72++;
    else if (h >= 48) b.over48++;
    else if (h >= 24) b.over24++;
    else b.under24++;
  }
  return b;
}

/** The widget's color: worst age wins (light green 24 h, orange 48 h, red 72 h). */
export function ticketTone(b: TicketBuckets): "neutral" | "light-green" | "orange" | "red" {
  if (b.over72) return "red";
  if (b.over48) return "orange";
  if (b.over24) return "light-green";
  return "neutral";
}

// ---------------------------------------------------------------- user list

export const USER_SORTS = ["newest", "az", "za"] as const;
export const USER_FILTERS = ["all", "free", "paid", "pro", "team_members", "hosts", "admins", "attention", "deleted"] as const;
export type UserSort = (typeof USER_SORTS)[number];
export type UserFilter = (typeof USER_FILTERS)[number];

export const USER_FILTER_LABELS: Record<UserFilter, string> = {
  all: "All",
  free: "Free",
  paid: "Paid",
  pro: "Pro",
  team_members: "Team members",
  hosts: "Hosts",
  admins: "Admins",
  attention: "Needs attention",
  deleted: "Deleted",
};
export const USER_SORT_LABELS: Record<UserSort, string> = { newest: "Newest", az: "A–Z", za: "Z–A" };

export const userListQuery = z.object({
  q: z.string().trim().max(100).catch("").default(""),
  sort: z.enum(USER_SORTS).catch("newest").default("newest"),
  filter: z.enum(USER_FILTERS).catch("all").default("all"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});
export type UserListQuery = z.infer<typeof userListQuery>;

/** Escapes % and _ so a search for "50%" matches literally. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// ---------------------------------------------------------------- AppZone list

export const ITEM_TABS = ["free", "paid"] as const;
export const ITEM_KINDS = ["all", "app", "widget", "theme"] as const;
export const ITEM_SORTS = ["most_bought", "name", "price_high", "price_low"] as const;
export const ITEM_SORT_LABELS: Record<(typeof ITEM_SORTS)[number], string> = {
  most_bought: "Most bought",
  name: "Name",
  price_high: "Price: high to low",
  price_low: "Price: low to high",
};

export const itemListQuery = z.object({
  itab: z.enum(ITEM_TABS).catch("free").default("free"),
  ikind: z.enum(ITEM_KINDS).catch("all").default("all"),
  isort: z.enum(ITEM_SORTS).catch("most_bought").default("most_bought"),
});
export type ItemListQuery = z.infer<typeof itemListQuery>;

/** Builds a query string, dropping defaults so URLs stay short. */
export function withParams(current: Record<string, string>, changes: Record<string, string | number | null>) {
  const next = new URLSearchParams(current);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === "") next.delete(k);
    else next.set(k, String(v));
  }
  const s = next.toString();
  return s ? `?${s}` : "?";
}
