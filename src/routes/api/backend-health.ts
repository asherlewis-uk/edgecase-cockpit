// Diagnostic route proving the edge -> Linux backend bridge is alive.
// Not a traffic path: it exists so an operator can confirm BACKEND_ORIGIN is
// set and reachable before any real route is migrated across the bridge.
import { createFileRoute } from "@tanstack/react-router";
import { backendFetch, BackendNotConfiguredError } from "@/lib/backend-client.server";
import { getPlatformEnv } from "@/lib/platform.server";

const NO_CACHE = { "Cache-Control": "no-cache" } as const;

// BACKEND_ORIGIN is not in server.ts's RUNTIME_ENV_KEYS allowlist, so it is
// never copied into process.env inside the Worker. Read the platform env first
// and let getBackendOrigin fall back to process.env for local Node dev.
function envSource(): Record<string, unknown> {
  return getPlatformEnv() ?? process.env;
}

// Merge the edge flag into the backend payload. Health endpoints return an
// object, but an array or scalar body must not be spread into key/index soup.
function withBridgeFlag(payload: unknown): Record<string, unknown> {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>), edge_bridged: true };
  }
  return { backend: payload, edge_bridged: true };
}

export const Route = createFileRoute("/api/backend-health")({
  server: {
    handlers: {
      GET: async () => {
        let response: Response;
        try {
          response = await backendFetch("/health", { method: "GET" }, envSource());
        } catch (error) {
          if (error instanceof BackendNotConfiguredError) {
            return Response.json(
              { status: "unconfigured", edge_bridged: false, error: error.message },
              { status: 503, headers: NO_CACHE },
            );
          }
          return Response.json(
            {
              status: "unreachable",
              edge_bridged: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 502, headers: NO_CACHE },
          );
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          // Reached the backend but it did not speak JSON — still a bad gateway.
          return Response.json(
            {
              status: "invalid_response",
              edge_bridged: false,
              error: `Backend returned a non-JSON body (HTTP ${response.status}).`,
            },
            { status: 502, headers: NO_CACHE },
          );
        }

        // Mirror the backend's status so an unhealthy backend does not read as
        // a healthy bridge. edge_bridged stays true either way: the hop worked.
        return Response.json(
          { ...withBridgeFlag(payload), backend_status: response.status },
          { status: response.status, headers: NO_CACHE },
        );
      },
    },
  },
});
