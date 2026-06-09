import type { CapacitorConfig } from "@capacitor/cli";

/**
 * IMPORTANT — native API routing:
 *
 * This app's API routes (/api/proxy/chat, /api/keys/*, etc.) are handled by
 * the Cloudflare Worker backend. In a native WebView there is no local server,
 * so all relative /api/* calls must resolve against the deployed Worker URL.
 *
 * Set server.url to your deployed CF Worker URL before running:
 *   npx cap add ios
 *   npx cap add android
 *   bun run native:ios:sync
 *   bun run native:android:sync
 *
 * The placeholder below will cause API calls to fail until a real URL is set.
 * For local dev you can set server.url to the Vite dev server URL instead:
 *   http://localhost:8080
 * But note the dev server requires SESSION_SECRET and D1 to be configured.
 */
const CLOUDFLARE_WORKER_URL =
  process.env.NATIVE_API_URL ?? "https://tanstack-start-app.workers.dev";

const config: CapacitorConfig = {
  // Confirm appId matches your Apple Developer (Bundle ID) and Google Play
  // (Application ID) registrations before initializing platform targets.
  appId: "uk.asherlewis.edgecase.cockpit",
  appName: "Edgecase Cockpit",

  // Points at the Vite web build output + generated index.html shell.
  // Run `bun run native:build` before any `cap sync` or `cap open`.
  webDir: "dist/client",

  server: {
    // Route all /api/* calls to the deployed Cloudflare Worker.
    // Change this to your actual deployed worker URL.
    url: CLOUDFLARE_WORKER_URL,

    // In development, set androidScheme to https so that cookies and
    // the Cloudflare session work correctly inside the Android WebView.
    androidScheme: "https",

    // cleartext is false by default (https only). Only set true for local dev.
    cleartext: false,
  },
};

export default config;
