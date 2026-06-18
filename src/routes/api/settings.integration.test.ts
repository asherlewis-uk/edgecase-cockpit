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
            if (lowered.includes("insert into user_settings")) {
              tables.user_settings = tables.user_settings ?? [];
              const row = {
                user_id: bindings[0],
                profile_json: bindings[1],
                personalization_json: bindings[2],
                keyboard_shortcuts_json: bindings[3],
                rag_json: bindings[4],
                active_provider_id: bindings[5],
                pinned_provider_ids_json: bindings[6],
                cost_overrides_json: bindings[7],
                onboarding_completed: bindings[8],
                sync_threads_enabled: bindings[9],
                created_at: bindings[10],
                updated_at: bindings[11],
              };
              const idx = tables.user_settings.findIndex((r) => r.user_id === bindings[0]);
              if (idx >= 0) tables.user_settings[idx] = row;
              else tables.user_settings.push(row);
              return { meta: { changes: 1 } };
            }
            if (lowered.includes("update user_settings set")) {
              const idx = tables.user_settings.findIndex(
                (r) => r.user_id === bindings[bindings.length - 1],
              );
              if (idx >= 0) {
                // Simplified: just update profile_json and personalization_json if provided
                const updates: Record<string, unknown> = {};
                for (let i = 0; i < bindings.length - 1; i++) {
                  const field = (bindings[i] as string)?.toString();
                  if (field && field.startsWith("{")) {
                    if (!updates.profile_json && i === 0) updates.profile_json = field;
                    else if (!updates.personalization_json && i === 1)
                      updates.personalization_json = field;
                  }
                }
                tables.user_settings[idx] = { ...tables.user_settings[idx], ...updates };
              }
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 1 } };
          };

          const first = async <T = DbRow>() => {
            if (lowered.includes("from user_settings where user_id")) {
              const found = tables.user_settings?.find((r) => r.user_id === bindings[0]);
              return (found ? { ...found } : null) as T | null;
            }
            return null as T | null;
          };

          return { run, first, all: async <T = DbRow>() => ({ results: [] as T[] }) };
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

import { getDB } from "@/lib/platform.server";
import { clearRateLimitBuckets } from "@/lib/rate-limit.server";

const CSRF_TOKEN = "aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233";
const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-CSRF-Token": CSRF_TOKEN,
  Cookie: `csrf-token=${CSRF_TOKEN}`,
};

describe("settings integration — User A vs User B isolation", () => {
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

  it("User A can save and retrieve profile/settings; User B cannot see them", async () => {
    const db = createInMemoryDb();
    vi.mocked(getDB).mockReturnValue(db as any);

    const settings = await import("@/routes/api/settings");
    const getHandler = (settings.Route.options as any).server.handlers.GET;
    const postHandler = (settings.Route.options as any).server.handlers.POST;

    // User A saves settings
    mocks.setData({ id: "session-a", userId: "user-a" });
    const postRes = await postHandler({
      request: new Request("http://localhost/api/settings", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          profile: { displayName: "User A", roleLabel: "Builder" },
          personalization: { assistantName: "A Copilot" },
          costOverrides: { openai: { input: 0.001 } },
        }),
      }),
    });
    expect(postRes.status).toBe(200);

    // User A GET sees their settings
    const getResA = await getHandler();
    const bodyA = (await getResA.json()) as {
      profile: { displayName: string };
      personalization: { assistantName: string };
      costOverrides: Record<string, unknown>;
    };
    expect(bodyA.profile.displayName).toBe("User A");
    expect(bodyA.personalization.assistantName).toBe("A Copilot");
    expect(bodyA.costOverrides.openai).toEqual({ input: 0.001 });

    // User B GET sees defaults/empty, not User A's data
    mocks.setData({ id: "session-b", userId: "user-b" });
    const getResB = await getHandler();
    const bodyB = (await getResB.json()) as typeof bodyA;
    expect(bodyB.profile.displayName).not.toBe("User A");
    expect(bodyB.personalization.assistantName).not.toBe("A Copilot");
    expect(bodyB.costOverrides).toBeNull();
  });

  it("guests cannot access /api/settings", async () => {
    const db = createInMemoryDb();
    vi.mocked(getDB).mockReturnValue(db as any);

    const settings = await import("@/routes/api/settings");
    const getHandler = (settings.Route.options as any).server.handlers.GET;
    const postHandler = (settings.Route.options as any).server.handlers.POST;

    mocks.setData({ id: "guest-session" }); // no userId

    const getRes = await getHandler();
    expect(getRes.status).toBe(401);

    const postRes = await postHandler({
      request: new Request("http://localhost/api/settings", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ profile: { displayName: "Guest" } }),
      }),
    });
    expect(postRes.status).toBe(401);
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
