import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, logIn, newDevice, PASSWORD, signUp, test } from "./helpers";

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("[data-logo]").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`))).toEqual([]);
}

async function logInAdmin(page: Page) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set (run npm run db:seed first)");
  await logIn(page, email!, password!);
  await expect(page).toHaveURL(/\/assistant$/);
}

test("Admin home shows the dashboard blocks", async ({ page }) => {
  await logInAdmin(page);
  await page.goto("/admin");
  for (const name of ["System health", "Users", "Support tickets", "Messages", "Notifications", "Live activity", "Launch checklist", "App update", "All users", "AppZone apps, widgets and themes"]) {
    await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("img", { name: /users: \d+ paid, \d+ free/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "System health" }).getByText("What the app needs:")).toBeVisible(); // e2e has no tickets but e.g. payments set
  await page.getByRole("tab", { name: "Paid" }).click();
  await expect(page).toHaveURL(/itab=paid/);
  const appzone = page.getByRole("region", { name: "AppZone apps, widgets and themes" });
  await expect(appzone.getByRole("table").or(appzone.getByText(/No paid items yet/))).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("Admin finds a user, changes their status, edits and deletes them; a deleted user can't sign in", async ({ page, browser }) => {
  const person = await newDevice(browser);
  const creds = await signUp(person, { name: `Findable ${Date.now()}` });

  await logInAdmin(page);
  await page.goto("/admin");
  const users = page.getByRole("region", { name: "All users" });
  await users.getByLabel("Search users").fill(creds.email);
  await users.getByRole("button", { name: "Search" }).click();
  await expect(users.getByTestId("user-row")).toHaveCount(1);
  const row = users.getByTestId("user-row").first();
  await expect(row).toContainText(creds.name);

  // Status menu
  await row.locator("summary", { hasText: "Active" }).click();
  await row.getByRole("button", { name: "Needs attention" }).click();
  await expect(page.getByText("Status set to Needs attention.")).toBeVisible();
  await page.getByRole("link", { name: "Needs attention", exact: true }).click(); // filter
  await expect(users.getByTestId("user-row").filter({ hasText: creds.email })).toHaveCount(1);

  // Edit: private note
  await page.goto(`/admin?q=${encodeURIComponent(creds.email)}`);
  await users.getByRole("link", { name: `Edit ${creds.name}` }).click();
  await page.getByLabel("Admin note (private)").fill("Asked about team plans");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("region", { name: "Edit" }).getByText("Saved.")).toBeVisible();
  await expectNoSeriousViolations(page);

  // Delete (soft): they're signed out and can't sign back in.
  await page.getByRole("region", { name: "Details" }).locator("summary", { hasText: "Delete" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText(/User deleted/)).toBeVisible();

  await person.goto("/settings/general");
  await expect(person).toHaveURL(/\/login/);
  await logIn(person, creds.email, PASSWORD);
  await expect(person.getByText("This account isn't active. Contact Garwin AI support for help.")).toBeVisible();
});

test("Remote view: the user accepts in a pop-up, the Admin sees their account read-only, and either can end it", async ({ page, browser }) => {
  const person = await newDevice(browser);
  const creds = await signUp(person, { name: `Viewed ${Date.now()}` });

  await logInAdmin(page);
  await page.goto(`/admin?q=${encodeURIComponent(creds.email)}`);
  await page.getByRole("link", { name: `Remote view of ${creds.name}` }).click();
  await page.getByLabel(/Reason/).fill("Checking why their storage looks empty");
  await page.getByRole("button", { name: "Request remote view" }).click();
  await expect(page.getByText(`Waiting for ${creds.name} to accept your request.`)).toBeVisible();

  // The user gets the pop-up on their next page.
  await person.goto("/storage");
  const dialog = person.getByRole("dialog", { name: /is requesting permission to view your account/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Checking why their storage looks empty");
  await dialog.getByRole("button", { name: "Accept" }).click();
  await expect(person.getByText(/can view your account \(read-only\) until/)).toBeVisible();

  // The Admin now sees the banner and the sections.
  await page.reload();
  const banner = page.getByRole("alert").filter({ hasText: `ADMIN remotely viewing ${creds.name}'s account` });
  await expect(banner).toBeVisible();
  for (const section of ["Storage", "Apps", "Messages", "Notifications"]) {
    await page.getByRole("navigation", { name: "Remote view sections" }).getByRole("link", { name: section, exact: true }).click();
    await expect(page.getByRole("region", { name: section })).toBeVisible();
  }
  await expectNoSeriousViolations(page);

  // The user ends it; the Admin loses access.
  await person.getByRole("button", { name: "End remote view" }).click();
  await expect(person.getByText(/can view your account/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/couldn.t be found|not found/i).first()).toBeVisible();
});

test("Console logs events live, records to Storage, clears and closes", async ({ page, browser }) => {
  await logInAdmin(page);
  await page.goto("/apps");
  await page.getByRole("link", { name: /Console/ }).click();
  await expect(page.getByRole("heading", { name: "Console", level: 1 })).toBeVisible();
  const log = page.getByRole("log", { name: "Console output" });

  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText(/REC 0/)).toBeVisible();

  // Something happens elsewhere: a new user signs up. It appears within a few seconds.
  const name = `Console Watcher ${Date.now()}`;
  await signUp(await newDevice(browser), { name });
  await expect(log.getByText(`New sign-up: ${name}`)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Stop Recording" }).click();
  await expect(page.getByText(/Saved "Console .*\.txt" to Storage → Console recordings\./)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Your recordings" }).getByRole("link", { name: "Download" }).first()).toBeVisible();

  // View settings persist on this device.
  await page.getByText("View settings").click();
  await page.getByLabel("Color theme").selectOption("amber");
  await page.reload();
  await page.getByText("View settings").click();
  await expect(page.getByLabel("Color theme")).toHaveValue("amber");
  await expectNoSeriousViolations(page);

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(log.getByText("Waiting for events…")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/apps$/);

  // The recording is a file in the Admin's Storage.
  await page.goto("/storage");
  await page.getByRole("link", { name: "Console recordings" }).click();
  await expect(page.getByText(/^Console .*\.txt$/).first()).toBeVisible();
});

test("non-Admins can't open Console, its feed, or Admin pages", async ({ page, request }) => {
  await signUp(page);
  await page.goto("/console");
  await expect(page).toHaveURL(/\/assistant$/);
  await page.goto("/apps");
  await expect(page.getByText("Admin apps")).toHaveCount(0);
  expect((await page.request.get("/api/admin/console")).status()).toBe(404);
  // Signed out, the request never reaches the feed: it's sent to the login page.
  const anonymous = await request.get("/api/admin/console");
  expect(anonymous.url()).toMatch(/\/login$/);
  expect(await anonymous.text()).not.toContain('"lines"');
});
