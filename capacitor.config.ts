import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native WebView loads bundled assets from webDir (dist/client).
 * API calls use relative paths (/api/*) which resolve against the
 * Cloudflare Worker when served from the Worker, or against the
 * Vite dev server in local development.
 *
 * For native builds, set NATIVE_API_URL to your deployed Worker URL
 * so the app can construct absolute API URLs at runtime.
 */
const NATIVE_API_URL =
  process.env.NATIVE_API_URL ?? "https://edgecase-cockpit.asher-lewis-knight.workers.dev";

const config: CapacitorConfig = {
  appId: "uk.asherlewis.edgecase.cockpit",
  appName: "Edgecase Cockpit",

  // Points at the Vite web build output + generated index.html shell.
  // Run `bun run native:build` before any `cap sync` or `cap open`.
  webDir: "dist/client",

  // No server.url — WebView loads bundled assets from webDir.
  // server.url would replace the entire content origin, causing
  // a black screen when the remote URL doesn't serve the app.
  // For API routing in native contexts, use absolute URLs or
  // CapacitorHttp plugin instead.

  // Enable CapacitorHttp to intercept fetch / XHR in the WebView and route
  // them through native networking, bypassing CORS for localhost providers.
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
