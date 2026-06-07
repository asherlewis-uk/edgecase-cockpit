import { createFileRoute } from "@tanstack/react-router";
import { getCockpitSession } from "@/lib/session.server";
import { rateLimit, urlAllowedAnyProvider } from "@/lib/proxy-guard.server";
import { validateCsrfToken } from "@/lib/csrf.server";

// Server-side reachability probe. The browser can't reliably ping localhost
// (mixed-content + CORS) or arbitrary cloud hosts. This runs from the server
// so the result reflects real network reachability from the deployment.
//
// NOTE: When the app is hosted, "localhost" refers to the server, not the
// user's machine — local-daemon checks will fail unless the daemon is on the
// same host. The settings UI explains this clearly.

export const Route = createFileRoute("/api/proxy/detect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        const session = await getCockpitSession();
        const rl = rateLimit(`detect:${session.data.id ?? "anon"}`);
        if (!rl.ok) {
          return Response.json({ ok: false, error: "Rate limited" }, { status: 429 });
        }
        let url = "";
        try {
          const body = (await request.json()) as { url?: string };
          url = (body.url ?? "").trim();
        } catch {
          /* fallthrough */
        }
        if (!url || !/^https?:\/\//i.test(url)) {
          return Response.json({ ok: false, error: "Bad url" }, { status: 400 });
        }
        if (!urlAllowedAnyProvider(url)) {
          return Response.json(
            { ok: false, error: "Host not in any provider allowlist" },
            { status: 400 },
          );
        }
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2000);
        try {
          const res = await fetch(url, { signal: ctrl.signal });
          clearTimeout(t);
          // 401/403 still means the host is reachable.
          const ok = res.ok || res.status === 401 || res.status === 403;
          return Response.json({ ok, status: res.status });
        } catch (e) {
          clearTimeout(t);
          const msg = e instanceof Error ? e.message : "Unreachable";
          return Response.json({ ok: false, error: msg });
        }
      },
    },
  },
});
