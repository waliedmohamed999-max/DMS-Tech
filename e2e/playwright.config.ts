import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke suite (Playwright). Separate from Vitest: Vitest only includes tests/**\/*.test.ts, these specs live
 * in e2e/ and are named *.spec.ts. Run with `npm run test:e2e`.
 *
 * The suite runs against an ALREADY BUILT and STARTED app (production `next start`) backed by a throwaway database —
 * never against production. It sends no form submissions to external services (no e-mail / WhatsApp / CRM).
 *
 *   E2E_BASE_URL          app under test (default http://localhost:3000; use localhost, not 127.0.0.1, so the
 *                         Secure "__Host-" session cookie is accepted over plain HTTP)
 *   E2E_ADMIN_EMAIL       bootstrap admin created by scripts/bootstrap.ts (login spec is skipped when unset)
 *   E2E_ADMIN_PASSWORD
 *   E2E_CHROMIUM_PATH     optional: use an installed Chrome/Chromium instead of Playwright's download
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const executablePath = process.env.E2E_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./specs",
  testMatch: /.*\.spec\.ts$/,
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["list"], ["github"], ["html", { outputFolder: "./playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "./playwright-report", open: "never" }]],
  use: {
    baseURL,
    // the opening splash is CSS-only and skipped under reduced motion — keeps screenshots and clicks deterministic
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // never let a test reach the outside world by accident (fonts, analytics, wa.me…): only the app under test
    serviceWorkers: "block"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...(executablePath ? { launchOptions: { executablePath } } : {}) }
    }
  ]
});
