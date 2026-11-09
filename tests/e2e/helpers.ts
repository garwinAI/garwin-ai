import { expect, type Page } from "@playwright/test";

export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.garwinai.dev`;

export async function signUp(page: Page, opts: { name?: string; email?: string; password?: string } = {}) {
  const creds = {
    name: opts.name ?? "E2E Tester",
    email: opts.email ?? uniqueEmail("user"),
    password: opts.password ?? "correct-horse-battery",
  };
  await page.goto("/signup");
  await page.getByLabel("Name").fill(creds.name);
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: "Create free account" }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  return creds;
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}
