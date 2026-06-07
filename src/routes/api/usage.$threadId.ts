import { createFileRoute } from "@tanstack/react-router";
import { getCockpitSession } from "@/lib/session.server";
import { getMessageCount } from "@/lib/db";

export const Route = createFileRoute("/api/usage/$threadId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ error: "No session" }, { status: 401 });
        }

        const threadId = params.threadId;
        if (!threadId) {
          return Response.json({ error: "Missing threadId" }, { status: 400 });
        }

        const messageCount = await getMessageCount(session.data.id, threadId);

        return Response.json({
          threadId,
          messageCount,
        });
      },
    },
  },
});
