import { createFileRoute } from "@tanstack/react-router";
import { clearProviderCreds } from "@/lib/session.server";

export const Route = createFileRoute("/api/keys/clear")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let providerId: string | undefined;
        try {
          const body = (await request.json()) as { providerId?: string };
          providerId = body?.providerId;
        } catch {
          /* clear all */
        }
        await clearProviderCreds(providerId);
        return Response.json({ ok: true });
      },
    },
  },
});
