import { createFileRoute } from "@tanstack/react-router";
import { getCockpitSession } from "@/lib/session.server";
import { getProviderStats, getMessageCount } from "@/lib/db";

export const Route = createFileRoute("/api/usage")({
  server: {
    handlers: {
      GET: async () => {
        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ error: "No session" }, { status: 401 });
        }

        const providerStats = await getProviderStats(session.data.id);
        const messageCount = await getMessageCount(session.data.id);

        let totalCalls = 0;
        let totalErrors = 0;
        for (const stat of Object.values(providerStats)) {
          totalCalls += stat.calls;
          totalErrors += stat.errors;
        }

        return Response.json({
          usage: {
            totalCalls,
            totalErrors,
            totalMessages: messageCount,
            perProvider: providerStats,
          },
        });
      },
    },
  },
});
