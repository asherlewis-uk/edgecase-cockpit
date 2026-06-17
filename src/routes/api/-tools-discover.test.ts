/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any for route handler stubs */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session.server", () => ({
  getCockpitSession: vi.fn().mockResolvedValue({ data: { id: "session-1" } }),
}));

vi.mock("@/lib/csrf.server", () => ({
  validateCsrfToken: () => true,
}));

vi.mock("@/lib/rate-limit.server", () => ({
  sessionRateLimit: vi.fn().mockResolvedValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));

vi.mock("@/lib/provider-tool-discovery.server", () => ({
  isProviderToolDiscoveryEnabled: vi.fn().mockReturnValue(false),
  discoverAllProviderTools: vi.fn().mockResolvedValue({}),
  discoverProviderTools: vi.fn().mockResolvedValue({ ok: false, error: "disabled" }),
}));

describe("/api/tools/discover", () => {
  let handler: { GET: any; POST: any };

  beforeEach(async () => {
    const mod = await import("./tools/discover");
    handler = (mod.Route.options as any).server.handlers;
  });

  it("GET returns discovery status", async () => {
    const request = new Request("http://localhost/api/tools/discover", { method: "GET" });
    const response = await handler.GET({ request });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { enabled: boolean };
    expect(body.enabled).toBe(false);
  });

  it("POST runs per-provider discovery", async () => {
    const request = new Request("http://localhost/api/tools/discover", {
      method: "POST",
      body: JSON.stringify({ providerId: "openai" }),
    });
    const response = await handler.POST({ request });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { enabled: boolean };
    expect(body.enabled).toBe(false);
  });
});
