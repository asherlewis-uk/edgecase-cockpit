import { createFileRoute } from "@tanstack/react-router";
import { clearProviderCreds } from "@/lib/session.server";
import { getCockpitSession } from "@/lib/session.server";
import { keysRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import { validateCsrfToken } from "@/lib/csrf.server";

export const Route = createFileRoute("/api/keys/clear")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const sessionId = session.data.id ?? "anon";
        const rl = keysRateLimit(sessionId);
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }

        let providerId: string | undefined;
        try {
          const body = (await request.json()) as { providerId?: string };
          providerId = body?.providerId;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        await clearProviderCreds(providerId);
        return Response.json({ ok: true });
      },
    },
  },
});
