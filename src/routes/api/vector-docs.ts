import { createFileRoute } from "@tanstack/react-router";
import { getCockpitSession } from "@/lib/session.server";
import { upsertVectorDoc, getVectorDocs, clearVectorDocs } from "@/lib/db";
import { validateCsrfToken } from "@/lib/csrf.server";

export const Route = createFileRoute("/api/vector-docs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const sessionId = session.data.id ?? "anon";
        const docs = await getVectorDocs(sessionId);
        return Response.json({ docs });
      },
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const sessionId = session.data.id ?? "anon";

        const body = (await request.json()) as {
          id: string;
          text: string;
          embedding: number[];
          metadata?: Record<string, unknown>;
        };

        await upsertVectorDoc({
          id: body.id,
          sessionId,
          text: body.text,
          embedding: body.embedding,
          metadata: body.metadata,
          createdAt: Date.now(),
        });

        return Response.json({ ok: true });
      },
      DELETE: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const sessionId = session.data.id ?? "anon";
        await clearVectorDocs(sessionId);
        return Response.json({ ok: true });
      },
    },
  },
});
