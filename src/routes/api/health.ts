import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const health = {
          status: "ok" as const,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: process.env.NODE_ENV || "development",
        };
        return Response.json(health, {
          headers: { "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
