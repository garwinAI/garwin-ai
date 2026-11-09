import { describe, expect, it } from "vitest";
import { PLANS } from "@/lib/plans";
import { resolveEntitlements } from "@/lib/entitlements";
import { BUILT_IN_APPS, appIncludedInPlan } from "@/lib/apps";

describe("plan limits match the product spec", () => {
  it.each([
    ["free", 1, 0, 10],
    ["starter", 20, 1, null],
    ["plus", 50, 3, null],
    ["pro", 100, 10, null],
  ] as const)("%s: %d GB, %d team members, %s downloads", (id, gb, team, downloads) => {
    expect(PLANS[id].storageGb).toBe(gb);
    expect(PLANS[id].teamMembers).toBe(team);
    expect(PLANS[id].appZoneDownloads).toBe(downloads);
  });

  it("Free has no Wordbase/Codebase/Spreadsheets; Starter does", () => {
    const wordbase = BUILT_IN_APPS.find((a) => a.slug === "wordbase")!;
    expect(appIncludedInPlan(wordbase, "free")).toBe(false);
    expect(appIncludedInPlan(wordbase, "starter")).toBe(true);
  });
});

describe("resolveEntitlements", () => {
  it("hosts use their own plan and can manage billing and delete", () => {
    const e = resolveEntitlements({ id: "u-1", plan: "plus", hostId: null });
    expect(e.plan.id).toBe("plus");
    expect(e.canManageBilling).toBe(true);
    expect(e.canPermanentlyDelete).toBe(true);
  });

  it("team members inherit the host plan, not their own", () => {
    const e = resolveEntitlements({ id: "u-1", plan: "free", hostId: "host-1" }, "pro");
    expect(e.plan.id).toBe("pro");
    expect(e.isTeamMember).toBe(true);
  });

  it("team members cannot permanently delete or manage billing", () => {
    const e = resolveEntitlements({ id: "u-1", plan: "free", hostId: "host-1" }, "pro");
    expect(e.canPermanentlyDelete).toBe(false);
    expect(e.canManageBilling).toBe(false);
    expect(e.canManageApps).toBe(false);
  });

  it("team members share the host's account", () => {
    expect(resolveEntitlements({ id: "u-1", plan: "free", hostId: "host-1" }, "pro").accountId).toBe("host-1");
    expect(resolveEntitlements({ id: "u-1", plan: "free", hostId: null }).accountId).toBe("u-1");
  });

  it("refuses to guess a team member's plan without the host plan", () => {
    expect(() => resolveEntitlements({ id: "u-1", plan: "free", hostId: "host-1" })).toThrow();
  });
});
