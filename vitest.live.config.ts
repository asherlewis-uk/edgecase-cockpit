import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { config } from "dotenv";
import { expand } from "dotenv-expand";

// Load environment variables from .env.local
const env = config({ path: ".env.local" });
if (env.error) {
  console.warn("[vitest:live] No .env.local found, using process.env");
} else {
  expand(env);
  console.log("[vitest:live] Loaded environment from .env.local");
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.live.test.ts"],
    css: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
