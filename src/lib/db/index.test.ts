import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/platform.server", () => ({
  getDB: vi.fn(),
}));

import { getDB } from "@/lib/platform.server";
import { createThread, setThreadPinned, upsertProviderStat, claimGuestSession } from "@/lib/db";

/* eslint-disable @typescript-eslint/no-explicit-any -- D1 test double keeps the SQL surface compact */

type SqlCall = { sql: string; bindings: unknown[] };

function mockDb(options?: { runResults?: unknown[]; allResults?: Array<{ results: unknown[] }> }) {
  const calls: SqlCall[] = [];
  const runResults = [...(options?.runResults ?? [])];
  const allResults = [...(options?.allResults ?? [])];
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: (...bindings: unknown[]) => {
        calls.push({ sql, bindings });
        return {
          run: vi.fn().mockResolvedValue(runResults.shift() ?? { meta: { changes: 0 } }),
          all: vi.fn().mockResolvedValue(allResults.shift() ?? { results: [] }),
          first: vi.fn().mockResolvedValue(null),
        };
      },
    })),
  };
  vi.mocked(getDB).mockReturnValue(db as any);
  return { calls };
}

describe("db ownership helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes guest updates by session_id and null user_id without rebinding ?1", async () => {
    const { calls } = mockDb({ runResults: [{ meta: { changes: 1 } }] });

    await setThreadPinned("session-a", "thread-1", true);

    expect(calls[0].sql).toContain("WHERE session_id = ? AND user_id IS NULL AND id = ?");
    expect(calls[0].bindings).toEqual([1, "session-a", "thread-1"]);
  });

  it("stores authenticated threads without the browser session id", async () => {
    const { calls } = mockDb();

    await createThread(
      "session-a",
      {
        id: "thread-1",
        title: "Thread",
        messages: [],
        updatedAt: 123,
        temporary: false,
        pinned: false,
        archived: false,
      },
      "user-a",
    );

    expect(calls[0].bindings.slice(0, 3)).toEqual(["thread-1", null, "user-a"]);
  });

  it("upserts authenticated provider stats against user/provider ownership", async () => {
    const { calls } = mockDb({ runResults: [{ meta: { changes: 0 } }] });

    await upsertProviderStat("session-a", "openai", "call", 100, 50, "user-a");

    expect(calls[0].sql).toContain("WHERE user_id = ? AND provider_id = ?");
    expect(calls[0].bindings).toEqual([100, 50, "user-a", "openai"]);
    expect(calls[1].bindings).toEqual([null, "user-a", "openai", 1, 0, 100, 50]);
  });

  it("upserts guest provider stats against session/provider ownership", async () => {
    const { calls } = mockDb({ runResults: [{ meta: { changes: 0 } }] });

    await upsertProviderStat("session-a", "openai", "error");

    expect(calls[0].sql).toContain("WHERE session_id = ? AND user_id IS NULL AND provider_id = ?");
    expect(calls[0].bindings).toEqual(["session-a", "openai"]);
    expect(calls[1].bindings).toEqual(["session-a", null, "openai", 0, 1, 0, 0]);
  });

  it("merges guest provider stats into an existing user stat row before deleting guests", async () => {
    const { calls } = mockDb({
      allResults: [
        {
          results: [
            {
              provider_id: "openai",
              calls: 2,
              errors: 1,
              input_tokens: 100,
              output_tokens: 50,
            },
          ],
        },
      ],
      runResults: [{ meta: { changes: 1 } }],
    });

    await claimGuestSession("session-a", "user-a");

    expect(calls[0].sql).toContain("FROM provider_stats WHERE session_id = ?1");
    expect(calls[1].sql).toContain("UPDATE provider_stats SET calls = calls + ?1");
    expect(calls[1].bindings).toEqual([2, 1, 100, 50, "user-a", "openai"]);
    expect(calls.some((call) => call.sql.includes("DELETE FROM provider_stats"))).toBe(true);
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
