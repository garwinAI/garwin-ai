import { expect, logIn, mailsTo, newDevice, PASSWORD, signUp, test, uniqueEmail, waitForLink } from "./helpers";

const formError = (page: import("@playwright/test").Page) => page.locator("form [role=alert]");
// Next.js adds its own empty role="alert" route announcer, so scope alerts to the page content.
const pageAlert = (page: import("@playwright/test").Page) => page.getByRole("main").getByRole("alert");

test.describe("basics", () => {
  test("health endpoint is public and reports the database", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", checks: { database: "ok" } });
  });

  test("signed-out visitors are sent to login", async ({ page }) => {
    await page.goto("/settings/general");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a forged session cookie is rejected and cleared", async ({ page, context, baseURL }) => {
    // Works for both the dev cookie name and the production __Host- name.
    await context.addCookies([
      { name: "garwin_session", value: "A".repeat(43), url: baseURL! },
      { name: "__Host-garwin_session", value: "A".repeat(43), url: baseURL!.replace("http:", "https:"), secure: true },
    ]);
    await page.goto("/settings/general");
    await expect(page).toHaveURL(/\/login\?expired=1$/);
  });
});

test.describe("registration", () => {
  test("creates an account, signs in, and sends a verification email", async ({ page }) => {
    const { email } = await signUp(page);
    await expect(page.getByRole("region", { name: "Email verification" })).toContainText(email);
    await waitForLink(email, "verify_email");
  });

  test("session cookie is httpOnly and not readable by page scripts", async ({ page, context }) => {
    await signUp(page);
    const cookie = (await context.cookies()).find((c) => c.name.endsWith("garwin_session"))!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(await page.evaluate(() => document.cookie)).not.toContain("garwin_session");
  });

  test("rejects duplicate emails and weak passwords", async ({ page, browser }) => {
    const { email } = await signUp(page);
    const other = await newDevice(browser);
    await other.goto("/signup");
    await other.getByLabel("Name").fill("Someone");
    await other.getByLabel("Email").fill(email);
    await other.getByLabel("Password").fill("another-password-1");
    await other.getByRole("button", { name: "Create free account" }).click();
    await expect(formError(other)).toHaveText("An account with that email already exists.");

    await other.getByLabel("Email").fill(uniqueEmail("weak"));
    await other.getByLabel("Password").fill("password123");
    await other.getByRole("button", { name: "Create free account" }).click();
    await expect(formError(other)).toContainText("too common");
  });
});

test.describe("login and logout", () => {
  test("wrong password keeps the email filled in; right password signs in; logout ends the session", async ({ page }) => {
    const { email } = await signUp(page);
    await page.getByRole("button", { name: "Log Out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await logIn(page, email, "wrong-password-123");
    await expect(formError(page)).toHaveText("Incorrect email or password.");
    await expect(page.getByLabel("Email")).toHaveValue(email);

    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/assistant$/);
  });

  test("unknown email gets the same message as a wrong password", async ({ page }) => {
    await logIn(page, uniqueEmail("nobody"), PASSWORD);
    await expect(formError(page)).toHaveText("Incorrect email or password.");
  });

  test("too many failed attempts are rate limited", async ({ page }) => {
    const { email } = await signUp(page);
    await page.getByRole("button", { name: "Log Out" }).click();
    for (let i = 0; i < 5; i++) {
      await logIn(page, email, `wrong-password-${i}`);
      await expect(formError(page)).toHaveText("Incorrect email or password.");
    }
    await logIn(page, email, PASSWORD);
    await expect(formError(page)).toContainText("Too many sign-in attempts");
  });
});

test.describe("email verification", () => {
  test("clicking the emailed link verifies the email and removes the banner", async ({ page }) => {
    const { email } = await signUp(page);
    const link = await waitForLink(email, "verify_email");

    await page.goto(link);
    await expect(page.getByRole("status")).toContainText("Your email is verified");
    // The secret is removed from the address bar after reading it.
    await expect(page).not.toHaveURL(/#token=/);

    await page.getByRole("link", { name: "Continue to Garwin AI" }).click();
    await expect(page.getByRole("region", { name: "Email verification" })).toHaveCount(0);
    await page.goto("/settings/security");
    await expect(page.getByText("Verified", { exact: true })).toBeVisible();
  });

  test("a used or tampered link is rejected", async ({ page }) => {
    const { email } = await signUp(page);
    const link = await waitForLink(email, "verify_email");
    await page.goto(link);
    await expect(page.getByRole("status")).toContainText("verified");

    // Load a blank page in between: otherwise only the #fragment changes and the page doesn't reload.
    await page.goto("about:blank");
    await page.goto(link);
    await expect(pageAlert(page)).toContainText("invalid, expired or already used");
    await page.goto("about:blank");
    await page.goto(link.replace(/#token=.{5}/, "#token=XXXXX"));
    await expect(pageAlert(page)).toContainText("invalid, expired or already used");
  });

  test("resend sends a new link", async ({ page }) => {
    const { email } = await signUp(page);
    await waitForLink(email, "verify_email");
    await page.getByRole("button", { name: "Resend email" }).click();
    await expect(page.getByRole("region", { name: "Email verification" }).getByRole("status")).toContainText("Verification email sent");
    await expect.poll(() => mailsTo(email).filter((m) => m.tag === "verify_email").length).toBe(2);
  });
});

test.describe("password reset", () => {
  test("full flow: request, open link, set new password, old sessions end, log in", async ({ page, browser }) => {
    const { email } = await signUp(page);
    const otherDevice = await newDevice(browser);
    await logIn(otherDevice, email, PASSWORD);
    await expect(otherDevice).toHaveURL(/\/assistant$/);

    const visitor = await newDevice(browser);
    await visitor.goto("/login");
    await visitor.getByRole("link", { name: "Forgot password?" }).click();
    await visitor.getByLabel("Email").fill(email);
    await visitor.getByRole("button", { name: "Send reset link" }).click();
    await expect(visitor.getByRole("status")).toContainText("If an account exists");

    await visitor.goto(await waitForLink(email, "password_reset"));
    await expect(visitor).not.toHaveURL(/#token=/);
    await visitor.getByLabel("New password", { exact: true }).fill("fresh-meadow-tulips-5");
    await visitor.getByLabel("Confirm new password").fill("fresh-meadow-tulips-5");
    await visitor.getByRole("button", { name: "Save new password" }).click();
    await expect(visitor).toHaveURL(/\/login\?reset=1$/);
    await expect(visitor.getByRole("status")).toContainText("Your password was changed");

    // Every existing session was signed out.
    await otherDevice.goto("/settings/general");
    await expect(otherDevice).toHaveURL(/\/login\?expired=1$/);

    await logIn(visitor, email, PASSWORD);
    await expect(formError(visitor)).toHaveText("Incorrect email or password.");
    await visitor.getByLabel("Password", { exact: true }).fill("fresh-meadow-tulips-5");
    await visitor.getByRole("button", { name: "Log in" }).click();
    await expect(visitor).toHaveURL(/\/assistant$/);
    await expect.poll(() => mailsTo(email).some((m) => m.tag === "password_changed")).toBe(true);
  });

  test("unknown email shows the same confirmation and sends nothing", async ({ page }) => {
    const email = uniqueEmail("ghost");
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("If an account exists");
    await page.waitForTimeout(500);
    expect(mailsTo(email)).toHaveLength(0);
  });

  test("a reset link works only once", async ({ page, browser }) => {
    const { email } = await signUp(page);
    const v = await newDevice(browser);
    await v.goto("/forgot-password");
    await v.getByLabel("Email").fill(email);
    await v.getByRole("button", { name: "Send reset link" }).click();
    const link = await waitForLink(email, "password_reset");

    for (const [i, expectOk] of [[1, true], [2, false]] as const) {
      await v.goto(link);
      await v.getByLabel("New password", { exact: true }).fill(`fresh-meadow-tulips-${i}`);
      await v.getByLabel("Confirm new password").fill(`fresh-meadow-tulips-${i}`);
      await v.getByRole("button", { name: "Save new password" }).click();
      if (expectOk) await expect(v).toHaveURL(/\/login\?reset=1$/);
      else await expect(formError(v)).toContainText("invalid or has expired");
    }
  });

  test("a link without a token explains what to do", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(pageAlert(page)).toContainText("incomplete");
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  });
});

test.describe("account security settings", () => {
  test("lists signed-in devices and can sign out another one", async ({ page, browser }) => {
    const { email } = await signUp(page);
    const phone = await newDevice(browser);
    await logIn(phone, email, PASSWORD);
    await expect(phone).toHaveURL(/\/assistant$/);

    await page.goto("/settings/security");
    const devices = page.getByRole("list", { name: "Signed-in devices" }).getByRole("listitem");
    await expect(devices).toHaveCount(2);
    await expect(devices.filter({ hasText: "This device" })).toHaveCount(1);

    await devices.filter({ hasNotText: "This device" }).getByRole("button", { name: /Sign out/ }).click();
    await expect(devices).toHaveCount(1);

    await phone.goto("/settings/general");
    await expect(phone).toHaveURL(/\/login\?expired=1$/);
  });

  test("sign out other devices keeps this one", async ({ page, browser }) => {
    const { email } = await signUp(page);
    for (let i = 0; i < 2; i++) {
      const d = await newDevice(browser);
      await logIn(d, email, PASSWORD);
      await expect(d).toHaveURL(/\/assistant$/);
    }
    await page.goto("/settings/security");
    await page.getByRole("button", { name: "Sign out other devices" }).click();
    await expect(page.getByText("Signed out 2 other devices.")).toBeVisible();
    await page.goto("/settings/general");
    await expect(page).toHaveURL(/\/settings\/general$/);
  });

  test("changing password signs out other sessions and validates input", async ({ page, browser }) => {
    const { email, password } = await signUp(page);
    const second = await newDevice(browser);
    await logIn(second, email, password);
    await expect(second).toHaveURL(/\/assistant$/);

    await page.goto("/settings/passwords");
    await page.getByLabel("Current password").fill("not-my-password-1");
    await page.getByLabel("New password", { exact: true }).fill("brand-new-password-9");
    await page.getByLabel("Confirm new password").fill("brand-new-password-9");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(formError(page)).toHaveText("Current password is incorrect.");

    await page.getByLabel("Current password").fill(password);
    await page.getByLabel("New password", { exact: true }).fill("brand-new-password-9");
    await page.getByLabel("Confirm new password").fill("brand-new-password-8");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(formError(page)).toHaveText("New passwords don't match.");

    await page.getByLabel("Current password").fill(password);
    await page.getByLabel("New password", { exact: true }).fill("brand-new-password-9");
    await page.getByLabel("Confirm new password").fill("brand-new-password-9");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.locator("form [role=status]")).toContainText("1 other device was signed out");

    await page.goto("/storage");
    await expect(page).toHaveURL(/\/storage$/);
    await second.goto("/storage");
    await expect(second).toHaveURL(/\/login\?expired=1$/);
    await logIn(second, email, "brand-new-password-9");
    await expect(second).toHaveURL(/\/assistant$/);
  });

  test("activity history shows sign-ins and security changes with IPs", async ({ page, clientIp }) => {
    const { email } = await signUp(page);
    await page.getByRole("button", { name: "Log Out" }).click();
    await logIn(page, email, "wrong-password-1");
    await logIn(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/assistant$/);

    await page.goto("/settings/ip-history");
    const rows = page.getByRole("table").getByRole("row");
    await expect(rows.filter({ hasText: "Account created" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "Signed out" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "Sign-in" }).filter({ hasText: "Failed" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "Sign-in" }).filter({ hasText: "Success" })).toHaveCount(1);
    await expect(rows.filter({ hasText: clientIp }).first()).toBeVisible();
  });
});

test.describe("authorization", () => {
  test("members cannot open Admin", async ({ page }) => {
    await signUp(page);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/assistant$/);
  });

  test("server actions reject cross-site requests", async ({ page, request, baseURL }) => {
    await signUp(page);
    const res = await request.post(`${baseURL}/settings/security`, {
      headers: { origin: "https://evil.example", "next-action": "0".repeat(40), "content-type": "text/plain;charset=UTF-8" },
      data: "[]",
      maxRedirects: 0,
    });
    expect(res.status()).not.toBe(200);
  });
});
