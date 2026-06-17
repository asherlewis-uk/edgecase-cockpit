import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { validateEnv } from "@/lib/env.server";

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
