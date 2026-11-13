import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expect, logIn, newDevice, signUp, test } from "./helpers";

// The full billing journey against the fake Stripe server (tests/support/fake-stripe.mjs):
// Admin sets prices -> a host subscribes -> switches plan -> a payment fails -> cancels.
const FAKE_STRIPE = "http://localhost:3199";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("[data-logo]").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

test("admin sets prices; a host subscribes, switches plan, fails a payment and cancels", async ({ page, browser }) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set (run npm run db:seed first)");
  test.setTimeout(120_000);

  // Fresh amounts each run, so the prices are created in this run's (empty) fake Stripe.
  const cents = String(10 + (Date.now() % 89));
  const starter = `9.${cents}`;

  // --- Admin sets prices
  await logIn(page, email!, password!);
  await expect(page).toHaveURL(/\/assistant$/);
  await page.goto("/admin");
  await page.getByRole("link", { name: "Open Billing" }).click();
  await expect(page.getByRole("heading", { name: "Billing", level: 1 })).toBeVisible();
  await expect(page.getByText("Connected in test mode")).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel("Starter monthly price").fill(starter);
  await page.getByLabel("Starter yearly price").fill(`99.${cents}`);
  await page.getByLabel("Plus monthly price").fill(`19.${cents}`);
  await page.getByLabel("Plus yearly price").fill(`199.${cents}`);
  await page.getByLabel("Pro monthly price").fill(`39.${cents}`);
  await page.getByLabel("Pro yearly price").fill(`399.${cents}`);
  await page.getByRole("button", { name: "Save prices" }).click();
  await expect(page.getByText("Prices saved.")).toBeVisible();

  await page.getByLabel("Starter monthly price").fill("0.10");
  await page.getByRole("button", { name: "Save prices" }).click();
  await expect(page.getByText("Starter monthly: Stripe's minimum charge is $0.50.")).toBeVisible();

  // --- A new host subscribes
  const host = await newDevice(browser);
  await signUp(host, { name: "Billing Tester" });
  await host.goto("/settings/payments");
  const starterCard = host.getByTestId("plan-starter");
  await expect(host.getByTestId("plan-free")).toContainText("Current plan");
  await expect(starterCard).toContainText(`$${starter}`);
  await host.getByRole("link", { name: "Yearly" }).click();
  await expect(starterCard).toContainText(`$99.${cents}`);
  await expect(starterCard).toContainText(/Save \d+% vs monthly/);
  await host.getByRole("link", { name: "Monthly" }).click();
  await expect(starterCard).toContainText(`$${starter}`);
  await expectAccessible(host);

  await starterCard.getByRole("button", { name: "Upgrade to Starter" }).click();
  await expect(host.getByRole("heading", { name: "Fake Stripe Checkout" })).toBeVisible();
  await host.getByRole("button", { name: "Pay" }).click();

  await expect(host).toHaveURL(/checkout=success/);
  await expect(host.getByText("Your payment went through and you're on Starter.")).toBeVisible();
  await expect(starterCard).toContainText("Current plan");
  await expect(host.getByText(/Active · Renews/)).toBeVisible();
  const history = host.getByRole("region", { name: "Billing history" });
  await expect(history.getByText("Paid")).toHaveCount(1);
  await expect(history).toContainText(`$${starter}`);
  await expectAccessible(host);

  // --- Switch plans (prorated, no checkout page)
  await host.getByTestId("plan-plus").getByRole("button", { name: "Switch to Plus" }).click();
  await expect(host.getByText("You're now on Plus.")).toBeVisible();
  await expect(host.getByTestId("plan-plus")).toContainText("Current plan");

  // --- The saved card shows on the Cards tab (brand and last four digits only)
  await host.goto("/settings/cards");
  await expect(host.getByText(/visa ending 4242/i)).toBeVisible();
  await expectAccessible(host);

  // --- A renewal payment fails: access continues while Stripe retries
  const res = await host.request.post(`${FAKE_STRIPE}/__test/fail-payment/latest`);
  expect(res.ok()).toBe(true);
  await host.goto("/settings/payments");
  await expect(host.getByRole("alert").filter({ hasText: "Your last payment failed" })).toBeVisible();
  await expect(host.getByTestId("plan-plus")).toContainText("Current plan");
  await expect(history.getByText("Failed")).toHaveCount(1);

  // --- Cancel in the billing portal -> back to Free
  await host.getByRole("button", { name: "Manage billing" }).click();
  await expect(host.getByRole("heading", { name: "Fake Stripe billing portal" })).toBeVisible();
  await host.getByRole("button", { name: "Cancel subscription now" }).click();
  await expect(host).toHaveURL(/\/settings\/payments$/);
  await expect(host.getByTestId("plan-free")).toContainText("Current plan");
  await expect(host.getByText("Canceled", { exact: true })).toBeVisible();
});

test("a plan can't be claimed by visiting the success URL", async ({ page }) => {
  await signUp(page);
  await page.goto("/settings/payments?checkout=success&session_id=cs_test_made_up_by_the_visitor");
  await expect(page.getByTestId("plan-free")).toContainText("Current plan");
  await expect(page.getByTestId("plan-starter")).not.toContainText("Current plan");
});

test("the webhook rejects unsigned requests", async ({ request }) => {
  const res = await request.post("/api/stripe/webhook", { data: { id: "evt_fake", type: "customer.subscription.deleted", data: { object: {} } } });
  expect(res.status()).toBe(400);
});
