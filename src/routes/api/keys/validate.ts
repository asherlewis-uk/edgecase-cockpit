import { createFileRoute } from "@tanstack/react-router";
import { getProviderCreds, getAuthUserId } from "@/lib/session.server";
import { PROVIDERS } from "@/lib/providers";
import { validateProviderKey } from "@/lib/validate-key.server";
import { keysRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { getAllUserProviderKeys } from "@/lib/db";

export const Route = createFileRoute("/api/keys/validate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const userId = await getAuthUserId();
        const sessionId = userId ?? "anon";
        const rl = keysRateLimit(sessionId);
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }

        const results: Record<string, { valid: boolean; reason?: string }> = {};

        if (!userId) {
          return Response.json({ results });
        }

        const storedKeys = await getAllUserProviderKeys(userId);
        const entries = Object.entries(storedKeys);

        // Run all validations in parallel for speed
        const settled = await Promise.allSettled(
          entries.map(async ([providerId, row]) => {
            const provider = PROVIDERS.find((p) => p.id === providerId);
            if (!provider) {
              results[providerId] = {
                valid: false,
                reason: "unknown_provider",
              };
              return;
            }
            if (!row.apiKeyEncrypted) {
              results[providerId] = { valid: false, reason: "no_key" };
              return;
            }

            const creds = await getProviderCreds(providerId);
            if (!creds) {
              results[providerId] = { valid: false, reason: "no_key" };
              return;
            }

            const result = await validateProviderKey(provider, creds.apiKey, creds.baseUrl);

            // Map technical errors to user-friendly messages
            let userMessage: string | undefined;
            let errorType: string | undefined;

            if (result.error) {
              switch (result.error) {
                case "auth_failed":
                  userMessage = "Invalid API key";
                  errorType = "auth_failed";
                  break;
                case "timeout":
                  userMessage = "Validation timeout - provider may be slow or unreachable";
                  errorType = "timeout";
                  break;
                case "network_error":
                  userMessage = "Network error - cannot reach provider";
                  errorType = "network_error";
                  break;
                default:
                  userMessage = "Validation failed";
                  errorType = "unknown";
              }
            }

            results[providerId] = {
              valid: result.valid,
              ...(result.error ? { reason: result.error } : {}),
              ...(userMessage ? { userMessage } : {}),
              ...(errorType ? { errorType } : {}),
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
