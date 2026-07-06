import { createFileRoute } from "@tanstack/react-router";
import { clearAuthSession } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        // Clear the authenticated user but keep the session id (and any
        // guestSessionId) so the local profile retains CSRF/rate-limit
        // continuity. guestSessionId regeneration on the next anonymous
        // request is handled by getGuestSessionId() if needed.
        await clearAuthSession();
        return Response.json({ ok: true });
      },
    },
  },
});
