// Guards the deployed Cloudflare configuration against drift.
//
// These assertions exist because each one has already failed in production:
// a deploy shipped with `vars` missing entirely (the Worker then answered
// `503 unconfigured`), and a later deploy removed the frontend hostname because
// it was configured in the dashboard but absent from `wrangler.jsonc`.
// `wrangler deploy` reconciles routes declaratively, so config drift is a
// deployment outage, not a lint nit. See docs/deployment.md.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Frontend Worker hostname. Must be in `routes` or a deploy deletes it. */
const FRONTEND_HOST = "veritas.mcplinux.dev";
/** Linux backend origin, fronted by the cloudflared tunnel. */
const BACKEND_ORIGIN = "https://vapi.mcplinux.dev";

/**
 * Parse wrangler.jsonc. JSONC allows `//` comments and trailing commas, neither
 * of which JSON.parse accepts.
 */
function readWranglerConfig(relativePath: string): Record<string, unknown> {
  const raw = readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
  const stripped = raw
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped) as Record<string, unknown>;
}

describe("wrangler.jsonc deploy configuration", () => {
  const config = readWranglerConfig("wrangler.jsonc");

  it("defines BACKEND_ORIGIN, so the Worker is not deployed unconfigured", () => {
    const vars = config.vars as Record<string, string> | undefined;

    // A missing `vars` block deploys silently and only surfaces as a 503 from
    // /api/backend-health, which reads like a backend fault but is not.
    expect(vars).toBeDefined();
    expect(vars?.BACKEND_ORIGIN).toBe(BACKEND_ORIGIN);
  });

  it("uses an absolute https origin with no trailing slash", () => {
    const origin = (config.vars as Record<string, string>).BACKEND_ORIGIN;
    const url = new URL(origin);

    expect(url.protocol).toBe("https:");
    // backendFetch() joins paths onto this value; a trailing slash or a base
    // path would produce a double slash or a silently wrong URL.
    expect(origin.endsWith("/")).toBe(false);
    expect(url.pathname).toBe("/");
  });

  it("lists the frontend hostname in routes", () => {
    const routes = config.routes as Array<{
      pattern: string;
      custom_domain?: boolean;
    }>;

    // wrangler deploy deletes any Worker route not present here, taking its
    // auto-managed DNS record with it (the hostname then returns 1016/530).
    expect(routes.some((r) => r.pattern === FRONTEND_HOST)).toBe(true);
  });

  it("keeps the frontend and backend on separate hostnames", () => {
    const routes = config.routes as Array<{ pattern: string }>;
    const backendHost = new URL(
      (config.vars as Record<string, string>).BACKEND_ORIGIN,
    ).hostname;

    // The split exists to prevent a Cloudflare routing collision: the Worker
    // and the tunnel must never claim the same name.
    expect(routes.map((r) => r.pattern)).not.toContain(backendHost);
  });
});
