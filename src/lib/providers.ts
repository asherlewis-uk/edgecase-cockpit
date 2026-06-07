// Provider abstraction layer. Endpoint paths are implementation details and
// must not leak into the UI. The catalog below defines first-class providers
// (cloud + local). Runtime is OpenAI-compatible by default, with body-style
// adapters for Anthropic and Gemini native APIs.

export type Capability = "chat" | "embeddings" | "vision" | "tools";

export type BodyStyle = "openai" | "anthropic" | "gemini";
export type AuthStyle = "bearer" | "x-api-key" | "none";

export type ProviderDef = {
  id: string;
  name: string;
  type: "cloud" | "local";
  badge: string; // 1-2 char monogram
  accent: string; // tailwind gradient classes
  description: string;
  supports: Record<Capability, boolean>;
  defaultBaseUrl: string;
  defaultModel: string;
  /** Allow user to override the base URL (true for local / custom). */
  baseUrlEditable?: boolean;
  /** Whether this provider needs an API key. */
  needsApiKey?: boolean;
  /** Setup hint shown on provider card. */
  setupHint?: string;
  /** Hostnames to probe for auto-detection (local providers only). */
  detectUrl?: string;
  /** Hosts the server proxy is allowed to reach for this provider. */
  allowedHosts?: string[];
  /** Speech-to-text path (OpenAI-compat) — undefined means not supported. */
  transcribePath?: string;
  /** What media this provider can produce. */
  mediaCapabilities?: { video?: "generate" | "none"; image?: "generate" | "none" };
  // --- internals ---
  chatPath: string;
  embeddingsPath?: string;
  modelsPath?: string;
  authStyle: AuthStyle;
  bodyStyle: BodyStyle;
  extraHeaders?: Record<string, string>;
};

const cap = (
  chat = true,
  embeddings = false,
  vision = false,
  tools = false,
): Record<Capability, boolean> => ({ chat, embeddings, vision, tools });

export const PROVIDERS: ProviderDef[] = [
  // ───────────────────────── Cloud ─────────────────────────
  {
    id: "openai",
    name: "OpenAI",
    type: "cloud",
    badge: "AI",
    accent: "from-emerald-400 to-teal-500",
    description: "GPT-5, GPT-4o, embeddings, vision and tools.",
    supports: cap(true, true, true, true),
    defaultBaseUrl: "https://api.openai.com",
    defaultModel: "gpt-4o-mini",
    needsApiKey: true,
    setupHint: "Get an API key from platform.openai.com",
    allowedHosts: ["api.openai.com"],
    transcribePath: "/v1/audio/transcriptions",
    mediaCapabilities: { image: "generate", video: "none" },
    chatPath: "/v1/chat/completions",
    embeddingsPath: "/v1/embeddings",
    modelsPath: "/v1/models",
    authStyle: "bearer",
    bodyStyle: "openai",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    type: "cloud",
    badge: "An",
    accent: "from-amber-500 to-orange-600",
    description: "Claude Sonnet & Opus with long context and tools.",
    supports: cap(true, false, true, true),
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-3-5-sonnet-latest",
    needsApiKey: true,
    setupHint: "Get an API key from console.anthropic.com",
    allowedHosts: ["api.anthropic.com"],
    chatPath: "/v1/messages",
    authStyle: "x-api-key",
    bodyStyle: "anthropic",
    extraHeaders: { "anthropic-version": "2023-06-01" },
  },
  {
    id: "gemini",
    name: "Google Gemini",
    type: "cloud",
    badge: "Gm",
    accent: "from-sky-400 to-indigo-500",
    description: "Gemini 2.5 Flash & Pro with vision and tools.",
    supports: cap(true, true, true, true),
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    needsApiKey: true,
    setupHint: "Get an API key from aistudio.google.com",
    allowedHosts: ["generativelanguage.googleapis.com"],
    mediaCapabilities: { image: "generate", video: "generate" },
    chatPath: "/chat/completions",
    embeddingsPath: "/embeddings",
    modelsPath: "/models",
    authStyle: "bearer",
    bodyStyle: "openai",
  },
  {
    id: "moonshot",
    name: "Moonshot / KimiCoding",
    type: "cloud",
    badge: "Ki",
    accent: "from-violet-500 to-fuchsia-600",
    description: "Kimi K2 coding models from Moonshot AI.",
    supports: cap(true, false, false, true),
    defaultBaseUrl: "https://api.moonshot.ai",
    defaultModel: "kimi-k2-0905-preview",
    needsApiKey: true,
    setupHint: "Get an API key from platform.moonshot.ai",
    allowedHosts: ["api.moonshot.ai", "api.moonshot.cn"],
    chatPath: "/v1/chat/completions",
    modelsPath: "/v1/models",
    authStyle: "bearer",
    bodyStyle: "openai",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    type: "cloud",
    badge: "Or",
    accent: "from-pink-500 to-rose-600",
    description: "Unified access to hundreds of models.",
    supports: cap(true, false, true, true),
    defaultBaseUrl: "https://openrouter.ai/api",
    defaultModel: "openai/gpt-4o-mini",
    needsApiKey: true,
    setupHint: "Get an API key from openrouter.ai/keys",
    allowedHosts: ["openrouter.ai"],
    chatPath: "/v1/chat/completions",
    modelsPath: "/v1/models",
    authStyle: "bearer",
    bodyStyle: "openai",
  },
  {
    id: "ollama-cloud",
    name: "Ollama Cloud",
    type: "cloud",
    badge: "Oc",
    accent: "from-stone-400 to-stone-700",
    description: "Managed Ollama-hosted open models.",
    supports: cap(true, true, false, false),
    defaultBaseUrl: "https://ollama.com/api",
    defaultModel: "llama3.2",
    needsApiKey: true,
    setupHint: "Get an API key from ollama.com",
    allowedHosts: ["ollama.com", "*.ollama.com"],
    chatPath: "/v1/chat/completions",
    embeddingsPath: "/v1/embeddings",
    modelsPath: "/v1/models",
    authStyle: "bearer",
    bodyStyle: "openai",
  },
  {
    id: "nvidia-nim",
    name: "NVIDIA NIM",
    type: "cloud",
    badge: "Nv",
    accent: "from-lime-400 to-emerald-600",
    description: "NVIDIA-hosted inference microservices.",
    supports: cap(true, true, true, true),
    defaultBaseUrl: "https://integrate.api.nvidia.com",
    defaultModel: "meta/llama-3.1-70b-instruct",
    needsApiKey: true,
    setupHint: "Get an API key from build.nvidia.com",
    allowedHosts: ["integrate.api.nvidia.com", "*.api.nvidia.com"],
    chatPath: "/v1/chat/completions",
    embeddingsPath: "/v1/embeddings",
    modelsPath: "/v1/models",
    authStyle: "bearer",
    bodyStyle: "openai",
  },
  {
    id: "vercel-ai",
    name: "Vercel AI Gateway",
    type: "cloud",
    badge: "Vc",
    accent: "from-zinc-200 to-zinc-500",
    description: "Vercel-hosted multi-provider gateway.",
    supports: cap(true, true, true, true),
    defaultBaseUrl: "https://ai-gateway.vercel.sh",
    defaultModel: "openai/gpt-4o-mini",
    needsApiKey: true,
    setupHint: "Get a gateway token from vercel.com/ai-gateway",
    allowedHosts: ["ai-gateway.vercel.sh"],
    chatPath: "/v1/chat/completions",
    embeddingsPath: "/v1/embeddings",
    modelsPath: "/v1/models",
    authStyle: "bearer",
    bodyStyle: "openai",
  },

  // ───────────────────────── Local ─────────────────────────
  {
    id: "ollama",
    name: "Ollama (local)",
    type: "local",
    badge: "Ol",
    accent: "from-slate-400 to-slate-700",
    description: "Locally running Ollama daemon.",
    supports: cap(true, true, true, false),
    defaultBaseUrl: "http://localhost:11434",
    defaultModel: "llama3.2",
    baseUrlEditable: true,
    allowedHosts: ["localhost", "127.0.0.1", "*.local"],
    chatPath: "/v1/chat/completions",
    embeddingsPath: "/v1/embeddings",
    modelsPath: "/api/tags",
    detectUrl: "http://localhost:11434/api/tags",
    authStyle: "none",
    bodyStyle: "openai",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    type: "local",
    badge: "Lm",
    accent: "from-cyan-400 to-blue-600",
    description: "LM Studio local server.",
    supports: cap(true, true, true, false),
    defaultBaseUrl: "http://localhost:1234",
    defaultModel: "lmstudio-community",
    baseUrlEditable: true,
    allowedHosts: ["localhost", "127.0.0.1", "*.local"],
    chatPath: "/v1/chat/completions",
    embeddingsPath: "/v1/embeddings",
    modelsPath: "/v1/models",
    detectUrl: "http://localhost:1234/v1/models",
    authStyle: "none",
    bodyStyle: "openai",
  },
  {
    id: "hermes",
    name: "Hermes",
    type: "local",
    badge: "Hr",
    accent: "from-purple-400 to-indigo-600",
    description: "Nous Hermes local gateway.",
    supports: cap(true, true, false, true),
    defaultBaseUrl: "http://localhost:8080",
    defaultModel: "hermes",
    baseUrlEditable: true,
    allowedHosts: ["localhost", "127.0.0.1", "*.local"],
    chatPath: "/v1/chat/completions",
    embeddingsPath: "/v1/embeddings",
    modelsPath: "/v1/models",
    detectUrl: "http://localhost:8080/v1/models",
    authStyle: "none",
    bodyStyle: "openai",
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    type: "local",
    badge: "Oc",
    accent: "from-orange-400 to-red-600",
    description: "OpenClaw local agent gateway.",
    supports: cap(true, false, false, true),
    defaultBaseUrl: "http://localhost:8787",
    defaultModel: "openclaw",
    baseUrlEditable: true,
    allowedHosts: ["localhost", "127.0.0.1", "*.local"],
    chatPath: "/v1/chat/completions",
    modelsPath: "/v1/models",
    detectUrl: "http://localhost:8787/v1/models",
    authStyle: "none",
    bodyStyle: "openai",
  },
  {
    id: "vllm",
    name: "vLLM",
    type: "local",
    badge: "vL",
    accent: "from-teal-400 to-emerald-600",
    description: "vLLM OpenAI-compatible server.",
    supports: cap(true, true, true, true),
    defaultBaseUrl: "http://localhost:8000",
    defaultModel: "meta-llama/Llama-3.1-8B-Instruct",
    baseUrlEditable: true,
    allowedHosts: ["localhost", "127.0.0.1", "*.local"],
    chatPath: "/v1/chat/completions",
    embeddingsPath: "/v1/embeddings",
    modelsPath: "/v1/models",
    detectUrl: "http://localhost:8000/v1/models",
    authStyle: "none",
    bodyStyle: "openai",
  },
  {
    id: "llama-cpp",
    name: "llama.cpp server",
    type: "local",
    badge: "Lc",
    accent: "from-amber-300 to-yellow-600",
    description: "llama.cpp OpenAI-compatible server.",
    supports: cap(true, true, true, false),
    defaultBaseUrl: "http://localhost:8081",
    defaultModel: "default",
    baseUrlEditable: true,
    allowedHosts: ["localhost", "127.0.0.1", "*.local"],
    chatPath: "/v1/chat/completions",
    embeddingsPath: "/v1/embeddings",
    modelsPath: "/v1/models",
    detectUrl: "http://localhost:8081/v1/models",
    authStyle: "none",
    bodyStyle: "openai",
  },
  {
    id: "custom",
    name: "Custom (OpenAI-compatible)",
    type: "local",
    badge: "Cu",
    accent: "from-neutral-400 to-neutral-700",
    description: "Any local or remote OpenAI-compatible endpoint.",
    supports: cap(true, true, true, true),
    defaultBaseUrl: "http://localhost:8000",
    defaultModel: "default",
    baseUrlEditable: true,
    allowedHosts: ["*"],
    transcribePath: "/v1/audio/transcriptions",
    chatPath: "/v1/chat/completions",
    embeddingsPath: "/v1/embeddings",
    modelsPath: "/v1/models",
    authStyle: "bearer",
    bodyStyle: "openai",
  },
];

export function getProvider(id: string | undefined | null): ProviderDef {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

export type Model = { id: string; label?: string };

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string | unknown;
  attachments?: string[];
};

export type ProviderCallOpts = {
  provider: ProviderDef;
  apiKey: string;
  baseUrl: string; // already resolved (override or default)
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onDelta?: (chunk: string) => void;
  stream?: boolean;
};

export class ProviderError extends Error {
  status: number;
  retryAfter?: number;
  constructor(message: string, status: number, retryAfter?: number) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function buildHeaders(p: ProviderDef, apiKey: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (p.authStyle === "bearer" && apiKey) h["Authorization"] = `Bearer ${apiKey}`;
  if (p.authStyle === "x-api-key" && apiKey) h["x-api-key"] = apiKey;
  if (p.extraHeaders) Object.assign(h, p.extraHeaders);
  return h;
}

function normalizeMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.attachments && m.attachments.length) {
      return {
        role: m.role,
        content: [
          ...(typeof m.content === "string" && m.content
            ? [{ type: "text", text: m.content }]
            : []),
          ...m.attachments.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

function buildBody(
  p: ProviderDef,
  model: string,
  messages: ChatMessage[],
  stream: boolean,
): string {
  if (p.bodyStyle === "anthropic") {
    const sys = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");
    const msgs = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" }));
    return JSON.stringify({
      model,
      max_tokens: 4096,
      ...(sys ? { system: sys } : {}),
      messages: msgs,
      stream,
    });
  }
  // gemini openai-compat & openai default
  return JSON.stringify({
    model,
    messages: normalizeMessages(messages),
    stream,
  });
}

function pickAnthropicDelta(j: unknown): string {
  const o = j as { type?: string; delta?: { text?: string } };
  if (o?.type === "content_block_delta") return o.delta?.text ?? "";
  return "";
}

function pickOpenAIDelta(j: unknown): string {
  const o = j as { choices?: { delta?: { content?: string }; message?: { content?: string } }[] };
  return o?.choices?.[0]?.delta?.content ?? o?.choices?.[0]?.message?.content ?? "";
}

function pickFinal(p: ProviderDef, raw: unknown): string {
  if (p.bodyStyle === "anthropic") {
    const o = raw as { content?: { type?: string; text?: string }[] };
    return (o?.content ?? [])
      .filter((b) => b?.type === "text")
      .map((b) => b?.text ?? "")
      .join("");
  }
  return pickOpenAIDelta(raw) || "";
}

export async function callProviderChat(opts: ProviderCallOpts): Promise<{
  text: string;
  raw: unknown;
}> {
  const { provider, apiKey, baseUrl, model, messages, signal, onDelta } = opts;
  const stream = !!onDelta && (opts.stream ?? true);
  const url = baseUrl.replace(/\/+$/, "") + provider.chatPath;
  const headers = buildHeaders(provider, apiKey);
  const body = buildBody(provider, model, messages, stream);

  const res = await fetch(url, { method: "POST", headers, body, signal });

  if (stream && res.ok && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let acc = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const delta =
            provider.bodyStyle === "anthropic" ? pickAnthropicDelta(j) : pickOpenAIDelta(j);
          if (delta) {
            acc += delta;
            onDelta?.(delta);
          }
        } catch {
          /* ignore partial */
        }
      }
    }
    return { text: acc, raw: acc };
  }

  const text = await res.text();
  let raw: unknown = text;
  try {
    raw = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const errMsg =
      typeof raw === "object" && raw && "error" in raw
        ? JSON.stringify((raw as { error: unknown }).error)
        : typeof raw === "string"
          ? raw
          : `HTTP ${res.status}`;
    const ra = res.headers.get("retry-after");
    const retryAfter = ra ? Number(ra) : undefined;
    throw new ProviderError(
      `${provider.name} → ${res.status}: ${errMsg}`,
      res.status,
      Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }
  const out = pickFinal(provider, raw);
  onDelta?.(out);
  return { text: out, raw };
}

/** Best-effort ping for local providers. */
export type DetectResult = { ok: boolean; status?: number; error?: string };

/** Server-side reachability probe via the same-origin proxy route. */
export async function detectProvider(p: ProviderDef): Promise<DetectResult> {
  if (!p.detectUrl) return { ok: false, error: "No detect URL" };
  try {
    const res = await fetch("/api/proxy/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: p.detectUrl }),
    });
    if (!res.ok) return { ok: false, error: `Proxy ${res.status}` };
    return (await res.json()) as DetectResult;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Send audio to the configured provider for transcription via the server proxy. */
export async function transcribeAudioViaProxy(
  providerId: string,
  blob: Blob,
  signal?: AbortSignal,
): Promise<{ text: string }> {
  const fd = new FormData();
  fd.append("providerId", providerId);
  fd.append("file", blob, "speech.webm");
  const res = await fetch("/api/proxy/transcribe", { method: "POST", body: fd, signal });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Transcription failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as { text: string };
}

/** Stream a chat completion through the server proxy. */
export async function callProviderChatViaProxy(opts: ProviderCallOpts): Promise<{
  text: string;
  raw: unknown;
}> {
  const { provider, baseUrl, model, messages, signal, onDelta } = opts;
  const stream = !!onDelta && (opts.stream ?? true);

  const res = await fetch("/api/proxy/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      providerId: provider.id,
      baseUrlOverride: baseUrl,
      model,
      messages,
      stream,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep */
    }
    const ra = res.headers.get("retry-after");
    const retryAfter = ra ? Number(ra) : undefined;
    const errMsg =
      typeof parsed === "object" && parsed && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : typeof parsed === "string"
          ? parsed
          : `HTTP ${res.status}`;
    throw new ProviderError(
      `${provider.name} → ${res.status}: ${errMsg}`,
      res.status,
      Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }

  if (stream && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let acc = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const delta =
            provider.bodyStyle === "anthropic" ? pickAnthropicDelta(j) : pickOpenAIDelta(j);
          if (delta) {
            acc += delta;
            onDelta?.(delta);
          }
        } catch {
          /* ignore partial */
        }
      }
    }
    return { text: acc, raw: acc };
  }

  const text = await res.text();
  let raw: unknown = text;
  try {
    raw = JSON.parse(text);
  } catch {
    /* keep text */
  }
  const out = pickFinal(provider, raw);
  onDelta?.(out);
  return { text: out, raw };
}
