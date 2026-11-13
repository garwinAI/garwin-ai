import { expect, test } from "./helpers";
import { logIn, signUp } from "./helpers";

test("navigation follows the spec order", async ({ page }) => {
  await signUp(page);
  const labels = await page.getByRole("navigation", { name: "Main" }).getByRole("link").allInnerTexts();
  expect(labels.map((l) => l.trim())).toEqual([
    "Assistant",
    "Messages",
    "Calendar",
    "Apps",
    "Go to AppZone",
    "Contacts",
    "Storage",
    "Settings",
  ]);
});

test("floating Assistant opens from other pages, is honest about its state, and is hidden on the Assistant page", async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole("button", { name: "Open Assistant" })).toHaveCount(0);

  await page.goto("/calendar");
  await page.getByRole("button", { name: "Open Assistant" }).click();
  const panel = page.getByRole("dialog", { name: "Assistant" });
  await expect(panel).toBeVisible();
  await expect(panel).toBeFocused();
  // No fake replies: input is disabled and the reason is shown.
  await expect(panel.getByLabel("Message the Assistant", { exact: true })).toBeDisabled();
  await expect(panel.getByRole("status")).toContainText("isn't connected");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Assistant" })).toBeFocused();
});

test("sidebar collapse persists across reloads", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
});

test("Free plan: locked premium apps, 10 AppZone downloads, 1 GB storage", async ({ page }) => {
  await signUp(page);
  await page.goto("/apps/wordbase");
  await expect(page.getByRole("link", { name: "Upgrade to use Wordbase" })).toBeVisible();

  await page.goto("/apps/calendar");
  await page.getByRole("link", { name: "GO", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar$/);

  await page.goto("/appzone");
  await expect(page.getByText("10 free downloads on Free")).toBeVisible();

  await page.goto("/storage");
  await expect(page.getByText("1 GB")).toBeVisible();
});

test("Admin sees system health", async ({ page }) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set (run npm run db:seed first)");
  await logIn(page, email!, password!);
  await expect(page).toHaveURL(/\/assistant$/);
  await page.goto("/admin");
  await expect(page.getByRole("region", { name: "System health" })).toBeVisible();
});

test("Admin publishes dev to live with Update App, then the button is greyed out", async ({ page, request }) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set (run npm run db:seed first)");
  // The fake GitHub (tests/support/mock-providers.mjs) starts with dev one change ahead of live.
  await request.post("http://localhost:3199/github/reset");
  await logIn(page, email!, password!);
  await expect(page).toHaveURL(/\/assistant$/);

  await page.goto("/notifications");
  await expect(page.getByRole("link", { name: "App update ready to publish" }).first()).toBeVisible();

  await page.goto("/admin");
  const button = page.getByRole("button", { name: "Update App" });
  await expect(page.getByText("Add the thing")).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByText(/Update sent to the live site/)).toBeVisible();
  await expect(button).toBeDisabled();

  await page.reload();
  await expect(page.getByRole("button", { name: "Update App" })).toBeDisabled();
  await expect(page.getByText("The live site already matches dev.")).toBeVisible();

  await page.goto("/notifications");
  await expect(page.getByRole("link", { name: "App update published" }).first()).toBeVisible();
});

test("Admin Assistant edits a file on dev, and can't touch protected code", async ({ page, request }) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, "ADMIN_EMAIL / ADMIN_PASSWORD not set (run npm run db:seed first)");
  await request.post("http://localhost:3199/github/reset");
  await logIn(page, email!, password!);
  await expect(page).toHaveURL(/\/assistant$/);

  await page.goto("/admin");
  await page.getByRole("region", { name: "Tools" }).getByRole("link", { name: "Admin Assistant" }).click();
  await expect(page.getByRole("heading", { name: "Admin Assistant", level: 1 })).toBeVisible();

  // A question changes nothing.
  await page.getByLabel("What would you like to change?").fill("Question only: what is this app?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("It is a workspace app.")).toBeVisible();
  expect(await (await request.get("http://localhost:3199/github/last-dev-commit")).json()).toEqual({});

  // A change request: the fake model tries a protected file (refused) and edits README.md (saved).
  await page.getByLabel("What would you like to change?").fill("Make the welcome line say new Garwin");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Protected write refused: true.")).toBeVisible();
  await expect(page.getByText("Saved to dev")).toBeVisible();
  await expect(page.getByText("Changed: README.md")).toBeVisible();

  const commit = await (await request.get("http://localhost:3199/github/last-dev-commit")).json();
  expect(commit.message).toContain("Admin Assistant: Make the welcome line say new Garwin");
  expect(commit.files).toEqual([{ path: "README.md", mode: "100644", type: "blob", content: "# Garwin AI\n\nWelcome to the new Garwin.\n" }]);
});

test("members cannot open the Admin Assistant", async ({ page }) => {
  await signUp(page);
  await page.goto("/admin/assistant");
  await expect(page).toHaveURL(/\/assistant$/);
  await expect(page).not.toHaveURL(/\/admin/);
});

test("unknown pages show the 404 page", async ({ page }) => {
  await signUp(page);
  await page.goto("/apps/does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
