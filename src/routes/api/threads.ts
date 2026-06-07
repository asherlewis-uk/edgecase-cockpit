import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCockpitSession } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { threadRateLimiter } from "@/lib/proxy-guard.server";
import {
  createSession as dbCreateSession,
  getThreads as dbGetThreads,
  createThread as dbCreateThread,
  deleteThreads as dbDeleteThreads,
} from "@/lib/db";
import type { Thread } from "@/lib/cockpit-store";

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
        const threads = await dbGetThreads(session.data.id);
        return Response.json({ threads });
      },

      POST: async ({ request }) => {
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

        const thread: Thread = {
          id: parsed.data.id,
          title: parsed.data.title,
          messages: parsed.data.messages,
          updatedAt: parsed.data.updatedAt,
          temporary: parsed.data.temporary,
        };

        await dbCreateSession(session.data.id);
        await dbCreateThread(session.data.id, thread);
        return Response.json({ ok: true, thread });
      },

      DELETE: async ({ request }) => {
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

        const deleted = await dbDeleteThreads(session.data.id, parsed.data.ids);
        return Response.json({ ok: true, deleted });
      },
    },
  },
});
