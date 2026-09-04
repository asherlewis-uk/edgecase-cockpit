import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  getUserByEmail,
  verifyPassword,
  stripPassword,
  claimGuestSession,
} from "@/lib/auth.server";
import { setAuthSession, getGuestSessionId } from "@/lib/session.server";
import { validateCsrfToken } from "@/lib/csrf.server";
import { sessionRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

const Body = z.object({
  email: z.string().email().min(1).max(256),
  password: z.string().min(1).max(128),
  // Whether the server should claim guest session data into this account.
  // Defaults to FALSE: an unstated intent must never merge one identity's data
  // into another. The local → server migration dialog sends true only for Move.
  claimGuestData: z.boolean().optional().default(false),
});

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const rl = await sessionRateLimit("auth:login");
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

        const { email, password, claimGuestData } = parsed.data;
        const user = await getUserByEmail(email);

        if (!user) {
          return Response.json({ error: "Invalid email or password" }, { status: 401 });
        }

        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
          return Response.json({ error: "Invalid email or password" }, { status: 401 });
        }

        // Capture the guest owner before login clears guest session state.
        const guestId = await getGuestSessionId();

        await setAuthSession(user.id, user.email);

        // Claim any guest session data into the user account, unless the
        // client explicitly opted out.
        if (guestId && claimGuestData !== false) {
          await claimGuestSession(guestId, user.id);
        }

        return Response.json({ user: stripPassword(user) });
      },
    },
  },
});
