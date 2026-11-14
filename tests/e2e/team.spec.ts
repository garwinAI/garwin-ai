import type { Browser, Page } from "@playwright/test";
import { expect, grantPlan, logIn, mailsTo, newDevice, PASSWORD, signUp, test, uniqueEmail, uniquePhone, waitForLink } from "./helpers";

const main = (page: Page) => page.getByRole("main");

async function paidHost(page: Page, plan: "starter" | "plus" | "pro" = "plus") {
  const host = await signUp(page, { name: "Hana Host" });
  await grantPlan(host.email, plan);
  return host;
}

async function invite(page: Page, emailOrPhone: string, opts: { sms?: boolean; uncheck?: string[] } = {}) {
  await page.goto("/settings/team");
  const form = page.getByRole("region", { name: "Invite a team member" });
  if (opts.sms) {
    await form.getByLabel("Text message").check();
    await form.getByLabel("Mobile number").fill(emailOrPhone);
  } else {
    await form.getByLabel("Email address").fill(emailOrPhone);
  }
  for (const label of opts.uncheck ?? []) await form.getByLabel(label).uncheck();
  await form.getByRole("button", { name: "Send invitation" }).click();
  await expect(form.getByRole("status")).toContainText(opts.sms ? "texted" : "Invitation sent");
}

/** A brand-new person opens the invite link, creates an account, and joins. */
async function joinAsNewUser(browser: Browser, link: string, email: string) {
  const page = await newDevice(browser);
  await page.goto(link);
  await expect(main(page).getByRole("heading", { name: /Join .*workspace/ })).toBeVisible();
  await main(page).getByRole("link", { name: "Create an account to join" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
  await page.getByLabel("Name").fill("Tom Teammate");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create free account" }).click();
  await expect(page).toHaveURL(/\/invite$/);
  await main(page).getByRole("button", { name: /^Join / }).click();
  await expect(page).toHaveURL(/\/assistant\?joined=1$/);
  return page;
}

test.describe("team plans", () => {
  test("Free hosts see an upgrade prompt instead of an invite form", async ({ page }) => {
    await signUp(page);
    await page.goto("/settings/team");
    await expect(page.getByText("The Free plan doesn't include team members")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send invitation" })).toHaveCount(0);
  });

  test("Starter allows exactly one seat, counting the pending invitation", async ({ page }) => {
    await paidHost(page, "starter");
    await invite(page, uniqueEmail("one"));
    await page.reload();
    await expect(page.getByText("All seats are in use")).toBeVisible();
    await expect(page.getByRole("list", { name: "Pending invitations" }).getByRole("listitem")).toHaveCount(1);
  });
});

test.describe("inviting and joining", () => {
  test("email invite: new person signs up, joins, and shares the host's workspace", async ({ page, browser }) => {
    await paidHost(page);
    const email = uniqueEmail("tom");
    await invite(page, email);
    const member = await joinAsNewUser(browser, await waitForLink(email, "team_invite"), email);

    // Member is in the host's workspace and can switch back to their own.
    await member.getByRole("navigation", { name: "Main" }).waitFor();
    const sidebar = member.getByRole("complementary", { name: "Sidebar" });
    await sidebar.locator("summary", { hasText: "Workspace" }).click();
    const workspaces = sidebar.getByRole("list", { name: "Workspaces" });
    await expect(workspaces.getByRole("button")).toHaveCount(2);
    await expect(workspaces.getByRole("button", { name: /Hana Host's workspace/ })).toHaveAttribute("aria-current", "true");

    // Host sees the new member.
    await page.goto("/settings/team");
    await expect(page.getByRole("list", { name: "Team members" })).toContainText("Tom Teammate");
    await expect(page.getByRole("list", { name: "Pending invitations" })).toHaveCount(0);
  });

  test("existing users join by logging in, and the link only works once", async ({ page, browser }) => {
    await paidHost(page);
    const existing = await newDevice(browser);
    const person = await signUp(existing, { name: "Ella Existing" });
    await existing.getByRole("button", { name: "Log Out" }).click();

    await invite(page, person.email);
    const link = await waitForLink(person.email, "team_invite");
    await existing.goto(link);
    // They already have an account, so they're told so and only offered "Log in".
    await expect(main(existing).getByRole("status")).toContainText("You already have a Garwin AI account");
    await expect(main(existing).getByRole("link", { name: "Create an account to join" })).toHaveCount(0);
    await main(existing).getByRole("link", { name: "Log in to join" }).click();
    await existing.getByLabel("Email", { exact: true }).fill(person.email);
    await existing.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await existing.getByRole("button", { name: "Log in" }).click();
    await expect(existing).toHaveURL(/\/invite$/);
    await main(existing).getByRole("button", { name: /^Join / }).click();
    await expect(existing).toHaveURL(/\/assistant\?joined=1$/);

    await existing.goto("about:blank");
    await existing.goto(link);
    await expect(main(existing).getByRole("alert")).toContainText("invalid, expired or already used");
  });

  test("an email invitation can't be accepted by a different account", async ({ page, browser }) => {
    await paidHost(page);
    const invited = uniqueEmail("right");
    await invite(page, invited);
    const other = await newDevice(browser);
    await signUp(other, { name: "Wrong Person" });
    await other.goto(await waitForLink(invited, "team_invite"));
    await expect(main(other).getByText(/this invitation is for/)).toContainText(invited);
    await expect(main(other).getByRole("button", { name: /^Join / })).toHaveCount(0);
    await expect(main(other).getByRole("button", { name: "Log out and use the invited email" })).toBeVisible();
  });

  test("SMS invitation via Twilio", async ({ page, browser }) => {
    await paidHost(page);
    const phone = uniquePhone();
    await invite(page, phone, { sms: true });
    let link = "";
    await expect.poll(() => (link = mailsTo(phone).at(-1)?.text.match(/https?:\/\/\S+#token=[A-Za-z0-9_-]{43}/)?.[0] ?? "")).toBeTruthy();

    const person = await newDevice(browser);
    await signUp(person, { name: "Sam Sms" });
    await person.goto(link);
    await main(person).getByRole("button", { name: /^Join / }).click();
    await expect(person).toHaveURL(/\/assistant\?joined=1$/);
  });

  test("host can cancel a pending invitation", async ({ page }) => {
    await paidHost(page);
    const email = uniqueEmail("cancel");
    await invite(page, email);
    await page.reload();
    const pending = page.getByRole("list", { name: "Pending invitations" });
    await pending.getByRole("button", { name: "Cancel" }).click();
    await expect(pending).toHaveCount(0);
    const link = await waitForLink(email, "team_invite");
    await page.goto(link);
    await expect(main(page).getByRole("alert")).toContainText("invalid, expired or already used");
  });
});

test.describe("permissions and shared storage", () => {
  test("members can mark items for deletion but never delete; the host reviews and deletes", async ({ page, browser }) => {
    await paidHost(page);
    const email = uniqueEmail("store");
    await invite(page, email);
    const member = await joinAsNewUser(browser, await waitForLink(email, "team_invite"), email);

    await member.goto("/storage");
    await member.getByLabel("New folder name").fill("Q3 Reports");
    await member.getByRole("button", { name: "Create folder" }).click();
    const row = member.getByRole("list", { name: "Folder contents" }).getByRole("listitem").filter({ hasText: "Q3 Reports" });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: /Delete .* permanently/ })).toHaveCount(0);
    await row.getByRole("button", { name: "Mark Q3 Reports for deletion" }).click();
    await expect(row.getByText(/Marked for deletion by Tom Teammate/)).toBeVisible();
    await expect(row.getByRole("button", { name: /Delete .* permanently/ })).toHaveCount(0);

    // The host sees it in the review list and deletes it.
    await page.goto("/storage?view=marked");
    const marked = page.getByRole("list", { name: "Marked items" }).getByRole("listitem").filter({ hasText: "Q3 Reports" });
    await expect(marked).toContainText("Marked by Tom Teammate");
    page.once("dialog", (d) => d.accept());
    await marked.getByRole("button", { name: "Delete Q3 Reports permanently" }).click();
    await expect(page.getByRole("list", { name: "Marked items" })).toHaveCount(0);
  });

  test("host sets permissions individually and they apply immediately", async ({ page, browser }) => {
    await paidHost(page);
    const email = uniqueEmail("perm");
    await invite(page, email, { uncheck: ["Message the host and team"] });
    const member = await joinAsNewUser(browser, await waitForLink(email, "team_invite"), email);

    await expect(member.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Messages" })).toHaveCount(0);
    await member.goto("/messages");
    await expect(member.getByText("You don't have access")).toBeVisible();

    await page.goto("/settings/team");
    const memberRow = page.getByRole("list", { name: "Team members" }).getByRole("listitem").filter({ hasText: "Tom Teammate" });
    await memberRow.getByText(/Permissions for Tom Teammate/).click();
    const form = memberRow.getByRole("form", { name: "Permissions for Tom Teammate" });
    await form.getByLabel("Message the host and team").check();
    await form.getByLabel("View files and folders").uncheck();
    await form.getByRole("button", { name: "Save permissions" }).click();
    await expect(form.getByRole("status")).toHaveText("Permissions saved.");

    await member.goto("/messages");
    await expect(member.getByRole("heading", { name: "Team", level: 2 })).toBeVisible();
    await member.goto("/storage");
    await expect(member.getByText("You don't have access")).toBeVisible();
  });

  test("team members see billing is managed by the host and can't invite", async ({ page, browser }) => {
    await paidHost(page);
    const email = uniqueEmail("bill");
    await invite(page, email);
    const member = await joinAsNewUser(browser, await waitForLink(email, "team_invite"), email);
    await member.goto("/settings/payments");
    await expect(member.getByText("Your account host manages the plan and billing")).toBeVisible();
    await member.goto("/settings/cards");
    await expect(member.getByText("Only your account host can manage payment cards")).toBeVisible();
    await member.goto("/settings/team");
    await expect(member.getByRole("button", { name: "Send invitation" })).toHaveCount(0);
    await expect(member.getByRole("button", { name: "Leave team" })).toBeVisible();
  });
});

test.describe("messaging and removal", () => {
  test("host and team member message each other", async ({ page, browser }) => {
    await paidHost(page);
    const email = uniqueEmail("msg");
    await invite(page, email);
    const member = await joinAsNewUser(browser, await waitForLink(email, "team_invite"), email);

    await page.goto("/messages");
    await page.getByLabel("Message Team").fill("Welcome to the team!");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("list", { name: "Messages in Team" })).toContainText("Welcome to the team!");

    await member.goto("/messages");
    await expect(member.getByRole("list", { name: "Messages in Team" })).toContainText("Welcome to the team!");
    await member.getByLabel("Message Team").fill("Thanks, glad to be here");
    await member.getByRole("button", { name: "Send", exact: true }).click();

    // One-to-one from the Team page.
    await page.goto("/settings/team");
    await page.getByRole("button", { name: "Message Tom Teammate" }).click();
    await expect(page.getByRole("heading", { name: "Tom Teammate", level: 2 })).toBeVisible();
    await page.getByLabel("Message Tom Teammate").fill("Quick private question");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await member.goto("/messages");
    await member.getByRole("navigation", { name: "Conversations" }).getByRole("link", { name: /Hana Host/ }).click();
    await expect(member.getByRole("list", { name: /Messages in Hana Host/ })).toContainText("Quick private question");
  });

  test("removed members lose access immediately and fall back to their own workspace", async ({ page, browser }) => {
    await paidHost(page);
    const email = uniqueEmail("rm");
    await invite(page, email);
    const member = await joinAsNewUser(browser, await waitForLink(email, "team_invite"), email);

    await page.goto("/settings/team");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Remove Tom Teammate" }).click();
    await expect(page.getByRole("list", { name: "Team members" })).not.toContainText("Tom Teammate");

    await member.goto("/settings/general");
    await expect(member.getByText("Host", { exact: true })).toBeVisible(); // their own workspace
    await expect(member.getByRole("complementary", { name: "Sidebar" }).locator("summary", { hasText: "Workspace" })).toHaveCount(0); // only one workspace left
  });

  test("a team member can't open another account's folders by id", async ({ page, browser }) => {
    const outsider = await newDevice(browser);
    await signUp(outsider, { name: "Other Host" });
    await outsider.goto("/storage");
    await outsider.getByLabel("New folder name").fill("Private");
    await outsider.getByRole("button", { name: "Create folder" }).click();
    await outsider.getByRole("link", { name: "Private" }).click();
    await expect(outsider).toHaveURL(/folder=/);
    const privateUrl = outsider.url();

    await signUp(page);
    await page.goto(new URL(privateUrl).pathname + new URL(privateUrl).search);
    await expect(page.getByText("Folder not found")).toBeVisible();
    await expect(page.getByText("Private")).toHaveCount(0);
  });
});

test("login keeps a safe return path and ignores unsafe ones", async ({ page }) => {
  const { email } = await signUp(page);
  await page.getByRole("button", { name: "Log Out" }).click();
  await expect(page).toHaveURL(/\/login$/); // wait until signed out before the next navigation
  await page.goto("/login?next=//evil.example/steal");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/localhost:\d+\/assistant$/);
  void logIn;
});
