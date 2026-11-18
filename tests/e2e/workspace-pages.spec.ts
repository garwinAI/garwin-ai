import AxeBuilder from "@axe-core/playwright";
import { expect, signUp, test } from "./helpers";

async function noSeriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("[data-logo]").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

test("workspace: widgets need confirming, pages appear in the menu, themes are per page", async ({ page }) => {
  await signUp(page);
  await page.goto("/workspace");
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await expect(page.getByRole("search")).toBeVisible();
  await noSeriousViolations(page);

  // Widgets: tapping one asks first.
  await page.getByRole("button", { name: "Widgets", exact: true }).click();
  await page.getByRole("region", { name: "Widgets" }).getByRole("button", { name: /^To-do/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Activate To-do?");
  await page.getByRole("button", { name: "Activate widget" }).click();
  await expect(page.getByRole("article", { name: "To-do widget" })).toHaveCount(2);

  // Dashboard: Messages / Notifications / Support views switch and are remembered.
  await page.getByRole("tab", { name: /Support/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("No help requests");
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tab", { name: /Support/ })).toHaveAttribute("aria-selected", "true");

  // Pages: a new blank page shows up under Pages in the menu.
  await page.getByRole("button", { name: "Page menu" }).click();
  await page.getByRole("button", { name: "Add new page", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Page 2" })).toBeVisible();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Page 2" })).toBeVisible();

  // Themes: confirm, then revert to default.
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  await page.getByRole("button", { name: /^Forest/ }).click();
  await page.getByRole("button", { name: "Apply theme" }).click();
  await expect(page.getByText(/Forest theme/)).toBeVisible();
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  await page.getByRole("button", { name: "Revert to default" }).click();
  await expect(page.getByText(/Garwin Blue theme/)).toBeVisible();
});

test("AppZone: anyone can apply to be a developer; included widgets and themes are listed", async ({ page }) => {
  await signUp(page);
  await page.goto("/appzone");
  await expect(page.getByRole("list", { name: "Included widgets" })).toContainText("Clock");
  await expect(page.getByRole("list", { name: "Included themes" })).toContainText("Garwin Blue");
  await noSeriousViolations(page);
  await page.goto("/appzone/developer");
  await expect(page.getByText("Fees are taken only when Admin approves")).toBeVisible();
  await page.getByLabel("Developer or company name").fill("Test Dev Co");
  await page.getByLabel("What do you plan to build?").fill("Widgets that help small teams plan their week.");
  await page.getByRole("button", { name: "Apply to be a developer" }).click();
  await expect(page.getByText("Application in review")).toBeVisible();
  await noSeriousViolations(page);
});
