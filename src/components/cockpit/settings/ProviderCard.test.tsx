import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocalCapabilitySummary, ProviderCard } from "./ProviderCard";
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

describe("LocalCapabilitySummary", () => {
  it("shows configured/reachable as not verified ready", () => {
    render(
      <LocalCapabilitySummary
        state={{
          endpointId: "local-openai-compatible",
          providerId: "custom",
          status: "ready",
          label: "Endpoint reachable with configured model",
          reason: 'The endpoint is reachable and model "local-model" is configured locally.',
          nextAction: "Run the model-list check to confirm usable model state.",
          actionable: true,
          modelCount: 1,
          models: [{ id: "local-model" }],
          raw: { baseUrl: "http://localhost:8000", modelSource: "configured" },
        }}
        baseUrl="http://localhost:8000"
        model="local-model"
      />,
    );

    expect(screen.getByTestId("v1-local-capability-label")).toHaveTextContent(
      "Configured/reachable",
    );
    expect(screen.getByTestId("v1-local-capability-boundary")).toHaveTextContent(
      /not verified until the model-list probe/i,
    );
  });

  it("explains hosted HTTPS blocking for local HTTP localhost", () => {
    render(
      <LocalCapabilitySummary
        state={{
          endpointId: "local-openai-compatible",
          providerId: "custom",
          status: "hosted-HTTPS-blocked",
          label: "Hosted HTTPS blocks local HTTP",
          reason: "A hosted HTTPS page cannot directly fetch an insecure localhost HTTP endpoint.",
          nextAction:
            "Run the app locally, use an HTTPS local endpoint, or use an allowed local proxy.",
          actionable: true,
          raw: { baseUrl: "http://localhost:8000" },
        }}
        baseUrl="http://localhost:8000"
        model="default"
      />,
    );

    expect(screen.getByTestId("v1-local-capability-label")).toHaveTextContent(
      "Hosted HTTPS blocks local HTTP",
    );
    expect(screen.getByTestId("v1-local-capability-boundary")).toHaveTextContent(
      /hosted web page cannot reach local HTTP localhost directly/i,
    );
  });

  it("shows verified model-list results with reported model names", () => {
    render(
      <LocalCapabilitySummary
        state={{
          endpointId: "local-openai-compatible",
          providerId: "custom",
          status: "ready",
          label: "Endpoint ready",
          reason: "The model-list endpoint returned 2 usable model(s).",
          nextAction: "Use one of the reported models or rerun the model-list check after changes.",
          actionable: true,
          modelCount: 2,
          models: [{ id: "llama3" }, { id: "mistral" }],
          raw: {
            baseUrl: "http://localhost:8000",
            status: 200,
            modelSource: "model-list",
          },
        }}
        baseUrl="http://localhost:8000"
        model="default"
      />,
    );

    expect(screen.getByTestId("v1-local-capability-label")).toHaveTextContent("Verified ready");
    expect(screen.getByTestId("v1-local-capability-models")).toHaveTextContent("llama3");
    expect(screen.getByTestId("v1-local-capability-models")).toHaveTextContent("mistral");
    expect(screen.getByTestId("v1-local-capability-debug")).toHaveTextContent("HTTP 200");
  });

  it("can visibly recover from a failed probe after config changes and retry", () => {
    const { rerender } = render(
      <LocalCapabilitySummary
        state={{
          endpointId: "local-openai-compatible",
          providerId: "custom",
          status: "unreachable",
          label: "Model-list endpoint unreachable",
          reason: "Failed to fetch",
          nextAction:
            "Check the base URL, make sure the local runtime is running, then retry the model-list check.",
          actionable: true,
          raw: { baseUrl: "http://localhost:8000", error: "Failed to fetch" },
        }}
        baseUrl="http://localhost:8000"
        model="default"
      />,
    );

    expect(screen.getByTestId("v1-local-capability-label")).toHaveTextContent(
      "Model-list endpoint unreachable",
    );
    expect(screen.getByTestId("v1-local-capability-reason")).toHaveTextContent("Failed to fetch");

    rerender(
      <LocalCapabilitySummary
        state={{
          endpointId: "local-openai-compatible",
          providerId: "custom",
          status: "ready",
          label: "Endpoint ready",
          reason: "The model-list endpoint returned 1 usable model(s).",
          nextAction: "Use one of the reported models or rerun the model-list check after changes.",
          actionable: true,
          modelCount: 1,
          models: [{ id: "fixed-model" }],
          raw: {
            baseUrl: "http://localhost:9000",
            status: 200,
            modelSource: "model-list",
          },
        }}
        baseUrl="http://localhost:9000"
        model="fixed-model"
      />,
    );

    expect(screen.getByTestId("v1-local-capability-label")).toHaveTextContent("Verified ready");
    expect(screen.getByTestId("v1-local-capability-models")).toHaveTextContent("fixed-model");
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });
});
