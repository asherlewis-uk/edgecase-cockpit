import { createFileRoute } from "@tanstack/react-router";
import { getCockpitSession } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { threadsRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import { getThread, setThreadPinned } from "@/lib/db";

export const Route = createFileRoute("/api/threads/$id/pin")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const csrfCheck = await validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ error: "No session" }, { status: 401 });
        }

        const rl = threadsRateLimit(session.data.id);
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }

        const id = params.id;
        if (!id) {
          return Response.json({ error: "Missing thread id" }, { status: 400 });
        }

        const thread = await getThread(session.data.id, id, session.data.userId);
        if (!thread) {
          return Response.json({ error: "Thread not found" }, { status: 404 });
        }

        const pinned = !thread.pinned;
        await setThreadPinned(session.data.id, id, pinned, session.data.userId);
        return Response.json({ ok: true, pinned });
      },
    },
  },
});
