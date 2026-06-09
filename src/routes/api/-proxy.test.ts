import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any for route handler stubs */

vi.mock("@/lib/session.server", () => ({
  getCockpitSession: vi.fn(),
  getProviderCreds: vi.fn(),
}));

vi.mock("@/lib/providers", async () => {
  const actual = await vi.importActual("@/lib/providers");
  return {
    ...actual,
    PROVIDERS: (actual as any).PROVIDERS,
  };
});

import { getCockpitSession, getProviderCreds } from "@/lib/session.server";
import { clearRateLimitBuckets } from "@/lib/rate-limit.server";
import { clearProxyGuardBuckets } from "@/lib/proxy-guard.server";

const CSRF_TOKEN = "aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233";
const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-CSRF-Token": CSRF_TOKEN,
  Cookie: `csrf-token=${CSRF_TOKEN}`,
};
const CSRF_HEADERS_NO_CT = {
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
// POST /api/proxy/chat
// ---------------------------------------------------------------------------
describe("POST /api/proxy/chat", () => {
  let handler: (ctx: { request: Request }) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/routes/api/proxy/chat");
    handler = (mod.Route.options as any).server.handlers.POST;
  });

  it("returns 403 for missing CSRF token", async () => {
    const req = new Request("http://localhost/api/proxy/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "openai", messages: [] }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Missing CSRF token");
  });

  it("returns 403 for invalid CSRF token", async () => {
    const req = new Request("http://localhost/api/proxy/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "bad",
        Cookie: "csrf-token=other",
      },
      body: JSON.stringify({ providerId: "openai", messages: [] }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Invalid CSRF token");
  });

  it("returns 429 when rate limit is exhausted", async () => {
    for (let i = 0; i < 120; i++) {
      const r = await handler({
        request: new Request("http://localhost/api/proxy/chat", {
          method: "POST",
          headers: CSRF_HEADERS,
          body: JSON.stringify({ providerId: "openai", messages: [] }),
        }),
      });
      expect(r.status).not.toBe(403);
    }
    const res = await handler({
      request: new Request("http://localhost/api/proxy/chat", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ providerId: "openai", messages: [] }),
      }),
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Rate limited");
  });

  it("returns 400 for unknown provider", async () => {
    const req = new Request("http://localhost/api/proxy/chat", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ providerId: "unknown-provider", messages: [] }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Unknown provider");
  });

  it("returns 400 for disallowed base URL", async () => {
    const req = new Request("http://localhost/api/proxy/chat", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        providerId: "openai",
        messages: [],
        baseUrlOverride: "https://evil.com",
      }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("not allowed");
  });
});

// ---------------------------------------------------------------------------
// POST /api/proxy/detect
// ---------------------------------------------------------------------------
describe("POST /api/proxy/detect", () => {
  let handler: (ctx: { request: Request }) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/routes/api/proxy/detect");
    handler = (mod.Route.options as any).server.handlers.POST;
  });

  it("returns 403 for missing CSRF token", async () => {
    const req = new Request("http://localhost/api/proxy/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://api.openai.com/v1" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Missing CSRF token");
  });

  it("returns 403 for invalid CSRF token", async () => {
    const req = new Request("http://localhost/api/proxy/detect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "bad",
        Cookie: "csrf-token=other",
      },
      body: JSON.stringify({ url: "https://api.openai.com/v1" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Invalid CSRF token");
  });

  it("returns 400 for bad URL format", async () => {
    const req = new Request("http://localhost/api/proxy/detect", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ url: "not-a-url" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Bad url");
  });
});

// ---------------------------------------------------------------------------
// GET /api/proxy/models
// ---------------------------------------------------------------------------
describe("GET /api/proxy/models", () => {
  let handler: (ctx: { request: Request }) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/routes/api/proxy/models");
    handler = (mod.Route.options as any).server.handlers.GET;
  });

  it("allows requests with valid CSRF", async () => {
    const res = await handler({
      request: new Request("http://localhost/api/proxy/models", {
        method: "GET",
        headers: CSRF_HEADERS,
      }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 200 even without CSRF headers because GET is safe", async () => {
    const res = await handler({
      request: new Request("http://localhost/api/proxy/models", {
        method: "GET",
      }),
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/proxy/transcribe
// ---------------------------------------------------------------------------
describe("POST /api/proxy/transcribe", () => {
  let handler: (ctx: { request: Request }) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/routes/api/proxy/transcribe");
    handler = (mod.Route.options as any).server.handlers.POST;
  });

  it("returns 403 for missing CSRF token", async () => {
    const fd = new FormData();
    fd.append("providerId", "openai");
    fd.append("file", new Blob(["test"], { type: "audio/webm" }), "speech.webm");
    const req = new Request("http://localhost/api/proxy/transcribe", {
      method: "POST",
      body: fd,
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Missing CSRF token");
  });

  it("returns 403 for invalid CSRF token", async () => {
    const fd = new FormData();
    fd.append("providerId", "openai");
    fd.append("file", new Blob(["test"], { type: "audio/webm" }), "speech.webm");
    const req = new Request("http://localhost/api/proxy/transcribe", {
      method: "POST",
      headers: {
        "X-CSRF-Token": "bad",
        Cookie: "csrf-token=other",
      },
      body: fd,
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Invalid CSRF token");
  });

  it("returns 400 for unknown provider", async () => {
    const fd = new FormData();
    fd.append("providerId", "unknown");
    fd.append("file", new Blob(["test"], { type: "audio/webm" }), "speech.webm");
    const req = new Request("http://localhost/api/proxy/transcribe", {
      method: "POST",
      headers: CSRF_HEADERS_NO_CT,
      body: fd,
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/proxy/chat — tool serialization
// ---------------------------------------------------------------------------
describe("POST /api/proxy/chat — tool serialization", () => {
  let handler: (ctx: { request: Request }) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("@/routes/api/proxy/chat");
    handler = (mod.Route.options as any).server.handlers.POST;
    // Provide a fake API key so the handler reaches the upstream fetch call
    vi.mocked(getProviderCreds).mockResolvedValue({ apiKey: "sk-test-key" } as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serializes tools in OpenAI function format for openai provider", async () => {
    const capturedBodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBodies.push(init.body as string);
        return Promise.resolve(
          new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    const req = new Request("http://localhost/api/proxy/chat", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        providerId: "openai",
        messages: [{ role: "user", content: "What time is it?" }],
        tools: [{ name: "get_current_time", description: "Returns current time" }],
      }),
    });

    await handler({ request: req });

    expect(capturedBodies).toHaveLength(1);
    const sentBody = JSON.parse(capturedBodies[0]);
    expect(sentBody.tools).toBeDefined();
    expect(sentBody.tools).toHaveLength(1);
    // OpenAI format wraps in { type: "function", function: { ... } }
    expect(sentBody.tools[0].type).toBe("function");
    expect(sentBody.tools[0].function.name).toBe("get_current_time");
    expect(sentBody.tools[0].function.description).toBe("Returns current time");
  });

  it("serializes tools in Anthropic input_schema format for anthropic provider", async () => {
    const capturedBodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBodies.push(init.body as string);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              content: [{ type: "text", text: "ok" }],
              stop_reason: "end_turn",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }),
    );

    const req = new Request("http://localhost/api/proxy/chat", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        providerId: "anthropic",
        messages: [{ role: "user", content: "Use the calculator" }],
        tools: [
          {
            name: "calculator",
            description: "Evaluates arithmetic",
            parameters: {
              type: "object",
              properties: { expression: { type: "string" } },
              required: ["expression"],
            },
          },
        ],
      }),
    });

    await handler({ request: req });

    expect(capturedBodies).toHaveLength(1);
    const sentBody = JSON.parse(capturedBodies[0]);
    expect(sentBody.tools).toBeDefined();
    expect(sentBody.tools).toHaveLength(1);
    // Anthropic format: { name, description, input_schema } — NO "type: function" wrapper
    expect(sentBody.tools[0].name).toBe("calculator");
    expect(sentBody.tools[0].description).toBe("Evaluates arithmetic");
    expect(sentBody.tools[0].input_schema).toBeDefined();
    expect(sentBody.tools[0].input_schema.type).toBe("object");
    // Must NOT have the OpenAI "type: function" wrapper
    expect(sentBody.tools[0].type).toBeUndefined();
    expect(sentBody.tools[0].function).toBeUndefined();
  });

  it("omits tools key from upstream body when tools array is empty", async () => {
    const capturedBodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBodies.push(init.body as string);
        return Promise.resolve(
          new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    const req = new Request("http://localhost/api/proxy/chat", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        providerId: "openai",
        messages: [{ role: "user", content: "Hello" }],
        tools: [],
      }),
    });

    await handler({ request: req });

    expect(capturedBodies).toHaveLength(1);
    const sentBody = JSON.parse(capturedBodies[0]);
    // Empty tools array must not add a "tools" key to the upstream body
    expect(sentBody.tools).toBeUndefined();
  });

  it("omits tools key when no tools field is provided", async () => {
    const capturedBodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBodies.push(init.body as string);
        return Promise.resolve(
          new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    const req = new Request("http://localhost/api/proxy/chat", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        providerId: "openai",
        messages: [{ role: "user", content: "Hello" }],
      }),
    });

    await handler({ request: req });

    expect(capturedBodies).toHaveLength(1);
    const sentBody = JSON.parse(capturedBodies[0]);
    expect(sentBody.tools).toBeUndefined();
  });

  it("uses default parameters object when tool has no parameters", async () => {
    const capturedBodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBodies.push(init.body as string);
        return Promise.resolve(
          new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    const req = new Request("http://localhost/api/proxy/chat", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        providerId: "openai",
        messages: [{ role: "user", content: "Test" }],
        tools: [{ name: "get_current_time", description: "Get time" }],
      }),
    });

    await handler({ request: req });

    const sentBody = JSON.parse(capturedBodies[0]);
    // Parameters should default to { type: "object" } when omitted
    expect(sentBody.tools[0].function.parameters).toEqual({ type: "object" });
  });

  it("sets x-provider-body-style response header to the provider body style", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const req = new Request("http://localhost/api/proxy/chat", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        providerId: "openai",
        messages: [{ role: "user", content: "Test" }],
      }),
    });

    const res = await handler({ request: req });
    expect(res.headers.get("x-provider-body-style")).toBe("openai");
  });
});
