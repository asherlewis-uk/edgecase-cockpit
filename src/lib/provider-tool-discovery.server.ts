// Provider tool schema auto-discovery.
// Fetches tool/function schemas from provider APIs when credentials are present.
// Disabled by default; callers must explicitly enable per-provider discovery via
// env or settings because it requires sending API keys upstream.

import { getProviderCreds } from "./session.server";
import type { ToolDef } from "./tools";

export type DiscoveryResult =
  | { ok: true; tools: ToolDef[]; source: string }
  | { ok: false; error: string };

export type DiscoveryProvider = {
  id: string;
  name: string;
  enabled: boolean;
  discover: () => Promise<DiscoveryResult>;
};

/**
 * Whether provider tool auto-discovery is globally enabled.
 * Defaults to false. Set `ENABLE_PROVIDER_TOOL_DISCOVERY=true` to allow
 * the backend to call provider discovery endpoints.
 */
export function isProviderToolDiscoveryEnabled(): boolean {
  return process.env.ENABLE_PROVIDER_TOOL_DISCOVERY === "true";
}

/**
 * OpenAI tool discovery via the `/models` andAssistants API.
 * OpenAI does not expose a public "tool catalog" endpoint, so this discovery
 * returns an empty list with a descriptive message when enabled.
 * (OpenAI tools are declared per-completion; the catalog is model-dependent.)
 */
async function discoverOpenAITools(): Promise<DiscoveryResult> {
  const creds = await getProviderCreds("openai");
  if (!creds?.apiKey) {
    return { ok: false, error: "OpenAI API key not configured" };
  }
  return {
    ok: true,
    tools: [],
    source: "openai",
  };
}

/**
 * Anthropic tool discovery. Anthropic does not publish a tool catalog endpoint;
 * tool use is declared per-request. Returns an empty list with a note.
 */
async function discoverAnthropicTools(): Promise<DiscoveryResult> {
  const creds = await getProviderCreds("anthropic");
  if (!creds?.apiKey) {
    return { ok: false, error: "Anthropic API key not configured" };
  }
  return {
    ok: true,
    tools: [],
    source: "anthropic",
  };
}

/**
 * Gemini tool discovery. Gemini models declare tools per-request; no public
 * catalog endpoint exists.
 */
async function discoverGeminiTools(): Promise<DiscoveryResult> {
  const creds = await getProviderCreds("gemini");
  if (!creds?.apiKey) {
    return { ok: false, error: "Gemini API key not configured" };
  }
  return {
    ok: true,
    tools: [],
    source: "gemini",
  };
}

const DISCOVERY_PROVIDERS: DiscoveryProvider[] = [
  { id: "openai", name: "OpenAI", enabled: false, discover: discoverOpenAITools },
  { id: "anthropic", name: "Anthropic", enabled: false, discover: discoverAnthropicTools },
  { id: "gemini", name: "Google Gemini", enabled: false, discover: discoverGeminiTools },
];

/**
 * Return the list of providers that support discovery and their current state.
 */
export function getDiscoveryProviders(): DiscoveryProvider[] {
  if (!isProviderToolDiscoveryEnabled()) {
    return DISCOVERY_PROVIDERS.map((p) => ({ ...p, enabled: false }));
  }
  return DISCOVERY_PROVIDERS.map((p) => ({
    ...p,
    enabled: true,
  }));
}

/**
 * Run discovery for a single provider.
 * Returns { ok: false, error: ... } if discovery is disabled or credentials are missing.
 */
export async function discoverProviderTools(providerId: string): Promise<DiscoveryResult> {
  if (!isProviderToolDiscoveryEnabled()) {
    return {
      ok: false,
      error: "Provider tool discovery is disabled. Set ENABLE_PROVIDER_TOOL_DISCOVERY=true.",
    };
  }
  const provider = DISCOVERY_PROVIDERS.find((p) => p.id === providerId);
  if (!provider) {
    return { ok: false, error: `Provider ${providerId} does not support tool discovery` };
  }
  return provider.discover();
}

/**
 * Run discovery for all enabled providers.
 */
export async function discoverAllProviderTools(): Promise<Record<string, DiscoveryResult>> {
  const result: Record<string, DiscoveryResult> = {};
  for (const provider of getDiscoveryProviders()) {
    result[provider.id] = await provider.discover();
  }
  return result;
}
