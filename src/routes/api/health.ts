import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const health = {
          status: "ok" as const,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        };
        return Response.json(health, {
          headers: { "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
