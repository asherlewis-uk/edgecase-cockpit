import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  store,
  __resetHydration,
  hydrateAsync,
  fetchMe,
  enterServerMode,
  enterLocalMode,
  ensureLocalProfileId,
  migrateGuestBucketToLocalProfile,
  copyLocalToServer,
  moveLocalToServer,
  readAccountMode,
  writeAccountMode,
  readLocalProfileId,
  writeLocalProfileId,
  clearOfflineQueue,
  getLocalProfileSettingsKey,
  getLocalProfileThreadsKey,
  getLocalProfileStatsKey,
  ACCOUNT_MODE_KEY,
  LOCAL_PROFILE_ID_KEY,
  type UserPublic,
} from "./cockpit-store";
import {
  getAllVectorDocsForUser,
  saveVectorStoreForUser,
  addVectorDocsForUser,
} from "./vector-store";

// Mock localStorage
const localStorageMock = (() => {
  let ls: Record<string, string> = {};
  return {
    getItem: (key: string) => ls[key] ?? null,
    setItem: (key: string, value: string) => {
      ls[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete ls[key];
    },
    clear: () => {
      ls = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

const mockFetch = vi.fn();

vi.mock("@/lib/api-base", () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}));

vi.mock("@/lib/tokens", () => ({ setCostOverrides: vi.fn() }));

const mockUserA: UserPublic = {
  id: "user-a",
  email: "user-a@example.com",
  display_name: "User A",
  created_at: 123,
  updated_at: 123,
};

function setLocalJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getLocalJson(key: string): unknown {
  const raw = window.localStorage.getItem(key);
  return raw ? JSON.parse(raw) : undefined;
}

beforeEach(() => {
  __resetHydration();
  window.localStorage.clear();
  // Default fetch: unauthenticated me + empty server settings/key status.
  mockFetch.mockImplementation(async (path: string) => {
    if (path === "/api/auth/me") return { ok: false, status: 401, json: async () => ({}) };
    if (path === "/api/settings") return { ok: true, json: async () => ({}) };
    if (path === "/api/keys/status") return { ok: true, json: async () => ({ providers: {} }) };
    return { ok: true, json: async () => ({}) };
  });
  vi.clearAllMocks();
});

describe("hydrateAsync — undetermined", () => {
  it("does not load the legacy guest bucket and leaves state neutral", async () => {
    // Seed legacy guest data that must NOT leak into the undetermined state.
    setLocalJson("cockpit.settings.v2:guest", { profile: { displayName: "Ghost Guest" } });
    setLocalJson("cockpit.threads.v1:guest", [
      { id: "g1", title: "guest chat", messages: [], updatedAt: 1 },
    ]);

    await hydrateAsync();

    expect(store.getState().accountMode).toBe("undetermined");
    expect(store.getState().user).toBeNull();
    expect(store.getState().threads).toHaveLength(0);
    expect(store.getState().settings.profile.displayName).not.toBe("Ghost Guest");
    // No /api/auth/me call in undetermined mode.
    expect(mockFetch).not.toHaveBeenCalledWith("/api/auth/me");
  });
});

describe("hydrateAsync — local-only", () => {
  it("generates and persists a localProfileId when missing", async () => {
    writeAccountMode("local-only");
    expect(readLocalProfileId()).toBeNull();

    await hydrateAsync();

    const id = store.getState().localProfileId;
    expect(id).toBeTruthy();
    expect(readLocalProfileId()).toBe(id);
    expect(store.getState().accountMode).toBe("local-only");
    expect(store.getState().user).toBeNull();
  });

  it("migrates the legacy guest bucket into the localProfileId bucket on first run", async () => {
    const lpId = "lp-migrate";
    writeAccountMode("local-only");
    writeLocalProfileId(lpId);
    // Legacy guest data
    setLocalJson("cockpit.settings.v2:guest", { profile: { displayName: "Legacy Guest" } });
    setLocalJson("cockpit.threads.v1:guest", [
      { id: "gt", title: "legacy", messages: [], updatedAt: 1 },
    ]);
    setLocalJson("cockpit.provider-stats.v1:guest", { openai: { calls: 5, errors: 1 } });
    addVectorDocsForUser(null, [{ id: "gd", text: "guest doc", embedding: [1, 0] }]);

    await hydrateAsync();

    // Local bucket now holds the migrated data.
    expect(getLocalJson(getLocalProfileSettingsKey(lpId))).toBeDefined();
    const migratedSettings = getLocalJson(getLocalProfileSettingsKey(lpId)) as {
      profile: { displayName: string };
    };
    expect(migratedSettings.profile.displayName).toBe("Legacy Guest");
    expect(getLocalJson(getLocalProfileThreadsKey(lpId))).toHaveLength(1);
    expect(getLocalJson(getLocalProfileStatsKey(lpId))).toEqual({
      openai: { calls: 5, errors: 1 },
    });
    expect(getAllVectorDocsForUser(lpId)).toHaveLength(1);
    // Legacy guest keys are preserved (not deleted during initial migration).
    expect(window.localStorage.getItem("cockpit.settings.v2:guest")).not.toBeNull();
  });

  it("loads the local profile bucket when data already exists", async () => {
    const lpId = "lp-existing";
    writeAccountMode("local-only");
    writeLocalProfileId(lpId);
    setLocalJson(getLocalProfileSettingsKey(lpId), { profile: { displayName: "Local Me" } });
    setLocalJson(getLocalProfileThreadsKey(lpId), [
      { id: "t1", title: "local chat", messages: [], updatedAt: 1 },
    ]);

    await hydrateAsync();

    expect(store.getState().settings.profile.displayName).toBe("Local Me");
    expect(store.getState().threads).toHaveLength(1);
    expect(store.getState().accountMode).toBe("local-only");
  });
});

describe("hydrateAsync — server", () => {
  it("loads the user bucket when /api/auth/me returns a valid user", async () => {
    writeAccountMode("server");
    setLocalJson("cockpit.settings.v2:user-a", { profile: { displayName: "Server A" } });
    setLocalJson("cockpit.threads.v1:user-a", [
      { id: "st", title: "server chat", messages: [], updatedAt: 1 },
    ]);
    mockFetch.mockImplementation(async (path: string) => {
      if (path === "/api/auth/me") return { ok: true, json: async () => ({ user: mockUserA }) };
      if (path === "/api/settings") return { ok: true, json: async () => ({}) };
      if (path === "/api/keys/status") return { ok: true, json: async () => ({ providers: {} }) };
      return { ok: true, json: async () => ({}) };
    });

    await hydrateAsync();

    expect(store.getState().user).toEqual(mockUserA);
    expect(store.getState().accountMode).toBe("server");
    expect(store.getState().settings.profile.displayName).toBe("Server A");
    expect(store.getState().threads).toHaveLength(1);
  });

  it("falls back to the local profile when the session is expired", async () => {
    const lpId = "lp-fallback";
    writeAccountMode("server");
    writeLocalProfileId(lpId);
    setLocalJson(getLocalProfileSettingsKey(lpId), { profile: { displayName: "Local Fallback" } });
    // /api/auth/me returns 401 (default mock)
    await hydrateAsync();

    expect(store.getState().user).toBeNull();
    expect(store.getState().accountMode).toBe("local-only");
    expect(store.getState().settings.profile.displayName).toBe("Local Fallback");
  });

  it("establishes a local profile when server session expired and none existed", async () => {
    writeAccountMode("server");
    // No localProfileId; legacy guest data present.
    setLocalJson("cockpit.settings.v2:guest", { profile: { displayName: "Legacy" } });
    await hydrateAsync();

    expect(store.getState().user).toBeNull();
    expect(store.getState().accountMode).toBe("local-only");
    expect(store.getState().localProfileId).toBeTruthy();
    // Legacy guest data migrated into the new local profile.
    expect(store.getState().settings.profile.displayName).toBe("Legacy");
  });
});

describe("enterServerMode / enterLocalMode", () => {
  it("enterServerMode loads the user bucket and clears runtime caches", async () => {
    // Start in local mode with a validation status set.
    const lpId = "lp-1";
    enterLocalMode(lpId);
    setLocalJson("cockpit.settings.v2:user-a", { profile: { displayName: "Server A" } });
    setLocalJson("cockpit.threads.v1:user-a", [
      { id: "st", title: "server", messages: [], updatedAt: 1 },
    ]);
    setLocalJson("cockpit.provider-stats.v1:user-a", { openai: { calls: 2, errors: 0 } });
    // Pretend a validation status leaked from the local profile.
    store.getState().providerValidationStatus.openai = { status: "valid" } as never;

    enterServerMode(mockUserA);

    expect(store.getState().user).toEqual(mockUserA);
    expect(store.getState().accountMode).toBe("server");
    expect(store.getState().settings.profile.displayName).toBe("Server A");
    expect(store.getState().threads).toHaveLength(1);
    expect(store.getState().stats.openai).toEqual({ calls: 2, errors: 0 });
    expect(store.getState().providerValidationStatus).toEqual({});
    expect(readAccountMode()).toBe("server");
  });

  it("enterLocalMode loads the local bucket and clears runtime caches", () => {
    enterServerMode(mockUserA);
    // Seed a server-side validation status that must not leak to local.
    store.getState().providerValidationStatus.anthropic = { status: "valid" } as never;

    const lpId = "lp-2";
    setLocalJson(getLocalProfileSettingsKey(lpId), { profile: { displayName: "Local Me" } });
    setLocalJson(getLocalProfileStatsKey(lpId), { openai: { calls: 9, errors: 0 } });

    enterLocalMode(lpId);

    expect(store.getState().user).toBeNull();
    expect(store.getState().accountMode).toBe("local-only");
    expect(store.getState().settings.profile.displayName).toBe("Local Me");
    expect(store.getState().stats.openai).toEqual({ calls: 9, errors: 0 });
    expect(store.getState().providerValidationStatus).toEqual({});
    expect(readAccountMode()).toBe("local-only");
    expect(readLocalProfileId()).toBe(lpId);
  });
});

describe("logout returns to local profile", () => {
  it("returns to the local profile, not an ambiguous guest state", async () => {
    const lpId = "lp-logout";
    writeLocalProfileId(lpId);
    setLocalJson(getLocalProfileSettingsKey(lpId), { profile: { displayName: "Local Return" } });
    enterServerMode(mockUserA);
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    await store.logout();

    expect(store.getState().user).toBeNull();
    expect(store.getState().accountMode).toBe("local-only");
    expect(store.getState().settings.profile.displayName).toBe("Local Return");
  });
});

describe("offline queue clears on account switch", () => {
  it("enterServerMode clears the global offline queue", () => {
    window.localStorage.setItem("cockpit.offline-queue.v1", JSON.stringify([{ text: "queued" }]));
    expect(window.localStorage.getItem("cockpit.offline-queue.v1")).not.toBeNull();
    enterServerMode(mockUserA);
    expect(window.localStorage.getItem("cockpit.offline-queue.v1")).toBeNull();
  });

  it("enterLocalMode clears the global offline queue", () => {
    enterServerMode(mockUserA);
    window.localStorage.setItem("cockpit.offline-queue.v1", JSON.stringify([{ text: "queued" }]));
    enterLocalMode("lp-q");
    expect(window.localStorage.getItem("cockpit.offline-queue.v1")).toBeNull();
  });

  it("clearOfflineQueue removes the key", () => {
    window.localStorage.setItem("cockpit.offline-queue.v1", "[]");
    clearOfflineQueue();
    expect(window.localStorage.getItem("cockpit.offline-queue.v1")).toBeNull();
  });
});

describe("Keep Separate cannot inherit local data", () => {
  it("enterServerMode without copying starts the server account clean", () => {
    const lpId = "lp-keep";
    enterLocalMode(lpId);
    setLocalJson(getLocalProfileSettingsKey(lpId), { profile: { displayName: "Local Secret" } });
    setLocalJson(getLocalProfileThreadsKey(lpId), [
      { id: "lt", title: "local only", messages: [], updatedAt: 1 },
    ]);
    addVectorDocsForUser(lpId, [{ id: "ld", text: "local memory", embedding: [1, 0] }]);

    // Simulate Keep Separate: register with onBeforeEnterServer false (no copy),
    // then enterServerMode against an empty user bucket.
    expect(window.localStorage.getItem("cockpit.settings.v2:user-a")).toBeNull();
    enterServerMode(mockUserA);

    // Server account starts with defaults, never the local profile data.
    expect(store.getState().settings.profile.displayName).not.toBe("Local Secret");
    expect(store.getState().threads).toHaveLength(0);
    // Local profile data is untouched.
    expect(getLocalJson(getLocalProfileSettingsKey(lpId))).toBeDefined();
    expect(getAllVectorDocsForUser(lpId)).toHaveLength(1);
  });
});

describe("vector store copy/move helpers", () => {
  it("getAllVectorDocsForUser returns the correct bucket docs", () => {
    saveVectorStoreForUser("user-a", [{ id: "a1", text: "A", embedding: [1] }]);
    saveVectorStoreForUser("user-b", [{ id: "b1", text: "B", embedding: [2] }]);
    expect(getAllVectorDocsForUser("user-a")).toHaveLength(1);
    expect(getAllVectorDocsForUser("user-a")[0].id).toBe("a1");
    expect(getAllVectorDocsForUser("user-b")).toHaveLength(1);
    expect(getAllVectorDocsForUser("user-b")[0].id).toBe("b1");
  });

  it("saveVectorStoreForUser replaces the entire bucket", () => {
    saveVectorStoreForUser("user-a", [{ id: "a1", text: "A", embedding: [1] }]);
    saveVectorStoreForUser("user-a", [
      { id: "a2", text: "A2", embedding: [2] },
      { id: "a3", text: "A3", embedding: [3] },
    ]);
    expect(getAllVectorDocsForUser("user-a")).toHaveLength(2);
    expect(
      getAllVectorDocsForUser("user-a")
        .map((d) => d.id)
        .sort(),
    ).toEqual(["a2", "a3"]);
  });

  it("copyLocalToServer copies into the user bucket and preserves local data", () => {
    const lpId = "lp-copy";
    setLocalJson(getLocalProfileSettingsKey(lpId), { profile: { displayName: "Local" } });
    setLocalJson(getLocalProfileThreadsKey(lpId), [
      { id: "lt", title: "local", messages: [], updatedAt: 1 },
    ]);
    setLocalJson(getLocalProfileStatsKey(lpId), { openai: { calls: 3, errors: 0 } });
    saveVectorStoreForUser(lpId, [{ id: "ld", text: "local doc", embedding: [1] }]);

    copyLocalToServer("user-a", lpId);

    expect(getLocalJson("cockpit.settings.v2:user-a")).toBeDefined();
    expect(getAllVectorDocsForUser("user-a")).toHaveLength(1);
    // Local data preserved
    expect(getLocalJson(getLocalProfileSettingsKey(lpId))).toBeDefined();
    expect(getAllVectorDocsForUser(lpId)).toHaveLength(1);
  });

  it("moveLocalToServer copies into the user bucket then clears the local bucket", () => {
    const lpId = "lp-move";
    setLocalJson(getLocalProfileSettingsKey(lpId), { profile: { displayName: "Local" } });
    saveVectorStoreForUser(lpId, [{ id: "ld", text: "local doc", embedding: [1] }]);

    moveLocalToServer("user-a", lpId);

    expect(getAllVectorDocsForUser("user-a")).toHaveLength(1);
    // Local bucket cleared
    expect(window.localStorage.getItem(getLocalProfileSettingsKey(lpId))).toBeNull();
    expect(window.localStorage.getItem(getLocalProfileThreadsKey(lpId))).toBeNull();
    expect(window.localStorage.getItem(getLocalProfileStatsKey(lpId))).toBeNull();
    expect(getAllVectorDocsForUser(lpId)).toHaveLength(0);
  });
});

describe("ensureLocalProfileId", () => {
  it("generates and persists a new id when none exists", () => {
    expect(readLocalProfileId()).toBeNull();
    const id = ensureLocalProfileId();
    expect(id).toBeTruthy();
    expect(readLocalProfileId()).toBe(id);
  });

  it("reuses the existing id", () => {
    writeLocalProfileId("existing-id");
    expect(ensureLocalProfileId()).toBe("existing-id");
  });
});

describe("migrateGuestBucketToLocalProfile", () => {
  it("copies guest data without deleting the legacy guest keys", () => {
    const lpId = "lp-migrate-fn";
    setLocalJson("cockpit.settings.v2:guest", { profile: { displayName: "G" } });
    setLocalJson("cockpit.threads.v1:guest", [
      { id: "gt", title: "g", messages: [], updatedAt: 1 },
    ]);
    addVectorDocsForUser(null, [{ id: "gd", text: "g doc", embedding: [1] }]);

    migrateGuestBucketToLocalProfile(lpId);

    expect(getLocalJson(getLocalProfileSettingsKey(lpId))).toBeDefined();
    expect(getAllVectorDocsForUser(lpId)).toHaveLength(1);
    // Legacy keys preserved
    expect(window.localStorage.getItem("cockpit.settings.v2:guest")).not.toBeNull();
    expect(window.localStorage.getItem("cockpit.threads.v1:guest")).not.toBeNull();
  });
});

describe("account mode keys", () => {
  it("persists and reads account mode", () => {
    writeAccountMode("local-only");
    expect(readAccountMode()).toBe("local-only");
    writeAccountMode("server");
    expect(readAccountMode()).toBe("server");
  });
  it("treats unknown values as undetermined", () => {
    window.localStorage.setItem(ACCOUNT_MODE_KEY, "bogus");
    expect(readAccountMode()).toBe("undetermined");
  });
  it("localProfileId round-trips", () => {
    writeLocalProfileId("abc");
    expect(readLocalProfileId()).toBe("abc");
  });
  it("LOCAL_PROFILE_ID_KEY and ACCOUNT_MODE_KEY are the documented constants", () => {
    expect(ACCOUNT_MODE_KEY).toBe("cockpit.account.mode");
    expect(LOCAL_PROFILE_ID_KEY).toBe("cockpit.local-profile.id");
  });
});
