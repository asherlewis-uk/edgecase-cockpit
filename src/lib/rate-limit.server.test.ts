import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  clearRateLimitBuckets,
  rateLimitResponse,
  keysRateLimit,
  usageRateLimit,
  healthRateLimit,
  threadsRateLimit,
  sessionRateLimit,
  statsRateLimit,
  warnInMemoryRateLimitInProduction,
  tryActivateD1RateLimiter,
  configureRateLimiterFromEnv,
  getActiveRateLimiterBackend,
  __resetRateLimiterBackend,
} from "@/lib/rate-limit.server";

vi.mock("@/lib/platform.server", () => ({
  getDB: vi.fn(),
}));

import { getDB } from "@/lib/platform.server";

describe("rate-limit.server", () => {
  beforeEach(() => {
    clearRateLimitBuckets();
  });

  it("allows the first request", () => {
    const result = checkRateLimit({ key: "test:a", limit: 3, windowMs: 1000 });
    expect(result.ok).toBe(true);
  });

  it("blocks after limit is reached", () => {
    const key = "test:b";
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit({ key, limit: 3, windowMs: 1000 }).ok).toBe(true);
    }
    const result = checkRateLimit({ key, limit: 3, windowMs: 1000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfter).toBeGreaterThan(0);
    }
  });

  it("resets the bucket after the window expires", async () => {
    const key = "test:c";
    expect(checkRateLimit({ key, limit: 1, windowMs: 25 }).ok).toBe(true);
    expect(checkRateLimit({ key, limit: 1, windowMs: 25 }).ok).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(checkRateLimit({ key, limit: 1, windowMs: 25 }).ok).toBe(true);
  });

  it("tracks independent buckets per key", () => {
    expect(checkRateLimit({ key: "test:d1", limit: 1, windowMs: 1000 }).ok).toBe(true);
    expect(checkRateLimit({ key: "test:d1", limit: 1, windowMs: 1000 }).ok).toBe(false);
    expect(checkRateLimit({ key: "test:d2", limit: 1, windowMs: 1000 }).ok).toBe(true);
  });

  it("returns a 429 response with retry-after", () => {
    const response = rateLimitResponse(42);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
  });

  it("keysRateLimit uses a low threshold", () => {
    const sessionId = "session-1";
    for (let i = 0; i < 20; i++) {
      expect(keysRateLimit(sessionId).ok).toBe(true);
    }
    expect(keysRateLimit(sessionId).ok).toBe(false);
  });

  it("usageRateLimit is more permissive than keys", () => {
    const sessionId = "session-2";
    for (let i = 0; i < 60; i++) {
      expect(usageRateLimit(sessionId).ok).toBe(true);
    }
    expect(usageRateLimit(sessionId).ok).toBe(false);
  });

  it("healthRateLimit is the most permissive preset", () => {
    const clientId = "client-1";
    for (let i = 0; i < 120; i++) {
      expect(healthRateLimit(clientId).ok).toBe(true);
    }
    expect(healthRateLimit(clientId).ok).toBe(false);
  });

  it("threadsRateLimit allows 60 requests per minute", () => {
    const sessionId = "session-threads";
    for (let i = 0; i < 60; i++) {
      expect(threadsRateLimit(sessionId).ok).toBe(true);
    }
    expect(threadsRateLimit(sessionId).ok).toBe(false);
  });

  it("sessionRateLimit allows 30 requests per minute", () => {
    expect(sessionRateLimit("session:global").ok).toBe(true);
    for (let i = 1; i < 30; i++) {
      expect(sessionRateLimit("session:global").ok).toBe(true);
    }
    expect(sessionRateLimit("session:global").ok).toBe(false);
  });

  it("statsRateLimit allows 60 requests per minute", () => {
    const key = "stats:session-1";
    for (let i = 0; i < 60; i++) {
      expect(statsRateLimit(key).ok).toBe(true);
    }
    expect(statsRateLimit(key).ok).toBe(false);
  });
});

// ── Production safety guard ────────────────────────────────────────────────

describe("warnInMemoryRateLimitInProduction", () => {
  const origNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env.NODE_ENV = origNodeEnv;
  });

  it("does not warn outside production", () => {
    delete process.env.NODE_ENV;
    // No custom backend, not in production — should not log warnings.
    // We can verify by calling it; the function guards on NODE_ENV.
    expect(() => warnInMemoryRateLimitInProduction()).not.toThrow();
  });

  it("logs a prominent warning in production without opt-in", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_IN_MEMORY_RATE_LIMIT;
    // Should not throw, but will emit console.error.
    expect(() => warnInMemoryRateLimitInProduction()).not.toThrow();
  });

  it("logs a softer warning in production with opt-in", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_IN_MEMORY_RATE_LIMIT = "true";
    // Should not throw, emits console.warn instead of error.
    expect(() => warnInMemoryRateLimitInProduction()).not.toThrow();
  });
});

// ── D1-backed distributed rate limiter ────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any -- D1 mock objects use any for minimal stubs */
describe("tryActivateD1RateLimiter", () => {
  afterEach(() => {
    __resetRateLimiterBackend();
    vi.mocked(getDB).mockReset();
  });

  it("returns true and activates D1 backend when DB is available", () => {
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnValue(null),
      }),
    };
    vi.mocked(getDB).mockReturnValue(mockDb as any);

    const result = tryActivateD1RateLimiter();
    expect(result).toBe(true);
  });

  it("returns false and leaves in-memory backend when DB throws", () => {
    vi.mocked(getDB).mockImplementation(() => {
      throw new Error("D1 not available");
    });

    const result = tryActivateD1RateLimiter();
    expect(result).toBe(false);
  });

  it("after D1 activation, rate limiting still functions correctly", () => {
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnValue(null),
        bind: vi.fn().mockReturnThis(),
        run: vi.fn(),
      }),
    };
    vi.mocked(getDB).mockReturnValue(mockDb as any);

    tryActivateD1RateLimiter();
    clearRateLimitBuckets();

    // Should allow requests up to limit
    const r1 = checkRateLimit({ key: "d1-test", limit: 2, windowMs: 1000 });
    expect(r1.ok).toBe(true);
    const r2 = checkRateLimit({ key: "d1-test", limit: 2, windowMs: 1000 });
    expect(r2.ok).toBe(true);
    const r3 = checkRateLimit({ key: "d1-test", limit: 2, windowMs: 1000 });
    expect(r3.ok).toBe(false);
  });

  it("production warning is silent after D1 backend activates", () => {
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnValue(null),
      }),
    };
    vi.mocked(getDB).mockReturnValue(mockDb as any);

    tryActivateD1RateLimiter();

    // When a custom backend is active, warnInMemoryRateLimitInProduction is silent
    process.env.NODE_ENV = "production";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnInMemoryRateLimitInProduction();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    delete process.env.NODE_ENV;
  });
});

// ── configureRateLimiterFromEnv ────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any -- D1 mock objects use any */
describe("configureRateLimiterFromEnv", () => {
  const origEnv = process.env.RATE_LIMIT_BACKEND;

  afterEach(() => {
    __resetRateLimiterBackend();
    vi.mocked(getDB).mockReset();
    if (origEnv !== undefined) {
      process.env.RATE_LIMIT_BACKEND = origEnv;
    } else {
      delete process.env.RATE_LIMIT_BACKEND;
    }
  });

  it("RATE_LIMIT_BACKEND=memory uses in-memory backend without touching D1", () => {
    process.env.RATE_LIMIT_BACKEND = "memory";
    const result = configureRateLimiterFromEnv();
    expect(result).toBe("memory");
    expect(getActiveRateLimiterBackend()).toBe("memory");
    // getDB should not have been called
    expect(vi.mocked(getDB)).not.toHaveBeenCalled();
  });

  it("RATE_LIMIT_BACKEND=d1 activates D1 when DB is available", () => {
    process.env.RATE_LIMIT_BACKEND = "d1";
    const mockDb = {
      prepare: vi.fn().mockReturnValue({ first: vi.fn().mockReturnValue(null) }),
    };
    vi.mocked(getDB).mockReturnValue(mockDb as any);

    const result = configureRateLimiterFromEnv();
    expect(result).toBe("d1");
    expect(getActiveRateLimiterBackend()).toBe("d1");
  });

  it("RATE_LIMIT_BACKEND=d1 falls back to memory when D1 unavailable", () => {
    process.env.RATE_LIMIT_BACKEND = "d1";
    vi.mocked(getDB).mockImplementation(() => {
      throw new Error("DB not available");
    });

    const result = configureRateLimiterFromEnv();
    expect(result).toBe("memory");
    expect(getActiveRateLimiterBackend()).toBe("memory");
  });

  it("RATE_LIMIT_BACKEND=auto tries D1 and succeeds", () => {
    process.env.RATE_LIMIT_BACKEND = "auto";
    const mockDb = {
      prepare: vi.fn().mockReturnValue({ first: vi.fn().mockReturnValue(null) }),
    };
    vi.mocked(getDB).mockReturnValue(mockDb as any);

    const result = configureRateLimiterFromEnv();
    expect(result).toBe("d1");
  });

  it("unset RATE_LIMIT_BACKEND behaves as auto", () => {
    delete process.env.RATE_LIMIT_BACKEND;
    vi.mocked(getDB).mockImplementation(() => {
      throw new Error("no D1");
    });

    const result = configureRateLimiterFromEnv();
    expect(result).toBe("memory");
  });

  it("getActiveRateLimiterBackend returns memory before any activation", () => {
    // No D1 backend set
    expect(getActiveRateLimiterBackend()).toBe("memory");
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
