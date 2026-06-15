import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any for route handler stubs */

// We need to test the route handlers directly. The route handlers are defined
// as TanStack Start route objects. We'll test the handler functions by
// importing and calling them directly with mocked dependencies.

// Mock the session module before importing the routes
vi.mock("@/lib/session.server", () => ({
  getCockpitSession: vi.fn(),
  setProviderCreds: vi.fn(),
  getProviderCreds: vi.fn(),
  clearProviderCreds: vi.fn(),
}));

vi.mock("@/lib/validate-key.server", () => ({
  validateProviderKey: vi.fn(),
}));

// Mock PROVIDERS to control what providers exist
vi.mock("@/lib/providers", async () => {
  const actual = await vi.importActual("@/lib/providers");
  return {
    ...actual,
    getProvider: actual.getProvider,
    PROVIDERS: (actual as any).PROVIDERS,
  };
});

import {
  getCockpitSession,
  setProviderCreds,
  clearProviderCreds,
  getProviderCreds,
} from "@/lib/session.server";
import { validateProviderKey } from "@/lib/validate-key.server";
import { clearRateLimitBuckets } from "@/lib/rate-limit.server";

beforeEach(() => {
  clearRateLimitBuckets();
});

// CSRF token for test requests (must be 64 hex chars to match validation)
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

// ---------------------------------------------------------------------------
// Route handler: POST /api/keys/set
// ---------------------------------------------------------------------------
describe("POST /api/keys/set", () => {
  let handler: (ctx: { request: Request }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getCockpitSession).mockResolvedValue({
      data: { id: "test-session" },
      update: vi.fn(),
    } as any);
    // Dynamically import to get the handler after mocks are set up
    const mod = await import("@/routes/api/keys/set");
    // Extract the POST handler from the TanStack Start route definition
    handler = (mod.Route.options as any).server.handlers.POST;
  });

  it("returns 403 for missing CSRF token", async () => {
    const req = new Request("http://localhost/api/keys/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "openai", apiKey: "sk-test" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Missing CSRF token");
  });

  it("returns 403 for invalid CSRF token", async () => {
    const req = new Request("http://localhost/api/keys/set", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "bad-token",
        Cookie: "csrf-token=other-token",
      },
      body: JSON.stringify({ providerId: "openai", apiKey: "sk-test" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Invalid CSRF token");
  });

  it("returns 400 for missing request body", async () => {
    const req = new Request("http://localhost/api/keys/set", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: "invalid json",
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Bad JSON");
  });

  it("returns 400 for missing providerId", async () => {
    const req = new Request("http://localhost/api/keys/set", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ apiKey: "sk-test" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid input");
  });

  it("returns 400 for invalid providerId format", async () => {
    const req = new Request("http://localhost/api/keys/set", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ providerId: "INVALID WITH SPACES", apiKey: "sk-test" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown provider", async () => {
    const req = new Request("http://localhost/api/keys/set", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ providerId: "nonexistent-provider", apiKey: "sk-test" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Unknown provider");
  });

  it("returns 200 and stores key for valid provider", async () => {
    const req = new Request("http://localhost/api/keys/set", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ providerId: "openai", apiKey: "sk-test-key-123" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(setProviderCreds).toHaveBeenCalledWith("openai", {
      apiKey: "sk-test-key-123",
      baseUrl: undefined,
      model: undefined,
    });
  });

  it("accepts optional baseUrl and model", async () => {
    const req = new Request("http://localhost/api/keys/set", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        providerId: "openai",
        apiKey: "sk-test",
        baseUrl: "https://custom.example.com/v1",
        model: "gpt-4o",
      }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(200);
    expect(setProviderCreds).toHaveBeenCalledWith("openai", {
      apiKey: "sk-test",
      baseUrl: "https://custom.example.com/v1",
      model: "gpt-4o",
    });
  });

  it("rejects empty apiKey", async () => {
    const req = new Request("http://localhost/api/keys/set", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ providerId: "openai", apiKey: "" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
  });

  it("rejects apiKey longer than 8192 chars", async () => {
    const req = new Request("http://localhost/api/keys/set", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        providerId: "openai",
        apiKey: "x".repeat(8193),
      }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Route handler: POST /api/keys/clear
// ---------------------------------------------------------------------------
describe("POST /api/keys/clear", () => {
  let handler: (ctx: { request: Request }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getCockpitSession).mockResolvedValue({
      data: { id: "test-session" },
      update: vi.fn(),
    } as any);
    const mod = await import("@/routes/api/keys/clear");
    handler = (mod.Route.options as any).server.handlers.POST;
  });

  it("returns 403 for missing CSRF token", async () => {
    const req = new Request("http://localhost/api/keys/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "openai" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Missing CSRF token");
  });

  it("returns 403 for invalid CSRF token", async () => {
    const req = new Request("http://localhost/api/keys/clear", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "bad",
        Cookie: "csrf-token=other",
      },
      body: JSON.stringify({ providerId: "openai" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Invalid CSRF token");
  });

  it("clears all keys when no providerId given", async () => {
    const req = new Request("http://localhost/api/keys/clear", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({}),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(clearProviderCreds).toHaveBeenCalledWith(undefined);
  });

  it("clears a specific provider key", async () => {
    const req = new Request("http://localhost/api/keys/clear", {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify({ providerId: "openai" }),
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(clearProviderCreds).toHaveBeenCalledWith("openai");
  });
});

// ---------------------------------------------------------------------------
// Route handler: POST /api/keys/validate
// ---------------------------------------------------------------------------
describe("POST /api/keys/validate", () => {
  let handler: (ctx: { request: Request }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getCockpitSession).mockResolvedValue({
      data: { id: "test-session", providers: {} },
      update: vi.fn(),
    } as any);
    const mod = await import("@/routes/api/keys/validate");
    handler = (mod.Route.options as any).server.handlers.POST;
  });

  it("returns 403 for missing CSRF token", async () => {
    const req = new Request("http://localhost/api/keys/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Missing CSRF token");
  });

  it("returns empty results when no providers stored", async () => {
    const req = new Request("http://localhost/api/keys/validate", {
      method: "POST",
      headers: CSRF_HEADERS,
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual({});
  });

  it("returns validation results for stored providers", async () => {
    vi.mocked(getCockpitSession).mockResolvedValue({
      data: {
        id: "test-session",
        providers: {
          openai: { apiKey: "sk-test" },
          anthropic: { apiKey: "sk-invalid" },
        },
      },
      update: vi.fn(),
    } as any);
    vi.mocked(validateProviderKey).mockImplementation(async (provider) => {
      if (provider.id === "openai") return { valid: true };
      return { valid: false, error: "auth_failed" };
    });

    const req = new Request("http://localhost/api/keys/validate", {
      method: "POST",
      headers: CSRF_HEADERS,
    });
    const res = await handler({ request: req });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.openai).toEqual({ valid: true });
    expect(body.results.anthropic).toEqual({
      valid: false,
      reason: "auth_failed",
      userMessage: "Invalid API key",
      errorType: "auth_failed",
    });
  });
});

// ---------------------------------------------------------------------------
// Route handler: POST /api/keys/validate/$providerId
// ---------------------------------------------------------------------------
describe("POST /api/keys/validate/$providerId", () => {
  let handler: (ctx: { params: { providerId: string }; request: Request }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getCockpitSession).mockResolvedValue({
      data: { id: "test-session" },
      update: vi.fn(),
    } as any);
    vi.mocked(getProviderCreds).mockResolvedValue({ apiKey: "sk-test" } as any);
    const mod = await import("@/routes/api/keys/validate.$providerId");
    handler = (mod.Route.options as any).server.handlers.POST;
  });

  it("returns 403 for missing CSRF token", async () => {
    const req = new Request("http://localhost/api/keys/validate/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const res = await handler({ params: { providerId: "openai" }, request: req });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Missing CSRF token");
  });

  it("returns 400 for unknown provider", async () => {
    const req = new Request("http://localhost/api/keys/validate/unknown", {
      method: "POST",
      headers: CSRF_HEADERS,
    });
    const res = await handler({ params: { providerId: "unknown" }, request: req });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("unknown_provider");
  });

  it("returns valid:false for missing key", async () => {
    vi.mocked(getProviderCreds).mockResolvedValue(null as any);
    const req = new Request("http://localhost/api/keys/validate/openai", {
      method: "POST",
      headers: CSRF_HEADERS,
    });
    const res = await handler({ params: { providerId: "openai" }, request: req });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("no_key");
  });

  it("returns valid:true for a working key", async () => {
    vi.mocked(getProviderCreds).mockResolvedValue({ apiKey: "sk-test" } as any);
    vi.mocked(validateProviderKey).mockResolvedValue({ valid: true });
    const req = new Request("http://localhost/api/keys/validate/openai", {
      method: "POST",
      headers: CSRF_HEADERS,
    });
    const res = await handler({ params: { providerId: "openai" }, request: req });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.provider).toBe("openai");
  });
});

// ---------------------------------------------------------------------------
// Route handler: GET /api/keys/status
// ---------------------------------------------------------------------------
describe("GET /api/keys/status", () => {
  let handler: () => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/routes/api/keys/status");
    handler = (mod.Route.options as any).server.handlers.GET;
  });

  it("returns provider status map", async () => {
    const mockSession = {
      data: {
        id: "session-1",
        providers: {
          openai: { apiKey: "sk-set", baseUrl: undefined, model: "gpt-4o" },
          anthropic: { apiKey: "", baseUrl: undefined, model: undefined },
        },
      },
      update: vi.fn(),
    };
    vi.mocked(getCockpitSession).mockResolvedValue(mockSession as any);

    const res = await handler();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers.openai).toEqual({
      hasKey: true,
      baseUrl: undefined,
      model: "gpt-4o",
    });
    expect(body.providers.anthropic).toEqual({
      hasKey: false,
      baseUrl: undefined,
      model: undefined,
    });
  });

  it("returns empty map when no providers exist", async () => {
    const mockSession = {
      data: { id: "session-1" },
      update: vi.fn(),
    };
    vi.mocked(getCockpitSession).mockResolvedValue(mockSession as any);

    const res = await handler();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers).toEqual({});
  });
});
