import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { setProviderCreds, getCockpitSession, getAuthUserId } from "@/lib/session.server";
import { PROVIDERS } from "@/lib/providers";
import { keysRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import { validateCsrfToken } from "@/lib/csrf.server";

const Body = z.object({
  providerId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  apiKey: z.string().min(1).max(8192),
  baseUrl: z.string().max(512).optional(),
  model: z.string().max(256).optional(),
});

export const Route = createFileRoute("/api/keys/set")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const sessionId = session.data.id ?? "anon";
        const rl = await keysRateLimit(sessionId);
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "Bad JSON" }, { status: 400 });
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ error: "Invalid input" }, { status: 400 });
        }
        if (!PROVIDERS.some((p) => p.id === parsed.data.providerId)) {
          return Response.json({ error: "Unknown provider" }, { status: 400 });
        }
        const userId = await getAuthUserId();
        if (!userId) {
          return Response.json({ error: "Authentication required" }, { status: 401 });
        }
        await setProviderCreds(parsed.data.providerId, {
          apiKey: parsed.data.apiKey,
          baseUrl: parsed.data.baseUrl,
          model: parsed.data.model,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
