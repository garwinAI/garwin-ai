import { describe, expect, it } from "vitest";
import { BUILT_IN_APPS, getBuiltInApp, resolveAppSettings } from "@/lib/apps";
import { MAIN_NAV, visibleNav } from "@/components/shell/nav";

describe("built-in apps", () => {
  it("Assistant can never be deactivated (must stay reachable)", () => {
    expect(getBuiltInApp("assistant")?.canDeactivate).toBe(false);
  });

  it("every app with a route has a unique slug", () => {
    const slugs = BUILT_IN_APPS.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("calendar settings default to Sunday and ignore bad stored values", () => {
    const calendar = getBuiltInApp("calendar")!;
    expect(resolveAppSettings(calendar, undefined)).toEqual({ weekStartsOn: "sunday" });
    expect(resolveAppSettings(calendar, { weekStartsOn: "monday" })).toEqual({ weekStartsOn: "monday" });
    expect(resolveAppSettings(calendar, { weekStartsOn: "friday", injected: true })).toEqual({ weekStartsOn: "sunday" });
  });

  it("apps without settings resolve to an empty object", () => {
    expect(resolveAppSettings(getBuiltInApp("messages")!, { anything: 1 })).toEqual({});
  });
});

describe("navigation", () => {
  it("follows the spec order", () => {
    expect(MAIN_NAV.map((i) => i.label)).toEqual([
      "Assistant", "Messages", "Calendar", "Apps", "Go to AppZone", "Contacts", "Storage", "Settings",
    ]);
  });

  it("hides deactivated apps but always keeps Apps, AppZone and Settings", () => {
    const labels = visibleNav(["assistant", "messages"], false).map((i) => i.label);
    expect(labels).toEqual(["Assistant", "Messages", "Apps", "Go to AppZone", "Settings"]);
  });

  it("adds Admin only for admins", () => {
    expect(visibleNav([], true).at(-1)?.label).toBe("Admin");
    expect(visibleNav([], false).some((i) => i.label === "Admin")).toBe(false);
  });
});
