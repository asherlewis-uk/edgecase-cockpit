import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getCloudflareEnvFromRequest,
  resolveCloudflareEnv,
  setPlatformEnv,
  getDB,
} from "./platform.server";

const mockDB = { prepare: () => ({}) } as unknown as ReturnType<typeof getDB>;

describe("getCloudflareEnvFromRequest", () => {
  it("returns env from request.runtime.cloudflare.env", () => {
    const request = {
      runtime: { cloudflare: { env: { DB: mockDB, RATE_LIMITER_DO: {} } } },
    } as unknown as Request;
    expect(getCloudflareEnvFromRequest(request)).toEqual({
      DB: mockDB,
      RATE_LIMITER_DO: {},
    });
  });

  it("returns null when runtime is missing", () => {
    expect(getCloudflareEnvFromRequest(new Request("http://localhost/"))).toBeNull();
  });

  it("returns null for non-objects", () => {
    expect(getCloudflareEnvFromRequest(null)).toBeNull();
    expect(getCloudflareEnvFromRequest("string")).toBeNull();
  });
});

describe("resolveCloudflareEnv", () => {
  beforeEach(() => {
    setPlatformEnv(null);
    delete (globalThis as Record<string, unknown>).__env__;
    delete (globalThis as Record<string, unknown>).DB;
    delete (process.env as Record<string, unknown>).DB;
  });

  afterEach(() => {
    setPlatformEnv(null);
    delete (globalThis as Record<string, unknown>).__env__;
    delete (globalThis as Record<string, unknown>).DB;
    delete (process.env as Record<string, unknown>).DB;
  });

  it("resolves a direct env object", () => {
    const env = { DB: mockDB };
    expect(resolveCloudflareEnv(env)).toBe(env);
  });

  it("resolves an env from a context wrapper", () => {
    const env = { DB: mockDB };
    expect(resolveCloudflareEnv({ env })).toBe(env);
  });

  it("falls back to the stored platform env", () => {
    const env = { DB: mockDB };
    setPlatformEnv(env);
    expect(resolveCloudflareEnv()).toBe(env);
  });

  it("falls back to globalThis.__env__", () => {
    const env = { DB: mockDB };
    (globalThis as Record<string, unknown>).__env__ = env;
    expect(resolveCloudflareEnv()).toBe(env);
  });

  it("returns null when no source has DB", () => {
    expect(resolveCloudflareEnv({ env: { OTHER: "x" } })).toBeNull();
    expect(resolveCloudflareEnv({ nope: true })).toBeNull();
  });
});

describe("getDB", () => {
  beforeEach(() => {
    setPlatformEnv(null);
    delete (globalThis as Record<string, unknown>).__env__;
    delete (globalThis as Record<string, unknown>).DB;
    delete (process.env as Record<string, unknown>).DB;
  });

  afterEach(() => {
    setPlatformEnv(null);
    delete (globalThis as Record<string, unknown>).__env__;
    delete (globalThis as Record<string, unknown>).DB;
    delete (process.env as Record<string, unknown>).DB;
  });

  it("returns DB from the resolved env", () => {
    setPlatformEnv({ DB: mockDB });
    expect(getDB()).toBe(mockDB);
  });

  it("returns DB from process.env.DB legacy fallback", () => {
    // process.env coerces values to strings, so use a string binding marker.
    (process.env as Record<string, unknown>).DB = "test-binding";
    expect(getDB()).toBe("test-binding");
  });

  it("returns DB from globalThis.DB legacy fallback", () => {
    (globalThis as Record<string, unknown>).DB = mockDB;
    expect(getDB()).toBe(mockDB);
  });

  it("throws when no binding is found", () => {
    expect(() => getDB()).toThrow(
      "D1 database binding 'DB' not found. Ensure wrangler.jsonc has a d1_databases entry with binding 'DB'.",
    );
  });
});
