import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for Edgecase Cockpit web runtimes.
 *
 * Select the runtime with E2E_RUNTIME:
 * - dev: local Vite dev server
 * - preview: built Cloudflare/Nitro output via Wrangler
 * - deployed: externally provided E2E_BASE_URL
 */
const runtime = process.env.E2E_RUNTIME ?? "dev";
const host = process.env.E2E_HOST ?? "127.0.0.1";
const port = Number(process.env.E2E_PORT ?? (runtime === "preview" ? "4173" : "4172"));
const localBaseURL = `http://${host}:${port}`;

const baseURL = process.env.E2E_BASE_URL ?? localBaseURL;

if (runtime === "deployed" && !process.env.E2E_BASE_URL) {
  throw new Error("E2E_RUNTIME=deployed requires E2E_BASE_URL.");
}

const e2eServerEnv = {
  SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-session-secret-32-characters-minimum",
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef",
  RATE_LIMIT_BACKEND: process.env.RATE_LIMIT_BACKEND ?? "memory",
  ALLOW_IN_MEMORY_RATE_LIMIT: process.env.ALLOW_IN_MEMORY_RATE_LIMIT ?? "true",
  NODE_ENV: runtime === "preview" ? "production" : "development",
};

const wranglerVars = Object.entries(e2eServerEnv)
  .map(([key, value]) => `--var ${key}:${value}`)
  .join(" ");

const webServer =
  runtime === "deployed"
    ? undefined
    : {
        command:
          runtime === "preview"
            ? `npx wrangler dev --local-protocol=http --port ${port} ${wranglerVars}`
            : `bun run dev -- --host ${host} --port ${port}`,
        url: baseURL,
        env: e2eServerEnv,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: `playwright-report/${runtime}`, open: "never" }],
    ["json", { outputFile: `test-results/e2e-${runtime}.json` }],
  ],
  outputDir: `test-results/playwright-${runtime}`,
  metadata: {
    runtime,
    baseURL,
  },
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: `${runtime}-chromium`,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer,
});
