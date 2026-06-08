import { createFileRoute } from "@tanstack/react-router";
import { getAllToolSchemas, getToolSchemaCounts, registerLocalTool } from "@/lib/tools";
import { getCockpitSession } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { sessionRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/tools/schemas")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const rl = sessionRateLimit(`tools-schemas:${session.data.id ?? "anon"}`);
        if (!rl.ok) return rateLimitResponse(rl.retryAfter);

        const schemas = getAllToolSchemas();
        const counts = getToolSchemaCounts();

        return Response.json({
          schemas: schemas.map((s) => ({
            name: s.name,
            description: s.description,
            source: s.source,
            providerId: s.providerId,
          })),
          counts,
        });
      },
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const rl = sessionRateLimit(`tools-schemas:${session.data.id ?? "anon"}`);
        if (!rl.ok) return rateLimitResponse(rl.retryAfter);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const ok = registerLocalTool(body);
        if (!ok) {
          return Response.json({ error: "Invalid, duplicate, or limit reached" }, { status: 400 });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
