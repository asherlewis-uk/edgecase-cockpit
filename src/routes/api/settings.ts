import { createFileRoute } from "@tanstack/react-router";
import { getAuthUserId } from "@/lib/session.server";
import { getUserSettings, setUserSettings } from "@/lib/db";
import { rateLimit, urlAllowedForProvider } from "@/lib/proxy-guard.server";
import { validateCsrfToken } from "@/lib/csrf.server";

export const Route = createFileRoute("/api/settings")({
  server: {
    handlers: {
      GET: async () => {
        const userId = await getAuthUserId();
        if (!userId) {
          return Response.json({ error: "Authentication required" }, { status: 401 });
        }

        const rl = rateLimit(`settings:${userId}`);
        if (!rl.ok) {
          return new Response(JSON.stringify({ error: "Rate limited" }), {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              ...(rl.retryAfter ? { "retry-after": String(rl.retryAfter) } : {}),
            },
          });
        }

        const settings = await getUserSettings(userId);
        if (!settings) {
          return Response.json({
            profile: {},
            personalization: {},
            keyboardShortcuts: {},
            rag: {},
            activeProviderId: null,
            pinnedProviderIds: [],
            costOverrides: null,
            onboardingCompleted: false,
            syncThreadsEnabled: false,
          });
        }

        return Response.json({
          profile: JSON.parse(settings.profileJson),
          personalization: JSON.parse(settings.personalizationJson),
          keyboardShortcuts: JSON.parse(settings.keyboardShortcutsJson),
          rag: JSON.parse(settings.ragJson),
          activeProviderId: settings.activeProviderId,
          pinnedProviderIds: JSON.parse(settings.pinnedProviderIdsJson),
          costOverrides: settings.costOverridesJson ? JSON.parse(settings.costOverridesJson) : null,
          onboardingCompleted: settings.onboardingCompleted,
          syncThreadsEnabled: settings.syncThreadsEnabled,
        });
      },

      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const userId = await getAuthUserId();
        if (!userId) {
          return Response.json({ error: "Authentication required" }, { status: 401 });
        }

        const rl = rateLimit(`settings:${userId}`);
        if (!rl.ok) {
          return new Response(JSON.stringify({ error: "Rate limited" }), {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              ...(rl.retryAfter ? { "retry-after": String(rl.retryAfter) } : {}),
            },
          });
        }

        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const settings: Parameters<typeof setUserSettings>[1] = {};

        if (body.profile !== undefined) {
          settings.profileJson = JSON.stringify(body.profile);
        }
        if (body.personalization !== undefined) {
          settings.personalizationJson = JSON.stringify(body.personalization);
        }
        if (body.keyboardShortcuts !== undefined) {
          settings.keyboardShortcutsJson = JSON.stringify(body.keyboardShortcuts);
        }
        if (body.rag !== undefined) {
          settings.ragJson = JSON.stringify(body.rag);
        }
        if (body.activeProviderId !== undefined) {
          settings.activeProviderId = typeof body.activeProviderId === "string" ? body.activeProviderId : undefined;
        }
        if (body.pinnedProviderIds !== undefined) {
          settings.pinnedProviderIdsJson = JSON.stringify(Array.isArray(body.pinnedProviderIds) ? body.pinnedProviderIds : []);
        }
        if (body.costOverrides !== undefined) {
          settings.costOverridesJson = body.costOverrides ? JSON.stringify(body.costOverrides) : undefined;
        }
        if (body.onboardingCompleted !== undefined) {
          settings.onboardingCompleted = Boolean(body.onboardingCompleted);
        }
        if (body.syncThreadsEnabled !== undefined) {
          settings.syncThreadsEnabled = Boolean(body.syncThreadsEnabled);
        }

        await setUserSettings(userId, settings);

        return Response.json({ ok: true });
      },
    },
  },
});
