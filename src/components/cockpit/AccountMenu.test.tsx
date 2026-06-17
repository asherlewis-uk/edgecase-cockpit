import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountMenu } from "./AccountMenu";
import { store } from "@/lib/cockpit-store";

const mockNavigate = vi.fn();
const mockFetch = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/api-base", () => ({
  apiFetch: (...args: unknown[]) => {
    const [path] = args as [string, ...unknown[]];
    if (path === "/api/auth/me") {
      return Promise.resolve({ ok: true, json: async () => ({ user: null }) });
    }
    return mockFetch(...args);
  },
}));

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

describe("AccountMenu", () => {
  beforeEach(() => {
    window.localStorage.clear();
    store.updateSettings({ profile: { displayName: "friend" } } as Parameters<
      typeof store.updateSettings
    >[0]);
    vi.clearAllMocks();
  });

  it("shows sign-in prompt for guests", () => {
    store.setUser(null);
    render(<AccountMenu />);
    expect(screen.getByText(/Sign in \/ Create account/i)).toBeInTheDocument();
    expect(screen.getByText(/You're using Cockpit as a guest/i)).toBeInTheDocument();
  });

  it("navigates to /auth when sign-in button clicked", async () => {
    store.setUser(null);
    render(<AccountMenu />);
    await userEvent.click(screen.getByText(/Sign in \/ Create account/i));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/auth", search: { redirect: "/settings" } }),
    );
  });

  it("shows user email and logout when authenticated", () => {
    store.setUser({
      id: "u1",
      email: "test@example.com",
      display_name: "Test User",
      created_at: 1,
      updated_at: 1,
    });
    render(<AccountMenu />);
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText(/Log out/i)).toBeInTheDocument();
  });

  it("falls back to email when display_name is null", () => {
    store.setUser({
      id: "u1",
      email: "test@example.com",
      display_name: null,
      created_at: 1,
      updated_at: 1,
    });
    render(<AccountMenu />);
    expect(screen.getAllByText("test@example.com").length).toBeGreaterThanOrEqual(1);
  });

  it("calls logout and clears user when logout clicked", async () => {
    store.setUser({
      id: "u1",
      email: "test@example.com",
      display_name: "Test User",
      created_at: 1,
      updated_at: 1,
    });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const callback = vi.fn();
    render(<AccountMenu onAction={callback} />);
    vi.clearAllMocks(); // ignore hydration fetchMe/refreshProviderKeyStatus calls
    await userEvent.click(screen.getByText(/Log out/i));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/logout",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(store.getState().user).toBeNull();
    expect(callback).toHaveBeenCalled();
  });
});
