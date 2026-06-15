import { createFileRoute } from "@tanstack/react-router";
import { PROVIDERS, type Model } from "@/lib/providers";
import { getCockpitSession, getProviderCreds } from "@/lib/session.server";
import { rateLimit, urlAllowedForProvider } from "@/lib/proxy-guard.server";
import { validateCsrfToken } from "@/lib/csrf.server";

async function fetchModels(
  provider: (typeof PROVIDERS)[number],
  creds: NonNullable<Awaited<ReturnType<typeof getProviderCreds>>>,
): Promise<Model[]> {
  if (!provider.modelsPath) return [];

  const baseUrl = (creds.baseUrl?.trim() || provider.defaultBaseUrl).replace(/\/+$/, "");
  const url = baseUrl + provider.modelsPath;

  if (!urlAllowedForProvider(provider.id, url)) return [];

  const headers: Record<string, string> = {};
  if (provider.authStyle === "bearer" && creds.apiKey) {
    headers["Authorization"] = `Bearer ${creds.apiKey}`;
  }
  if (provider.authStyle === "x-api-key" && creds.apiKey) {
    headers["x-api-key"] = creds.apiKey;
  }
  if (provider.extraHeaders) {
    Object.assign(headers, provider.extraHeaders);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);

  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, redirect: "manual" });
    clearTimeout(timer);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      data?: { id?: string }[];
      models?: { name?: string; model?: string; displayName?: string }[];
    };

    // Ollama returns { models: [{ name: "llama3.2", ... }] }
    if (provider.id === "ollama" && Array.isArray(data.models)) {
      return (data.models as { name?: string; model?: string }[]).map((m) => ({
        id: m.name ?? m.model ?? "",
        label: m.name ?? m.model,
      }));
    }

    // OpenAI-compatible: { data: [{ id: "gpt-4o", ... }] }
    if (Array.isArray(data.data)) {
      return data.data
        .filter((m): m is { id: string } => typeof m === "object" && m !== null && "id" in m)
        .map((m) => ({ id: m.id }));
    }

    // Gemini-compatible
    if (provider.id === "gemini" && Array.isArray(data.models)) {
      return (data.models as { name?: string; displayName?: string }[]).map((m) => ({
        id: m.name ?? "",
        label: m.displayName ?? m.name,
      }));
    }

    return [];
  } catch {
    clearTimeout(timer);
    return [];
  }
}

export const Route = createFileRoute("/api/proxy/models")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // CSRF policy: GET is a safe method per RFC 9110, so validateCsrfToken
        // returns true automatically. We call it explicitly to document the
        // policy decision and keep route handlers consistent.
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const sessionId = session.data.id ?? "anon";
        const rl = rateLimit(`models:${sessionId}`);
        if (!rl.ok) {
          return Response.json({ error: "Rate limited" }, { status: 429 });
        }

        const models: Record<string, Model[]> = {};

        for (const provider of PROVIDERS) {
          if (!provider.modelsPath) continue;
          const creds = await getProviderCreds(provider.id);
          if (!creds?.apiKey && provider.needsApiKey) continue;

          try {
            const providerModels = await fetchModels(provider, creds ?? { apiKey: "" });
            if (providerModels.length > 0) {
              models[provider.id] = providerModels;
            }
          } catch {
            // skip providers that fail
          }
        }

        return Response.json({ models });
      },
    },
  },
});
