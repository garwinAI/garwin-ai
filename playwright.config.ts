import "dotenv/config";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const MOCK_RESEND_PORT = 3199;
const isCI = Boolean(process.env.CI);

// Emails go to a local fake Resend server; tests read links from this file.
export const MAIL_FILE = process.env.MOCK_MAIL_FILE ?? join(tmpdir(), "garwin-e2e-mail.jsonl");
process.env.MOCK_MAIL_FILE = MAIL_FILE;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Optional: point at an existing Chrome/Chromium instead of Playwright's download.
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    },
  ],
  webServer: [
    {
      command: "node tests/support/mock-providers.mjs",
      url: `http://localhost:${MOCK_RESEND_PORT}/health`,
      env: { MOCK_MAIL_FILE: MAIL_FILE, MOCK_RESEND_PORT: String(MOCK_RESEND_PORT) },
      reuseExistingServer: false,
    },
    {
      // CI tests the production build; locally the dev server is fine.
      command: isCI ? `npm run start -- --port ${PORT}` : `npm run dev -- --port ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        APP_URL: `http://localhost:${PORT}`,
        RESEND_API_KEY: "re_test_e2e_not_a_real_key",
        RESEND_API_URL: `http://localhost:${MOCK_RESEND_PORT}/emails`,
        EMAIL_TRANSPORT: "resend",
        TWILIO_ACCOUNT_SID: "ACtest00000000000000000000000000",
        TWILIO_AUTH_TOKEN: "test_token_not_real",
        TWILIO_FROM: "+15005550006",
        TWILIO_API_BASE: `http://localhost:${MOCK_RESEND_PORT}`,
        MAIL_LOG_FILE: "",
      },
    },
  ],
});
