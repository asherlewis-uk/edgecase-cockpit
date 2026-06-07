import { createFileRoute } from "@tanstack/react-router";
import { getCockpitSession } from "@/lib/session.server";
import { PROVIDERS } from "@/lib/providers";
import { validateProviderKey } from "@/lib/validate-key.server";
import { keysRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import { validateCsrfToken } from "@/lib/csrf.server";

export const Route = createFileRoute("/api/keys/validate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const sessionId = session.data.id ?? "anon";
        const rl = keysRateLimit(sessionId);
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }

        const storedProviders = session.data.providers ?? {};

        const entries = Object.entries(storedProviders);
        const results: Record<string, { valid: boolean; reason?: string }> = {};

        // Run all validations in parallel for speed
        const settled = await Promise.allSettled(
          entries.map(async ([providerId, creds]) => {
            const provider = PROVIDERS.find((p) => p.id === providerId);
            if (!provider) {
              results[providerId] = {
                valid: false,
                reason: "unknown_provider",
              };
              return;
            }
            if (!creds.apiKey) {
              results[providerId] = { valid: false, reason: "no_key" };
              return;
            }

            const result = await validateProviderKey(provider, creds.apiKey, creds.baseUrl);

            results[providerId] = {
              valid: result.valid,
              ...(result.error ? { reason: result.error } : {}),
            };
          }),
        );

        // Surface any unexpected rejections as failed validations
        for (let i = 0; i < settled.length; i++) {
          const outcome = settled[i];
          const providerId = entries[i][0];
          if (outcome.status === "rejected" && !results[providerId]) {
            results[providerId] = {
              valid: false,
              reason: outcome.reason instanceof Error ? outcome.reason.message : "unknown_error",
            };
          }
        }

        return Response.json({ results });
      },
    },
  },
});
