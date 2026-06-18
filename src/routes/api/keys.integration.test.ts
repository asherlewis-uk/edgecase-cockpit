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
            if (lowered.includes("insert or replace into user_provider_keys")) {
              const row = {
                user_id: bindings[0],
                provider_id: bindings[1],
                api_key_encrypted: bindings[2],
                base_url: bindings[3],
                model: bindings[4],
                created_at: bindings[5],
                updated_at: bindings[6],
              };
              tables.user_provider_keys = tables.user_provider_keys ?? [];
              const idx = tables.user_provider_keys.findIndex(
                (r) => r.user_id === bindings[0] && r.provider_id === bindings[1],
              );
              if (idx >= 0) tables.user_provider_keys[idx] = row;
              else tables.user_provider_keys.push(row);
              return { meta: { changes: 1 } };
            }
            if (lowered.includes("delete from user_provider_keys")) {
              const userId = bindings[0] as string;
              const providerId = bindings[1] as string | undefined;
              const before = tables.user_provider_keys?.length ?? 0;
              tables.user_provider_keys = tables.user_provider_keys?.filter((r) => {
                if (r.user_id !== userId) return true;
                if (providerId === undefined) return false;
                return r.provider_id !== providerId;
              });
              const after = tables.user_provider_keys?.length ?? 0;
              return { meta: { changes: before - after } };
            }
            return { meta: { changes: 1 } };
          };

          const first = async <T = DbRow>() => {
            if (lowered.includes("from user_provider_keys where user_id")) {
              const found = tables.user_provider_keys?.find(
                (r) => r.user_id === bindings[0] && r.provider_id === bindings[1],
              );
              return (found ? { ...found } : null) as T | null;
            }
            return null as T | null;
          };

          const all = async <T = DbRow>() => {
            if (lowered.includes("from user_provider_keys where user_id")) {
              const rows =
                tables.user_provider_keys?.filter((r) => r.user_id === bindings[0]) ?? [];
              return { results: rows.map((r) => ({ ...r })) as T[] };
            }
            return { results: [] as T[] };
          };

          return { run, first, all };
        },
      };
    },
  };
}

const mocks = vi.hoisted(() => {
  let data: Record<string, unknown> = {};
  return {
    getData: () => data,
    setData: (next: Record<string, unknown>) => {
      data = next;
    },
    useSession: vi.fn(async (_config: unknown) => {
      return {
        data,
        update: async (next: Record<string, unknown>) => {
          data = next;
        },
      };
    }),
  };
});

vi.mock("@tanstack/react-start/server", () => ({
  useSession: mocks.useSession,
}));

vi.mock("@/lib/platform.server", () => ({
  getDB: vi.fn(),
  setPlatformEnv: vi.fn(),
}));

vi.mock("@/lib/encryption.server", () => ({
  encrypt: vi.fn(async (text: string) => `enc:${text}`),
  decrypt: vi.fn(async (text: string) => text.replace(/^enc:/, "")),
}));

import { getDB } from "@/lib/platform.server";
import { clearRateLimitBuckets } from "@/lib/rate-limit.server";

const CSRF_TOKEN = "aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233";
const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-CSRF-Token": CSRF_TOKEN,
  Cookie: `csrf-token=${CSRF_TOKEN}`,
};

describe("provider keys integration — User A vs User B isolation", () => {
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    clearRateLimitBuckets();
    mocks.setData({ id: "test-session" });
    mocks.useSession.mockClear();
    process.env.SESSION_SECRET = "test-session-secret-32-characters";
    process.env.ENCRYPTION_KEY = "test-encryption-secret-32-characters";
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSessionSecret;
    if (originalEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalEncryptionKey;
  });

  it("User B cannot see User A's provider key via /api/keys/status", async () => {
    const db = createInMemoryDb({
      user_provider_keys: [
        {
          user_id: "user-a",
          provider_id: "openai",
          api_key_encrypted: "enc:sk-a",
          base_url: "https://api.openai.com/v1",
          model: "gpt-4o",
          created_at: 1,
          updated_at: 1,
        },
      ],
    });
    vi.mocked(getDB).mockReturnValue(db as any);

    const status = await import("@/routes/api/keys/status");
    const statusHandler = (status.Route.options as any).server.handlers.GET;

    // User A request
    mocks.setData({ id: "session-a", userId: "user-a" });
    const resA = await statusHandler();
    const bodyA = (await resA.json()) as {
      providers: Record<string, { hasKey: boolean; baseUrl?: string; model?: string }>;
    };
    expect(bodyA.providers.openai.hasKey).toBe(true);
    expect(bodyA.providers.openai.baseUrl).toBe("https://api.openai.com/v1");
    expect(bodyA.providers.openai.model).toBe("gpt-4o");

    // User B request
    mocks.setData({ id: "session-b", userId: "user-b" });
    const resB = await statusHandler();
    const bodyB = (await resB.json()) as typeof bodyA;
    expect(bodyB.providers.openai).toBeUndefined();
  });

  it("User B cannot validate User A's stored key", async () => {
    const db = createInMemoryDb({
      user_provider_keys: [
        {
          user_id: "user-a",
          provider_id: "openai",
          api_key_encrypted: "enc:sk-a",
          base_url: null,
          model: null,
          created_at: 1,
          updated_at: 1,
        },
      ],
    });
    vi.mocked(getDB).mockReturnValue(db as any);

    const validate = await import("@/routes/api/keys/validate");
    const validateHandler = (validate.Route.options as any).server.handlers.POST;

    mocks.setData({ id: "session-b", userId: "user-b" });
    const res = await validateHandler({
      request: new Request("http://localhost/api/keys/validate", {
        method: "POST",
        headers: CSRF_HEADERS,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: Record<string, { valid: boolean; reason?: string }>;
    };
    expect(body.results.openai).toBeUndefined();
  });

  it("User B cannot overwrite or clear User A's key", async () => {
    const db = createInMemoryDb({
      user_provider_keys: [
        {
          user_id: "user-a",
          provider_id: "openai",
          api_key_encrypted: "enc:sk-a",
          base_url: null,
          model: null,
          created_at: 1,
          updated_at: 1,
        },
      ],
    });
    vi.mocked(getDB).mockReturnValue(db as any);

    const setRoute = await import("@/routes/api/keys/set");
    const setHandler = (setRoute.Route.options as any).server.handlers.POST;

    // User B saves their own key for openai
    mocks.setData({ id: "session-b", userId: "user-b" });
    const res = await setHandler({
      request: new Request("http://localhost/api/keys/set", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          providerId: "openai",
          apiKey: "sk-b",
          baseUrl: "https://b.example.com",
          model: "gpt-3.5",
        }),
      }),
    });
    expect(res.status).toBe(200);

    // User A's key remains intact
    const userAKey = db.tables.user_provider_keys?.find(
      (r) => r.user_id === "user-a" && r.provider_id === "openai",
    );
    expect(userAKey?.api_key_encrypted).toBe("enc:sk-a");

    // User B clear for openai only removes B's row
    const clearRoute = await import("@/routes/api/keys/clear");
    const clearHandler = (clearRoute.Route.options as any).server.handlers.POST;

    const clearRes = await clearHandler({
      request: new Request("http://localhost/api/keys/clear", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ providerId: "openai" }),
      }),
    });
    expect(clearRes.status).toBe(200);
    expect(db.tables.user_provider_keys?.some((r) => r.user_id === "user-a")).toBe(true);
    expect(db.tables.user_provider_keys?.some((r) => r.user_id === "user-b")).toBe(false);
  });

  it("guests are rejected from /api/keys/set", async () => {
    const db = createInMemoryDb();
    vi.mocked(getDB).mockReturnValue(db as any);

    const setRoute = await import("@/routes/api/keys/set");
    const setHandler = (setRoute.Route.options as any).server.handlers.POST;

    mocks.setData({ id: "guest-session" }); // no userId
    const res = await setHandler({
      request: new Request("http://localhost/api/keys/set", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ providerId: "openai", apiKey: "sk-guest" }),
      }),
    });
    expect(res.status).toBe(401);
    expect(db.tables.user_provider_keys ?? []).toHaveLength(0);
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
