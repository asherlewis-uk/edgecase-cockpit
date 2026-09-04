import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { getBackendOrigin, validateEnv } from "@/lib/env.server";

describe("validateEnv", () => {
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.ENCRYPTION_KEY;
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
    vi.restoreAllMocks();
  });

  it("requires SESSION_SECRET everywhere", () => {
    expect(() => validateEnv({})).toThrow("SESSION_SECRET");
  });

  it("requires ENCRYPTION_KEY when a D1 binding is present", () => {
    expect(() =>
      validateEnv({
        SESSION_SECRET: "test-session-secret-32-characters",
        DB: {},
      }),
    ).toThrow("ENCRYPTION_KEY");
  });

  it("allows local development without ENCRYPTION_KEY", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(() =>
      validateEnv({
        SESSION_SECRET: "test-session-secret-32-characters",
        NODE_ENV: "development",
      }),
    ).not.toThrow();
  });
});

describe("getBackendOrigin", () => {
  const original = process.env.BACKEND_ORIGIN;

  beforeEach(() => {
    delete process.env.BACKEND_ORIGIN;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.BACKEND_ORIGIN;
    } else {
      process.env.BACKEND_ORIGIN = original;
    }
  });

  it("is undefined when unset", () => {
    expect(getBackendOrigin({})).toBeUndefined();
  });

  it("reads the runtime env before process.env", () => {
    process.env.BACKEND_ORIGIN = "http://process-env:9999";
    expect(getBackendOrigin({ BACKEND_ORIGIN: "http://127.0.0.1:8000" })).toBe(
      "http://127.0.0.1:8000",
    );
  });

  it("falls back to process.env", () => {
    process.env.BACKEND_ORIGIN = "http://127.0.0.1:8000";
    expect(getBackendOrigin({})).toBe("http://127.0.0.1:8000");
  });

  it("treats a blank value as unset", () => {
    expect(getBackendOrigin({ BACKEND_ORIGIN: "   " })).toBeUndefined();
  });
});
