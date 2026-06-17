import { createFileRoute } from "@tanstack/react-router";
import { getCockpitSession } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { sessionRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import { createSession } from "@/lib/db";

export const Route = createFileRoute("/api/session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const rl = await sessionRateLimit("session:global");
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }

        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ error: "Could not create session" }, { status: 500 });
        }
        await createSession(session.data.id);
        return Response.json({ sessionId: session.data.id });
      },
    },
  },
});
