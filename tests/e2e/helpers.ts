import { existsSync, readFileSync } from "node:fs";
import { test as base, expect, type Browser, type Page } from "@playwright/test";

/** Each test gets its own fake client IP, so rate limits from one test never affect another. */
export const randomIp = () => `198.51.${1 + Math.floor(Math.random() * 254)}.${1 + Math.floor(Math.random() * 254)}`;

export const test = base.extend<{ clientIp: string }>({
  clientIp: async ({}, provide) => provide(randomIp()),
  context: async ({ context, clientIp }, provide) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": clientIp });
    await provide(context);
  },
});
export { expect };

/** A second, independent browser (another "device") with its own IP. */
export async function newDevice(browser: Browser, ip = randomIp()): Promise<Page> {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } });
  return ctx.newPage();
}

export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.garwinai.dev`;
export const PASSWORD = "correct-horse-battery";

export async function signUp(page: Page, opts: { name?: string; email?: string; password?: string } = {}) {
  const creds = {
    name: opts.name ?? "E2E Tester",
    email: opts.email ?? uniqueEmail("user"),
    password: opts.password ?? PASSWORD,
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
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

type Mail = { to: string; subject: string; text: string; tag: string };

function readMail(): Mail[] {
  const file = process.env.MOCK_MAIL_FILE!;
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Mail);
}

export const mailsTo = (email: string) => readMail().filter((m) => m.to === email);

/** Waits for an email of the given type and returns the link inside it. */
export async function waitForLink(email: string, tag: "verify_email" | "password_reset"): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(() => {
      const mail = mailsTo(email).filter((m) => m.tag === tag).at(-1);
      link = mail?.text.match(/https?:\/\/\S+#token=[A-Za-z0-9_-]{43}/)?.[0];
      return link;
    }, { message: `waiting for ${tag} email to ${email}`, timeout: 10_000 })
    .toBeTruthy();
  return link!;
}
