import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, logIn, newDevice, signUp, test } from "./helpers";

// The whole billing journey against the fake Stripe server (tests/support/fake-stripe.mjs), which
// imitates Stripe's API, hosted Checkout and billing portal, and sends signed webhooks.
const FAKE_STRIPE = "http://localhost:3199";

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("[data-logo]").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

test("Admin sets prices; a host subscribes, switches, has a payment fail and cancels", async ({ page, browser }) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set (run npm run db:seed first)");
  test.setTimeout(120_000);

  // Fresh amounts every run, so each run's (fresh) fake Stripe gets new prices.
  const cents = String(10 + (Date.now() % 89));
  const starter = `9.${cents}`;

  // --- Admin sets prices -----------------------------------------------------------------
  await logIn(page, email!, password!);
  await expect(page).toHaveURL(/\/assistant$/);
  await page.goto("/admin");
  await page.getByRole("link", { name: "Plans & prices" }).click();
  await expect(page.getByRole("heading", { name: "Billing", level: 1 })).toBeVisible();
  await expect(page.getByText("Connected in test mode")).toBeVisible();
  await page.getByLabel("Starter monthly price").fill(starter);
  await page.getByLabel("Starter yearly price").fill(`99.${cents}`);
  await page.getByLabel("Plus monthly price").fill(`19.${cents}`);
  await page.getByLabel("Plus yearly price").fill(`199.${cents}`);
  await page.getByLabel("Pro monthly price").fill(`39.${cents}`);
  await page.getByLabel("Pro yearly price").fill(`399.${cents}`);
  await page.getByRole("button", { name: "Save prices" }).click();
  await expect(page.getByText("Prices saved.")).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.getByLabel("Starter monthly price").fill("0.10");
  await page.getByRole("button", { name: "Save prices" }).click();
  await expect(page.getByText("Starter monthly: Stripe's minimum charge is $0.50.")).toBeVisible();

  // --- A new host subscribes through Checkout ------------------------------------------
  const host = await newDevice(browser);
  // The public Plans section (signed out) shows Admin's prices.
  await host.goto("/");
  await expect(host.getByText(`$${starter}`).first()).toBeVisible();
  await signUp(host);
  await host.goto("/settings/payments");
  const starterCard = host.getByTestId("plan-starter");
  await expect(starterCard).toContainText(`$${starter}`);
  await host.getByRole("link", { name: "Yearly" }).click();
  await expect(starterCard).toContainText(`$99.${cents}`);
  await host.getByRole("link", { name: "Monthly" }).click();
  await expect(starterCard).toContainText(`$${starter}`);

  await starterCard.getByRole("button", { name: "Upgrade to Starter" }).click();
  await expect(host.getByRole("heading", { name: "Fake Stripe Checkout" })).toBeVisible();
  await host.getByRole("button", { name: "Pay" }).click();

  await expect(host).toHaveURL(/checkout=success/);
  await expect(host.getByText("You're on Starter.")).toBeVisible();
  await expect(starterCard).toContainText("Current plan");
  await expect(host.getByText(/Renews .* billed monthly/)).toBeVisible();
  await expect(host.getByRole("cell", { name: "Starter plan (monthly)" })).toBeVisible();
  await expectNoSeriousViolations(host);

  // --- Switch plans in the app (prorated) ----------------------------------------------
  await host.getByTestId("plan-plus").getByRole("button", { name: "Switch to Plus" }).click();
  await expect(host.getByText("You're now on Plus.")).toBeVisible();
  await expect(host.getByTestId("plan-plus")).toContainText("Current plan");

  // Plan limits follow the subscription: Plus includes 50 GB.
  await host.goto("/storage");
  await expect(host.getByText("50 GB")).toBeVisible();

  // --- The saved card shows on the Cards tab -------------------------------------------
  await host.goto("/settings/cards");
  await expect(host.getByText(/visa ending in 4242/i)).toBeVisible();
  await expectNoSeriousViolations(host);

  // --- A renewal payment fails: the plan stays while Stripe retries --------------------
  expect((await host.request.post(`${FAKE_STRIPE}/__test/fail-payment/latest`)).ok()).toBe(true);
  await host.goto("/settings/payments");
  await expect(host.getByRole("alert").filter({ hasText: "Your last payment failed" })).toBeVisible();
  await expect(host.getByTestId("plan-plus")).toContainText("Current plan");

  // --- Cancel in the billing portal: back to Free --------------------------------------
  await host.getByRole("button", { name: "Manage billing" }).click();
  await expect(host.getByRole("heading", { name: "Fake Stripe billing portal" })).toBeVisible();
  await host.getByRole("button", { name: "Cancel subscription now" }).click();
  await expect(host).toHaveURL(/\/settings\/payments$/);
  await expect(host.getByTestId("plan-free")).toContainText("Current plan");
  await expect(host.getByText("Your previous subscription was canceled.")).toBeVisible();
});

test("the Stripe webhook refuses unsigned requests", async ({ request }) => {
  const res = await request.post("/api/stripe/webhook", { data: { type: "customer.subscription.deleted" } });
  expect(res.status()).toBe(400);
});
