import { createFileRoute } from "@tanstack/react-router";
import { getAuthUserId } from "@/lib/session.server";
import { getAllUserProviderKeys } from "@/lib/db";
import { keysRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/keys/status")({
  server: {
    handlers: {
      GET: async () => {
        const userId = await getAuthUserId();
        const sessionId = userId ?? "anon";
        const rl = await keysRateLimit(sessionId);
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }
        const providers: Record<string, { hasKey: boolean; baseUrl?: string; model?: string }> = {};
        if (userId) {
          const keys = await getAllUserProviderKeys(userId);
          for (const [id, cfg] of Object.entries(keys)) {
            providers[id] = {
              hasKey: !!cfg.apiKeyEncrypted,
              baseUrl: cfg.baseUrl,
              model: cfg.model,
            };
          }
        }
        return Response.json({ providers });
      },
    },
  },
});
