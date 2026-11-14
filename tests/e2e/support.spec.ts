import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, logIn, newDevice, signUp, test } from "./helpers";

// Support tickets with Auto Pilot. The fake AI (tests/support/mock-providers.mjs) closes how-to
// questions and escalates anything mentioning a refund.

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("[data-logo]").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.html.slice(0, 120)}`))).toEqual([]);
}

async function logInAdmin(page: Page) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set (run npm run db:seed first)");
  await logIn(page, email!, password!);
  await expect(page).toHaveURL(/\/assistant$/);
}

async function setAutopilot(page: Page, state: "On" | "Off") {
  await page.goto("/admin");
  const block = page.getByRole("region", { name: "Admin Assistant" });
  const button = block.getByRole("button", { name: state, exact: true });
  if (await button.isEnabled()) await button.click();
  await expect(block.getByTestId("autopilot-status")).toContainText(state === "On" ? "Auto Pilot has been running since" : "Auto Pilot turned off on");
}

test("Auto Pilot answers support tickets: closes simple ones, escalates refunds to Admins", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await logInAdmin(page);
  await setAutopilot(page, "On");
  await expectNoSeriousViolations(page);

  const customer = await newDevice(browser);
  await signUp(customer, { name: `Customer ${Date.now()}` });

  // A simple question is answered and resolved.
  await customer.getByRole("link", { name: "Help & support" }).click();
  await customer.getByLabel("Subject").fill("Changing plans");
  await customer.getByLabel("How can we help?").fill("How do I change my plan?");
  await customer.getByRole("button", { name: "Send to support" }).click();
  await expect(customer.getByText("You can change your plan any time in Settings → Payments.")).toBeVisible({ timeout: 20_000 });
  await expect(customer.getByText("Resolved", { exact: true })).toBeVisible();
  await expect(customer.getByText("Garwin AI Support (Auto Pilot)").first()).toBeVisible();
  await expectNoSeriousViolations(customer);

  // A refund request is answered and escalated.
  const subject = `Refund ${Date.now()}`;
  await customer.goto("/support");
  await customer.getByLabel("Subject").fill(subject);
  await customer.getByLabel("How can we help?").fill("I was charged twice, I want a refund.");
  await customer.getByRole("button", { name: "Send to support" }).click();
  await expect(customer.getByText("A person from Garwin AI will reply here.")).toBeVisible({ timeout: 20_000 });

  // The Admin finds it under Escalated and answers.
  await page.goto("/admin/support?view=escalated");
  await page.getByRole("link", { name: subject }).click();
  await expect(page.getByText("Escalated", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Your reply").fill("We've refunded the duplicate charge.");
  await page.getByRole("button", { name: "Send and resolve" }).click();
  await expect(page.getByText("Sent and resolved.")).toBeVisible();
  await expectNoSeriousViolations(page);

  await customer.reload();
  await expect(customer.getByText("We've refunded the duplicate charge.")).toBeVisible();

  // Console shows what happened.
  await page.goto("/console");
  await expect(page.getByRole("log", { name: "Console output" }).getByText(`Auto Pilot answered and ESCALATED "${subject}"`)).toBeVisible();

  await setAutopilot(page, "Off");
});

test("Admin home widgets and the Admin Assistant chat log", async ({ page }) => {
  await logInAdmin(page);
  await page.goto("/admin");
  for (const name of ["Plan upgrades & revenue", "Users", "Server", "Admin Assistant", "Calendar", "Support tickets", "Messages", "Notifications"]) {
    await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
  }
  const growth = page.getByRole("region", { name: "Plan upgrades & revenue" });
  for (const label of ["Today", "Week", "Month", "Year"]) await expect(growth.getByText(new RegExp(`^${label} · last`))).toBeVisible();
  await expect(page.getByRole("img", { name: /Last 14 days: \d+ new users, \d+ upgrades/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Server" }).getByText(/Online · /)).toBeVisible();
  await expect(page.getByRole("region", { name: "Calendar" }).getByText("Coming up")).toBeVisible();

  await page.getByRole("region", { name: "Admin Assistant" }).getByRole("link", { name: "View chat log" }).click();
  await expect(page.getByRole("heading", { name: "Admin Assistant chat log", level: 1 })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("users can't see each other's tickets or the Admin support pages", async ({ page, browser }) => {
  await signUp(page);
  await page.goto("/support");
  await page.getByLabel("Subject").fill("Private question");
  await page.getByLabel("How can we help?").fill("Only I should see this.");
  await page.getByRole("button", { name: "Send to support" }).click();
  await expect(page).toHaveURL(/\/support\/[0-9a-f-]{36}$/);
  const url = page.url();

  const other = await newDevice(browser);
  await signUp(other);
  await other.goto(url);
  await expect(other.getByText(/not found|couldn.t be found/i).first()).toBeVisible();
  await other.goto("/admin/support");
  await expect(other).toHaveURL(/\/assistant$/);
});
