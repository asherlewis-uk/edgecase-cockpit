import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "./auth";
import { enterLocalMode } from "@/lib/cockpit-store";

const mockRegister = vi.fn();
const mockLogin = vi.fn();
const mockNavigate = vi.fn();
const mockEnterServerMode = vi.fn();
const mockCopyLocalToServer = vi.fn();
const mockPushAccountSettingsToServer = vi.fn();
const mockSearch = vi.hoisted(() => ({
  redirect: "/settings",
  mode: "signin" as "signin" | "register",
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useSearch: () => mockSearch,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/lib/cockpit-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cockpit-store")>();
  return {
    ...actual,
    register: (...args: Parameters<typeof actual.register>) => mockRegister(...args),
    login: (...args: Parameters<typeof actual.login>) => mockLogin(...args),
    enterServerMode: (...args: Parameters<typeof actual.enterServerMode>) =>
      mockEnterServerMode(...args),
    copyLocalToServer: (...args: Parameters<typeof actual.copyLocalToServer>) =>
      mockCopyLocalToServer(...args),
    pushAccountSettingsToServer: (...args: Parameters<typeof actual.pushAccountSettingsToServer>) =>
      mockPushAccountSettingsToServer(...args),
  };
});

function renderAuthRoute() {
  const Component = Route.options.component as React.FC;
  return render(<Component />);
}

describe("/auth route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.redirect = "/settings";
    mockSearch.mode = "signin";
  });

  it("exposes sign-in branding in head meta", () => {
    const head = (Route.options.head as unknown as () => { meta: Array<Record<string, string>> })();
    const meta: Array<Record<string, string>> = head.meta;
    expect(meta.find((m) => "title" in m)?.title).toBe("Sign in — Cockpit");
  });

  it("renders sign-in tab by default", () => {
    renderAuthRoute();
    expect(screen.getByRole("heading", { name: /Edgecase Cockpit/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Sign in/i })).toHaveAttribute("data-state", "active");
  });

  it("switches to create account tab", async () => {
    renderAuthRoute();
    await userEvent.click(screen.getByRole("tab", { name: /Create account/i }));
    expect(screen.getByRole("tab", { name: /Create account/i })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("renders create account tab when requested by search mode", () => {
    mockSearch.mode = "register";
    renderAuthRoute();
    expect(screen.getByRole("tab", { name: /Create account/i })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("validates email and password on sign-in", async () => {
    renderAuthRoute();
    await userEvent.click(screen.getByRole("button", { name: /Sign in$/i }));
    await waitFor(() => {
      expect(screen.getByText(/Enter a valid email/i)).toBeInTheDocument();
    });
  });

  it("submits login form with email and password", async () => {
    mockLogin.mockResolvedValueOnce({
      ok: true,
      user: { id: "u1", email: "a@b.com", display_name: null, created_at: 1, updated_at: 1 },
    });
    renderAuthRoute();
    await userEvent.type(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /Sign in$/i }));
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        "a@b.com",
        "password123",
        expect.objectContaining({ claimGuestData: false }),
      );
    });
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/settings" }));
  });

  it("submits register form with display name", async () => {
    mockRegister.mockResolvedValueOnce({
      ok: true,
      user: { id: "u1", email: "a@b.com", display_name: "Me", created_at: 1, updated_at: 1 },
    });
    renderAuthRoute();
    await userEvent.click(screen.getByRole("tab", { name: /Create account/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Optional")).not.toHaveAttribute("hidden");
    });
    await userEvent.type(screen.getByPlaceholderText("Optional"), "Me");
    const emailInputs = screen.getAllByPlaceholderText("you@example.com");
    await userEvent.type(emailInputs[emailInputs.length - 1], "a@b.com");
    await userEvent.type(screen.getByPlaceholderText("At least 8 characters"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /Create account$/i }));
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        "a@b.com",
        "password123",
        "Me",
        expect.objectContaining({ claimGuestData: false }),
      );
    });
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/settings" }));
  });

  it("displays global error on auth failure", async () => {
    mockLogin.mockResolvedValueOnce({ ok: false, error: "Invalid email or password" });
    renderAuthRoute();
    await userEvent.type(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /Sign in$/i }));
    await waitFor(() => {
      expect(screen.getByText("Invalid email or password")).toBeInTheDocument();
    });
  });

  it("signing in from a local-only profile requires a migration choice first", async () => {
    mockLogin.mockResolvedValueOnce({
      ok: true,
      user: { id: "u1", email: "a@b.co", display_name: null, created_at: 1, updated_at: 1 },
    });
    enterLocalMode("lp-1");
    renderAuthRoute();

    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByTestId("data-migration-dialog")).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("choosing keep-separate on sign-in sends claimGuestData false", async () => {
    mockLogin.mockResolvedValueOnce({
      ok: true,
      user: { id: "u1", email: "a@b.co", display_name: null, created_at: 1, updated_at: 1 },
    });
    enterLocalMode("lp-1");
    renderAuthRoute();

    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await userEvent.click(await screen.findByTestId("migration-choice-keep-separate"));

    expect(mockLogin).toHaveBeenCalledWith(
      "a@b.co",
      "password123",
      expect.objectContaining({ claimGuestData: false }),
    );
  });

  // Copying into an account that ALREADY has a settings row is reachable — this
  // is the sign-in path, not just registration. enterServerMode fires a
  // fire-and-forget GET /api/settings; if that GET runs on a migration entry it
  // applies the account's old server settings over the bucket copy/move just
  // wrote, then persists them into it. On Move the local bucket is already gone.
  // The local bucket is authoritative by construction here, so the load must be
  // suppressed for this entry rather than raced against.
  it("suppresses the initial server settings load when copying local data in", async () => {
    mockLogin.mockResolvedValueOnce({
      ok: true,
      user: { id: "u1", email: "a@b.co", display_name: null, created_at: 1, updated_at: 1 },
    });
    enterLocalMode("lp-1");
    renderAuthRoute();

    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await userEvent.click(await screen.findByTestId("migration-choice-copy"));

    await waitFor(() => expect(mockEnterServerMode).toHaveBeenCalled());
    expect(mockCopyLocalToServer).toHaveBeenCalled();
    expect(mockEnterServerMode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1" }),
      expect.objectContaining({ skipSettingsLoad: true }),
    );
    // The push is still fired — suppressing the load must not drop the upload.
    expect(mockPushAccountSettingsToServer).toHaveBeenCalledWith("u1");
  });

  it("keeps loading server settings normally on keep-separate", async () => {
    mockLogin.mockResolvedValueOnce({
      ok: true,
      user: { id: "u1", email: "a@b.co", display_name: null, created_at: 1, updated_at: 1 },
    });
    enterLocalMode("lp-1");
    renderAuthRoute();

    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await userEvent.click(await screen.findByTestId("migration-choice-keep-separate"));

    await waitFor(() => expect(mockEnterServerMode).toHaveBeenCalled());
    // keep-separate's whole point is that local data never reaches the account,
    // so the account's own server settings stay the source of truth.
    const opts = mockEnterServerMode.mock.calls[0][1] as { skipSettingsLoad?: boolean } | undefined;
    expect(opts?.skipSettingsLoad).toBeFalsy();
    expect(mockPushAccountSettingsToServer).not.toHaveBeenCalled();
  });
});
