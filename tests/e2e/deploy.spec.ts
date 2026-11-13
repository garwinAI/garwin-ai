import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, logIn, signUp, test } from "./helpers";

// Settings → General → Deploy New App Version, and Admin → Launch checklist.
// GitHub is the fake in tests/support/mock-providers.mjs: dev starts one change ahead of live.
const FAKE_GITHUB = "http://localhost:3199/github";

/** "YYYY-MM-DDTHH:MM" in the browser's (= this machine's) time zone, for datetime-local inputs. */
function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("[data-logo]").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

async function logInAdmin(page: Page) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set (run npm run db:seed first)");
  await logIn(page, email!, password!);
  await expect(page).toHaveURL(/\/assistant$/);
}

test("Admin schedules, cancels, sees a failed schedule, then deploys now", async ({ page, request }) => {
  await request.post(`${FAKE_GITHUB}/reset`);
  await logInAdmin(page);
  await page.goto("/settings/general");
  const section = page.getByRole("region", { name: "Deploy New App Version" });
  await expect(section).toBeVisible();
  await expect(section.getByText(/1 change waiting/)).toBeVisible();
  await expect(section.getByText("Add the thing")).toBeVisible();
  await expectNoSeriousViolations(page);

  // Too soon is refused.
  await section.getByLabel("Schedule for later").fill(localInput(new Date(Date.now() + 60_000)));
  await section.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(section.getByText(/at least 5 minutes from now/)).toBeVisible();

  // Schedule, then reschedule: only one schedule exists.
  await section.getByLabel("Schedule for later").fill(localInput(new Date(Date.now() + 2 * 86_400_000)));
  await section.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(section.getByText(/Scheduled\. The update goes live/)).toBeVisible();
  await section.getByLabel("Schedule for later").fill(localInput(new Date(Date.now() + 3 * 86_400_000)));
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/settings/general")),
    section.getByRole("button", { name: "Schedule", exact: true }).click(),
  ]);
  await page.reload();
  await expect(section.getByText(/Scheduled: version ddddddd goes live at/)).toHaveCount(1);

  await section.getByRole("button", { name: "Cancel schedule" }).click();
  await expect(section.getByText("Schedule canceled.")).toBeVisible();
  await page.reload();
  await expect(section.getByText(/Scheduled: version/)).toHaveCount(0);

  // The workflow couldn't publish: the app shows it, and it can be dismissed.
  await section.getByLabel("Schedule for later").fill(localInput(new Date(Date.now() + 86_400_000)));
  await section.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(section.getByText(/Scheduled\. The update goes live/)).toBeVisible();
  await request.post(`${FAKE_GITHUB}/fail-schedule`);
  await page.reload();
  await expect(section.getByRole("alert").filter({ hasText: "couldn't go live" })).toBeVisible();
  await section.getByRole("button", { name: "Dismiss" }).click();
  await expect(section.getByText("Dismissed.")).toBeVisible();

  // Deploy Now publishes immediately.
  await section.getByRole("button", { name: "Deploy Now" }).click();
  await expect(section.getByText(/Update sent to the live site/)).toBeVisible();
  await page.reload();
  await expect(section.getByText("The live site already matches dev.")).toBeVisible();
  await expect(section.getByRole("button", { name: "Deploy Now" })).toBeDisabled();
  await expect(section.getByRole("button", { name: "Schedule", exact: true })).toBeDisabled();
});

test("only Admins see Deploy New App Version", async ({ page }) => {
  await signUp(page);
  await page.goto("/settings/general");
  await expect(page.getByRole("region", { name: "Profile" })).toBeVisible();
  await expect(page.getByText("Deploy New App Version")).toHaveCount(0);
});

test("Admin launch checklist: automatic steps follow settings, manual steps can be ticked", async ({ page }) => {
  await logInAdmin(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Launch checklist" })).toBeVisible();
  await page.getByRole("link", { name: "Open launch checklist" }).click();
  await expect(page.getByRole("heading", { name: "Launch checklist", level: 1 })).toBeVisible();

  // The e2e server has (fake) Stripe keys and a Claude key, so those steps are done automatically.
  await expect(page.getByTestId("launch-stripe_keys")).toContainText("Automatic: done");
  await expect(page.getByTestId("launch-assistant_key")).toContainText("Automatic: done");
  await expect(page.getByTestId("launch-stripe_live").getByText("Automatic", { exact: true })).toBeVisible(); // test keys, not live

  const legal = page.getByTestId("launch-legal");
  await legal.getByRole("button", { name: /Mark done/ }).click();
  await expect(legal.getByRole("button", { name: /Undo/ })).toBeVisible();
  await expect(legal).toContainText("Marked done");
  await expectNoSeriousViolations(page);
  await legal.getByRole("button", { name: /Undo/ }).click();
  await expect(legal.getByRole("button", { name: /Mark done/ })).toBeVisible();
});
