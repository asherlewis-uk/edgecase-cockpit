import { createFileRoute } from "@tanstack/react-router";
import { executeToolCall } from "@/lib/tool-execution.server";
import { getAuthUserId } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { sessionRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import type { ToolCall } from "@/lib/tools";

export const Route = createFileRoute("/api/tools/execute")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const userId = await getAuthUserId();
        const rl = await sessionRateLimit(`tools-execute:${userId ?? "anon"}`);
        if (!rl.ok) return rateLimitResponse(rl.retryAfter);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const call = (body as { call?: ToolCall }).call;
        if (!call || typeof call !== "object") {
          return Response.json({ error: "Missing call" }, { status: 400 });
        }

        const result = await executeToolCall(userId, call);
        return Response.json(result);
      },
    },
  },
});
