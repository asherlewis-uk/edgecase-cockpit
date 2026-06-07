import { createFileRoute } from "@tanstack/react-router";
import { getCockpitSession } from "@/lib/session.server";
import { getUsageForThread, getMessageCount, getThread } from "@/lib/db";
import { usageRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import { estimateTokens, estimateCost } from "@/lib/tokens";

export const Route = createFileRoute("/api/usage/$threadId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ error: "No session" }, { status: 401 });
        }

        const rl = usageRateLimit(session.data.id);
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }

        const threadId = params.threadId;
        if (!threadId) {
          return Response.json({ error: "Missing threadId" }, { status: 400 });
        }

        const messageCount = await getMessageCount(session.data.id, threadId);
        const usage = await getUsageForThread(session.data.id, threadId);

        // Fallback: estimate tokens from thread messages if no usage records exist
        let inputTokens = usage.inputTokens;
        let outputTokens = usage.outputTokens;
        let estimatedCost = usage.estimatedCost;

        if (usage.count === 0) {
          const thread = await getThread(session.data.id, threadId);
          if (thread) {
            for (const m of thread.messages) {
              const tokens = estimateTokens(m.content);
              if (m.role === "assistant") {
                outputTokens += tokens;
              } else {
                inputTokens += tokens;
              }
            }
            // Use the active provider for cost estimation fallback
            const firstAssistant = thread.messages.find(
              (m) => m.role === "assistant" && m.providerId,
            );
            const providerId = firstAssistant?.providerId ?? "openai";
            estimatedCost = estimateCost(providerId, inputTokens, outputTokens);
          }
        }

        return Response.json({
          threadId,
          messageCount,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimatedCost,
        });
      },
    },
  },
});
