import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProviderStatus } from "@/components/cockpit/ProviderStatus";
import type { Settings } from "@/lib/cockpit-store";

type ProviderValidationStatus = {
  status: "idle" | "validating" | "valid" | "invalid" | "error";
  message?: string;
  errorType?: "auth_failed" | "network_error" | "timeout" | "rate_limited" | "unknown";
  lastValidated?: number;
};

const { mockValidationStatus, mockSettings } = vi.hoisted(() => {
  const mockValidationStatus: ProviderValidationStatus = { status: "idle" };
  const mockSettings: Settings = {
    userName: "Test User",
    activeProviderId: "openai",
    providers: { openai: { apiKey: "sk-test" } },
    profile: { displayName: "Test User" },
    personalization: {
      assistantName: "Assistant",
      preferredTone: "direct",
      defaultPromptPlaceholder: "Ask me anything...",
      visualMode: "dark",
      ambientIntensity: "medium",
      reduceMotion: false,
      showProviderInGreeting: true,
      showModelInGreeting: true,
      rememberLastProvider: true,
    },
    keyboardShortcuts: {
      enabled: {
        commandPalette: true,
        newThread: true,
        sendMessage: true,
        help: true,
        escapeActions: true,
      },
      forceCtrl: false,
    },
    rag: { enabled: false, providerId: "openai" },
    pinnedProviderIds: [],
  };
  return { mockValidationStatus, mockSettings };
});

vi.mock("@/lib/cockpit-store", () => ({
  useStore: function <T>(
    selector: (s: {
      settings: Settings;
      providerValidationStatus: Record<string, ProviderValidationStatus>;
    }) => T,
  ) {
    return selector({
      settings: mockSettings,
      providerValidationStatus: { openai: mockValidationStatus },
    });
  },
  resolveProvider: () => ({
    provider: { id: "openai", name: "OpenAI", needsApiKey: true },
    model: "gpt-4o",
  }),
  isProviderReady: (settings: Settings) => {
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
