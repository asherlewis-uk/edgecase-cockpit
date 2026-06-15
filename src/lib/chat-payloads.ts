/**
 * Client-safe payload builders for LLM provider chat requests.
 *
 * Extracted from the server-side proxy route (`src/routes/api/proxy/chat.ts`) and
 * the client-side `callProviderChat` so the logic lives in a single, testable,
 * isomorphic module that can run in browser, Electron, and Capacitor contexts.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string | unknown;
  attachments?: string[];
};

export type ToolDefPayload = {
  name: string;
  description: string;
  parameters?: unknown;
};

export type ProviderPayloadStyle = {
  bodyStyle: "openai" | "anthropic" | "gemini";
  authStyle: "bearer" | "x-api-key" | "none";
  extraHeaders?: Record<string, string>;
};

// ── Headers ──────────────────────────────────────────────────────────────

export function buildHeaders(
  p: ProviderPayloadStyle,
  apiKey: string,
): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (p.authStyle === "bearer" && apiKey) h["Authorization"] = `Bearer ${apiKey}`;
  if (p.authStyle === "x-api-key" && apiKey) h["x-api-key"] = apiKey;
  if (p.extraHeaders) Object.assign(h, p.extraHeaders);
  return h;
}

// ── Message normalisation ─────────────────────────────────────────────────

export function normalizeMessages(messages: ChatMessage[]): unknown[] {
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

// ── Tool payloads ─────────────────────────────────────────────────────────

export function toOpenAIToolPayload(tools: ToolDefPayload[]): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters ?? { type: "object" },
    },
  }));
}

export function toAnthropicToolPayload(tools: ToolDefPayload[]): unknown[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters ?? { type: "object" },
  }));
}

// ── Request body builder ──────────────────────────────────────────────────

export function buildBody(
  p: ProviderPayloadStyle,
  model: string,
  messages: ChatMessage[],
  stream: boolean,
  tools?: ToolDefPayload[],
): string {
  const toolPayload = tools?.length
    ? p.bodyStyle === "anthropic"
      ? { tools: toAnthropicToolPayload(tools) }
      : { tools: toOpenAIToolPayload(tools) }
    : {};

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
      ...toolPayload,
    });
  }

  // gemini (openai-compat) & openai default
  return JSON.stringify({
    model,
    messages: normalizeMessages(messages),
    stream,
    ...toolPayload,
  });
}
