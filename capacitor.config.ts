import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // TODO: Confirm appId with your Apple/Google developer accounts before
  // running `npx cap add ios` or `npx cap add android`.
  appId: "uk.asherlewis.edgecase.cockpit",
  appName: "Edgecase Cockpit",

  // Points at the Vite web build output.
  // Run `bun run native:build` before any `cap sync` or `cap open`.
  webDir: "dist/client",

  server: {
    // In development, set androidScheme to https so that cookies and
    // the Cloudflare session work correctly inside the Android WebView.
    androidScheme: "https",
  },
};

export default config;
