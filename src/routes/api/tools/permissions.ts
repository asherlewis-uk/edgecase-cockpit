import { createFileRoute } from "@tanstack/react-router";
import { getToolApprovalStatus } from "@/lib/tool-execution.server";
import { grantUserToolPermission, revokeUserToolPermission } from "@/lib/db";
import { getAuthUserId } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { sessionRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import { validateToolName } from "@/lib/tools";

export const Route = createFileRoute("/api/tools/permissions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const userId = await getAuthUserId();
        const rl = await sessionRateLimit(`tools-perms:${userId ?? "anon"}`);
        if (!rl.ok) return rateLimitResponse(rl.retryAfter);

        const tools = await getToolApprovalStatus(userId);
        return Response.json({ tools });
      },
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const userId = await getAuthUserId();
        if (!userId) {
          return Response.json({ error: "Authentication required" }, { status: 401 });
        }

        const rl = await sessionRateLimit(`tools-perms:${userId}`);
        if (!rl.ok) return rateLimitResponse(rl.retryAfter);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const { toolName, action } = body as { toolName?: string; action?: "grant" | "revoke" };
        if (!toolName || typeof toolName !== "string" || !validateToolName(toolName)) {
          return Response.json({ error: "Invalid toolName" }, { status: 400 });
        }
        if (action !== "grant" && action !== "revoke") {
          return Response.json({ error: "Invalid action" }, { status: 400 });
        }

        if (action === "grant") {
          await grantUserToolPermission(userId, toolName);
        } else {
          await revokeUserToolPermission(userId, toolName);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
