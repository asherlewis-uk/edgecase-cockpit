import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProviderCard } from "./ProviderCard";
import { store } from "@/lib/cockpit-store";
import { PROVIDERS } from "@/lib/providers";

const mockFetch = vi.fn();

vi.mock("@/lib/api-base", () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useNavigate: () => vi.fn(),
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

const openai = PROVIDERS.find((p) => p.id === "openai")!;

describe("ProviderCard auth gating", () => {
  beforeEach(() => {
    window.localStorage.clear();
    store.updateSettings({ profile: { displayName: "friend" } } as Parameters<
      typeof store.updateSettings
    >[0]);
    vi.clearAllMocks();
  });

  it("shows auth prompt and does not call /api/keys/set when guest", async () => {
    store.setUser(null);
    render(<ProviderCard p={openai} isActive={false} />);
    vi.clearAllMocks();
    await userEvent.type(screen.getByPlaceholderText(/API key/i), "sk-test");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByText(/Sign in to save provider keys securely/i)).toBeInTheDocument();
  });

  it("calls /api/keys/set and clears input when authenticated", async () => {
    store.setUser({
      id: "u1",
      email: "test@example.com",
      display_name: "Test",
      created_at: 1,
      updated_at: 1,
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ providers: {} }) }); // refresh key status
    render(<ProviderCard p={openai} isActive={false} />);
    vi.clearAllMocks();
    await userEvent.type(screen.getByPlaceholderText(/API key/i), "sk-test");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/keys/set",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("sk-test"),
        }),
      );
    });
  });

  it("shows auth prompt when /api/keys/set returns 401", async () => {
    store.setUser({
      id: "u1",
      email: "test@example.com",
      display_name: "Test",
      created_at: 1,
      updated_at: 1,
    });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Authentication required" }),
    });
    render(<ProviderCard p={openai} isActive={false} />);
    vi.clearAllMocks();
    await userEvent.type(screen.getByPlaceholderText(/API key/i), "sk-test");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() => {
      expect(screen.getByText(/Sign in to save provider keys securely/i)).toBeInTheDocument();
    });
    expect(store.getState().user).toBeNull();
  });

  it("shows not-configured state for authenticated user without a saved key", () => {
    store.setUser({
      id: "u2",
      email: "user-b@example.com",
      display_name: "User B",
      created_at: 1,
      updated_at: 1,
    });
    render(<ProviderCard p={openai} isActive={false} />);
    expect(screen.getByTestId("provider-status-openai")).toHaveTextContent(/Needs API key/i);
    expect(screen.queryByTestId("provider-auth-prompt")).not.toBeInTheDocument();
  });
});
