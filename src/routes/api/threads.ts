import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCockpitSession } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { threadsRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import {
  createSession as dbCreateSession,
  getThreads as dbGetThreads,
  getThreadCount,
  createThread as dbCreateThread,
  deleteThreads as dbDeleteThreads,
} from "@/lib/db";
import type { Thread } from "@/lib/cockpit-store";
import {
  getStorageLimits,
  validateThreadTitle,
  validateMessages,
  limitViolationResponse,
} from "@/lib/storage-limits.server";

const CreateThreadBody = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(512),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
        providerId: z.string().optional(),
        providerName: z.string().optional(),
        cached: z.boolean().optional(),
        error: z.boolean().optional(),
        pending: z.boolean().optional(),
        timestamp: z.number().optional(),
        ts: z.number(),
        attachments: z.array(z.string()).optional(),
        videoAttachments: z.array(z.string()).optional(),
        assistantImages: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  updatedAt: z.number(),
  temporary: z.boolean().optional(),
  syncEnabled: z.boolean().optional(),
  isLocal: z.boolean().optional(),
});

const BulkDeleteBody = z.object({
  ids: z.array(z.string()).min(1).max(100),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const Route = createFileRoute("/api/threads")({
  server: {
    handlers: {
      GET: async () => {
        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ error: "No session" }, { status: 401 });
        }
        await dbCreateSession(session.data.id);
        const threads = await dbGetThreads(session.data.id, session.data.userId);
        return Response.json({ threads });
      },

      POST: async ({ request }) => {
        const csrfCheck = await validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ error: "No session" }, { status: 401 });
        }

        const rl = await threadsRateLimit(session.data.id);
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "Bad JSON" }, { status: 400 });
        }

        const parsed = CreateThreadBody.safeParse(raw);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid thread data", details: parsed.error.flatten() },
            { status: 400 },
          );
        }

        const titleViolation = validateThreadTitle(parsed.data.title);
        if (titleViolation) {
          return limitViolationResponse(titleViolation);
        }

        const messageViolation = validateMessages(parsed.data.messages);
        if (messageViolation) {
          return limitViolationResponse(messageViolation);
        }

        const limits = getStorageLimits();
        const threadCount = await getThreadCount(session.data.id, session.data.userId);
        if (threadCount >= limits.maxThreadsPerSession) {
          return limitViolationResponse({
            field: "threads",
            limit: limits.maxThreadsPerSession,
            actual: threadCount + 1,
          });
        }

        if (parsed.data.syncEnabled === true) {
          return Response.json({ error: "Backend thread sync is not enabled" }, { status: 400 });
        }

        const thread: Thread = {
          id: parsed.data.id,
          title: parsed.data.title,
          messages: parsed.data.messages,
          updatedAt: parsed.data.updatedAt,
          temporary: parsed.data.temporary,
          syncEnabled: false,
          isLocal: parsed.data.isLocal,
        };

        await dbCreateSession(session.data.id);
        await dbCreateThread(session.data.id, thread, session.data.userId);
        return Response.json({ ok: true, thread });
      },

      DELETE: async ({ request }) => {
        const csrfCheck = await validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ error: "No session" }, { status: 401 });
        }

        const rl = await threadsRateLimit(session.data.id);
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "Bad JSON" }, { status: 400 });
        }

        const parsed = BulkDeleteBody.safeParse(raw);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid request", details: parsed.error.flatten() },
            { status: 400 },
          );
        }

        const deleted = await dbDeleteThreads(
          session.data.id,
          parsed.data.ids,
          session.data.userId,
        );
        return Response.json({ ok: true, deleted });
      },
    },
  },
});
