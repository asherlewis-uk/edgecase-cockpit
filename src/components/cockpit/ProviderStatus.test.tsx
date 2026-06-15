import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProviderStatus } from "@/components/cockpit/ProviderStatus";

const { mockValidationStatus, mockSettings } = vi.hoisted(() => {
  const mockValidationStatus: {
    status: "idle" | "validating" | "valid" | "invalid" | "error";
    message?: string;
  } = { status: "idle" };
  const mockSettings: { activeProviderId: string; providers: Record<string, any> } = {
    activeProviderId: "openai",
    providers: { openai: { apiKey: "sk-test" } },
  };
  return { mockValidationStatus, mockSettings };
});

vi.mock("@/lib/cockpit-store", () => ({
  useStore: (selector: any) =>
    selector({
      settings: mockSettings,
      providerValidationStatus: { openai: mockValidationStatus },
    }),
  resolveProvider: () => ({
    provider: { id: "openai", name: "OpenAI", needsApiKey: true },
    model: "gpt-4o",
  }),
  isProviderReady: (settings: any) => {
    return !!settings.providers?.openai?.apiKey;
  },
  getProviderValidationStatus: (id: string) => mockValidationStatus,
}));

describe("ProviderStatus", () => {
  beforeEach(() => {
    mockValidationStatus.status = "idle";
    mockValidationStatus.message = undefined;
    mockSettings.providers = { openai: { apiKey: "sk-test" } };
  });

  it("renders ready state with provider name and model", () => {
    render(<ProviderStatus onOpenSettings={() => {}} />);
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
  });

  it("renders missing key state", () => {
    mockSettings.providers = {};
    render(<ProviderStatus onOpenSettings={() => {}} />);
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("set API key")).toBeInTheDocument();
  });

  it("renders invalid key state", () => {
    mockValidationStatus.status = "invalid";
    render(<ProviderStatus onOpenSettings={() => {}} />);
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("invalid key")).toBeInTheDocument();
  });

  it("renders error state with message", () => {
    mockValidationStatus.status = "error";
    mockValidationStatus.message = "Network timeout";
    render(<ProviderStatus onOpenSettings={() => {}} />);
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Network timeout")).toBeInTheDocument();
  });
});
