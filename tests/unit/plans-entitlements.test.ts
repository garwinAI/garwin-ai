import { describe, expect, it } from "vitest";
import { PLAN_SPEC } from "@/lib/plans";
import {
  decideAcquisition,
  effectivePermissions,
  grantsAccess,
  hasFreeSeat,
  splitSale,
  storageFits,
  UPLOAD_FEE_CENTS,
} from "@/lib/entitlements";
import { BUILT_IN_APPS, appIncludedInPlan } from "@/lib/apps";
import { PERMISSIONS } from "@/db/schema/accounts";

describe("plan spec", () => {
  it.each([
    ["free", 1, 0, 10, false],
    ["starter", 20, 1, null, true],
    ["plus", 50, 3, null, true],
    ["pro", 100, 10, null, true],
  ] as const)("%s: %d GB, %d team members, %s free downloads, paid=%s", (id, gb, team, downloads, paid) => {
    expect(PLAN_SPEC[id]).toMatchObject({ storageGb: gb, teamMembers: team, freeAppzoneDownloads: downloads, isPaid: paid });
  });

  it("Free has the core apps only; every paid plan adds Wordbase, Codebase and Spreadsheets", () => {
    expect(PLAN_SPEC.free.includedApps.sort()).toEqual(["assistant", "calendar", "contacts", "messages", "storage"]);
    for (const id of ["starter", "plus", "pro"] as const) {
      expect(PLAN_SPEC[id].includedApps).toEqual(expect.arrayContaining([...PLAN_SPEC.free.includedApps, "wordbase", "codebase", "spreadsheets"]));
    }
    const wordbase = BUILT_IN_APPS.find((a) => a.slug === "wordbase")!;
    expect(appIncludedInPlan(wordbase, PLAN_SPEC.free.includedApps)).toBe(false);
    expect(appIncludedInPlan(wordbase, PLAN_SPEC.starter.includedApps)).toBe(true);
  });

  it("every app named in a plan exists", () => {
    const slugs = new Set(BUILT_IN_APPS.map((a) => a.slug));
    for (const p of Object.values(PLAN_SPEC)) for (const a of p.includedApps) expect(slugs.has(a)).toBe(true);
  });
});

describe("subscriptions", () => {
  it("active, trialing and past_due grant the plan; others don't", () => {
    expect(["active", "trialing", "past_due"].every(grantsAccess)).toBe(true);
    expect(["incomplete", "unpaid", "canceled", null].some(grantsAccess)).toBe(false);
  });
});

describe("permissions", () => {
  it("owners have every permission", () => {
    expect(effectivePermissions("owner", []).size).toBe(PERMISSIONS.length);
  });
  it("members have only what was granted", () => {
    const p = effectivePermissions("member", ["storage.view"]);
    expect([...p]).toEqual(["storage.view"]);
  });
});

describe("limits", () => {
  it("storage must fit exactly", () => {
    expect(storageFits(0, 1024, 1024)).toBe(true);
    expect(storageFits(1, 1024, 1024)).toBe(false);
    expect(storageFits(0, -5, 1024)).toBe(false);
  });

  it("seats count members plus pending invitations", () => {
    expect(hasFreeSeat(0, 0, 0)).toBe(false); // Free: no team
    expect(hasFreeSeat(0, 0, 1)).toBe(true);
    expect(hasFreeSeat(0, 1, 1)).toBe(false); // the pending invite uses the Starter seat
    expect(hasFreeSeat(2, 0, 3)).toBe(true);
    expect(hasFreeSeat(9, 1, 10)).toBe(false);
  });
});

describe("AppZone acquisition", () => {
  const free = { priceCents: 0, hasPaidPurchase: false };
  it("Free plan: free items count toward a lifetime limit of 10", () => {
    expect(decideAcquisition({ ...free, freeLimit: 10, freeDownloadsUsed: 0 })).toEqual({ ok: true, countsTowardFreeLimit: true });
    expect(decideAcquisition({ ...free, freeLimit: 10, freeDownloadsUsed: 9 })).toEqual({ ok: true, countsTowardFreeLimit: true });
    expect(decideAcquisition({ ...free, freeLimit: 10, freeDownloadsUsed: 10 })).toEqual({ ok: false, reason: "free_limit_reached" });
  });

  it("paid plans: unlimited free items, not counted", () => {
    expect(decideAcquisition({ ...free, freeLimit: null, freeDownloadsUsed: 500 })).toEqual({ ok: true, countsTowardFreeLimit: false });
  });

  it("paid items need a purchase on every plan, and never use a free download", () => {
    expect(decideAcquisition({ priceCents: 499, hasPaidPurchase: false, freeLimit: null, freeDownloadsUsed: 0 })).toEqual({ ok: false, reason: "needs_purchase" });
    expect(decideAcquisition({ priceCents: 499, hasPaidPurchase: true, freeLimit: 10, freeDownloadsUsed: 10 })).toEqual({ ok: true, countsTowardFreeLimit: false });
  });

  it("15% commission, split adds up exactly", () => {
    expect(splitSale(1000)).toEqual({ platformFeeCents: 150, developerAmountCents: 850 });
    const s = splitSale(999);
    expect(s.platformFeeCents + s.developerAmountCents).toBe(999);
  });

  it("upload fees match the spec", () => {
    expect(UPLOAD_FEE_CENTS).toEqual({ app: 3999, theme: 2999, widget: 1999 });
  });
});
