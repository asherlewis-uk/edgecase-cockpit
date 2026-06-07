import { createFileRoute } from "@tanstack/react-router";
import { getCockpitSession } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { threadsRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import { getThread, createThread, getThreadCount } from "@/lib/db";
import type { Thread } from "@/lib/cockpit-store";
import {
  getStorageLimits,
  validateMessages,
  limitViolationResponse,
} from "@/lib/storage-limits.server";

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

        const rl = threadsRateLimit(session.data.id);
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }

        const id = params.id;
        if (!id) {
          return Response.json({ error: "Missing thread id" }, { status: 400 });
        }

        const original = await getThread(session.data.id, id);
        if (!original) {
          return Response.json({ error: "Thread not found" }, { status: 404 });
        }

        const messageViolation = validateMessages(original.messages);
        if (messageViolation) {
          return limitViolationResponse(messageViolation);
        }

        const limits = getStorageLimits();
        const threadCount = await getThreadCount(session.data.id);
        if (threadCount >= limits.maxThreadsPerSession) {
          return limitViolationResponse({
            field: "threads",
            limit: limits.maxThreadsPerSession,
            actual: threadCount + 1,
          });
        }

        const newThread: Thread = {
          id: crypto.randomUUID(),
          title: `Copy of ${original.title}`.slice(0, limits.maxThreadTitleLength),
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
