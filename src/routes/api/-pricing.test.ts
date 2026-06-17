/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any for route handler stubs */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session.server", () => ({
  getCockpitSession: vi.fn().mockResolvedValue({ data: { id: "session-1" } }),
}));

vi.mock("@/lib/csrf.server", () => ({
  validateCsrfToken: () => true,
}));

vi.mock("@/lib/rate-limit.server", () => ({
  usageRateLimit: vi.fn().mockResolvedValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));

vi.mock("@/lib/pricing.server", () => ({
  getCachedRates: vi.fn().mockResolvedValue({
    openai: { input: 0.001, output: 0.002, source: "static", updatedAt: 1 },
  }),
  refreshLivePricing: vi.fn().mockResolvedValue({ ok: true, rates: {}, refreshedAt: Date.now() }),
}));

describe("/api/pricing", () => {
  let handler: { GET: any; POST: any };

  beforeEach(async () => {
    const mod = await import("./pricing");
    handler = (mod.Route.options as any).server.handlers;
  });

  it("GET returns cached rates", async () => {
    const request = new Request("http://localhost/api/pricing", { method: "GET" });
    const response = await handler.GET({ request });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { rates: Record<string, unknown> };
    expect(body.rates.openai).toBeDefined();
  });

  it("POST refreshes pricing", async () => {
    const request = new Request("http://localhost/api/pricing", { method: "POST" });
    const response = await handler.POST({ request });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
