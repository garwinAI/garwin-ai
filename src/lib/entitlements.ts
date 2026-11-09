// Pure entitlement rules (no database). The server-side service in
// src/server/services/entitlements.ts loads the data and applies these rules; unit tests cover
// them directly. UI may use the results to hide/disable things, but every rule is enforced again
// on the server before any change is made.
import { PERMISSIONS, type Permission } from "@/db/schema/accounts";
import type { PlanId } from "./plans";

export type EntitledPlan = {
  id: PlanId;
  name: string;
  storageBytes: number;
  storageGb: number;
  teamMemberLimit: number;
  /** Lifetime free AppZone downloads; null = unlimited */
  freeAppzoneDownloadLimit: number | null;
  includedApps: string[];
  isPaid: boolean;
};

/** Subscription statuses that grant the plan. past_due keeps access while Stripe retries payment. */
export const ENTITLING_STATUSES = ["trialing", "active", "past_due"] as const;

export function grantsAccess(status: string | null | undefined): boolean {
  return (ENTITLING_STATUSES as readonly string[]).includes(status ?? "");
}

/** Owners have every permission. Members have exactly what the host granted. */
export function effectivePermissions(role: "owner" | "member", granted: Permission[]): Set<Permission> {
  return new Set(role === "owner" ? PERMISSIONS : granted);
}

export function storageFits(usedBytes: number, addBytes: number, limitBytes: number): boolean {
  return addBytes >= 0 && usedBytes + addBytes <= limitBytes;
}

/** Seats used = current team members + open (unexpired, unaccepted, unrevoked) invitations. */
export function hasFreeSeat(members: number, openInvitations: number, limit: number): boolean {
  return members + openInvitations < limit;
}

export type AcquisitionDecision =
  | { ok: true; countsTowardFreeLimit: boolean }
  | { ok: false; reason: "needs_purchase" | "free_limit_reached" };

/**
 * May the account acquire this AppZone item?
 *  - Paid items always need a completed purchase (any plan may buy; buying doesn't use a free download).
 *  - Free items: unlimited on plans without a limit; otherwise up to the LIFETIME limit.
 */
export function decideAcquisition(input: {
  priceCents: number;
  hasPaidPurchase: boolean;
  freeLimit: number | null;
  freeDownloadsUsed: number;
}): AcquisitionDecision {
  if (input.priceCents > 0) {
    return input.hasPaidPurchase ? { ok: true, countsTowardFreeLimit: false } : { ok: false, reason: "needs_purchase" };
  }
  if (input.freeLimit === null) return { ok: true, countsTowardFreeLimit: false };
  if (input.freeDownloadsUsed >= input.freeLimit) return { ok: false, reason: "free_limit_reached" };
  return { ok: true, countsTowardFreeLimit: true };
}

/** Garwin AI's 15% commission, rounded to the nearest cent (matches the DB constraint). */
export function splitSale(amountCents: number) {
  const platformFeeCents = Math.round(amountCents * 0.15);
  return { platformFeeCents, developerAmountCents: amountCents - platformFeeCents };
}

export const UPLOAD_FEE_CENTS = { app: 3999, theme: 2999, widget: 1999 } as const;
