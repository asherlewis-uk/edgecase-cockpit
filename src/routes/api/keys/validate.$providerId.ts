import { createFileRoute } from "@tanstack/react-router";
import { getProviderCreds } from "@/lib/session.server";
import { PROVIDERS } from "@/lib/providers";
import { validateProviderKey } from "@/lib/validate-key.server";

export const Route = createFileRoute("/api/keys/validate/$providerId")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const providerId = params.providerId;
        const provider = PROVIDERS.find((p) => p.id === providerId);
        if (!provider) {
          return Response.json({ valid: false, reason: "unknown_provider" }, { status: 400 });
        }

        const creds = await getProviderCreds(providerId);
        if (!creds || !creds.apiKey) {
          return Response.json({ valid: false, reason: "no_key" });
        }

        const result = await validateProviderKey(provider, creds.apiKey, creds.baseUrl);

        const body: Record<string, unknown> = {
          valid: result.valid,
          provider: providerId,
        };
        if (result.error) body.reason = result.error;
        if (result.status) body.status = result.status;

        return Response.json(body);
      },
    },
  },
});
