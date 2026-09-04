/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any for route handler stubs */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BackendNotConfiguredError } from "@/lib/backend-client.server";

const backendFetch = vi.fn();

// Keep the real BackendNotConfiguredError so the handler's instanceof check is
// exercised against the same class the transport client actually throws.
vi.mock("@/lib/backend-client.server", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/backend-client.server")>();
  return { ...actual, backendFetch: (...args: unknown[]) => backendFetch(...args) };
});

vi.mock("@/lib/platform.server", () => ({
  getPlatformEnv: () => ({ BACKEND_ORIGIN: "http://127.0.0.1:8000" }),
}));

describe("/api/backend-health", () => {
  let handler: { GET: any };

  beforeEach(async () => {
    backendFetch.mockReset();
    const mod = await import("./backend-health");
    handler = (mod.Route.options as any).server.handlers;
  });

  it("asks the backend for /health with a GET", async () => {
    backendFetch.mockResolvedValue(Response.json({ status: "ok" }));
    await handler.GET({});
    expect(backendFetch).toHaveBeenCalledWith(
      "/health",
      { method: "GET" },
      { BACKEND_ORIGIN: "http://127.0.0.1:8000" },
    );
  });

  it("returns 503 when BACKEND_ORIGIN is unset", async () => {
    backendFetch.mockRejectedValue(new BackendNotConfiguredError());

    const response = await handler.GET({});
    expect(response.status).toBe(503);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("unconfigured");
    expect(body.edge_bridged).toBe(false);
    expect(body.error).toContain("BACKEND_ORIGIN unset");
  });

  it("returns 502 when the backend is unreachable", async () => {
    backendFetch.mockRejectedValue(new TypeError("fetch failed: ECONNREFUSED"));

    const response = await handler.GET({});
    expect(response.status).toBe(502);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("unreachable");
    expect(body.edge_bridged).toBe(false);
    expect(body.error).toContain("ECONNREFUSED");
  });

  it("returns the backend payload with edge_bridged injected", async () => {
    backendFetch.mockResolvedValue(Response.json({ status: "ok", uptime: 42 }));

    const response = await handler.GET({});
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "ok",
      uptime: 42,
      edge_bridged: true,
      backend_status: 200,
    });
  });

  it("mirrors an unhealthy backend status rather than reporting 200", async () => {
    backendFetch.mockResolvedValue(Response.json({ status: "degraded" }, { status: 500 }));

    const response = await handler.GET({});
    expect(response.status).toBe(500);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.edge_bridged, "the hop still worked, so the flag stays true").toBe(true);
    expect(body.backend_status).toBe(500);
  });

  it("returns 502 when the backend does not speak JSON", async () => {
    backendFetch.mockResolvedValue(new Response("<html>gateway</html>", { status: 200 }));

    const response = await handler.GET({});
    expect(response.status).toBe(502);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("invalid_response");
    expect(body.edge_bridged).toBe(false);
  });

  it("wraps a non-object backend payload instead of spreading it", async () => {
    backendFetch.mockResolvedValue(Response.json(["ok"]));

    const response = await handler.GET({});
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.backend).toEqual(["ok"]);
    expect(body.edge_bridged).toBe(true);
  });

  it("marks the response no-cache", async () => {
    backendFetch.mockResolvedValue(Response.json({ status: "ok" }));

    const response = await handler.GET({});
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });
});
