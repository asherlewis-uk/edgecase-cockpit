import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCockpitSession } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { statsRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import {
  getProviderStats as dbGetProviderStats,
  upsertProviderStat,
  resetProviderStats as dbResetProviderStats,
} from "@/lib/db";

const UpsertBody = z.object({
  providerId: z.string().min(1).max(64),
  kind: z.enum(["call", "error"]),
  calls: z.number().optional(), // legacy compat; ignored in favour of kind
});

export const Route = createFileRoute("/api/stats")({
  server: {
    handlers: {
      GET: async () => {
        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ stats: {} });
        }
        const stats = await dbGetProviderStats(session.data.id);
        return Response.json({ stats });
      },

      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ error: "No session" }, { status: 401 });
        }

        const rl = statsRateLimit(`stats:${session.data.id}`);
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "Bad JSON" }, { status: 400 });
        }

        const parsed = UpsertBody.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ error: "Invalid input" }, { status: 400 });
        }

        await upsertProviderStat(session.data.id, parsed.data.providerId, parsed.data.kind);
        return Response.json({ ok: true });
      },

      DELETE: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ error: "No session" }, { status: 401 });
        }

        const rl = statsRateLimit(`stats:${session.data.id}`);
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }
        await dbResetProviderStats(session.data.id);
        return Response.json({ ok: true });
      },
    },
  },
});
