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

let _currentEnv: CloudflareEnv | null = null;

/**
 * Set the platform env for the current request.
 * Called from server.ts before dispatching to TanStack Start.
 */
export function setPlatformEnv(env: unknown): void {
  _currentEnv = (env as CloudflareEnv) ?? null;
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
  // Try platform env first (set by server.ts)
  const env = getPlatformEnv();
  if (env?.DB) return env.DB;

  // Fallback: try process.env (some CF setups inject bindings here in nodejs_compat mode)
  if (
    typeof process !== "undefined" &&
    process.env &&
    (process.env as Record<string, unknown>).DB
  ) {
    return (process.env as Record<string, unknown>).DB as D1Database;
  }

  // Fallback: try globalThis (some setups attach to global)
  const g = globalThis as Record<string, unknown>;
  if (g.DB) return g.DB as D1Database;

  throw new Error(
    "D1 database binding 'DB' not found. Ensure wrangler.jsonc has a d1_databases entry with binding 'DB'.",
  );
}
