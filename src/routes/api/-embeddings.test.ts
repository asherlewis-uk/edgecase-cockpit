import { describe, it, expect, beforeEach, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any for route handler stubs */

vi.mock("@/lib/session.server", () => ({
  getCockpitSession: vi.fn(),
  getProviderCreds: vi.fn(),
}));

import { getCockpitSession, getProviderCreds } from "@/lib/session.server";
import { clearRateLimitBuckets } from "@/lib/rate-limit.server";
import { clearProxyGuardBuckets } from "@/lib/proxy-guard.server";

const CSRF_TOKEN = "aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233";
const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-CSRF-Token": CSRF_TOKEN,
  Cookie: `csrf-token=${CSRF_TOKEN}`,
};

beforeEach(() => {
  clearRateLimitBuckets();
  clearProxyGuardBuckets();
  vi.clearAllMocks();
  vi.mocked(getCockpitSession).mockResolvedValue({
    data: { id: "test-session" },
    update: vi.fn(),
  } as any);
});

// ---------------------------------------------------------------------------
// POST /api/proxy/embeddings
// ---------------------------------------------------------------------------
describe("POST /api/proxy/embeddings", () => {
  let handler: (ctx: { request: Request }) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/routes/api/proxy/embeddings");
    handler = (mod.Route.options as any).server.handlers.POST;
  });

  it("returns 403 for missing CSRF token", async () => {
    const req = new Request("http://localhost/api/proxy/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "openai", input: ["hello"] }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Missing CSRF token");
  });

  it("returns 400 for provider without embeddings support", async () => {
    const req = new Request("http://localhost/api/proxy/embeddings", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ providerId: "anthropic", input: ["hello"] }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("does not support embeddings");
  });

  it("returns 400 for empty input", async () => {
    const req = new Request("http://localhost/api/proxy/embeddings", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ providerId: "openai", input: [] }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
  });

  it("returns 400 for disallowed base URL", async () => {
    vi.mocked(getProviderCreds).mockResolvedValue({
      apiKey: "sk-test",
      baseUrl: "https://evil.com",
    } as any);
    const req = new Request("http://localhost/api/proxy/embeddings", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ providerId: "openai", input: ["hello"] }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Base URL not allowed");
  });
});
