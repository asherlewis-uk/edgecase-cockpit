import { describe, it, expect, beforeEach, vi } from "vitest";

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
