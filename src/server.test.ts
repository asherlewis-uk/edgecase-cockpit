import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getDB: vi.fn(),
  setPlatformEnv: vi.fn(),
  configureRateLimiterFromEnv: vi.fn(),
  warnInMemoryRateLimitInProduction: vi.fn(),
  logCustomProviderPolicy: vi.fn(),
}));

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: mocks.fetch },
}));

vi.mock("./lib/platform.server", () => ({
  getDB: mocks.getDB,
  setPlatformEnv: mocks.setPlatformEnv,
}));

vi.mock("./lib/rate-limit.server", () => ({
  configureRateLimiterFromEnv: mocks.configureRateLimiterFromEnv,
  warnInMemoryRateLimitInProduction: mocks.warnInMemoryRateLimitInProduction,
}));

vi.mock("./lib/proxy-guard.server", () => ({
  logCustomProviderPolicy: mocks.logCustomProviderPolicy,
}));

describe("server CSRF cookie issuance", () => {
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SESSION_SECRET = "test-session-secret-32-characters";
    process.env.ENCRYPTION_KEY = "test-encryption-secret-32-characters";
    process.env.NODE_ENV = "production";
    mocks.getDB.mockReturnValue({});
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
    if (originalEncryptionKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = originalEncryptionKey;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("sets a CSRF cookie on document responses when missing", async () => {
    mocks.fetch.mockResolvedValue(
      new Response("<!doctype html><html></html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const server = (await import("./server")).default;
    const response = await server.fetch(
      new Request("https://example.test/"),
      {
        SESSION_SECRET: "test-session-secret-32-characters",
        ENCRYPTION_KEY: "test-encryption-secret-32-characters",
        NODE_ENV: "production",
        DB: {},
      },
      {},
    );

    expect(response.headers.get("set-cookie")).toContain("csrf-token=");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
  });

  it("does not replace an existing CSRF cookie", async () => {
    mocks.fetch.mockResolvedValue(
      new Response("<!doctype html><html></html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const server = (await import("./server")).default;
    const response = await server.fetch(
      new Request("https://example.test/", {
        headers: { cookie: "csrf-token=existing" },
      }),
      {
        SESSION_SECRET: "test-session-secret-32-characters",
        ENCRYPTION_KEY: "test-encryption-secret-32-characters",
        NODE_ENV: "production",
        DB: {},
      },
      {},
    );

    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
