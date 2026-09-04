import { describe, it, expect } from "vitest";
import * as api from "./provider-api";

/**
 * The catalog contract. Cloud providers are supported infrastructure, not
 * clutter to be trimmed so a local-first story reads better. Removing an entry
 * from this list is a product decision, and it goes through this test.
 */
const CATALOG = [
  "openai",
  "anthropic",
  "gemini",
  "moonshot",
  "openrouter",
  "ollama-cloud",
  "nvidia-nim",
  "vercel-ai",
  "ollama",
  "lmstudio",
  "hermes",
  "openclaw",
  "vllm",
  "llama-cpp",
  "custom",
];

describe("provider catalog", () => {
  it("keeps all 15 entries, cloud and local alike", () => {
    expect(api.PROVIDERS.map((p) => p.id)).toEqual(CATALOG);
  });

  it("keeps the generic local OpenAI-compatible endpoint pointed at a real entry", () => {
    expect(api.V1_LOCAL_OPENAI_COMPAT_PROVIDER_ID).toBe("custom");
    expect(CATALOG).toContain(api.V1_LOCAL_OPENAI_COMPAT_PROVIDER_ID);
    expect(api.getProvider(api.V1_LOCAL_OPENAI_COMPAT_PROVIDER_ID).id).toBe("custom");
  });

  it("exposes catalog, detection, model-list, routing and status through one facade", () => {
    for (const fn of [
      "getProvider",
      "detectProvider",
      "deriveLocalCapabilityState",
      "probeLocalOpenAICompatibleModels",
      "callProviderChat",
      "callProviderChatViaProxy",
      "transcribeAudioViaProxy",
    ]) {
      expect(typeof api[fn as keyof typeof api], `${fn} missing from facade`).toBe("function");
    }
  });
});
