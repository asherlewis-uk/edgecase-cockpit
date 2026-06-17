import { describe, it, expect, beforeEach, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any for route handler stubs */

vi.mock("@/lib/session.server", () => ({
  getCockpitSession: vi.fn(),
  setAuthSession: vi.fn(),
  clearAuthSession: vi.fn(),
  getGuestSessionId: vi.fn().mockResolvedValue(undefined),
  clearGuestSessionId: vi.fn().mockResolvedValue(undefined),
  getAuthUserId: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/auth.server", () => ({
  hashPassword: vi.fn(),
  createUser: vi.fn(),
  getUserByEmail: vi.fn(),
  verifyPassword: vi.fn(),
  claimGuestSession: vi.fn().mockResolvedValue(undefined),
  stripPassword: vi.fn((u: Record<string, unknown>) => {
    const { password_hash, ...rest } = u;
    return rest;
  }),
  getUserById: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getThreads: vi.fn().mockResolvedValue([]),
  getThreadCount: vi.fn().mockResolvedValue(0),
  createThread: vi.fn().mockResolvedValue(undefined),
  getThread: vi.fn().mockResolvedValue(null),
  createUsageRecord: vi.fn().mockResolvedValue(undefined),
  upsertProviderStat: vi.fn().mockResolvedValue(undefined),
  resetProviderStats: vi.fn().mockResolvedValue(undefined),
  getProviderStats: vi.fn().mockResolvedValue({}),
  getAggregateUsage: vi.fn().mockResolvedValue({
    totalCalls: 0,
    totalErrors: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalEstimatedCost: 0,
    perProvider: {},
  }),
  getMessageCount: vi.fn().mockResolvedValue(0),
  getUsageForThread: vi.fn().mockResolvedValue({
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: 0,
    count: 0,
  }),
  getVectorDocs: vi.fn().mockResolvedValue([]),
  upsertVectorDoc: vi.fn().mockResolvedValue(undefined),
  clearVectorDocs: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn().mockResolvedValue(undefined),
  claimGuestSession: vi.fn().mockResolvedValue(undefined),
}));

import {
  getCockpitSession,
  setAuthSession,
  clearAuthSession,
  getGuestSessionId,
} from "@/lib/session.server";
import {
  createUser,
  getUserByEmail,
  verifyPassword,
  getUserById,
  hashPassword,
  claimGuestSession,
} from "@/lib/auth.server";
import { getThread, getThreads, getThreadCount, getProviderStats } from "@/lib/db";
import { clearRateLimitBuckets } from "@/lib/rate-limit.server";

const CSRF_TOKEN = "aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233";
const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-CSRF-Token": CSRF_TOKEN,
  Cookie: `csrf-token=${CSRF_TOKEN}`,
};

function mockSession(sessionData: Record<string, unknown>) {
  vi.mocked(getCockpitSession).mockResolvedValue({
    data: sessionData,
    update: vi.fn(),
  } as any);
}

beforeEach(() => {
  clearRateLimitBuckets();
  vi.clearAllMocks();
  vi.mocked(getGuestSessionId).mockResolvedValue(undefined);
  vi.mocked(claimGuestSession).mockResolvedValue(undefined);
  mockSession({ id: "test-session" });
});

// ── Register ───────────────────────────────────────────────────────────────

describe("POST /api/auth/register", () => {
  it("creates a user and returns public user data", async () => {
    const mockUser = {
      id: "user-1",
      email: "new@example.com",
      display_name: "New User",
      created_at: 123,
      updated_at: 123,
    };
    vi.mocked(hashPassword).mockResolvedValue("hashed-password");
    vi.mocked(createUser).mockResolvedValue({ user: mockUser });

    const mod = await import("@/routes/api/auth/register");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          email: "new@example.com",
          password: "password123",
          displayName: "New User",
        }),
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("new@example.com");
    expect(body.user.display_name).toBe("New User");
    expect(body.user.password_hash).toBeUndefined();
    expect(setAuthSession).toHaveBeenCalledWith("user-1", "new@example.com");
  });

  it("captures and claims guest data before register clears guest state", async () => {
    const mockUser = {
      id: "user-1",
      email: "new@example.com",
      display_name: "New User",
      created_at: 123,
      updated_at: 123,
    };
    vi.mocked(hashPassword).mockResolvedValue("hashed-password");
    vi.mocked(createUser).mockResolvedValue({ user: mockUser });
    vi.mocked(getGuestSessionId).mockResolvedValue("guest-session");

    const mod = await import("@/routes/api/auth/register");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          email: "new@example.com",
          password: "password123",
          displayName: "New User",
        }),
      }),
    });

    expect(res.status).toBe(200);
    expect(claimGuestSession).toHaveBeenCalledWith("guest-session", "user-1");
    expect(vi.mocked(getGuestSessionId).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(setAuthSession).mock.invocationCallOrder[0],
    );
  });

  it("rejects duplicate email with 409", async () => {
    vi.mocked(hashPassword).mockResolvedValue("hashed-password");
    vi.mocked(createUser).mockResolvedValue({ error: "Email already registered" } as any);

    const mod = await import("@/routes/api/auth/register");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          email: "dup@example.com",
          password: "password123",
        }),
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Email already registered");
  });

  it("rejects invalid email with 400", async () => {
    const mod = await import("@/routes/api/auth/register");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          email: "not-an-email",
          password: "password123",
        }),
      }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects short password with 400", async () => {
    const mod = await import("@/routes/api/auth/register");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          email: "test@example.com",
          password: "short",
        }),
      }),
    });

    expect(res.status).toBe(400);
  });
});

// ── Login ──────────────────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("authenticates with correct credentials and sets session", async () => {
    const fullUser = {
      id: "user-1",
      email: "login@example.com",
      password_hash: "hashed",
      display_name: "Login User",
      created_at: 123,
      updated_at: 123,
    };
    vi.mocked(getUserByEmail).mockResolvedValue(fullUser as any);
    vi.mocked(verifyPassword).mockResolvedValue(true);

    const mod = await import("@/routes/api/auth/login");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          email: "login@example.com",
          password: "correct-password",
        }),
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("login@example.com");
    expect(body.user.password_hash).toBeUndefined();
    expect(setAuthSession).toHaveBeenCalledWith("user-1", "login@example.com");
  });

  it("captures and claims guest data before login clears guest state", async () => {
    const fullUser = {
      id: "user-1",
      email: "login@example.com",
      password_hash: "hashed",
      display_name: "Login User",
      created_at: 123,
      updated_at: 123,
    };
    vi.mocked(getUserByEmail).mockResolvedValue(fullUser as any);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(getGuestSessionId).mockResolvedValue("guest-session");

    const mod = await import("@/routes/api/auth/login");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          email: "login@example.com",
          password: "correct-password",
        }),
      }),
    });

    expect(res.status).toBe(200);
    expect(claimGuestSession).toHaveBeenCalledWith("guest-session", "user-1");
    expect(vi.mocked(getGuestSessionId).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(setAuthSession).mock.invocationCallOrder[0],
    );
  });

  it("rejects wrong password with 401", async () => {
    const fullUser = {
      id: "user-1",
      email: "login@example.com",
      password_hash: "hashed",
      display_name: null,
      created_at: 123,
      updated_at: 123,
    };
    vi.mocked(getUserByEmail).mockResolvedValue(fullUser as any);
    vi.mocked(verifyPassword).mockResolvedValue(false);

    const mod = await import("@/routes/api/auth/login");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          email: "login@example.com",
          password: "wrong-password",
        }),
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid email or password");
  });

  it("rejects non-existent email with 401", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(null);

    const mod = await import("@/routes/api/auth/login");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          email: "missing@example.com",
          password: "password123",
        }),
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid email or password");
  });
});

// ── Logout ─────────────────────────────────────────────────────────────────

describe("POST /api/auth/logout", () => {
  it("clears auth session and returns ok", async () => {
    mockSession({ id: "test-session", userId: "user-1" });

    const mod = await import("@/routes/api/auth/logout");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: CSRF_HEADERS,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(clearAuthSession).toHaveBeenCalled();
  });
});

// ── Me ─────────────────────────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  it("returns authenticated user", async () => {
    const publicUser = {
      id: "user-1",
      email: "me@example.com",
      display_name: "Me User",
      created_at: 123,
      updated_at: 123,
    };
    mockSession({ id: "test-session", userId: "user-1" });
    vi.mocked(getUserById).mockResolvedValue(publicUser as any);

    const mod = await import("@/routes/api/auth/me");
    const handler = (mod.Route.options as any).server.handlers.GET;

    const res = await handler();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe("user-1");
    expect(body.user.password_hash).toBeUndefined();
  });

  it("returns 401 when not authenticated", async () => {
    mockSession({ id: "test-session" });

    const mod = await import("@/routes/api/auth/me");
    const handler = (mod.Route.options as any).server.handlers.GET;

    const res = await handler();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });
});

// ── User isolation (threads) ───────────────────────────────────────────────

describe("User isolation — threads", () => {
  it("user A cannot see user B's threads", async () => {
    const userAThread = {
      id: "thread-a",
      title: "User A Thread",
      messages: [],
      updatedAt: Date.now(),
      temporary: false,
      pinned: false,
      archived: false,
    };

    // User A requests their threads
    mockSession({ id: "session-a", userId: "user-a" });
    vi.mocked(getThreads).mockResolvedValue([userAThread]);

    const mod = await import("@/routes/api/threads");
    const handler = (mod.Route.options as any).server.handlers.GET;
    const resA = await handler();
    const bodyA = await resA.json();

    // Verify the DB was queried with user-a's userId
    expect(getThreads).toHaveBeenCalledWith("session-a", "user-a");
    expect(bodyA.threads).toHaveLength(1);
    expect(bodyA.threads[0].title).toBe("User A Thread");

    // Now simulate User B trying to access — the DB query will be different
    mockSession({ id: "session-b", userId: "user-b" });
    vi.mocked(getThreads).mockResolvedValue([]);

    const resB = await handler();
    const bodyB = await resB.json();

    expect(getThreads).toHaveBeenCalledWith("session-b", "user-b");
    expect(bodyB.threads).toHaveLength(0);
  });

  it("user A cannot access user B's individual thread", async () => {
    mockSession({ id: "session-b", userId: "user-b" });
    vi.mocked(getThread).mockResolvedValue(null); // user-b has no thread with this id

    const mod = await import("@/routes/api/threads.$id");
    const handler = (mod.Route.options as any).server.handlers.GET;

    const res = await handler({ params: { id: "thread-a" } });
    expect(res.status).toBe(404);

    // Verify the DB was queried with user-b's context
    expect(getThread).toHaveBeenCalledWith("session-b", "thread-a", "user-b");
  });
});

// ── Backward compatibility (anonymous session) ─────────────────────────────

describe("Backward compatibility — anonymous sessions", () => {
  it("thread endpoints still work without userId", async () => {
    mockSession({ id: "anon-session" });
    vi.mocked(getThreads).mockResolvedValue([]);
    vi.mocked(getThreadCount).mockResolvedValue(0);

    const mod = await import("@/routes/api/threads");
    const handler = (mod.Route.options as any).server.handlers.GET;

    const res = await handler();
    expect(res.status).toBe(200);
    expect(getThreads).toHaveBeenCalledWith("anon-session", undefined);
  });

  it("stats endpoint still works without userId", async () => {
    mockSession({ id: "anon-session" });
    vi.mocked(getProviderStats).mockResolvedValue({});

    const mod = await import("@/routes/api/stats");
    const handler = (mod.Route.options as any).server.handlers.GET;

    const res = await handler();
    expect(res.status).toBe(200);
    expect(getProviderStats).toHaveBeenCalledWith("anon-session", undefined);
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
