// Access Cloudflare platform bindings (env) during server-side request handling.
// The platform env is set per-request in server.ts before TanStack Start processes the request.

// Minimal D1 type — the full @cloudflare/workers-types is not a dependency.
// This matches Cloudflare's D1Database interface used at runtime.
interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
  raw<T = unknown[]>(): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1Result>;
}

type CloudflareEnv = {
  DB?: D1Database;
  [key: string]: unknown;
};

/**
 * Extract the Cloudflare env object from a Request whose runtime was augmented
 * by Nitro's cloudflare-module preset (`request.runtime.cloudflare.env`).
 */
export function getCloudflareEnvFromRequest(request: unknown): CloudflareEnv | null {
  if (!request || typeof request !== "object") return null;
  const req = request as {
    runtime?: { cloudflare?: { env?: CloudflareEnv } };
  };
  return req.runtime?.cloudflare?.env ?? null;
}

function isCloudflareEnv(value: unknown): value is CloudflareEnv {
  return !!value && typeof value === "object" && "DB" in (value as Record<string, unknown>);
}

/**
 * Resolve the Cloudflare env from a variety of runtime sources:
 *   - the env argument itself (e.g. from server.ts)
 *   - a context wrapper with `.env`
 *   - the currently-stored platform env
 *   - the active request (Nitro cloudflare-module attaches env there)
 *   - Nitro's global `__env__`
 *   - legacy `globalThis.env` / `process.env.DB` / `globalThis.DB`
 */
export function resolveCloudflareEnv(source?: unknown): CloudflareEnv | null {
  // Direct env object.
  if (isCloudflareEnv(source)) return source;

  // Context wrapper such as event.context.cloudflare or { env }.
  if (source && typeof source === "object") {
    const nested = (source as { env?: unknown }).env;
    if (isCloudflareEnv(nested)) return nested;
  }

  // Explicitly-set platform env.
  const stored = getPlatformEnv();
  if (stored?.DB) return stored;

  // Active request runtime (populated by Nitro's cloudflare-module runtime).
  if (typeof globalThis !== "undefined") {
    const g = globalThis as Record<string, unknown>;
    if (isCloudflareEnv(g.__env__)) return g.__env__ as CloudflareEnv;
  }

  return null;
}

let _currentEnv: CloudflareEnv | null = null;

/**
 * Set the platform env for the current request.
 * Called from server.ts before dispatching to TanStack Start.
 */
export function setPlatformEnv(env: unknown): void {
  if (env === null || env === undefined) {
    _currentEnv = null;
    return;
  }
  _currentEnv = resolveCloudflareEnv(env);
}

/**
 * Get the platform env for the current request.
 * Returns null outside of a request context (e.g., during build).
 */
export function getPlatformEnv(): CloudflareEnv | null {
  return _currentEnv;
}

/**
 * Get the D1 database binding for the current request.
 * Throws if D1 is not available.
 */
export function getDB(): D1Database {
  // Prefer the env set for the current request (server.ts or TanStack Start middleware).
  const env = resolveCloudflareEnv() ?? resolveLegacyEnv();
  if (env?.DB) return env.DB;

  throw new Error(
    "D1 database binding 'DB' not found. Ensure wrangler.jsonc has a d1_databases entry with binding 'DB'.",
  );
}

/** Legacy fallbacks for non-request contexts (build scripts, tests, etc.). */
function resolveLegacyEnv(): CloudflareEnv | null {
  if (
    typeof process !== "undefined" &&
    process.env &&
    (process.env as Record<string, unknown>).DB
  ) {
    return { DB: (process.env as Record<string, unknown>).DB as D1Database };
  }

  const g = globalThis as Record<string, unknown>;
  if (g.DB) return { DB: g.DB as D1Database };

  return null;
}
