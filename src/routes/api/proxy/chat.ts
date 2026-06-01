import { createFileRoute } from "@tanstack/react-router";
import { PROVIDERS, getProvider } from "@/lib/providers";

// Proxy chat completions through the server so the browser never talks to
// third-party / localhost APIs directly. Avoids CORS + mixed-content issues
// and keeps a single same-origin code path.
//
// Body: { providerId, apiKey, baseUrlOverride?, model?, messages, stream? }
// Returns: upstream Response (text or SSE stream) verbatim.

type ProxyBody = {
  providerId: string;
  apiKey?: string;
  baseUrlOverride?: string;
  model?: string;
  messages: { role: "user" | "assistant" | "system"; content: unknown; attachments?: string[] }[];
  stream?: boolean;
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

function buildBody(p: ReturnType<typeof getProvider>, model: string, messages: ProxyBody["messages"], stream: boolean) {
  if (p.bodyStyle === "anthropic") {
    const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
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
  return JSON.stringify({ model, messages: normalizeMessages(messages), stream });
}

export const Route = createFileRoute("/api/proxy/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
        const baseUrl = (body.baseUrlOverride?.trim() || provider.defaultBaseUrl).replace(/\/+$/, "");
        const model = body.model?.trim() || provider.defaultModel;
        const stream = body.stream ?? true;
        const url = baseUrl + provider.chatPath;

        const headers = buildHeaders(provider, body.apiKey ?? "");
        const upstreamBody = buildBody(provider, model, body.messages ?? [], stream);

        let upstream: Response;
        try {
          upstream = await fetch(url, { method: "POST", headers, body: upstreamBody });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Upstream fetch failed";
          return new Response(JSON.stringify({ error: `${provider.name}: ${msg}` }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }

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