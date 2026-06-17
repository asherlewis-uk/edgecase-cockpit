/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any for route handler stubs */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAuthUserId = vi.fn().mockResolvedValue("user-1");
vi.mock("@/lib/session.server", () => ({
  getAuthUserId: (...args: unknown[]) => mockGetAuthUserId(...args),
}));

vi.mock("@/lib/csrf.server", () => ({
  validateCsrfToken: () => true,
}));

vi.mock("@/lib/rate-limit.server", () => ({
  sessionRateLimit: vi.fn().mockResolvedValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));

const mockGrant = vi.fn();
const mockRevoke = vi.fn();
vi.mock("@/lib/db", () => ({
  grantUserToolPermission: mockGrant,
  revokeUserToolPermission: mockRevoke,
}));

vi.mock("@/lib/tool-execution.server", () => ({
  getToolApprovalStatus: vi
    .fn()
    .mockResolvedValue([{ name: "my_tool", source: "local", approved: false }]),
}));

describe("/api/tools/permissions", () => {
  let handler: { GET: any; POST: any };

  beforeEach(async () => {
    const mod = await import("./tools/permissions");
    handler = (mod.Route.options as any).server.handlers;
    mockGetAuthUserId.mockResolvedValue("user-1");
    mockGrant.mockReset();
    mockRevoke.mockReset();
  });

  it("lists tool approval status", async () => {
    const request = new Request("http://localhost/api/tools/permissions", { method: "GET" });
    const response = await handler.GET({ request });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { tools: Array<{ name: string; approved: boolean }> };
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toBe("my_tool");
  });

  it("grants permission", async () => {
    const request = new Request("http://localhost/api/tools/permissions", {
      method: "POST",
      body: JSON.stringify({ toolName: "my_tool", action: "grant" }),
    });
    const response = await handler.POST({ request });
    expect(response.status).toBe(200);
    expect(mockGrant).toHaveBeenCalledWith("user-1", "my_tool");
  });

  it("revokes permission", async () => {
    const request = new Request("http://localhost/api/tools/permissions", {
      method: "POST",
      body: JSON.stringify({ toolName: "my_tool", action: "revoke" }),
    });
    const response = await handler.POST({ request });
    expect(response.status).toBe(200);
    expect(mockRevoke).toHaveBeenCalledWith("user-1", "my_tool");
  });
});
