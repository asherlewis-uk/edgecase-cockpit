import { createFileRoute } from "@tanstack/react-router";
import { getCockpitSession } from "@/lib/session.server";
import { getAggregateUsage, getMessageCount } from "@/lib/db";
import { usageRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/usage")({
  server: {
    handlers: {
      GET: async () => {
        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ error: "No session" }, { status: 401 });
        }

        const rl = await usageRateLimit(session.data.id);
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }

        const aggregate = await getAggregateUsage(session.data.id, session.data.userId);
        const messageCount = await getMessageCount(session.data.id, undefined, session.data.userId);

        return Response.json({
          usage: {
            totalCalls: aggregate.totalCalls,
            totalErrors: aggregate.totalErrors,
            totalMessages: messageCount,
            totalInputTokens: aggregate.totalInputTokens,
            totalOutputTokens: aggregate.totalOutputTokens,
            totalEstimatedCost: aggregate.totalEstimatedCost,
            perProvider: aggregate.perProvider,
          },
        });
      },
    },
  },
});
