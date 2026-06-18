import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "./auth";

const mockRegister = vi.fn();
const mockLogin = vi.fn();
const mockNavigate = vi.fn();
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
      expect(mockLogin).toHaveBeenCalledWith("a@b.com", "password123");
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
      expect(mockRegister).toHaveBeenCalledWith("a@b.com", "password123", "Me");
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
});
