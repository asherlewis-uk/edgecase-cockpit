import { describe, it, expect, beforeEach, vi } from "vitest";
import { store, __resetHydration, fetchMe, register, login, logout } from "./cockpit-store";

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

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  display_name: "Test User",
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
    store.setUser(mockUser);
    expect(store.getState().user).toEqual(mockUser);
  });

  it("clearUser clears the user", () => {
    store.setUser(mockUser);
    store.clearUser();
    expect(store.getState().user).toBeNull();
  });
});

describe("fetchMe", () => {
  it("restores authenticated user from /api/auth/me", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: mockUser }),
    });
    const user = await fetchMe();
    expect(user).toEqual(mockUser);
    expect(store.getState().user).toEqual(mockUser);
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/me");
  });

  it("clears user when /api/auth/me returns 401", async () => {
    store.setUser(mockUser);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    const user = await fetchMe();
    expect(user).toBeNull();
    expect(store.getState().user).toBeNull();
  });

  it("clears user on network error", async () => {
    store.setUser(mockUser);
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
      json: async () => ({ user: mockUser }),
    });
    const result = await register("test@example.com", "password123", "Test User");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toEqual(mockUser);
    }
    expect(store.getState().user).toEqual(mockUser);
  });

  it("returns error on failure without setting user", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: "Email already registered" }),
    });
    const result = await register("test@example.com", "password123");
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
      json: async () => ({ user: mockUser }),
    });
    const result = await login("test@example.com", "password123");
    expect(result.ok).toBe(true);
    expect(store.getState().user).toEqual(mockUser);
  });

  it("returns error on invalid credentials", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid email or password" }),
    });
    const result = await login("test@example.com", "wrong");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Invalid email or password");
    }
    expect(store.getState().user).toBeNull();
  });
});

describe("logout", () => {
  it("calls /api/auth/logout and clears user", async () => {
    store.setUser(mockUser);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await logout();
    expect(store.getState().user).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("clears user even if /api/auth/logout fails", async () => {
    store.setUser(mockUser);
    mockFetch.mockRejectedValueOnce(new Error("network"));
    await logout();
    expect(store.getState().user).toBeNull();
  });
});
