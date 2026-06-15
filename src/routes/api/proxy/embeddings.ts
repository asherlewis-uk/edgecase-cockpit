// Server-side embedding proxy. Forwards text to the provider's embeddings endpoint.
// Body: { providerId, model?, input: string[] }
// Returns: { embeddings: number[][] }
import { createFileRoute } from "@tanstack/react-router";
import { PROVIDERS } from "@/lib/providers";
import { getCockpitSession, getProviderCreds } from "@/lib/session.server";
import { rateLimit, urlAllowedForProvider } from "@/lib/proxy-guard.server";
import { validateCsrfToken } from "@/lib/csrf.server";

const MAX_INPUTS = 32;
const MAX_TEXT_LENGTH = 8192;

export const Route = createFileRoute("/api/proxy/embeddings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const sessionId = session.data.id ?? "anon";
        const rl = rateLimit(`embeddings:${sessionId}`);
        if (!rl.ok) {
          return Response.json({ error: "Rate limited" }, { status: 429 });
        }

        let body: { providerId?: string; model?: string; input?: string[] };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const providerId = body.providerId ?? "openai";
        const provider = PROVIDERS.find((p) => p.id === providerId);
        if (!provider || !provider.embeddingsPath) {
          return Response.json(
            { error: `${providerId} does not support embeddings` },
            { status: 400 },
          );
        }

        const input = Array.isArray(body.input) ? body.input : [];
        if (input.length === 0 || input.length > MAX_INPUTS) {
          return Response.json(
            { error: `input must contain 1–${MAX_INPUTS} strings` },
            { status: 400 },
          );
        }
        for (const text of input) {
          if (typeof text !== "string" || text.length > MAX_TEXT_LENGTH) {
            return Response.json(
              { error: "Each input string must be ≤ 8192 chars" },
              { status: 400 },
            );
          }
        }

        const creds = await getProviderCreds(providerId);
        const baseUrl = (creds?.baseUrl?.trim() || provider.defaultBaseUrl).replace(/\/+$/, "");
        if (!urlAllowedForProvider(providerId, baseUrl)) {
          return Response.json({ error: "Base URL not allowed" }, { status: 400 });
        }
        if (provider.needsApiKey && !creds?.apiKey) {
          return Response.json({ error: `No API key for ${provider.name}` }, { status: 401 });
        }

        const url = baseUrl + provider.embeddingsPath;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (provider.authStyle === "bearer" && creds?.apiKey) {
          headers["Authorization"] = `Bearer ${creds.apiKey}`;
        }
        if (provider.authStyle === "x-api-key" && creds?.apiKey) {
          headers["x-api-key"] = creds.apiKey;
        }
        if (provider.extraHeaders) {
          Object.assign(headers, provider.extraHeaders);
        }

        const upstreamBody = JSON.stringify({
          model: body.model || creds?.model || provider.defaultModel,
          input,
        });

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30_000);
        try {
          const upstream = await fetch(url, {
            redirect: "manual",
            method: "POST",
            headers,
            body: upstreamBody,
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          if (!upstream.ok) {
            const txt = await upstream.text();
            return new Response(txt || `Upstream ${upstream.status}`, {
              status: upstream.status,
              headers: { "Content-Type": upstream.headers.get("content-type") || "text/plain" },
            });
          }
          const data = (await upstream.json()) as {
            data?: { embedding?: number[] }[];
          };
          const embeddings = (data.data ?? [])
            .map((d) => d.embedding)
            .filter((e): e is number[] => Array.isArray(e));
          return Response.json({ embeddings });
        } catch (e) {
          clearTimeout(timer);
          const msg = e instanceof Error ? e.message : "Embedding request failed";
          return Response.json({ error: msg }, { status: 502 });
        }
      },
    },
  },
});
