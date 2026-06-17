import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isProviderToolDiscoveryEnabled,
  discoverProviderTools,
  discoverAllProviderTools,
  getDiscoveryProviders,
} from "./provider-tool-discovery.server";

vi.mock("./session.server", () => ({
  getProviderCreds: vi.fn().mockResolvedValue(null),
}));

import { getProviderCreds } from "./session.server";

describe("provider-tool-discovery.server", () => {
  const origEnv = process.env.ENABLE_PROVIDER_TOOL_DISCOVERY;

  beforeEach(() => {
    process.env.ENABLE_PROVIDER_TOOL_DISCOVERY = "true";
    vi.mocked(getProviderCreds).mockReset();
  });

  afterEach(() => {
    if (origEnv === undefined) {
      delete process.env.ENABLE_PROVIDER_TOOL_DISCOVERY;
    } else {
      process.env.ENABLE_PROVIDER_TOOL_DISCOVERY = origEnv;
    }
  });

  it("is disabled by default", () => {
    delete process.env.ENABLE_PROVIDER_TOOL_DISCOVERY;
    expect(isProviderToolDiscoveryEnabled()).toBe(false);
  });

  it("is enabled when env is set", () => {
    process.env.ENABLE_PROVIDER_TOOL_DISCOVERY = "true";
    expect(isProviderToolDiscoveryEnabled()).toBe(true);
  });

  it("returns disabled error when env is not set", async () => {
    delete process.env.ENABLE_PROVIDER_TOOL_DISCOVERY;
    const result = await discoverProviderTools("openai");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("disabled");
    }
  });

  it("returns credential error when key is missing", async () => {
    vi.mocked(getProviderCreds).mockResolvedValue(null);
    const result = await discoverProviderTools("openai");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("API key not configured");
    }
  });

  it("returns empty tool list when key is present", async () => {
    vi.mocked(getProviderCreds).mockResolvedValue({ apiKey: "sk-test" });
    const result = await discoverProviderTools("openai");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tools).toEqual([]);
      expect(result.source).toBe("openai");
    }
  });

  it("returns error for unsupported provider", async () => {
    const result = await discoverProviderTools("unknown");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("does not support tool discovery");
    }
  });

  it("discovers all providers in parallel", async () => {
    vi.mocked(getProviderCreds).mockImplementation(async (id) => {
      return id === "openai" ? { apiKey: "sk-test" } : null;
    });
    const results = await discoverAllProviderTools();
    expect(results.openai.ok).toBe(true);
    expect(results.anthropic.ok).toBe(false);
    expect(results.gemini.ok).toBe(false);
  });

  it("lists discovery providers", () => {
    const providers = getDiscoveryProviders();
    expect(providers.map((p) => p.id)).toContain("openai");
    expect(providers.map((p) => p.id)).toContain("anthropic");
    expect(providers.map((p) => p.id)).toContain("gemini");
  });
});
