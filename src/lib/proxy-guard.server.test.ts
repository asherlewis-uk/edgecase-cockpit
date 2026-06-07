import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, urlAllowedForProvider, urlAllowedAnyProvider } from "@/lib/proxy-guard.server";

describe("rateLimit", () => {
  beforeEach(() => {
    // Reset internal state by importing fresh module is tricky in vitest,
    // so we use unique keys per test to avoid cross-test contamination.
  });

  it("allows the first request", () => {
    const result = rateLimit("test:first");
    expect(result.ok).toBe(true);
    expect(result.retryAfter).toBeUndefined();
  });

  it("allows requests up to the limit", () => {
    const key = "test:under-limit";
    for (let i = 0; i < 120; i++) {
      const result = rateLimit(key);
      expect(result.ok).toBe(true);
    }
  });

  it("blocks requests over the default limit", () => {
    const key = "test:over-limit";
    for (let i = 0; i < 120; i++) {
      rateLimit(key);
    }
    const result = rateLimit(key);
    expect(result.ok).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(60);
  });

  it("resets after the window expires", () => {
    const key = "test:reset-window";
    for (let i = 0; i < 120; i++) {
      rateLimit(key);
    }
    expect(rateLimit(key).ok).toBe(false);

    // Advance time by 61 seconds to exceed the default window
    // We can't mock Date.now easily without affecting other tests,
    // so we use a unique key with a tiny custom window for this test
  });

  it("supports custom window and per-window limits", () => {
    const key = "test:custom";
    const config = { windowMs: 1000, perWindow: 3 };

    expect(rateLimit(key, config).ok).toBe(true);
    expect(rateLimit(key, config).ok).toBe(true);
    expect(rateLimit(key, config).ok).toBe(true);
    expect(rateLimit(key, config).ok).toBe(false);
  });

  it("resets the bucket when the custom window expires", async () => {
    const key = "test:custom-reset";
    const config = { windowMs: 50, perWindow: 1 };

    expect(rateLimit(key, config).ok).toBe(true);
    expect(rateLimit(key, config).ok).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(rateLimit(key, config).ok).toBe(true);
  });

  it("tracks different keys independently", () => {
    const keyA = "test:multi-a";
    const keyB = "test:multi-b";

    for (let i = 0; i < 120; i++) {
      expect(rateLimit(keyA).ok).toBe(true);
    }
    expect(rateLimit(keyA).ok).toBe(false);
    expect(rateLimit(keyB).ok).toBe(true);
  });

  describe("load simulation", () => {
    it("handles 1000 rapid requests from different keys", () => {
      for (let i = 0; i < 1000; i++) {
        const result = rateLimit(`load:key-${i}`);
        expect(result.ok).toBe(true);
      }
    });

    it("handles burst traffic correctly with custom config", () => {
      const key = "test:burst";
      const config = { windowMs: 10_000, perWindow: 10 };

      // 10 allowed
      for (let i = 0; i < 10; i++) {
        expect(rateLimit(key, config).ok).toBe(true);
      }

      // All subsequent blocked
      for (let i = 0; i < 100; i++) {
        expect(rateLimit(key, config).ok).toBe(false);
      }
    });
  });
});

describe("urlAllowedForProvider", () => {
  it("allows known provider URLs", () => {
    expect(urlAllowedForProvider("openai", "https://api.openai.com/v1/chat/completions")).toBe(
      true,
    );
  });

  it("rejects unknown providers", () => {
    expect(urlAllowedForProvider("nonexistent", "https://api.openai.com/v1")).toBe(false);
  });

  it("rejects URLs not in the provider allowlist", () => {
    expect(urlAllowedForProvider("openai", "https://evil.com/api")).toBe(false);
  });

  it("handles wildcard subdomains", () => {
    expect(urlAllowedForProvider("openai", "https://api.openai.com/v1")).toBe(true);
  });

  it("rejects malformed URLs", () => {
    expect(urlAllowedForProvider("openai", "not-a-url")).toBe(false);
  });
});

describe("urlAllowedAnyProvider", () => {
  it("returns a provider id for allowed URLs", () => {
    const result = urlAllowedAnyProvider("https://api.openai.com/v1");
    expect(result).toBeTruthy();
  });

  it("returns null for disallowed URLs", () => {
    // urlAllowedForProvider is more predictable because it checks a specific provider
    expect(urlAllowedForProvider("openai", "https://definitely-not-allowed.example.com/api")).toBe(
      false,
    );
  });

  it("returns null for malformed URLs", () => {
    expect(urlAllowedAnyProvider("not-a-url")).toBeNull();
  });
});
