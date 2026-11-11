import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const unique = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

test("health check is public and reports the database", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: "ok", database: "ok" });
});

test("landing page has no accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your AI-powered workspace" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`))).toEqual([]);
});

test("signed-out visitors are sent to log in", async ({ page }) => {
  await page.goto("/assistant");
  await expect(page).toHaveURL(/\/login$/);
});

test("sign up, log out, log back in", async ({ page }) => {
  const email = unique();
  const password = "correct-horse-battery";

  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /create/i }).click();
  await expect(page).toHaveURL(/\/assistant$/);

  // Members can't reach Admin.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/assistant$/);

  await page.getByRole("button", { name: "Log Out" }).first().click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/assistant$/);
});

test("signing up twice with the same email is refused", async ({ page }) => {
  const email = unique();
  const signUp = async () => {
    await page.goto("/signup");
    await page.getByLabel("Name").fill("Dup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-battery");
    await page.getByRole("button", { name: /create/i }).click();
  };
  await signUp();
  await expect(page).toHaveURL(/\/assistant$/);
  await page.context().clearCookies();
  await signUp();
  await expect(page.getByText("An account with that email already exists.")).toBeVisible();
});
