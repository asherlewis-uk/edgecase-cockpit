// Rate limiter with in-memory default and pluggable backend abstraction.
// In-memory is safe for single-node/self-hosted deployments.
// For distributed/multi-node deployments, swap in a shared-storage adapter
// implementing the IRateLimiterBackend interface.

export type RateLimiterConfig = {
  key: string;
  windowMs?: number;
  limit?: number;
};

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

export interface IRateLimiterBackend {
  checkLimit(
    key: string,
    windowMs: number,
    limit: number,
  ): RateLimitResult | Promise<RateLimitResult>;
  clearAll(): void | Promise<void>;
}

// ── D1-backed distributed limiter ───────────────────────────────────────────

import { getDB, getPlatformEnv } from "@/lib/platform.server";
import { DurableObjectRateLimiterBackend } from "./rate-limit-do.server";

class D1RateLimiterBackend implements IRateLimiterBackend {
  // In-memory cache for synchronous lookups. D1 writes are fire-and-forget
  // for eventual cross-worker consistency. This preserves the synchronous
  // IRateLimiterBackend interface.
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async checkLimit(key: string, windowMs: number, limit: number): Promise<RateLimitResult> {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      this.persistAsync(key, 1, now + windowMs);
      return { ok: true };
    }

    if (bucket.count >= limit) {
      return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
    }

    bucket.count++;
    this.persistAsync(key, bucket.count, bucket.resetAt);
    return { ok: true };
  }

  clearAll(): void {
    this.buckets.clear();
    try {
      getDB().prepare("DELETE FROM rate_limits").run();
    } catch {
      // ignore
    }
  }

  private persistAsync(key: string, count: number, resetAt: number): void {
    try {
      const db = getDB();
      db.prepare(
        `INSERT INTO rate_limits (key, count, reset_at, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(key) DO UPDATE SET count = ?2, reset_at = ?3, updated_at = ?4`,
      )
        .bind(key, count, resetAt, Date.now())
        .run();
    } catch {
      // fire-and-forget — in-memory is source of truth for this worker
    }
  }
}

/**
 * Try to activate the D1-backed distributed rate limiter.
 * Returns true if D1 is available and the backend was activated.
 * Call this at startup after DB binding is known to exist.
 */
export function tryActivateD1RateLimiter(): boolean {
  try {
    const db = getDB();
    // Verify the table exists with a lightweight query
    db.prepare("SELECT count(*) as cnt FROM rate_limits LIMIT 0").first();
    _backend = new D1RateLimiterBackend();
    console.log("[rate-limit] Using D1-backed distributed rate limiter.");
    return true;
  } catch {
    console.warn(
      "[rate-limit] D1 not available for distributed rate limiting; " +
        "falling back to in-memory.",
    );
    return false;
  }
}

/**
 * Configure the rate limiter backend from the RATE_LIMIT_BACKEND environment
 * variable. Called once at cold start.
 *
 *   RATE_LIMIT_BACKEND=auto   (default) — try D1, fall back to in-memory
 *   RATE_LIMIT_BACKEND=d1    — require D1; log error and fall back if unavailable
 *   RATE_LIMIT_BACKEND=memory — use in-memory explicitly (dev/single-node)
 *
 * Returns the name of the active backend for startup diagnostics.
 */
export function configureRateLimiterFromEnv(): "d1" | "memory" | "durable_object" {
  const mode = (process.env.RATE_LIMIT_BACKEND ?? "auto").toLowerCase();

  if (mode === "durable_object") {
    const env = getPlatformEnv();
    const ns = env?.RATE_LIMITER_DO as
      | import("./rate-limit-do.server").DurableObjectNamespace
      | undefined;
    if (ns) {
      _backend = new DurableObjectRateLimiterBackend(ns);
      console.log("[rate-limit] Using Durable Object backend for strong cross-Worker consistency.");
      return "durable_object";
    }
    console.error(
      "[rate-limit] RATE_LIMIT_BACKEND=durable_object but RATE_LIMITER_DO binding is missing. " +
        "Add the Durable Object binding to wrangler.jsonc. Falling back to D1/auto.",
    );
    return tryActivateD1RateLimiter() ? "d1" : "memory";
  }

  if (mode === "memory") {
    console.log(
      "[rate-limit] RATE_LIMIT_BACKEND=memory: using in-memory backend explicitly. " +
        "Suitable for local dev and single-node deployments.",
    );
    return "memory";
  }

  if (mode === "d1") {
    const ok = tryActivateD1RateLimiter();
    if (!ok) {
      console.error(
        "[rate-limit] RATE_LIMIT_BACKEND=d1 but D1 is unavailable. " +
          "Falling back to in-memory rate limiting. " +
          "Verify that the DB binding is configured in wrangler.jsonc.",
      );
    }
    return ok ? "d1" : "memory";
  }

  // "auto" or unset: try D1, silently fall back to in-memory
  const ok = tryActivateD1RateLimiter();
  return ok ? "d1" : "memory";
}

let _backend: IRateLimiterBackend | null = null;

/** For tests: reset the active backend to in-memory default. */
export function __resetRateLimiterBackend(): void {
  _backend = null;
}

/** Return the name of the currently active rate-limiter backend. */
export function getActiveRateLimiterBackend(): "d1" | "memory" | "durable_object" {
  if (_backend instanceof DurableObjectRateLimiterBackend) return "durable_object";
  return _backend !== null ? "d1" : "memory";
}

export function setRateLimiterBackend(backend: IRateLimiterBackend) {
  _backend = backend;
}

function getBackend(): IRateLimiterBackend {
  if (_backend) return _backend;
  return _defaultBackend;
}

// ── In-memory backend (default) ─────────────────────────────────────────────

const buckets = new Map<string, { count: number; resetAt: number }>();

const _defaultBackend: IRateLimiterBackend = {
  checkLimit(key, windowMs, limit): RateLimitResult {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true };
    }
    if (bucket.count >= limit) {
      return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    bucket.count++;
    return { ok: true };
  },
  clearAll() {
    buckets.clear();
  },
};

// ── Public API ──────────────────────────────────────────────────────────────

export const DEFAULT_WINDOW_MS = 60_000;
export const DEFAULT_LIMIT = 60;

export async function checkRateLimit(config: RateLimiterConfig): Promise<RateLimitResult> {
  const windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
  const limit = config.limit ?? DEFAULT_LIMIT;
  const result = getBackend().checkLimit(config.key, windowMs, limit);
  return result instanceof Promise ? await result : result;
}

export function clearRateLimitBuckets(): void {
  getBackend().clearAll();
}

/**
 * Production safety guard: warn (or fail) if in-memory rate limiting is
 * active in a production-like environment without explicit acknowledgement.
 *
 * In-memory rate limiting resets on every cold start and does not share
 * state across multiple Workers / nodes.  This function emits a prominent
 * warning and recommends setting ALLOW_IN_MEMORY_RATE_LIMIT=true when the
 * operator has intentionally chosen the simpler single-node deployment path.
 */
export function warnInMemoryRateLimitInProduction(): void {
  if (process.env.NODE_ENV !== "production") return;

  // A custom backend has been plugged in — safe.
  if (_backend !== null) return;

  if (process.env.ALLOW_IN_MEMORY_RATE_LIMIT === "true") {
    console.warn(
      "[rate-limit] Using in-memory rate limiting in production " +
        "(ALLOW_IN_MEMORY_RATE_LIMIT=true). Distributed deployments may see " +
        "inconsistent enforcement.",
    );
    return;
  }

  console.error(
    "[rate-limit] IN-MEMORY rate limiting is active in production. " +
      "This is not suitable for multi-node deployments because buckets " +
      "are not shared across Workers. " +
      "Either swap in a distributed backend via setRateLimiterBackend(), " +
      "or set ALLOW_IN_MEMORY_RATE_LIMIT=true if you have intentionally " +
      "chosen a single-node deployment.",
  );
}

/**
 * Build a standard rate-limited 429 Response.
 */
export function rateLimitResponse(retryAfter: number): Response {
  return Response.json(
    { error: "Rate limited", retryAfter },
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        ...(retryAfter > 0 ? { "retry-after": String(retryAfter) } : {}),
      },
    },
  );
}

// Preset limiters for common non-proxy route categories.

/** For credential/key routes (set/clear/validate). Low limit to deter brute force. */
export async function keysRateLimit(sessionId: string): Promise<RateLimitResult> {
  return await checkRateLimit({ key: `keys:${sessionId}`, limit: 20, windowMs: 60_000 });
}

/** For usage/ analytics read routes. */
export async function usageRateLimit(sessionId: string): Promise<RateLimitResult> {
  return await checkRateLimit({ key: `usage:${sessionId}`, limit: 60, windowMs: 60_000 });
}

/** For health checks. Very permissive but still bounded. */
export async function healthRateLimit(clientId: string): Promise<RateLimitResult> {
  return await checkRateLimit({ key: `health:${clientId}`, limit: 120, windowMs: 60_000 });
}

/** For thread mutation routes (create/update/delete/import/fork/pin). */
export async function threadsRateLimit(sessionId: string): Promise<RateLimitResult> {
  return await checkRateLimit({ key: `threads:${sessionId}`, limit: 60, windowMs: 60_000 });
}

/** For session bootstrap. */
export async function sessionRateLimit(key: string): Promise<RateLimitResult> {
  return await checkRateLimit({ key, limit: 30, windowMs: 60_000 });
}

/** For provider stats mutation. */
export async function statsRateLimit(key: string): Promise<RateLimitResult> {
  return checkRateLimit({ key, limit: 60, windowMs: 60_000 });
}
