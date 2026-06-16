import { createFileRoute } from "@tanstack/react-router";
import { clearAuthSession, clearGuestSessionId } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        await clearAuthSession();
        await clearGuestSessionId();
        return Response.json({ ok: true });
      },
    },
  },
});
