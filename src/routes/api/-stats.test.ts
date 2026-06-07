import { describe, it, expect, beforeEach, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any for route handler stubs */

vi.mock("@/lib/session.server", () => ({
  getCockpitSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getProviderStats: vi.fn(),
  upsertProviderStat: vi.fn(),
  resetProviderStats: vi.fn(),
  createUsageRecord: vi.fn(),
}));

import { getCockpitSession } from "@/lib/session.server";
import { upsertProviderStat, createUsageRecord } from "@/lib/db";
import { clearRateLimitBuckets } from "@/lib/rate-limit.server";

const CSRF_TOKEN = "aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233";
const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-CSRF-Token": CSRF_TOKEN,
  Cookie: `csrf-token=${CSRF_TOKEN}`,
};

beforeEach(() => {
  clearRateLimitBuckets();
  vi.clearAllMocks();
  vi.mocked(getCockpitSession).mockResolvedValue({
    data: { id: "test-session" },
    update: vi.fn(),
  } as any);
});

// ---------------------------------------------------------------------------
// POST /api/stats
// ---------------------------------------------------------------------------
describe("POST /api/stats", () => {
  let handler: (ctx: { request: Request }) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/routes/api/stats");
    handler = (mod.Route.options as any).server.handlers.POST;
  });

  it("persists token data when provided", async () => {
    const req = new Request("http://localhost/api/stats", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        providerId: "openai",
        kind: "call",
        inputTokens: 100,
        outputTokens: 50,
        model: "gpt-4o",
        threadId: "thread-1",
      }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(200);
    expect(upsertProviderStat).toHaveBeenCalledWith("test-session", "openai", "call", 100, 50);
    expect(createUsageRecord).toHaveBeenCalled();
    const recordArg = vi.mocked(createUsageRecord).mock.calls[0][0];
    expect(recordArg.providerId).toBe("openai");
    expect(recordArg.inputTokens).toBe(100);
    expect(recordArg.outputTokens).toBe(50);
    expect(recordArg.model).toBe("gpt-4o");
    expect(recordArg.threadId).toBe("thread-1");
  });

  it("returns 403 for missing CSRF token", async () => {
    const req = new Request("http://localhost/api/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "openai", kind: "call" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(403);
  });
});
