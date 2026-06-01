import { createFileRoute } from "@tanstack/react-router";
import { getCockpitSession } from "@/lib/session.server";

export const Route = createFileRoute("/api/keys/status")({
  server: {
    handlers: {
      GET: async () => {
        const s = await getCockpitSession();
        const providers: Record<string, { hasKey: boolean; baseUrl?: string; model?: string }> = {};
        for (const [id, cfg] of Object.entries(s.data.providers ?? {})) {
          providers[id] = {
            hasKey: !!cfg.apiKey,
            baseUrl: cfg.baseUrl,
            model: cfg.model,
          };
        }
        return Response.json({ providers });
      },
    },
  },
});
