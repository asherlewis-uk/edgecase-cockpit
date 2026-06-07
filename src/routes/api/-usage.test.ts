import { describe, it, expect, beforeEach, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any for route handler stubs */

vi.mock("@/lib/session.server", () => ({
  getCockpitSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getAggregateUsage: vi.fn(),
  getMessageCount: vi.fn(),
  getUsageForThread: vi.fn(),
  getThread: vi.fn(),
}));

import { getCockpitSession } from "@/lib/session.server";
import { getAggregateUsage, getMessageCount, getUsageForThread, getThread } from "@/lib/db";
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
// GET /api/usage
// ---------------------------------------------------------------------------
describe("GET /api/usage", () => {
  let handler: () => Promise<Response>;

  beforeEach(async () => {
    vi.mocked(getAggregateUsage).mockResolvedValue({
      totalCalls: 10,
      totalErrors: 1,
      totalInputTokens: 5000,
      totalOutputTokens: 2000,
      totalEstimatedCost: 0.05,
      perProvider: {
        openai: { calls: 10, errors: 1, inputTokens: 5000, outputTokens: 2000 },
      },
    });
    vi.mocked(getMessageCount).mockResolvedValue(42);
    const mod = await import("@/routes/api/usage");
    handler = (mod.Route.options as any).server.handlers.GET;
  });

  it("returns aggregate usage with token data", async () => {
    const res = await handler();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usage.totalCalls).toBe(10);
    expect(body.usage.totalErrors).toBe(1);
    expect(body.usage.totalMessages).toBe(42);
    expect(body.usage.totalInputTokens).toBe(5000);
    expect(body.usage.totalOutputTokens).toBe(2000);
    expect(body.usage.totalEstimatedCost).toBe(0.05);
    expect(body.usage.perProvider.openai.inputTokens).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// GET /api/usage/$threadId
// ---------------------------------------------------------------------------
describe("GET /api/usage/$threadId", () => {
  let handler: (ctx: { params: { threadId: string } }) => Promise<Response>;

  beforeEach(async () => {
    vi.mocked(getUsageForThread).mockResolvedValue({
      inputTokens: 1000,
      outputTokens: 500,
      estimatedCost: 0.01,
      count: 3,
    });
    vi.mocked(getMessageCount).mockResolvedValue(12);
    const mod = await import("@/routes/api/usage.$threadId");
    handler = (mod.Route.options as any).server.handlers.GET;
  });

  it("returns per-thread usage with token data", async () => {
    const res = await handler({ params: { threadId: "thread-1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.threadId).toBe("thread-1");
    expect(body.messageCount).toBe(12);
    expect(body.inputTokens).toBe(1000);
    expect(body.outputTokens).toBe(500);
    expect(body.totalTokens).toBe(1500);
    expect(body.estimatedCost).toBe(0.01);
  });

  it("falls back to message estimation when no usage records exist", async () => {
    vi.mocked(getUsageForThread).mockResolvedValue({
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      count: 0,
    });
    vi.mocked(getThread).mockResolvedValue({
      id: "thread-1",
      title: "Test",
      messages: [
        { id: "1", role: "user", content: "Hello world", ts: 1 },
        { id: "2", role: "assistant", content: "Hi there", providerId: "openai", ts: 2 },
      ],
      updatedAt: 2,
    } as any);
    const res = await handler({ params: { threadId: "thread-1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inputTokens).toBeGreaterThan(0);
    expect(body.outputTokens).toBeGreaterThan(0);
    expect(body.totalTokens).toBe(body.inputTokens + body.outputTokens);
    expect(body.estimatedCost).toBeGreaterThan(0);
  });
});
