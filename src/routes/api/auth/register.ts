import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { hashPassword, createUser, claimGuestSession } from "@/lib/auth.server";
import { setAuthSession, getGuestSessionId } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { sessionRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

const Body = z.object({
  email: z.string().email().min(1).max(256),
  password: z.string().min(8).max(128),
  displayName: z.string().max(128).optional(),
});

export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const rl = await sessionRateLimit("auth:register");
        if (!rl.ok) {
          return rateLimitResponse(rl.retryAfter);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "Bad JSON" }, { status: 400 });
        }

        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid input", details: parsed.error.flatten() },
            { status: 400 },
          );
        }

        const { email, password, displayName } = parsed.data;
        const passwordHash = await hashPassword(password);
        const result = await createUser(email, passwordHash, displayName);

        if (result.error) {
          return Response.json({ error: result.error }, { status: 409 });
        }

        // Capture the guest owner before login clears guest session state.
        const guestId = await getGuestSessionId();

        // Immediately log the user in after registration
        await setAuthSession(result.user.id, result.user.email);

        // Claim any guest session data into the new user account
        if (guestId) {
          await claimGuestSession(guestId, result.user.id);
        }

        return Response.json({ user: result.user });
      },
    },
  },
});
