import { createFileRoute } from "@tanstack/react-router";
import { refreshLivePricing, getCachedRates } from "@/lib/pricing.server";
import { getCockpitSession } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { usageRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/pricing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const rl = await usageRateLimit(`pricing:${session.data.id ?? "anon"}`);
        if (!rl.ok) return rateLimitResponse(rl.retryAfter);

        const rates = await getCachedRates();
        return Response.json({ rates });
      },
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const rl = await usageRateLimit(`pricing:${session.data.id ?? "anon"}`);
        if (!rl.ok) return rateLimitResponse(rl.retryAfter);

        const result = await refreshLivePricing();
        return Response.json(result);
      },
    },
  },
});
