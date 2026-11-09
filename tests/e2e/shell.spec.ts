import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import AxeBuilder from "@axe-core/playwright";
import { signUp } from "./helpers";

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test.describe("Settings → Apps", () => {
  test("lists installed apps with settings, deactivate and open actions", async ({ page }) => {
    await signUp(page);
    await page.goto("/settings/apps");
    const list = page.getByRole("list", { name: "Installed apps" });
    // Free plan: the five core apps.
    await expect(list.getByRole("listitem")).toHaveCount(5);
    await expect(list.getByRole("link", { name: "Calendar settings" })).toBeVisible();
    await expect(list.getByRole("button", { name: "Deactivate Calendar" })).toBeVisible();
    await expect(list.getByRole("link", { name: "Open Calendar" })).toBeVisible();
    // Assistant must always stay reachable.
    await expect(list.getByRole("button", { name: "Deactivate Assistant" })).toHaveCount(0);
  });

  test("deactivating an app hides it everywhere until reactivated", async ({ page }) => {
    await signUp(page);
    await page.goto("/settings/apps");
    await page.getByRole("button", { name: "Deactivate Calendar" }).click();
    await expect(page.getByRole("button", { name: "Activate Calendar" })).toBeVisible();

    await expect(mainNav(page).getByRole("link", { name: "Calendar" })).toHaveCount(0);
    await page.goto("/calendar");
    await expect(page.getByText("Calendar is deactivated")).toBeVisible();
    await page.goto("/apps/calendar");
    await expect(page.getByText("Deactivated for your account")).toBeVisible();

    await page.goto("/settings/apps");
    await page.getByRole("button", { name: "Activate Calendar" }).click();
    await expect(page.getByRole("button", { name: "Deactivate Calendar" })).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: "Calendar" })).toBeVisible();
  });

  test("calendar setting is saved and used", async ({ page }) => {
    await signUp(page);
    await page.goto("/settings/apps/calendar");
    await page.getByLabel("Week starts on").selectOption("monday");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status")).toHaveText("Settings saved.");

    await page.reload();
    await expect(page.getByLabel("Week starts on")).toHaveValue("monday");
    await page.goto("/calendar");
    await expect(page.getByRole("columnheader").first()).toHaveText(/Mon/);
  });
});

test("settings sections follow the spec order", async ({ page }) => {
  await signUp(page);
  await page.goto("/settings");
  const tabs = page.getByRole("navigation", { name: "Settings sections" }).getByRole("link");
  await expect(tabs).toHaveText(["General", "Payments", "Cards", "Apps", "Security", "Passwords", "IP History"]);
  await expect(tabs.first()).toHaveAttribute("aria-current", "page");
});

test("collapsed sidebar keeps accessible names", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(mainNav(page).getByRole("link", { name: "Go to AppZone" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log Out" })).toBeVisible();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("menu button opens the navigation drawer, which closes after navigating", async ({ page }) => {
    await signUp(page);
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeHidden();

    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Storage" }).click();
    await expect(page).toHaveURL(/\/storage$/);
    await expect(drawer).toBeHidden();

    await page.getByRole("button", { name: "Open menu" }).click();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("Assistant button is reachable on mobile", async ({ page }) => {
    await signUp(page);
    await page.goto("/settings/general");
    await page.getByRole("button", { name: "Open Assistant" }).click();
    await expect(page.getByRole("dialog", { name: "Assistant" })).toBeVisible();
  });
});

test.describe("accessibility (axe)", () => {
  for (const path of ["/assistant", "/calendar", "/apps", "/apps/calendar", "/settings/general", "/settings/apps", "/settings/ip-history", "/storage"]) {
    test(`no serious or critical violations on ${path}`, async ({ page }) => {
      await signUp(page);
      await page.goto(path);
      // Logotypes are exempt from WCAG contrast rules (1.4.3), so the wordmark is excluded.
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("[data-logo]").analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    });
  }
});
