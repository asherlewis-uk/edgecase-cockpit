import { describe, it, expect, beforeEach, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any for route handler stubs */

vi.mock("@/lib/session.server", () => ({
  getCockpitSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  createSession: vi.fn(),
  getThreads: vi.fn().mockResolvedValue([]),
  getThreadCount: vi.fn().mockResolvedValue(0),
  createThread: vi.fn().mockResolvedValue(undefined),
  updateThread: vi.fn().mockResolvedValue(undefined),
  deleteThread: vi.fn().mockResolvedValue(undefined),
  deleteThreads: vi.fn().mockResolvedValue(0),
  getThread: vi.fn().mockResolvedValue(null),
}));

import { getCockpitSession } from "@/lib/session.server";
import { clearRateLimitBuckets } from "@/lib/rate-limit.server";
import { getThreadCount } from "@/lib/db";

const CSRF_TOKEN = "aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233";
const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-CSRF-Token": CSRF_TOKEN,
  Cookie: `csrf-token=${CSRF_TOKEN}`,
};

beforeEach(() => {
  clearRateLimitBuckets();
  vi.clearAllMocks();
  vi.mocked(getThreadCount).mockResolvedValue(0);
  vi.mocked(getCockpitSession).mockResolvedValue({
    data: { id: "test-session" },
    update: vi.fn(),
  } as any);
});

async function exhaustThreadRateLimit(handler: (ctx: { request: Request }) => Promise<Response>) {
  // threadsRateLimit allows 60 requests per minute
  const body = JSON.stringify({
    id: "thread-1",
    title: "Test thread",
    messages: [],
    updatedAt: Date.now(),
  });
  for (let i = 0; i < 60; i++) {
    const res = await handler({
      request: new Request("http://localhost/api/threads", {
        method: "POST",
        headers: CSRF_HEADERS,
        body,
      }),
    });
    expect(res.status).toBe(200);
  }
  return handler({
    request: new Request("http://localhost/api/threads", {
      method: "POST",
      headers: CSRF_HEADERS,
      body,
    }),
  });
}

describe("POST /api/threads", () => {
  it("returns 429 after exhausting the thread mutation rate limit", async () => {
    const mod = await import("@/routes/api/threads");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await exhaustThreadRateLimit(handler);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Rate limited");
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it("returns 413 when thread count limit is exceeded", async () => {
    vi.mocked(getThreadCount).mockResolvedValue(2_000);
    const mod = await import("@/routes/api/threads");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/threads", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          id: "thread-1",
          title: "Test thread",
          messages: [],
          updatedAt: Date.now(),
        }),
      }),
    });

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("Limit exceeded");
    expect(body.field).toBe("threads");
  });
});

describe("backend thread sync guard", () => {
  it("POST /api/threads rejects syncEnabled=true", async () => {
    const mod = await import("@/routes/api/threads");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/threads", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          id: "thread-1",
          title: "Test thread",
          messages: [],
          updatedAt: Date.now(),
          syncEnabled: true,
        }),
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Backend thread sync is not enabled");
  });

  it("POST /api/threads stores syncEnabled=false even when omitted", async () => {
    const mod = await import("@/routes/api/threads");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/threads", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          id: "thread-1",
          title: "Test thread",
          messages: [],
          updatedAt: Date.now(),
        }),
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.thread.syncEnabled).toBe(false);
  });

  it("PATCH /api/threads/$id rejects syncEnabled=true", async () => {
    const mod = await import("@/routes/api/threads.$id");
    const handler = (mod.Route.options as any).server.handlers.PATCH;

    const res = await handler({
      request: new Request("http://localhost/api/threads/thread-1", {
        method: "PATCH",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ syncEnabled: true }),
      }),
      params: { id: "thread-1" },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Backend thread sync is not enabled");
  });
});
