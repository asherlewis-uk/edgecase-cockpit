import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCockpitSession } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { threadRateLimiter } from "@/lib/proxy-guard.server";
import { createThread } from "@/lib/db";
import type { Thread } from "@/lib/cockpit-store";

const MessageSchema = z.object({
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
});

const ThreadSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  messages: z.array(MessageSchema).default([]),
  updatedAt: z.number().optional(),
});

const ImportBody = z.object({
  threads: z.array(ThreadSchema),
});

export const Route = createFileRoute("/api/threads/import")({
  server: {
    handlers: {
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

        const parsed = ImportBody.safeParse(raw);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid import data", details: parsed.error.flatten() },
            { status: 400 },
          );
        }

        const now = Date.now();
        let imported = 0;

        for (const t of parsed.data.threads) {
          const thread: Thread = {
            id: crypto.randomUUID(),
            title: t.title,
            messages: t.messages,
            updatedAt: t.updatedAt ?? now,
            pinned: false,
            archived: false,
          };
          await createThread(session.data.id, thread);
          imported++;
        }

        return Response.json({ ok: true, imported });
      },
    },
  },
});
