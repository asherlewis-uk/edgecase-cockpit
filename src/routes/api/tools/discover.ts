import { createFileRoute } from "@tanstack/react-router";
import {
  discoverAllProviderTools,
  discoverProviderTools,
  isProviderToolDiscoveryEnabled,
} from "@/lib/provider-tool-discovery.server";
import { getCockpitSession } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { sessionRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/tools/discover")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const rl = await sessionRateLimit(`tools-discover:${session.data.id ?? "anon"}`);
        if (!rl.ok) return rateLimitResponse(rl.retryAfter);

        const results = await discoverAllProviderTools();
        return Response.json({
          enabled: isProviderToolDiscoveryEnabled(),
          results,
        });
      },
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const rl = await sessionRateLimit(`tools-discover:${session.data.id ?? "anon"}`);
        if (!rl.ok) return rateLimitResponse(rl.retryAfter);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const providerId = (body as { providerId?: string })?.providerId;
        if (!providerId || typeof providerId !== "string") {
          return Response.json({ error: "Missing providerId" }, { status: 400 });
        }

        const result = await discoverProviderTools(providerId);
        return Response.json({ enabled: isProviderToolDiscoveryEnabled(), result });
      },
    },
  },
});
