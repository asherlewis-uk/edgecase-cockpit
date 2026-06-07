// Reusable in-memory rate limiter for non-proxy server-side routes.
// Safe for single-node/self-hosted deployments. Not suitable for distributed
// multi-node deployments without a shared store (Redis, etc.).

const buckets = new Map<string, { count: number; resetAt: number }>();

export const DEFAULT_WINDOW_MS = 60_000;
export const DEFAULT_LIMIT = 60;

export type RateLimiterConfig = {
  /** Bucket key suffix (prepended with route prefix automatically if omitted). */
  key: string;
  /** Time window in milliseconds. */
  windowMs?: number;
  /** Max requests allowed inside the window. */
  limit?: number;
};

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

/**
 * Check whether a request is within rate limits for the given key.
 * In-memory buckets are lazily created and cleaned on expiration.
 */
export function checkRateLimit(config: RateLimiterConfig): RateLimitResult {
  const windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
  const limit = config.limit ?? DEFAULT_LIMIT;
  const now = Date.now();

  const bucket = buckets.get(config.key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(config.key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count++;
  return { ok: true };
}

/**
 * Clear all buckets. Exposed primarily for tests.
 */
export function clearRateLimitBuckets(): void {
  buckets.clear();
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
export function keysRateLimit(sessionId: string): RateLimitResult {
  return checkRateLimit({ key: `keys:${sessionId}`, limit: 20, windowMs: 60_000 });
}

/** For usage/ analytics read routes. */
export function usageRateLimit(sessionId: string): RateLimitResult {
  return checkRateLimit({ key: `usage:${sessionId}`, limit: 60, windowMs: 60_000 });
}

/** For health checks. Very permissive but still bounded. */
export function healthRateLimit(clientId: string): RateLimitResult {
  return checkRateLimit({ key: `health:${clientId}`, limit: 120, windowMs: 60_000 });
}

/** For thread mutation routes (create/update/delete/import/fork/pin). */
export function threadsRateLimit(sessionId: string): RateLimitResult {
  return checkRateLimit({ key: `threads:${sessionId}`, limit: 60, windowMs: 60_000 });
}

/** For session bootstrap. */
export function sessionRateLimit(key: string): RateLimitResult {
  return checkRateLimit({ key, limit: 30, windowMs: 60_000 });
}

/** For provider stats mutation. */
export function statsRateLimit(key: string): RateLimitResult {
  return checkRateLimit({ key, limit: 60, windowMs: 60_000 });
}
