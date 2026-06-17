/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any for route handler stubs */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/session.server", () => ({
  getAuthUserId: vi.fn().mockResolvedValue("user-1"),
}));

vi.mock("@/lib/csrf.server", () => ({
  validateCsrfToken: () => true,
}));

vi.mock("@/lib/rate-limit.server", () => ({
  sessionRateLimit: vi.fn().mockResolvedValue({ ok: true }),
  rateLimitResponse: vi
    .fn()
    .mockImplementation((retryAfter: number) =>
      Response.json({ error: "Rate limited", retryAfter }, { status: 429 }),
    ),
}));

vi.mock("@/lib/tool-execution.server", () => ({
  executeToolCall: vi.fn().mockResolvedValue({ ok: true, content: "done" }),
}));

describe("POST /api/tools/execute", () => {
  it("executes an approved non-built-in tool", async () => {
    const mod = await import("./tools/execute");
    const handler = (mod.Route.options as any).server.handlers.POST;
    const request = new Request("http://localhost/api/tools/execute", {
      method: "POST",
      body: JSON.stringify({
        call: { id: "call-1", name: "my_tool", arguments: '{"x":1}' },
      }),
    });
    const response = await handler({ request });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; content: string };
    expect(body.ok).toBe(true);
    expect(body.content).toBe("done");
  });
});
