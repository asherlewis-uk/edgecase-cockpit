import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { setProviderCreds } from "@/lib/session.server";
import { PROVIDERS } from "@/lib/providers";

const Body = z.object({
  providerId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  apiKey: z.string().min(1).max(8192),
  baseUrl: z.string().max(512).optional(),
  model: z.string().max(256).optional(),
});

export const Route = createFileRoute("/api/keys/set")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "Bad JSON" }, { status: 400 });
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ error: "Invalid input" }, { status: 400 });
        }
        if (!PROVIDERS.some((p) => p.id === parsed.data.providerId)) {
          return Response.json({ error: "Unknown provider" }, { status: 400 });
        }
        await setProviderCreds(parsed.data.providerId, {
          apiKey: parsed.data.apiKey,
          baseUrl: parsed.data.baseUrl,
          model: parsed.data.model,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
