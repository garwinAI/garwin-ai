import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Full billing journey against the fake Stripe server (tests/support/fake-stripe.mjs):
// Admin sets prices → member subscribes → switches plan → payment fails → cancels.
const FAKE_STRIPE = "http://localhost:3199";

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`))).toEqual([]);
}

async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/assistant$/);
}

test("admin sets prices; a member subscribes, switches, fails a payment and cancels", async ({ page, browser }) => {
  test.setTimeout(90_000);
  // Fresh amounts each run, so Stripe prices are recreated in the (fresh) fake Stripe server.
  const cents = 10 + (Date.now() % 89);
  const starter = `9.${cents}`;
  const plus = `19.${cents}`;

  // --- Admin sets prices -----------------------------------------------------------------
  await logIn(page, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
  await page.goto("/admin");
  await page.getByRole("link", { name: "Plans & prices" }).click();
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  await expect(page.getByText("Connected in test mode")).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Starter monthly price").fill(starter);
  await page.getByLabel("Starter yearly price").fill(`99.${cents}`);
  await page.getByLabel("Plus monthly price").fill(plus);
  await page.getByLabel("Plus yearly price").fill(`199.${cents}`);
  await page.getByLabel("Pro monthly price").fill(`39.${cents}`);
  await page.getByLabel("Pro yearly price").fill(`399.${cents}`);
  await page.getByRole("button", { name: "Save prices" }).click();
  await expect(page.getByText("Prices saved.")).toBeVisible();

  await page.getByLabel("Starter monthly price").fill("0.10");
  await page.getByRole("button", { name: "Save prices" }).click();
  await expect(page.getByText("Starter monthly: Stripe's minimum charge is $0.50.")).toBeVisible();

  // --- A new member subscribes -----------------------------------------------------------
  const member = await (await browser.newContext()).newPage();
  await member.goto("/signup");
  await member.getByLabel("Name").fill("Billing Tester");
  await member.getByLabel("Email").fill(`billing-${Date.now()}@example.com`);
  await member.getByLabel("Password").fill("correct-horse-battery");
  await member.getByRole("button", { name: /create/i }).click();
  await expect(member).toHaveURL(/\/assistant$/);

  await member.goto("/settings/payments");
  const starterCard = member.getByTestId("plan-starter");
  await expect(starterCard).toContainText(`$${starter}`);
  await member.getByRole("link", { name: "Yearly" }).click();
  await expect(starterCard).toContainText(`$99.${cents}`);
  await member.getByRole("link", { name: "Monthly" }).click();
  await expect(starterCard).toContainText(`$${starter}`);

  await starterCard.getByRole("button", { name: "Upgrade to Starter" }).click();
  await expect(member.getByRole("heading", { name: "Fake Stripe Checkout" })).toBeVisible();
  await member.getByRole("button", { name: "Pay" }).click();

  await expect(member).toHaveURL(/checkout=success/);
  await expect(member.getByText("Your payment went through")).toBeVisible();
  await expect(starterCard).toContainText("Current");
  await expect(member.getByText(/Active · Renews/)).toBeVisible();
  await expect(member.getByRole("link", { name: /View FAKE-/ }).first()).toBeVisible();
  await expectAccessible(member);

  // --- Switch plans (prorated, no checkout) ----------------------------------------------
  await member.getByTestId("plan-plus").getByRole("button", { name: "Switch to Plus" }).click();
  await expect(member.getByText("You're now on Plus.")).toBeVisible();
  await member.reload();
  await expect(member.getByTestId("plan-plus")).toContainText("Current");

  // --- The saved card shows on the Cards tab ---------------------------------------------
  await member.goto("/settings/cards");
  await expect(member.getByText(/visa ending 4242/i)).toBeVisible();
  await expectAccessible(member);

  // --- A renewal payment fails ----------------------------------------------------------
  const res = await member.request.post(`${FAKE_STRIPE}/__test/fail-payment/latest`);
  expect(res.ok()).toBe(true);
  await member.goto("/settings/payments");
  await expect(member.getByRole("alert").filter({ hasText: "Your last payment failed" })).toBeVisible();
  await expect(member.getByTestId("plan-plus")).toContainText("Current"); // still has access while Stripe retries

  // --- Cancel in the billing portal → back to Free ---------------------------------------
  await member.getByRole("button", { name: "Manage billing" }).click();
  await expect(member.getByRole("heading", { name: "Fake Stripe billing portal" })).toBeVisible();
  await member.getByRole("button", { name: "Cancel subscription now" }).click();
  await expect(member).toHaveURL(/\/settings\/payments$/);
  await expect(member.getByTestId("plan-free")).toContainText("Current");
  await expect(member.getByText("Canceled", { exact: true })).toBeVisible();
});

test("the webhook rejects unsigned requests", async ({ request }) => {
  const res = await request.post("/api/stripe/webhook", { data: { type: "customer.subscription.deleted" } });
  expect(res.status()).toBe(400);
});
