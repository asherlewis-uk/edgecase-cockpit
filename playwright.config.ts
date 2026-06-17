import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E smoke-test configuration for Edgecase Cockpit.
 *
 * - Runs against the local Vite dev server (`bun run dev`).
 * - Uses Chromium desktop by default; mobile variants can be added later.
 * - Smoke tests cover route availability, auth page elements, settings,
 *   provider key status, and thread creation.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
