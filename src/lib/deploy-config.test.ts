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

/**
 * The native shells (Capacitor iOS/Android, Electron) cannot use a relative
 * "/api/..." path: they load from capacitor:// or file://, where same-origin
 * resolves to the local bundle and every API call 404s. They therefore bake an
 * absolute origin in at BUILD time via api-base.ts.
 *
 * That origin is a second copy of the frontend hostname, and it has already
 * drifted once: the Worker route moved to veritas.mcplinux.dev while
 * DEFAULT_NATIVE_API_URL still pointed at the retired
 * edgecase-cockpit.*.workers.dev. The web app was fine — it is same-origin —
 * so nothing caught it until a device build showed "Request failed" on every
 * request. These assertions pin the copies to the deployed route.
 */
describe("native shell API origin", () => {
  const FRONTEND_ORIGIN = `https://${FRONTEND_HOST}`;

  function readRepoFile(relativePath: string): string {
    return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
  }

  it("points DEFAULT_NATIVE_API_URL at the deployed frontend route", () => {
    const source = readRepoFile("src/lib/api-base.ts");
    const match = source.match(
      /const\s+DEFAULT_NATIVE_API_URL\s*=\s*["']([^"']+)["']/,
    );

    // A missing constant means the fallback was renamed or removed; the guard
    // must fail loudly rather than silently pass on a regex miss.
    expect(match?.[1]).toBeDefined();
    expect(match?.[1]).toBe(FRONTEND_ORIGIN);
  });

  it("documents VITE_NATIVE_API_URL as the deployed frontend route", () => {
    const example = readRepoFile(".env.example");
    const match = example.match(/^VITE_NATIVE_API_URL=(.+)$/m);

    // .env.example is what a fresh checkout copies to .env.local, so a stale
    // value here reproduces the outage on every new machine.
    expect(match?.[1]).toBeDefined();
    expect(match?.[1]?.trim()).toBe(FRONTEND_ORIGIN);
  });
  it("keeps the Electron shell origin in step with api-base.ts", () => {
    const main = readRepoFile("electron/main.ts");
    const match = main.match(
      /const\s+NATIVE_API_URL\s*=\s*[\s\S]*?\|\|\s*["']([^"']+)["']/,
    );

    // This value is not just a fetch base: it is interpolated into the CSP
    // connect-src and the webRequest filter. A stale value does not merely
    // point at the wrong host, it BLOCKS the right one.
    expect(match?.[1]).toBeDefined();
    expect(match?.[1]).toBe(FRONTEND_ORIGIN);
  });
});
