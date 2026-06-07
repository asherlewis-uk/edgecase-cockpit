import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  clearRateLimitBuckets,
  rateLimitResponse,
  keysRateLimit,
  usageRateLimit,
  healthRateLimit,
} from "@/lib/rate-limit.server";

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
});
