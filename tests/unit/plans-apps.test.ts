import { describe, expect, it } from "vitest";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { BUILT_IN_APPS, appIncludedInPlan, getBuiltInApp } from "@/lib/apps";

describe("plans", () => {
  it("grows storage and team size with each tier", () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      expect(PLANS[PLAN_ORDER[i]].storageGb).toBeGreaterThan(PLANS[PLAN_ORDER[i - 1]].storageGb);
      expect(PLANS[PLAN_ORDER[i]].teamMembers).toBeGreaterThan(PLANS[PLAN_ORDER[i - 1]].teamMembers);
    }
  });

  it("limits AppZone downloads only on Free", () => {
    expect(PLANS.free.appZoneDownloads).toBe(10);
    expect(PLANS.pro.appZoneDownloads).toBeNull();
  });
});

describe("built-in apps", () => {
  it("has unique slugs", () => {
    expect(new Set(BUILT_IN_APPS.map((a) => a.slug)).size).toBe(BUILT_IN_APPS.length);
  });

  it("includes core apps on Free and pro apps only on paid plans", () => {
    expect(appIncludedInPlan(getBuiltInApp("assistant")!, "free")).toBe(true);
    expect(appIncludedInPlan(getBuiltInApp("wordbase")!, "free")).toBe(false);
    expect(appIncludedInPlan(getBuiltInApp("wordbase")!, "starter")).toBe(true);
  });
});
