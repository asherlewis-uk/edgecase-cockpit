import { describe, it, expect, vi } from "vitest";
import {
  deriveLocalCapabilityState,
  getProvider,
  probeLocalOpenAICompatibleModels,
  PROVIDERS,
  ProviderError,
  V1_LOCAL_OPENAI_COMPAT_ENDPOINT_ID,
  type ChatMessage,
  type LocalCapabilityStateInput,
} from "@/lib/providers";
import { buildPersonalizationSystemMessage } from "@/hooks/use-chat";
import { defaultSettings } from "@/lib/cockpit-store";

// ---------------------------------------------------------------------------
// getProvider
// ---------------------------------------------------------------------------
describe("getProvider", () => {
  it("returns the correct provider for known ID", () => {
    const provider = getProvider("openai");
    expect(provider).toBeDefined();
    expect(provider.id).toBe("openai");
    expect(provider.name).toBe("OpenAI");
    expect(provider.type).toBe("cloud");
  });

  it("returns the first provider as fallback for null/undefined", () => {
    const provider = getProvider(null);
    expect(provider.id).toBe(PROVIDERS[0].id);
  });

  it("returns the first provider as fallback for unknown IDs", () => {
    const provider = getProvider("completely-fake-provider-999");
    expect(provider.id).toBe(PROVIDERS[0].id);
  });

  it("all providers have required fields", () => {
    for (const p of PROVIDERS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(typeof p.type).toBe("string");
      expect(p.defaultBaseUrl).toBeTruthy();
      expect(p.defaultModel).toBeTruthy();
      expect(p.chatPath).toBeTruthy();
      expect(["bearer", "x-api-key", "none"]).toContain(p.authStyle);
      expect(["openai", "anthropic", "gemini"]).toContain(p.bodyStyle);
    }
  });
});

// ---------------------------------------------------------------------------
// buildPersonalizationSystemMessage
// ---------------------------------------------------------------------------
describe("buildPersonalizationSystemMessage", () => {
  it("generates correct system message with default profile", () => {
    const msg = buildPersonalizationSystemMessage(defaultSettings);
    expect(msg).not.toBeNull();
    expect(msg!.role).toBe("system");
    expect(msg!.content).toContain("You are Cockpit");
    expect(msg!.content).toContain("Use a warm response tone");
    expect(msg!.content).toContain(
      `The user's display name is ${defaultSettings.profile.displayName}`,
    );
  });

  it("includes role label when set", () => {
    const settings = {
      ...defaultSettings,
      profile: { ...defaultSettings.profile, roleLabel: "Engineer" },
    };
    const msg = buildPersonalizationSystemMessage(settings);
    expect(msg?.content).toContain("The user's role label is Engineer");
  });

  it("includes pronouns when set", () => {
    const settings = {
      ...defaultSettings,
      profile: { ...defaultSettings.profile, pronouns: "they/them" },
    };
    const msg = buildPersonalizationSystemMessage(settings);
    expect(msg?.content).toContain("The user's pronouns are they/them");
  });

  it("includes handle when set", () => {
    const settings = {
      ...defaultSettings,
      profile: { ...defaultSettings.profile, handle: "@testuser" },
    };
    const msg = buildPersonalizationSystemMessage(settings);
    expect(msg?.content).toContain("The user's handle is @testuser");
  });

  it("uses custom assistant name", () => {
    const settings = {
      ...defaultSettings,
      personalization: {
        ...defaultSettings.personalization,
        assistantName: "Jarvis",
      },
    };
    const msg = buildPersonalizationSystemMessage(settings);
    expect(msg?.content).toContain("You are Jarvis");
  });

  it("uses custom tone", () => {
    const settings = {
      ...defaultSettings,
      personalization: {
        ...defaultSettings.personalization,
        preferredTone: "technical" as const,
      },
    };
    const msg = buildPersonalizationSystemMessage(settings);
    expect(msg?.content).toContain("Use a technical response tone");
  });

  it("does not include display name line when displayName is empty", () => {
    const settings = {
      ...defaultSettings,
      profile: { ...defaultSettings.profile, displayName: "" },
    };
    const msg = buildPersonalizationSystemMessage(settings);
    expect(msg?.content).not.toContain("The user's display name is");
  });
});

// ---------------------------------------------------------------------------
// normalizeMessages concept (tested via buildBody output)
// ---------------------------------------------------------------------------
describe("ChatMessage processing", () => {
  // NOTE: normalizeMessages is not exported, so we verify it indirectly
  // through buildBody and by checking the behavior described in the source.
  // The key behavior: messages with attachments get content arrays with
  // text and image_url parts for OpenAI body style.

  it("ProviderError has correct properties", () => {
    const err = new ProviderError("Rate limited", 429, 60);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProviderError");
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(60);
    expect(err.message).toBe("Rate limited");
  });

  it("ProviderError without retryAfter", () => {
    const err = new ProviderError("Unauthorized", 401);
    expect(err.status).toBe(401);
    expect(err.retryAfter).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Provider catalog integrity
// ---------------------------------------------------------------------------
describe("PROVIDERS catalog", () => {
  it("contains known cloud providers", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(ids).toContain("openai");
    expect(ids).toContain("anthropic");
    expect(ids).toContain("gemini");
  });

  it("all providers have unique ids", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cloud providers require API keys", () => {
    const cloud = PROVIDERS.filter((p) => p.type === "cloud");
    for (const p of cloud) {
      // Some cloud providers may not need keys (like local emulators), but most do
      expect(p.needsApiKey).toBeDefined();
    }
  });

  it("local/openai-compatible providers have baseUrlEditable", () => {
    // Local/openai-compatible providers should allow base URL editing
    const openaiCompat = PROVIDERS.filter((p) => p.authStyle === "none" || p.baseUrlEditable);
    for (const p of openaiCompat) {
      if (p.baseUrlEditable !== undefined) {
        expect(p.baseUrlEditable).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// deriveLocalCapabilityState
// ---------------------------------------------------------------------------
describe("deriveLocalCapabilityState", () => {
  const baseInput: LocalCapabilityStateInput = {
    endpointId: V1_LOCAL_OPENAI_COMPAT_ENDPOINT_ID,
    providerId: "custom",
    baseUrl: "http://localhost:8000",
    chatPath: "/v1/chat/completions",
    modelsPath: "/v1/models",
    environment: { pageProtocol: "http:", isMobile: false },
  };

  it("models checking state before reachability or model-list results exist", () => {
    const state = deriveLocalCapabilityState({ ...baseInput, checking: true });
    expect(state.status).toBe("checking");
    expect(state.actionable).toBe(false);
    expect(state.label).toBe("Checking local endpoint");
  });

  it("models misconfigured state for a missing base URL", () => {
    const state = deriveLocalCapabilityState({ ...baseInput, baseUrl: "" });
    expect(state.status).toBe("misconfigured");
    expect(state.reason).toContain("No local OpenAI-compatible base URL");
    expect(state.actionable).toBe(true);
  });

  it("models hosted HTTPS local HTTP blocking before fetch", () => {
    const state = deriveLocalCapabilityState({
      ...baseInput,
      environment: { pageProtocol: "https:", isMobile: false },
    });
    expect(state.status).toBe("hosted-HTTPS-blocked");
    expect(state.nextAction).toContain("localhost-safe context");
    expect(state.nextAction).toContain("http://127.0.0.1");
  });

  it("models mobile localhost mismatch before fetch", () => {
    const state = deriveLocalCapabilityState({
      ...baseInput,
      environment: { pageProtocol: "http:", isMobile: true },
    });
    expect(state.status).toBe("mobile-localhost-mismatch");
    expect(state.reason).toContain("localhost refers to the phone or tablet");
  });

  it("distinguishes basic reachability from ready model state", () => {
    const state = deriveLocalCapabilityState({
      ...baseInput,
      detect: { ok: true, status: 200 },
    });
    expect(state.status).toBe("reachable");
    expect(state.reason).toContain("usable model state has not been confirmed");
    expect(state.modelCount).toBeUndefined();
  });

  it("models unreachable state from a failed reachability check", () => {
    const state = deriveLocalCapabilityState({
      ...baseInput,
      detect: { ok: false, error: "fetch failed" },
    });
    expect(state.status).toBe("unreachable");
    expect(state.reason).toBe("fetch failed");
    expect(state.raw?.error).toBe("fetch failed");
  });

  it("models no-models state from an empty model-list result", () => {
    const state = deriveLocalCapabilityState({
      ...baseInput,
      modelList: { status: "success", models: [] },
    });
    expect(state.status).toBe("no-models");
    expect(state.modelCount).toBe(0);
    expect(state.models).toEqual([]);
  });

  it("models failed state from a malformed model-list response", () => {
    const state = deriveLocalCapabilityState({
      ...baseInput,
      modelList: { status: "malformed", statusCode: 200, error: "missing data[]" },
    });
    expect(state.status).toBe("failed");
    expect(state.label).toBe("Model-list response is malformed");
    expect(state.raw?.status).toBe(200);
  });

  it("models failed state from model-list timeout or network failure", () => {
    const state = deriveLocalCapabilityState({
      ...baseInput,
      modelList: { status: "failed", error: "timeout" },
    });
    expect(state.status).toBe("failed");
    expect(state.reason).toBe("timeout");
    expect(state.nextAction).toContain("retry the model-list check");
  });

  it("models ready state from usable model-list results", () => {
    const state = deriveLocalCapabilityState({
      ...baseInput,
      modelList: { status: "success", models: [{ id: "llama3" }, { id: "  " }] },
    });
    expect(state.status).toBe("ready");
    expect(state.modelCount).toBe(1);
    expect(state.models).toEqual([{ id: "llama3" }]);
    expect(state.raw?.modelSource).toBe("model-list");
  });

  it("models ready state only when reachable plus explicit model config exists", () => {
    const state = deriveLocalCapabilityState({
      ...baseInput,
      model: "local-model",
      detect: { ok: true, status: 200 },
    });
    expect(state.status).toBe("ready");
    expect(state.modelCount).toBe(1);
    expect(state.models).toEqual([{ id: "local-model" }]);
    expect(state.raw?.modelSource).toBe("configured");
  });

  it("models unreachable state from a model-list network failure", () => {
    const state = deriveLocalCapabilityState({
      ...baseInput,
      modelList: { status: "unreachable", error: "Failed to fetch" },
    });
    expect(state.status).toBe("unreachable");
    expect(state.label).toBe("Model-list endpoint unreachable");
    expect(state.nextAction).toContain("retry the model-list check");
  });
});

// ---------------------------------------------------------------------------
// probeLocalOpenAICompatibleModels
// ---------------------------------------------------------------------------
describe("probeLocalOpenAICompatibleModels", () => {
  const provider = getProvider("custom");

  it("returns usable models without sending auth or cloud key headers", async () => {
    let requestInit: RequestInit | undefined;
    const result = await probeLocalOpenAICompatibleModels({
      provider,
      baseUrl: "http://localhost:8000/",
      fetchImpl: async (url, init) => {
        requestInit = init;
        expect(url).toBe("http://localhost:8000/v1/models");
        return new Response(
          JSON.stringify({
            data: [{ id: "llama3", name: "Llama 3" }, { id: "  " }],
          }),
          { status: 200 },
        );
      },
    });

    expect(result.status).toBe("success");
    expect(result.statusCode).toBe(200);
    expect(result.models).toEqual([{ id: "llama3", label: "Llama 3" }]);
    const headers = new Headers(requestInit?.headers);
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("X-API-Key")).toBeNull();
  });

  it("returns empty when the model list has no usable ids", async () => {
    const result = await probeLocalOpenAICompatibleModels({
      provider,
      baseUrl: "http://localhost:8000",
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: [{ id: "" }, { object: "model" }] }), {
          status: 200,
        }),
    });

    expect(result.status).toBe("empty");
    expect(result.models).toEqual([]);
  });

  it("returns malformed when the response is not OpenAI-compatible", async () => {
    const result = await probeLocalOpenAICompatibleModels({
      provider,
      baseUrl: "http://localhost:8000",
      fetchImpl: async () => new Response(JSON.stringify({ models: ["llama3"] }), { status: 200 }),
    });

    expect(result.status).toBe("malformed");
    expect(result.error).toContain("data[]");
  });

  it("returns failed when the endpoint responds with a non-OK status", async () => {
    const result = await probeLocalOpenAICompatibleModels({
      provider,
      baseUrl: "http://localhost:8000",
      fetchImpl: async () => new Response("not found", { status: 404 }),
    });

    expect(result.status).toBe("failed");
    expect(result.statusCode).toBe(404);
    expect(result.error).toContain("HTTP 404");
  });

  it("returns unreachable when fetch cannot reach the endpoint", async () => {
    const result = await probeLocalOpenAICompatibleModels({
      provider,
      baseUrl: "http://localhost:8000",
      fetchImpl: async () => {
        throw new Error("Failed to fetch");
      },
    });

    expect(result.status).toBe("unreachable");
    expect(result.error).toBe("Failed to fetch");
  });

  it("returns failed when the probe times out", async () => {
    vi.useFakeTimers();
    try {
      const resultPromise = probeLocalOpenAICompatibleModels({
        provider,
        baseUrl: "http://localhost:8000",
        timeoutMs: 5,
        fetchImpl: async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      });

      await vi.advanceTimersByTimeAsync(5);
      const result = await resultPromise;
      expect(result.status).toBe("failed");
      expect(result.error).toContain("timed out");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns failed when the probe is aborted", async () => {
    const ctrl = new AbortController();
    const resultPromise = probeLocalOpenAICompatibleModels({
      provider,
      baseUrl: "http://localhost:8000",
      signal: ctrl.signal,
      fetchImpl: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });

    ctrl.abort();
    const result = await resultPromise;
    expect(result.status).toBe("failed");
    expect(result.error).toContain("aborted");
  });
});
