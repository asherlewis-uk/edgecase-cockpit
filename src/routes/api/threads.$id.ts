import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCockpitSession } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { threadsRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import { updateThread, deleteThread, getThread } from "@/lib/db";
import type { Thread } from "@/lib/cockpit-store";
import {
  validateThreadTitle,
  validateMessages,
  limitViolationResponse,
} from "@/lib/storage-limits.server";

const PatchThreadBody = z.object({
  title: z.string().min(1).max(512).optional(),
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
    .optional(),
  updatedAt: z.number().optional(),
  temporary: z.boolean().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  syncEnabled: z.boolean().optional(),
  isLocal: z.boolean().optional(),
});

export const Route = createFileRoute("/api/threads/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ error: "No session" }, { status: 401 });
        }

        const id = params.id;
        if (!id) {
          return Response.json({ error: "Missing thread id" }, { status: 400 });
        }

        const thread = await getThread(session.data.id, id, session.data.userId);
        if (!thread) {
          return Response.json({ error: "Thread not found" }, { status: 404 });
        }

        return Response.json({ thread });
      },

      PATCH: async ({ request, params }) => {
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

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "Bad JSON" }, { status: 400 });
        }

        const parsed = PatchThreadBody.safeParse(raw);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid thread data", details: parsed.error.flatten() },
            { status: 400 },
          );
        }

        if (parsed.data.title !== undefined) {
          const titleViolation = validateThreadTitle(parsed.data.title);
          if (titleViolation) {
            return limitViolationResponse(titleViolation);
          }
        }

        if (parsed.data.messages !== undefined) {
          const messageViolation = validateMessages(parsed.data.messages);
          if (messageViolation) {
            return limitViolationResponse(messageViolation);
          }
        }

        const updates: Partial<Thread> = {};
        if (parsed.data.title !== undefined) updates.title = parsed.data.title;
        if (parsed.data.messages !== undefined) updates.messages = parsed.data.messages;
        if (parsed.data.updatedAt !== undefined) updates.updatedAt = parsed.data.updatedAt;
        if (parsed.data.temporary !== undefined) updates.temporary = parsed.data.temporary;
        if (parsed.data.pinned !== undefined) updates.pinned = parsed.data.pinned;
        if (parsed.data.archived !== undefined) updates.archived = parsed.data.archived;
        if (parsed.data.syncEnabled !== undefined) updates.syncEnabled = parsed.data.syncEnabled;
        if (parsed.data.isLocal !== undefined) updates.isLocal = parsed.data.isLocal;

        if (Object.keys(updates).length === 0) {
          return Response.json({ error: "No fields to update" }, { status: 400 });
        }

        await updateThread(session.data.id, id, updates, session.data.userId);
        return Response.json({ ok: true });
      },

      DELETE: async ({ params, request }) => {
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

        await deleteThread(session.data.id, id, session.data.userId);
        return Response.json({ ok: true });
      },
    },
  },
});
