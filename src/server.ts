import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { setPlatformEnv, getDB } from "./lib/platform.server";
import { withCspHeaders } from "./lib/csp.server";
import { validateEnv } from "./lib/env.server";
import { warnInMemoryRateLimitInProduction } from "./lib/rate-limit.server";
import { logCustomProviderPolicy } from "./lib/proxy-guard.server";

// ── Startup guards (run once per cold start) ─────────────────────────────

let envValid = false;
try {
  validateEnv();
  envValid = true;
} catch (e) {
  console.error("[env]", e instanceof Error ? e.message : String(e));
}

// Warn about D1 binding at startup — the placeholder ID (00000000-...) in
// wrangler.jsonc won't be caught here, but a missing binding will be.
try {
  getDB();
} catch {
  console.warn(
    "[platform] D1 database binding 'DB' not available. " +
      "Thread persistence and usage stats require a valid d1_databases entry in wrangler.jsonc.",
  );
}

// Warn if in-memory rate limiting is used in production without acknowledgement.
warnInMemoryRateLimitInProduction();

// Log effective custom-provider wildcard policy.
logCustomProviderPolicy();

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // ── Per-request startup guard ────────────────────────────────────
      if (!envValid) {
        return new Response(
          JSON.stringify({
            error: "Server misconfigured",
            detail:
              "Required environment variables are missing or invalid. " +
              "Check server logs for the full diagnostic. " +
              "At minimum, SESSION_SECRET must be set to a random string of 32+ characters.",
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      setPlatformEnv(env);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);

      // Only attach security headers to document/HTML responses.
      // API routes manage their own headers; static assets are served by
      // the platform and should not be modified here.
      const contentType = normalized.headers.get("content-type") ?? "";
      const isDocument =
        contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
      if (isDocument) {
        const mode =
          typeof env === "object" &&
          env !== null &&
          (env as Record<string, unknown>).NODE_ENV === "development"
            ? "development"
            : "production";
        return withCspHeaders(normalized, mode);
      }

      return normalized;
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
