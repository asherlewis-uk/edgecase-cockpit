import { createFileRoute } from "@tanstack/react-router";
import { PROVIDERS, getProvider } from "@/lib/providers";
import { getCockpitSession, getProviderCreds } from "@/lib/session.server";
import { rateLimit, urlAllowedForProvider } from "@/lib/proxy-guard.server";
import { validateCsrfToken } from "@/lib/csrf.server";

// Proxy chat completions through the server so the browser never talks to
// third-party / localhost APIs directly. Avoids CORS + mixed-content issues
// and keeps a single same-origin code path.
//
// Body: { providerId, apiKey, baseUrlOverride?, model?, messages, stream? }
// Returns: upstream Response (text or SSE stream) verbatim.

type ProxyBody = {
  providerId: string;
  baseUrlOverride?: string;
  model?: string;
  messages: { role: "user" | "assistant" | "system"; content: unknown; attachments?: string[] }[];
  stream?: boolean;
  tools?: { name: string; description: string; parameters?: unknown }[];
};

function buildHeaders(p: ReturnType<typeof getProvider>, apiKey: string) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (p.authStyle === "bearer" && apiKey) h["Authorization"] = `Bearer ${apiKey}`;
  if (p.authStyle === "x-api-key" && apiKey) h["x-api-key"] = apiKey;
  if (p.extraHeaders) Object.assign(h, p.extraHeaders);
  return h;
}

function normalizeMessages(messages: ProxyBody["messages"]) {
  return messages.map((m) => {
    if (m.attachments && m.attachments.length) {
      return {
        role: m.role,
        content: [
          ...(typeof m.content === "string" && m.content
            ? [{ type: "text", text: m.content }]
            : []),
          ...m.attachments.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

function toOpenAIToolPayload(tools: NonNullable<ProxyBody["tools"]>): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters ?? { type: "object" },
    },
  }));
}

function toAnthropicToolPayload(tools: NonNullable<ProxyBody["tools"]>): unknown[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters ?? { type: "object" },
  }));
}

function buildBody(
  p: ReturnType<typeof getProvider>,
  model: string,
  messages: ProxyBody["messages"],
  stream: boolean,
  tools?: ProxyBody["tools"],
) {
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
  return JSON.stringify({ model, messages: normalizeMessages(messages), stream, ...toolPayload });
}

export const Route = createFileRoute("/api/proxy/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const sessionId = session.data.id ?? "anon";
        const rl = rateLimit(`chat:${sessionId}`);
        if (!rl.ok) {
          return new Response(JSON.stringify({ error: "Rate limited" }), {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              ...(rl.retryAfter ? { "retry-after": String(rl.retryAfter) } : {}),
            },
          });
        }
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > 1024 * 1024) {
          return new Response(JSON.stringify({ error: "Body too large" }), {
            status: 413,
            headers: { "Content-Type": "application/json" },
          });
        }
        let body: ProxyBody;
        try {
          body = (await request.json()) as ProxyBody;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const provider = PROVIDERS.find((p) => p.id === body.providerId);
        if (!provider) {
          return new Response(JSON.stringify({ error: "Unknown provider" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const baseUrl = (body.baseUrlOverride?.trim() || provider.defaultBaseUrl).replace(
          /\/+$/,
          "",
        );
        if (!urlAllowedForProvider(provider.id, baseUrl)) {
          return new Response(
            JSON.stringify({ error: `Base URL host not allowed for ${provider.name}` }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        const creds = await getProviderCreds(provider.id);
        const model = body.model?.trim() || creds?.model || provider.defaultModel;
        const apiKey = creds?.apiKey ?? "";
        if (provider.needsApiKey && !apiKey) {
          return new Response(JSON.stringify({ error: `No API key set for ${provider.name}` }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const stream = body.stream ?? true;
        const url = baseUrl + provider.chatPath;

        const headers = buildHeaders(provider, apiKey);
        const upstreamBody = buildBody(provider, model, body.messages ?? [], stream, body.tools);

        let upstream: Response;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 60_000);
        try {
          upstream = await fetch(url, {
            redirect: "manual",
            method: "POST",
            headers,
            body: upstreamBody,
            signal: ctrl.signal,
          });
        } catch (e) {
          clearTimeout(timer);
          const msg = e instanceof Error ? e.message : "Upstream fetch failed";
          return new Response(JSON.stringify({ error: `${provider.name}: ${msg}` }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
        // Don't clearTimeout here — keep the abort armed for the streaming body.
        // The Worker will GC after response is consumed; for non-stream this is short.

        // Pass through body + status. For streaming SSE this preserves chunks.
        const respHeaders = new Headers();
        const ct = upstream.headers.get("content-type");
        if (ct) respHeaders.set("Content-Type", ct);
        const ra = upstream.headers.get("retry-after");
        if (ra) respHeaders.set("retry-after", ra);
        // Surface provider style so the client knows how to parse deltas.
        respHeaders.set("x-provider-body-style", provider.bodyStyle);

        return new Response(upstream.body, {
          status: upstream.status,
          headers: respHeaders,
        });
      },
    },
  },
});
