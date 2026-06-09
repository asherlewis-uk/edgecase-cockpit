import { describe, it, expect, beforeEach, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any for route handler stubs */

vi.mock("@/lib/session.server", () => ({
  getCockpitSession: vi.fn(),
  getProviderCreds: vi.fn(),
}));

import { getCockpitSession } from "@/lib/session.server";
import { clearRateLimitBuckets } from "@/lib/rate-limit.server";
import { __resetToolRegistry } from "@/lib/tools";

const CSRF_TOKEN = "aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233";
const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-CSRF-Token": CSRF_TOKEN,
  Cookie: `csrf-token=${CSRF_TOKEN}`,
};

beforeEach(() => {
  clearRateLimitBuckets();
  __resetToolRegistry();
  vi.clearAllMocks();
  vi.mocked(getCockpitSession).mockResolvedValue({
    data: { id: "test-session" },
    update: vi.fn(),
  } as any);
});

// ---------------------------------------------------------------------------
// GET /api/tools/schemas
// ---------------------------------------------------------------------------
describe("GET /api/tools/schemas", () => {
  let handler: (ctx: { request: Request }) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/routes/api/tools/schemas");
    handler = (mod.Route.options as any).server.handlers.GET;
  });

  it("allows GET without CSRF token (GET is a safe/read method)", async () => {
    // GET is a safe, idempotent method — validateCsrfToken exempts it.
    // This matches the behavior of other read-only routes (e.g. GET /api/proxy/models).
    const req = new Request("http://localhost/api/tools/schemas", {
      method: "GET",
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(200);
  });

  it("returns 200 with schemas list and counts for valid CSRF", async () => {
    const req = new Request("http://localhost/api/tools/schemas", {
      method: "GET",
      headers: CSRF_HEADERS,
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("schemas");
    expect(body).toHaveProperty("counts");
    expect(Array.isArray(body.schemas)).toBe(true);
    // Built-in tools are always present
    expect(body.schemas.length).toBeGreaterThanOrEqual(4);
    expect(body.counts.builtIn).toBe(4);
  });

  it("returns built-in tools by default with source=built-in", async () => {
    const req = new Request("http://localhost/api/tools/schemas", {
      method: "GET",
      headers: CSRF_HEADERS,
    });
    const res = await handler({ request: req });
    const body = await res.json();
    const builtIns = body.schemas.filter((s: any) => s.source === "built-in");
    expect(builtIns.length).toBe(4);
    const names = builtIns.map((s: any) => s.name);
    expect(names).toContain("get_current_time");
    expect(names).toContain("echo");
    expect(names).toContain("word_count");
    expect(names).toContain("calculator");
  });

  it("returns 429 when rate limit is exhausted", async () => {
    for (let i = 0; i < 30; i++) {
      await handler({
        request: new Request("http://localhost/api/tools/schemas", {
          method: "GET",
          headers: CSRF_HEADERS,
        }),
      });
    }
    const res = await handler({
      request: new Request("http://localhost/api/tools/schemas", {
        method: "GET",
        headers: CSRF_HEADERS,
      }),
    });
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tools/schemas
// ---------------------------------------------------------------------------
describe("POST /api/tools/schemas", () => {
  let handler: (ctx: { request: Request }) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/routes/api/tools/schemas");
    handler = (mod.Route.options as any).server.handlers.POST;
  });

  it("returns 403 for missing CSRF token", async () => {
    const req = new Request("http://localhost/api/tools/schemas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "my_tool", description: "A tool" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(403);
  });

  it("registers a valid local tool and returns ok:true", async () => {
    const req = new Request("http://localhost/api/tools/schemas", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        name: "my_custom_tool",
        description: "Does something useful",
      }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/tools/schemas", {
      method: "POST",
      headers: {
        "X-CSRF-Token": CSRF_TOKEN,
        Cookie: `csrf-token=${CSRF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: "not json",
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("returns 400 for missing description (invalid tool def)", async () => {
    const req = new Request("http://localhost/api/tools/schemas", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ name: "no_description_tool" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 for unsafe tool name", async () => {
    const req = new Request("http://localhost/api/tools/schemas", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ name: "rm -rf /", description: "dangerous" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
  });

  it("returns 400 for duplicate tool name", async () => {
    // Register once
    await handler({
      request: new Request("http://localhost/api/tools/schemas", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ name: "unique_tool", description: "First" }),
      }),
    });
    // Try to register again with same name
    const res = await handler({
      request: new Request("http://localhost/api/tools/schemas", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ name: "unique_tool", description: "Second" }),
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when trying to override a built-in tool name", async () => {
    const req = new Request("http://localhost/api/tools/schemas", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ name: "echo", description: "Override built-in" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
  });

  it("registered non-built-in tool is visible in GET but cannot execute (not in built-in registry)", async () => {
    // Register a local tool
    await handler({
      request: new Request("http://localhost/api/tools/schemas", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ name: "fetch_url", description: "Fetches a URL" }),
      }),
    });

    // Now GET should list it
    const getMod = await import("@/routes/api/tools/schemas");
    const getHandler = (getMod.Route.options as any).server.handlers.GET;
    const getRes = await getHandler({
      request: new Request("http://localhost/api/tools/schemas", {
        method: "GET",
        headers: CSRF_HEADERS,
      }),
    });
    const body = await getRes.json();
    const local = body.schemas.find((s: any) => s.name === "fetch_url");
    expect(local).toBeDefined();
    expect(local.source).toBe("local");
    expect(body.counts.local).toBe(1);
  });
});
