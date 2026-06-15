// Server-side speech-to-text proxy. Sends multipart audio to the active
// provider's transcription endpoint (OpenAI-compatible). Reads key from
// the encrypted session; never accepts a key in the request body.
import { createFileRoute } from "@tanstack/react-router";
import { PROVIDERS } from "@/lib/providers";
import { getCockpitSession, getProviderCreds } from "@/lib/session.server";
import { rateLimit, urlAllowedForProvider } from "@/lib/proxy-guard.server";
import { validateCsrfToken } from "@/lib/csrf.server";

const MAX_BYTES = 20 * 1024 * 1024;

export const Route = createFileRoute("/api/proxy/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const sessionId = session.data.id ?? "anon";
        const rl = rateLimit(`transcribe:${sessionId}`);
        if (!rl.ok) {
          return new Response(JSON.stringify({ error: "Rate limited" }), {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              ...(rl.retryAfter ? { "retry-after": String(rl.retryAfter) } : {}),
            },
          });
        }
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
        }
        const providerId = String(form.get("providerId") ?? "");
        const file = form.get("file");
        if (!providerId || !(file instanceof Blob)) {
          return Response.json({ error: "providerId and file required" }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
          return Response.json({ error: "File too large" }, { status: 413 });
        }
        const provider = PROVIDERS.find((p) => p.id === providerId);
        if (!provider || !provider.transcribePath) {
          return Response.json(
            {
              error: `${provider?.name ?? providerId} does not support transcription. Switch to OpenAI or a compatible provider.`,
            },
            { status: 400 },
          );
        }
        const creds = await getProviderCreds(providerId);
        const baseUrl = (creds?.baseUrl?.trim() || provider.defaultBaseUrl).replace(/\/+$/, "");
        const url = baseUrl + provider.transcribePath;
        if (!urlAllowedForProvider(providerId, baseUrl)) {
          return Response.json(
            { error: "Base URL not allowed for this provider" },
            { status: 400 },
          );
        }
        if (provider.needsApiKey && !creds?.apiKey) {
          return Response.json({ error: `No API key for ${provider.name}` }, { status: 401 });
        }
        const upstreamForm = new FormData();
        upstreamForm.append("file", file, (file as File).name || "speech.webm");
        upstreamForm.append("model", creds?.model || "whisper-1");
        const headers: Record<string, string> = {};
        if (provider.authStyle === "bearer" && creds?.apiKey) {
          headers["Authorization"] = `Bearer ${creds.apiKey}`;
        }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 60_000);
        try {
          const upstream = await fetch(url, { redirect: "manual",
            method: "POST",
            headers,
            body: upstreamForm,
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          const txt = await upstream.text();
          if (!upstream.ok) {
            return new Response(txt || `Upstream ${upstream.status}`, {
              status: upstream.status,
              headers: { "Content-Type": upstream.headers.get("content-type") || "text/plain" },
            });
          }
          let parsed: { text?: string } = {};
          try {
            parsed = JSON.parse(txt);
          } catch {
            parsed = { text: txt };
          }
          return Response.json({ text: parsed.text ?? "" });
        } catch (e) {
          clearTimeout(timer);
          const msg = e instanceof Error ? e.message : "Transcription request failed";
          return Response.json({ error: msg }, { status: 502 });
        }
      },
    },
  },
});
