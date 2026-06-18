import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  store,
  __resetHydration,
  fetchMe,
  register,
  login,
  logout,
  refreshProviderKeyStatus,
  getProviderValidationStatus,
  setProviderValidationStatus,
} from "./cockpit-store";

// Mock localStorage
const localStorageMock = (() => {
  let ls: Record<string, string> = {};
  return {
    getItem: (key: string) => ls[key] || null,
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

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

const mockUserA = {
  id: "user-a",
  email: "user-a@example.com",
  display_name: "User A",
  created_at: 123,
  updated_at: 123,
};

const mockUserB = {
  id: "user-b",
  email: "user-b@example.com",
  display_name: "User B",
  created_at: 123,
  updated_at: 123,
};

const mockFetch = vi.fn();

vi.mock("@/lib/api-base", () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}));

vi.mock("@/lib/tokens", () => ({
  setCostOverrides: vi.fn(),
}));

beforeEach(() => {
  __resetHydration();
  window.localStorage.clear();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ user: null }) });
  // Hydrate once so later getState() calls don't reset runtime state.
  store.getState();
  store.updateSettings({
    profile: { displayName: "friend" },
    personalization: { assistantName: "Cockpit" },
  } as Parameters<typeof store.updateSettings>[0]);
  store.setUser(null);
  vi.clearAllMocks();
});

describe("auth state helpers", () => {
  it("starts with no authenticated user", () => {
    expect(store.getState().user).toBeNull();
  });

  it("setUser updates the user in state", () => {
    store.setUser(mockUserA);
    expect(store.getState().user).toEqual(mockUserA);
  });

  it("clearUser clears the user", () => {
    store.setUser(mockUserA);
    store.clearUser();
    expect(store.getState().user).toBeNull();
  });
});

describe("fetchMe", () => {
  it("restores authenticated user from /api/auth/me", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: mockUserA }),
    });
    const user = await fetchMe();
    expect(user).toEqual(mockUserA);
    expect(store.getState().user).toEqual(mockUserA);
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/me");
  });

  it("clears user when /api/auth/me returns 401", async () => {
    store.setUser(mockUserA);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    const user = await fetchMe();
    expect(user).toBeNull();
    expect(store.getState().user).toBeNull();
  });

  it("clears user on network error", async () => {
    store.setUser(mockUserA);
    mockFetch.mockRejectedValueOnce(new Error("network"));
    const user = await fetchMe();
    expect(user).toBeNull();
    expect(store.getState().user).toBeNull();
  });
});

describe("register", () => {
  it("registers and sets user on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ user: mockUserA }),
    });
    const result = await register("user-a@example.com", "password123", "User A");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toEqual(mockUserA);
    }
    expect(store.getState().user).toEqual(mockUserA);
  });

  it("returns error on failure without setting user", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: "Email already registered" }),
    });
    const result = await register("user-a@example.com", "password123");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Email already registered");
    }
    expect(store.getState().user).toBeNull();
  });
});

describe("login", () => {
  it("logs in and sets user on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ user: mockUserA }),
    });
    const result = await login("user-a@example.com", "password123");
    expect(result.ok).toBe(true);
    expect(store.getState().user).toEqual(mockUserA);
  });

  it("returns error on invalid credentials", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid email or password" }),
    });
    const result = await login("user-a@example.com", "wrong");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Invalid email or password");
    }
    expect(store.getState().user).toBeNull();
  });
});

describe("logout", () => {
  it("calls /api/auth/logout and clears user", async () => {
    store.setUser(mockUserA);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await logout();
    expect(store.getState().user).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("clears user even if /api/auth/logout fails", async () => {
    store.setUser(mockUserA);
    mockFetch.mockRejectedValueOnce(new Error("network"));
    await logout();
    expect(store.getState().user).toBeNull();
  });
});

describe("provider key status isolation across accounts", () => {
  it("refreshProviderKeyStatus loads only the current user's keys and configs", async () => {
    store.setUser(mockUserA);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        providers: {
          openai: { hasKey: true, baseUrl: "https://a.example.com", model: "gpt-4o" },
        },
      }),
    });
    await refreshProviderKeyStatus();
    expect(store.getState().providerKeyStatus.openai).toBe(true);
    expect(store.getState().settings.providers.openai).toMatchObject({
      baseUrl: "https://a.example.com",
      model: "gpt-4o",
    });
  });

  it("logout clears provider key status and validation state", async () => {
    store.setUser(mockUserA);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ providers: { openai: { hasKey: true } } }),
    });
    await refreshProviderKeyStatus();
    setProviderValidationStatus("openai", { status: "valid", message: "ok" });

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await logout();

    expect(store.getState().providerKeyStatus).toEqual({});
    expect(getProviderValidationStatus("openai").status).toBe("idle");
  });

  it("switching from User A to User B drops A's key/config state", async () => {
    store.setUser(mockUserA);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        providers: { openai: { hasKey: true, baseUrl: "https://a.example.com", model: "gpt-4o" } },
      }),
    });
    await refreshProviderKeyStatus();
    setProviderValidationStatus("openai", { status: "valid" });

    // Simulate User B login by direct setUser (login path in store calls this)
    store.setUser(mockUserB);
    // After setUser, runtime state should be empty until the next refresh.
    expect(store.getState().providerKeyStatus).toEqual({});
    expect(getProviderValidationStatus("openai").status).toBe("idle");

    // User B refresh returns no keys for B
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ providers: {} }),
    });
    await refreshProviderKeyStatus();
    expect(store.getState().providerKeyStatus.openai).toBeUndefined();
  });
});

describe("account-scoped settings", () => {
  it("User A and User B have separate local settings buckets", () => {
    store.setUser(mockUserA);
    store.updateSettings({ profile: { displayName: "User A" } });
    expect(store.getState().settings.profile.displayName).toBe("User A");

    store.setUser(mockUserB);
    store.updateSettings({ profile: { displayName: "User B" } });
    expect(store.getState().settings.profile.displayName).toBe("User B");

    // Switch back to User A: their bucket is restored.
    store.setUser(mockUserA);
    expect(store.getState().settings.profile.displayName).toBe("User A");

    // Switch back to User B: their bucket is restored.
    store.setUser(mockUserB);
    expect(store.getState().settings.profile.displayName).toBe("User B");
  });

  it("guest settings stay local and do not leak to signed-in users", async () => {
    // Set guest settings while no user is signed in.
    store.setUser(null);
    store.updateSettings({ profile: { displayName: "Guest User" } });
    expect(store.getState().settings.profile.displayName).toBe("Guest User");

    // Sign in as User A: User A should not inherit the guest display name.
    store.setUser(mockUserA);
    expect(store.getState().settings.profile.displayName).not.toBe("Guest User");
    expect(store.getState().user?.id).toBe("user-a");

    // Change User A's settings and log out: the guest bucket should remain untouched.
    store.updateSettings({ profile: { displayName: "User A" } });
    await store.logout();
    expect(store.getState().settings.profile.displayName).toBe("Guest User");
  });

  it("updateSettings POSTs to /api/settings only when authenticated", async () => {
    // Guest update should not hit the server.
    store.setUser(null);
    store.updateSettings({ profile: { displayName: "Guest" } });
    expect(mockFetch).not.toHaveBeenCalledWith("/api/settings", expect.anything());

    // Authenticated update should sync to the server.
    store.setUser(mockUserA);
    vi.clearAllMocks();
    store.updateSettings({ profile: { displayName: "User A" } });
    await vi.waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/settings",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("login loads server settings for the authenticated user", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: mockUserA }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          profile: { displayName: "Server A" },
          personalization: { assistantName: "Server Copilot" },
          costOverrides: { openai: { input: 0.002 } },
        }),
      });

    const result = await login("user-a@example.com", "password123");
    expect(result.ok).toBe(true);
    expect(store.getState().user).toEqual(mockUserA);

    // Server settings eventually overwrite the local defaults.
    await vi.waitFor(() => {
      expect(store.getState().settings.profile.displayName).toBe("Server A");
      expect(store.getState().settings.personalization.assistantName).toBe("Server Copilot");
      expect(store.getState().settings.costOverrides).toEqual({ openai: { input: 0.002 } });
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/settings");
  });

  it("logout switches to the guest bucket and does not leak User A settings", async () => {
    // Seed User A's bucket with distinct settings.
    store.setUser(mockUserA);
    store.updateSettings({ profile: { displayName: "User A" } });

    // Seed the guest bucket with its own settings.
    await store.logout();
    store.updateSettings({ profile: { displayName: "Guest" } });

    // Log in as User A and then log out: runtime should return to guest settings.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ user: mockUserA }),
    });
    await login("user-a@example.com", "password123");
    expect(store.getState().settings.profile.displayName).toBe("User A");

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await logout();
    expect(store.getState().user).toBeNull();
    expect(store.getState().settings.profile.displayName).toBe("Guest");

    // Verify the guest bucket did not absorb User A's settings.
    const guestRaw = JSON.parse(window.localStorage.getItem("cockpit.settings.v2:guest") ?? "{}");
    expect(guestRaw.profile?.displayName).toBe("Guest");
  });

  it("fetchMe restores the authenticated user and their scoped settings", async () => {
    // Persist User A's local settings.
    store.setUser(mockUserA);
    store.updateSettings({ profile: { displayName: "Local A" } });
    await store.logout();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: mockUserA }),
    });

    const user = await fetchMe();
    expect(user).toEqual(mockUserA);
    expect(store.getState().settings.profile.displayName).toBe("Local A");
  });
});
