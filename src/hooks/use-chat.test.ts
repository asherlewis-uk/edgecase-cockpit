import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any for flexible stubs */

// ---------------------------------------------------------------------------
// Use vi.hoisted() for variables needed by vi.mock factories (which are
// hoisted to the top of the file before normal variable declarations run).
// ---------------------------------------------------------------------------

const { mockCallProxy, mockState, mockStore, mockSettings } = vi.hoisted(() => {
  const mockCallProxy = vi.fn();

  const mockState = {
    threads: [] as any[],
    activeThreadId: null as string | null,
    threadCounter: 0,
  };

  const mockSettings = {
    userName: "friend",
    profile: {
      displayName: "friend",
      initials: "AI",
    },
    personalization: {
      assistantName: "Cockpit",
      preferredTone: "warm" as const,
      defaultPromptPlaceholder: "Message",
      visualMode: "glass" as const,
      ambientIntensity: "medium" as const,
      reduceMotion: false,
      showProviderInGreeting: true,
      showModelInGreeting: true,
      rememberLastProvider: true,
    },
    activeProviderId: "openai",
    providers: { openai: { apiKey: "sk-test" } },
    pinnedProviderIds: [],
    rag: { enabled: false, providerId: "openai" },
  };

  const mockStore = {
    getState: () => ({
      settings: mockSettings,
      threads: mockState.threads,
      activeThreadId: mockState.activeThreadId,
      providerKeyStatus: {},
    }),
    subscribe: vi.fn(() => () => {}),
    newThread: (opts?: { temporary?: boolean }) => {
      const id = "thread-" + mockState.threadCounter++;
      const t = {
        id,
        title: opts?.temporary ? "Temporary chat" : "New chat",
        messages: [],
        updatedAt: Date.now(),
        temporary: opts?.temporary,
      };
      mockState.threads = [t, ...mockState.threads];
      mockState.activeThreadId = id;
      return id;
    },
    addMessage: (threadId: string, msg: any) => {
      mockState.threads = mockState.threads.map((t) => {
        if (t.id === threadId) {
          return {
            ...t,
            messages: [...t.messages, msg],
            updatedAt: Date.now(),
            title:
              t.messages.length === 0 && msg.role === "user"
                ? (msg.content?.trim() || "").slice(0, 48) || "New chat"
                : t.title,
          };
        }
        return t;
      });
    },
    patchMessage: (threadId: string, id: string, patch: any) => {
      mockState.threads = mockState.threads.map((t) => {
        if (t.id === threadId) {
          return {
            ...t,
            messages: t.messages.map((m: any) => (m.id === id ? { ...m, ...patch } : m)),
          };
        }
        return t;
      });
    },
    selectThread: (id: string | null) => {
      mockState.activeThreadId = id;
    },
  };

  return { mockCallProxy, mockState, mockStore, mockSettings };
});

// ---------------------------------------------------------------------------
// vi.mock factories (hoisted — must reference only hoisted vars)
// ---------------------------------------------------------------------------

vi.mock("@/lib/providers", () => ({
  PROVIDERS: [
    {
      id: "openai",
      name: "OpenAI",
      type: "cloud",
      badge: "AI",
      accent: "",
      description: "",
      supports: { chat: true, embeddings: true, vision: true, tools: true },
      defaultBaseUrl: "https://api.openai.com",
      defaultModel: "gpt-4o",
      needsApiKey: true,
      chatPath: "/v1/chat/completions",
      authStyle: "bearer",
      bodyStyle: "openai",
    },
  ],
  getProvider: () => ({
    id: "openai",
    name: "OpenAI",
    type: "cloud",
    badge: "AI",
    accent: "",
    description: "",
    supports: { chat: true, embeddings: true, vision: true, tools: true },
    defaultBaseUrl: "https://api.openai.com",
    defaultModel: "gpt-4o",
    needsApiKey: true,
    chatPath: "/v1/chat/completions",
    authStyle: "bearer",
    bodyStyle: "openai",
  }),
  callProviderChatViaProxy: mockCallProxy,
  ProviderError: class ProviderError extends Error {
    status: number;
    retryAfter?: number;
    constructor(message: string, status: number, retryAfter?: number) {
      super(message);
      this.name = "ProviderError";
      this.status = status;
      this.retryAfter = retryAfter;
    }
  },
  ChatMessage: null as any,
  normalizeMessages: () => [],
  buildBody: () => "{}",
  buildHeaders: () => ({}),
  pickAnthropicDelta: () => "",
  pickOpenAIDelta: () => "",
  pickFinal: () => "",
  callProviderChat: async () => ({ text: "", raw: {} }),
  transcribeAudioViaProxy: async () => "",
  detectProvider: async () => ({ ok: false, error: "" }),
}));

function resetState() {
  mockState.threads = [];
  mockState.activeThreadId = null;
  mockState.threadCounter = 0;
}

vi.mock("@/lib/cockpit-store", () => ({
  store: mockStore,
  useStore: (selector: (s: any) => any) =>
    selector({
      settings: mockSettings,
      threads: mockState.threads,
      activeThreadId: mockState.activeThreadId,
      providerKeyStatus: {},
    }),
  resolveProvider: vi.fn(() => ({
    provider: {
      id: "openai",
      name: "OpenAI",
      defaultBaseUrl: "https://api.openai.com",
      defaultModel: "gpt-4o",
    },
    baseUrl: "https://api.openai.com",
    apiKey: "sk-test",
    model: "gpt-4o",
  })),
  bumpProviderStat: vi.fn(),
  defaultSettings: mockSettings,
  defaultProfile: mockSettings.profile,
  defaultPersonalization: mockSettings.personalization,
  normalizeSettings: (s: any) => ({ ...mockSettings, ...s }),
  deriveInitials: (n: string) => n.slice(0, 2).toUpperCase() || "AI",
  getProviderStats: () => ({}),
  isProviderReady: () => true,
  providerHasKey: () => true,
  PROVIDERS: [],
}));

// ---------------------------------------------------------------------------
// Imports (must come after vi.mock for hoisting to work)
// ---------------------------------------------------------------------------
import { useChat, buildPersonalizationSystemMessage } from "@/hooks/use-chat";
import { ProviderError } from "@/lib/providers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setupGlobals() {
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("crypto", { randomUUID: () => "msg-" + Math.random().toString(36).slice(2, 10) });
  // Setup localStorage mock
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString();
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  })();
  vi.stubGlobal("localStorage", localStorageMock);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockCallProxy.mockReset();
  resetState();
  setupGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildPersonalizationSystemMessage", () => {
  it("returns a system message with role=system", () => {
    const msg = buildPersonalizationSystemMessage(mockSettings as any);
    expect(msg).toBeDefined();
    expect(msg!.role).toBe("system");
    expect(msg!.content).toContain("You are Cockpit");
  });
});

describe("useChat.sendMessage", () => {
  it("creates a new thread if none is active", async () => {
    mockCallProxy.mockResolvedValueOnce({ text: "Hello back!", raw: {} });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(mockState.threads.length).toBeGreaterThanOrEqual(1);
  });

  it("adds a user message to the store", async () => {
    mockCallProxy.mockResolvedValueOnce({ text: "Response", raw: {} });
    const threadId = mockStore.newThread();

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("Hello, AI!");
    });

    const thread = mockState.threads.find((t) => t.id === threadId);
    expect(thread).toBeDefined();
    const userMsg = thread!.messages.find((m: any) => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).toBe("Hello, AI!");
  });

  it("does nothing when input is empty", async () => {
    mockState.activeThreadId = mockStore.newThread();

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("   ");
    });

    const thread = mockState.threads.find((t) => t.id === mockState.activeThreadId);
    expect(thread!.messages.length).toBe(0);
  });

  it("triggers the proxy call", async () => {
    mockCallProxy.mockResolvedValueOnce({ text: "Response", raw: {} });
    mockStore.newThread();

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(mockCallProxy).toHaveBeenCalledTimes(1);
    const callArgs = mockCallProxy.mock.calls[0][0];
    expect(callArgs.stream).toBe(true);
  });
});

describe("useChat.stop", () => {
  it("does not throw when called idle", () => {
    const { result } = renderHook(() => useChat());
    expect(() => result.current.stop()).not.toThrow();
  });
});

describe("useChat.regenerate", () => {
  it("does nothing without an active thread", async () => {
    mockState.activeThreadId = null;
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.regenerate();
    });
  });

  it("does nothing when thread is empty", async () => {
    mockStore.newThread();
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.regenerate();
    });

    expect(mockCallProxy).not.toHaveBeenCalled();
  });
});

describe("useChat initial state", () => {
  it("starts with idle status", () => {
    const { result } = renderHook(() => useChat());
    expect(result.current.status).toBe("idle");
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("exposes all expected return keys", () => {
    const { result } = renderHook(() => useChat());
    expect(result.current).toHaveProperty("messages");
    expect(result.current).toHaveProperty("status");
    expect(result.current).toHaveProperty("isStreaming");
    expect(result.current).toHaveProperty("sendMessage");
    expect(result.current).toHaveProperty("stop");
    expect(result.current).toHaveProperty("regenerate");
  });

  it("has correct initial computed values", () => {
    const { result } = renderHook(() => useChat());
    expect(result.current.isOnline).toBe(true);
    expect(result.current.isCoolingDown).toBe(false);
    expect(result.current.queueSize).toBe(0);
  });
});

describe("useChat error handling", () => {
  it("handles 401 auth error", async () => {
    const onAuthError = vi.fn();
    mockCallProxy.mockRejectedValueOnce(new ProviderError("Invalid API key", 401));

    mockStore.newThread();

    const { result } = renderHook(() => useChat({ onAuthError }));

    await act(async () => {
      await result.current.sendMessage("test");
    });

    expect(result.current.error).toBe("Your API key for OpenAI is invalid. Update it in Settings.");
    expect(result.current.status).toBe("error");
    expect(onAuthError).toHaveBeenCalled();
  });

  it("handles 429 rate limit", async () => {
    mockCallProxy.mockRejectedValueOnce(new ProviderError("Rate limited", 429, 30));

    mockStore.newThread();

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("test");
    });

    expect(result.current.isCoolingDown).toBe(true);
    expect(result.current.cooldownSeconds).toBeGreaterThan(0);
    expect(result.current.status).toBe("error");
  });

  it("handles localStorage unavailability gracefully", async () => {
    vi.stubGlobal("localStorage", undefined);
    mockCallProxy.mockRejectedValueOnce(new Error("Failed to fetch"));
    vi.stubGlobal("navigator", { onLine: false });

    mockStore.newThread();

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("offline");
    });

    expect(result.current.error).toBe("Message could not be saved. Free up space or try again.");
    expect(result.current.status).toBe("error");
    // Should not throw even though localStorage is undefined
  });

  it("handles offline errors", async () => {
    mockCallProxy.mockRejectedValueOnce(new Error("Failed to fetch"));
    vi.stubGlobal("navigator", { onLine: false });

    mockStore.newThread();

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("offline");
    });

    expect(result.current.queueSize).toBeGreaterThan(0);
    expect(result.current.error).toBe("You're offline. Messages will send when you reconnect.");
    expect(result.current.status).toBe("error");
  });

  it("handles generic errors", async () => {
    mockCallProxy.mockRejectedValueOnce(new Error("Boom!"));

    mockStore.newThread();

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("test");
    });

    expect(result.current.error).toBe("Boom!");
    expect(result.current.status).toBe("error");
  });

  it("handles AbortError gracefully", async () => {
    const err = new Error("Aborted");
    err.name = "AbortError";
    mockCallProxy.mockRejectedValueOnce(err);

    mockStore.newThread();

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("test");
    });

    expect(result.current.status).toBe("idle");
  });

  it("processes streaming deltas", async () => {
    mockCallProxy.mockImplementation(async ({ onDelta }: any) => {
      if (onDelta) {
        onDelta("Part 1 ");
        onDelta("Part 2");
      }
      return { text: "Part 1 Part 2", raw: {} };
    });

    const threadId = mockStore.newThread();

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("Stream test");
    });

    const thread = mockState.threads.find((t) => t.id === threadId);
    const asst = thread!.messages.find((m: any) => m.role === "assistant");
    expect(asst).toBeDefined();
    expect(asst!.content).toBe("Part 1 Part 2");
    expect(asst!.pending).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Offline sync
// ---------------------------------------------------------------------------
describe("useChat offline sync", () => {
  it("drains offline queue when reconnecting", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    mockCallProxy.mockResolvedValue({ text: "Response", raw: {} });

    const { result } = renderHook(() => useChat());

    // isOnline should be false after mount
    expect(result.current.isOnline).toBe(false);

    await act(async () => {
      await result.current.sendMessage("offline message");
    });

    expect(result.current.queueSize).toBe(1);
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("You're offline. Messages will send when you reconnect.");

    // Reconnect
    vi.stubGlobal("navigator", { onLine: true });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    // Wait for async queue drain
    await waitFor(() => {
      expect(result.current.queueSize).toBe(0);
    });
    expect(result.current.isOnline).toBe(true);
  });
});
