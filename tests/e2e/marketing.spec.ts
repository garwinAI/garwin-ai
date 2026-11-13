import AxeBuilder from "@axe-core/playwright";
import { expect, signUp, test } from "./helpers";

test.describe("public site", () => {
  test("home page has the hero, sections, plans and footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("One workspace.");

    const hero = page.getByRole("region", { name: /One workspace/ });
    await expect(hero.getByRole("link", { name: "Sign Up FREE" })).toHaveAttribute("href", "/signup");
    await expect(hero.getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");

    for (const name of ["About", "Plans", "FAQ"]) {
      await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name })).toBeVisible();
    }
    await expect(page.getByRole("list", { name: "Plans" }).getByRole("heading", { level: 3 })).toHaveText(["Free", "Starter", "Plus", "Pro"]);

    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    await expect(footer).toContainText("© 2026 GarwinAI, All Rights Reserved.");
  });

  test("FAQ answers open on click", async ({ page }) => {
    await page.goto("/#faq");
    const answer = page.getByText("There is no credit card step", { exact: false });
    await expect(answer).toBeHidden();
    await page.getByText("Is the Free plan really free?").click();
    await expect(answer).toBeVisible();
  });

  test("privacy and terms are public, signed in or not", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
    await page.getByRole("contentinfo").getByRole("link", { name: "Terms" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();

    await signUp(page);
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
  });

  test("works at 360px without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign Up FREE" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Login" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  for (const path of ["/", "/privacy", "/terms"]) {
    test(`${path} has no serious accessibility violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("[data-logo]").analyze();
      expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    });
  }
});
