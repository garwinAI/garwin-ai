import { expect, test } from "@playwright/test";
import { logIn, signUp } from "./helpers";

test("health endpoint is public and reports the database", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: "ok", checks: { database: "ok" } });
});

test("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/settings/general");
  await expect(page).toHaveURL(/\/login$/);
});

test("sign up, log out, failed login keeps email, log back in", async ({ page }) => {
  const { email, password } = await signUp(page);

  await page.getByRole("button", { name: "Log Out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await logIn(page, email, "wrong-password-123");
  await expect(page.locator("form [role=alert]")).toHaveText("Incorrect email or password.");
  await expect(page.getByLabel("Email")).toHaveValue(email);

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/assistant$/);
});

test("signing up twice with the same email is rejected", async ({ page, browser }) => {
  const { email } = await signUp(page);
  const other = await browser.newPage();
  await other.goto("/signup");
  await other.getByLabel("Name").fill("Someone");
  await other.getByLabel("Email").fill(email);
  await other.getByLabel("Password").fill("another-password-1");
  await other.getByRole("button", { name: "Create free account" }).click();
  await expect(other.locator("form [role=alert]")).toHaveText("An account with that email already exists.");
  await other.close();
});

test("changing password signs out other sessions", async ({ page, browser }) => {
  const { email, password } = await signUp(page);

  const second = await browser.newPage();
  await logIn(second, email, password);
  await expect(second).toHaveURL(/\/assistant$/);

  await page.goto("/settings/passwords");
  await page.getByLabel("Current password").fill(password);
  await page.getByLabel("New password", { exact: true }).fill("brand-new-password-9");
  await page.getByLabel("Confirm new password").fill("brand-new-password-9");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password changed");

  // This device stays signed in; the other one is logged out.
  await page.goto("/storage");
  await expect(page).toHaveURL(/\/storage$/);
  await second.goto("/storage");
  await expect(second).toHaveURL(/\/login$/);
  // ...and can sign in again with the new password (no redirect loop, cookie was cleared).
  await logIn(second, email, "brand-new-password-9");
  await expect(second).toHaveURL(/\/assistant$/);
  await second.close();
});

test("IP history records sign-ins", async ({ page }) => {
  await signUp(page);
  await page.goto("/settings/ip-history");
  await expect(page.getByRole("cell", { name: "Success" }).first()).toBeVisible();
});
