import { createFileRoute } from "@tanstack/react-router";
import { PROVIDERS, getProvider } from "@/lib/providers";
import { getCockpitSession, getProviderCreds } from "@/lib/session.server";
import { rateLimit, urlAllowedForProvider } from "@/lib/proxy-guard.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { buildHeaders, buildBody } from "@/lib/chat-payloads";
import type { ChatMessage } from "@/lib/chat-payloads";

// Proxy chat completions through the server so the browser never talks to
// third-party APIs directly. Avoids CORS + mixed-content issues and keeps a
// single same-origin code path.
//
// Body: { providerId, apiKey, baseUrlOverride?, model?, messages, stream? }
// Returns: upstream Response (text or SSE stream) verbatim.

type ProxyBody = {
  providerId: string;
  baseUrlOverride?: string;
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  tools?: { name: string; description: string; parameters?: unknown }[];
};

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
