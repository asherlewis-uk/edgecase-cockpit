import { createFileRoute } from "@tanstack/react-router";
import { getCockpitSession } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { threadRateLimiter } from "@/lib/proxy-guard.server";
import { getThread, createThread } from "@/lib/db";
import type { Thread } from "@/lib/cockpit-store";

export const Route = createFileRoute("/api/threads/$id/fork")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const csrfCheck = await validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ error: "No session" }, { status: 401 });
        }

        const rl = threadRateLimiter(`threads:${session.data.id}`);
        if (!rl.ok) {
          return Response.json({ error: "Rate limited" }, { status: 429 });
        }

        const id = params.id;
        if (!id) {
          return Response.json({ error: "Missing thread id" }, { status: 400 });
        }

        const original = await getThread(session.data.id, id);
        if (!original) {
          return Response.json({ error: "Thread not found" }, { status: 404 });
        }

        const newThread: Thread = {
          id: crypto.randomUUID(),
          title: `Copy of ${original.title}`,
          messages: original.messages.map((m) => ({ ...m })),
          updatedAt: Date.now(),
          pinned: false,
          archived: false,
        };

        await createThread(session.data.id, newThread);
        return Response.json({ ok: true, thread: newThread });
      },
    },
  },
});
