import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any -- D1 test double and session internals */

type DbRow = Record<string, unknown>;

function createInMemoryDb(initial: Record<string, DbRow[]> = {}) {
  const tables: Record<string, DbRow[]> = {};
  for (const [name, rows] of Object.entries(initial)) {
    tables[name] = rows.map((r) => ({ ...r }));
  }

  const calls: { sql: string; bindings: unknown[] }[] = [];

  return {
    tables,
    calls,
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          calls.push({ sql, bindings });
          const lowered = sql.toLowerCase();

          const run = async () => {
            if (lowered.includes("insert into users")) {
              const email = bindings[1] as string;
              if (tables.users?.some((u) => u.email === email)) {
                throw new Error("UNIQUE constraint failed: users.email");
              }
              tables.users = tables.users ?? [];
              tables.users.push({
                id: bindings[0],
                email: bindings[1],
                password_hash: bindings[2],
                display_name: bindings[3],
                created_at: bindings[4],
                updated_at: bindings[5],
              });
              return { meta: { changes: 1 } };
            }
            if (lowered.includes("insert or ignore into sessions")) {
              tables.sessions = tables.sessions ?? [];
              if (!tables.sessions.some((s) => s.id === bindings[0])) {
                tables.sessions.push({
                  id: bindings[0],
                  data: bindings[1],
                  created_at: bindings[2],
                  updated_at: bindings[3],
                });
              }
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 1 } };
          };

          const first = async <T = DbRow>() => {
            if (lowered.includes("from users where email")) {
              const found = tables.users?.find((u) => u.email === bindings[0]);
              return (found ? { ...found } : null) as T | null;
            }
            if (lowered.includes("from users where id")) {
              const found = tables.users?.find((u) => u.id === bindings[0]);
              return (found ? { ...found } : null) as T | null;
            }
            return null as T | null;
          };

          const all = async <T = DbRow>() => ({ results: [] as T[] });

          return { run, first, all };
        },
      };
    },
  };
}

type SessionState = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  let data: SessionState = {};
  return {
    getData: () => data,
    setData: (next: SessionState) => {
      data = next;
    },
    useSession: vi.fn(async (_config: unknown) => {
      return {
        data,
        update: async (next: SessionState) => {
          data = next;
        },
      };
    }),
  };
});

vi.mock("@tanstack/react-start/server", () => ({
  useSession: mocks.useSession,
  sealSession: vi.fn(async () => "sealed"),
  setCookie: vi.fn(),
}));

vi.mock("@/lib/platform.server", () => ({
  getDB: vi.fn(),
  setPlatformEnv: vi.fn(),
}));

import { getDB } from "@/lib/platform.server";
import { clearRateLimitBuckets } from "@/lib/rate-limit.server";

const CSRF_TOKEN = "aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233";
const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-CSRF-Token": CSRF_TOKEN,
  Cookie: `csrf-token=${CSRF_TOKEN}`,
};

describe("auth integration — register / login / logout / me", () => {
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    clearRateLimitBuckets();
    mocks.setData({});
    mocks.useSession.mockClear();
    process.env.SESSION_SECRET = "test-session-secret-32-characters";
    process.env.ENCRYPTION_KEY = "test-encryption-secret-32-characters";
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
    if (originalEncryptionKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = originalEncryptionKey;
    }
  });

  it("registers a user, persists hashed password, and logs them in", async () => {
    const db = createInMemoryDb();
    vi.mocked(getDB).mockReturnValue(db as any);

    const register = await import("@/routes/api/auth/register");
    const handler = (register.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          email: "alice@example.com",
          password: "password12345",
          displayName: "Alice",
        }),
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: DbRow };
    expect(body.user.email).toBe("alice@example.com");
    expect(body.user.display_name).toBe("Alice");
    expect(body.user.password_hash).toBeUndefined();

    const session = mocks.getData();
    expect(typeof session.userId).toBe("string");
    expect(session.userEmail).toBe("alice@example.com");

    expect(db.tables.users).toHaveLength(1);
    const stored = db.tables.users[0];
    expect(stored.email).toBe("alice@example.com");
    expect(typeof stored.password_hash).toBe("string");
    expect(stored.password_hash).not.toBe("password12345");
    expect(stored.display_name).toBe("Alice");
  });

  it("logs in an existing user with correct password and rejects wrong password", async () => {
    const { hashPassword } = await import("@/lib/auth.server");
    const hash = await hashPassword("correct-password");
    const db = createInMemoryDb({
      users: [
        {
          id: "existing-user",
          email: "bob@example.com",
          password_hash: hash,
          display_name: "Bob",
          created_at: 1_700_000_000_000,
          updated_at: 1_700_000_000_000,
        },
      ],
    });
    vi.mocked(getDB).mockReturnValue(db as any);

    const login = await import("@/routes/api/auth/login");
    const handler = (login.Route.options as any).server.handlers.POST;

    const success = await handler({
      request: new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ email: "bob@example.com", password: "correct-password" }),
      }),
    });

    expect(success.status).toBe(200);
    const body = (await success.json()) as { user: DbRow };
    expect(body.user.email).toBe("bob@example.com");
    expect(mocks.getData().userId).toBe("existing-user");

    mocks.setData({});

    const failure = await handler({
      request: new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ email: "bob@example.com", password: "wrong-password" }),
      }),
    });

    expect(failure.status).toBe(401);
    expect(mocks.getData().userId).toBeUndefined();
  });

  it("logout clears the authenticated user from the session", async () => {
    mocks.setData({ id: "session-1", userId: "user-1", userEmail: "alice@example.com" });
    const db = createInMemoryDb();
    vi.mocked(getDB).mockReturnValue(db as any);

    const logout = await import("@/routes/api/auth/logout");
    const handler = (logout.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: CSRF_HEADERS,
      }),
    });

    expect(res.status).toBe(200);
    const session = mocks.getData();
    expect(session.userId).toBeUndefined();
    expect(session.userEmail).toBeUndefined();
    expect(session.id).toBe("session-1"); // session id survives for continuity
  });

  it("/api/auth/me reflects login state", async () => {
    const { hashPassword } = await import("@/lib/auth.server");
    const hash = await hashPassword("password12345");
    const db = createInMemoryDb({
      users: [
        {
          id: "me-user",
          email: "me@example.com",
          password_hash: hash,
          display_name: "Me",
          created_at: 1_700_000_000_000,
          updated_at: 1_700_000_000_000,
        },
      ],
    });
    vi.mocked(getDB).mockReturnValue(db as any);

    const login = await import("@/routes/api/auth/login");
    const loginHandler = (login.Route.options as any).server.handlers.POST;
    await loginHandler({
      request: new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ email: "me@example.com", password: "password12345" }),
      }),
    });

    const me = await import("@/routes/api/auth/me");
    const meHandler = (me.Route.options as any).server.handlers.GET;
    const res = await meHandler();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: DbRow };
    expect(body.user.email).toBe("me@example.com");
    expect(body.user.password_hash).toBeUndefined();

    const logout = await import("@/routes/api/auth/logout");
    const logoutHandler = (logout.Route.options as any).server.handlers.POST;
    await logoutHandler({
      request: new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: CSRF_HEADERS,
      }),
    });

    const res2 = await meHandler();
    expect(res2.status).toBe(401);
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
