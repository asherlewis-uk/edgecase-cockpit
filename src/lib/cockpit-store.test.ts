import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  normalizeSettings,
  deriveInitials,
  defaultSettings,
  defaultProfile,
  defaultPersonalization,
  resolveProvider,
  bumpProviderStat,
  recordTokenUsage,
  getProviderStats,
  subscribeProviderStats,
  store,
  __resetHydration,
} from "@/lib/cockpit-store";
import { PROVIDERS } from "@/lib/providers";

// Mock localStorage
const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    get length() {
      return storage.size;
    },
    key: (index: number) => [...storage.keys()][index] ?? null,
  });
  let uuidCounter = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () => {
      const hex = (uuidCounter++).toString(16).padStart(12, "0");
      return `00000000-0000-0000-0000-${hex}`;
    },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// normalizeSettings
// ---------------------------------------------------------------------------
describe("normalizeSettings", () => {
  it("returns default settings for empty input", () => {
    const result = normalizeSettings({});
    expect(result.profile.displayName).toBe(defaultSettings.profile.displayName);
    expect(result.personalization.assistantName).toBe(
      defaultSettings.personalization.assistantName,
    );
    expect(result.activeProviderId).toBe("openai");
    expect(result.providers).toEqual({});
    expect(result.pinnedProviderIds).toEqual([]);
  });

  it("returns default settings for null/undefined", () => {
    const result = normalizeSettings(null);
    expect(result.profile.displayName).toBe(defaultSettings.profile.displayName);
    expect(result.activeProviderId).toBe("openai");
  });

  it("validates activeProviderId against known providers", () => {
    // Known provider ID should be kept
    const result = normalizeSettings({ activeProviderId: "anthropic" });
    expect(result.activeProviderId).toBe("anthropic");

    // Unknown provider ID should fall back to default
    const fallback = normalizeSettings({ activeProviderId: "nonexistent-provider" });
    expect(fallback.activeProviderId).toBe(defaultSettings.activeProviderId);
  });

  it("normalizes profile fields from partial input", () => {
    const result = normalizeSettings({
      profile: { displayName: "TestUser", pronouns: "they/them" },
    });
    expect(result.profile.displayName).toBe("TestUser");
    expect(result.profile.pronouns).toBe("they/them");
    expect(result.profile.roleLabel).toBeUndefined();
    // Initials should be derived from display name
    expect(result.profile.initials).toBe("TE");
  });

  it("normalizes personalization with partial overrides", () => {
    const result = normalizeSettings({
      personalization: { preferredTone: "technical", reduceMotion: true },
    });
    expect(result.personalization.preferredTone).toBe("technical");
    expect(result.personalization.reduceMotion).toBe(true);
    expect(result.personalization.visualMode).toBe(defaultSettings.personalization.visualMode);
    expect(result.personalization.ambientIntensity).toBe(
      defaultSettings.personalization.ambientIntensity,
    );
  });

  it("rejects invalid personalization enum values and falls back to defaults", () => {
    const result = normalizeSettings({
      personalization: { preferredTone: "invalid-tone", visualMode: "invalid-mode" },
    });
    expect(result.personalization.preferredTone).toBe("warm");
    expect(result.personalization.visualMode).toBe("glass");
  });

  it("normalizes providers object", () => {
    const result = normalizeSettings({
      providers: {
        openai: { apiKey: "sk-test", model: "gpt-5" },
        invalid: "not-an-object",
      },
    });
    expect(result.providers.openai).toBeDefined();
    expect(result.providers.openai?.model).toBe("gpt-5");
    // Non-object entries should be filtered out
    expect(result.providers.invalid).toBeUndefined();
  });

  it("sets userName from profile displayName", () => {
    const result = normalizeSettings({ profile: { displayName: "Alice" } });
    expect(result.userName).toBe("Alice");
  });

  it("deduplicates pinned provider ids", () => {
    const result = normalizeSettings({
      pinnedProviderIds: ["openai", "anthropic", "openai"],
    });
    expect(result.pinnedProviderIds).toEqual(["openai", "anthropic"]);
  });

  it("filters non-string values from pinned provider ids", () => {
    const result = normalizeSettings({
      pinnedProviderIds: ["openai", 123, true, "anthropic"],
    });
    expect(result.pinnedProviderIds).toEqual(["openai", "anthropic"]);
  });
});

// ---------------------------------------------------------------------------
// deriveInitials
// ---------------------------------------------------------------------------
describe("deriveInitials", () => {
  it('returns "AI" for empty string', () => {
    expect(deriveInitials("")).toBe("AI");
  });

  it('returns "AI" for whitespace-only string', () => {
    expect(deriveInitials("   ")).toBe("AI");
  });

  it("returns first two letters for single name", () => {
    expect(deriveInitials("Alice")).toBe("AL");
  });

  it("returns first letter of first and last name", () => {
    expect(deriveInitials("Alice Bob")).toBe("AB");
  });

  it("handles multiple names — takes first and last", () => {
    expect(deriveInitials("Alice Bob Charlie")).toBe("AC");
  });

  it("trims whitespace", () => {
    expect(deriveInitials("  Alice  Bob  ")).toBe("AB");
  });

  it("handles single-character name", () => {
    expect(deriveInitials("A")).toBe("A");
  });
});

// ---------------------------------------------------------------------------
// defaultSettings
// ---------------------------------------------------------------------------
describe("defaultSettings", () => {
  it("has all required top-level keys", () => {
    expect(defaultSettings).toHaveProperty("userName");
    expect(defaultSettings).toHaveProperty("profile");
    expect(defaultSettings).toHaveProperty("personalization");
    expect(defaultSettings).toHaveProperty("activeProviderId");
    expect(defaultSettings).toHaveProperty("providers");
    expect(defaultSettings).toHaveProperty("pinnedProviderIds");
  });

  it("defaults activeProviderId to openai", () => {
    expect(defaultSettings.activeProviderId).toBe("openai");
  });

  it("has empty providers by default", () => {
    expect(defaultSettings.providers).toEqual({});
  });

  it("has empty pinnedProviderIds by default", () => {
    expect(defaultSettings.pinnedProviderIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Store operations
// ---------------------------------------------------------------------------
describe("store", () => {
  beforeEach(() => {
    // Reset state by calling clearAll
    store.clearAll();
  });

  describe("newThread", () => {
    it("creates a new thread with correct shape", () => {
      const id = store.newThread();
      const state = store.getState();
      expect(state.threads).toHaveLength(1);
      expect(state.threads[0].id).toBe(id);
      expect(state.threads[0].title).toBe("New chat");
      expect(state.threads[0].messages).toEqual([]);
      expect(state.threads[0].temporary).toBeFalsy();
    });

    it("sets the new thread as active", () => {
      const id = store.newThread();
      expect(store.getState().activeThreadId).toBe(id);
    });

    it("creates a temporary thread when specified", () => {
      store.newThread({ temporary: true });
      expect(store.getState().threads[0].title).toBe("Temporary chat");
      expect(store.getState().threads[0].temporary).toBe(true);
    });
  });

  describe("addMessage", () => {
    it("adds a user message to the thread", () => {
      const threadId = store.newThread();
      store.addMessage(threadId, {
        id: "msg-1",
        role: "user",
        content: "Hello",
        ts: Date.now(),
      });
      const thread = store.getState().threads.find((t) => t.id === threadId);
      expect(thread?.messages).toHaveLength(1);
      expect(thread?.messages[0].role).toBe("user");
      expect(thread?.messages[0].content).toBe("Hello");
    });

    it("auto-titles the thread with the first user message", () => {
      const threadId = store.newThread();
      store.addMessage(threadId, {
        id: "msg-1",
        role: "user",
        content: "Help me understand TypeScript generics",
        ts: Date.now(),
      });
      const thread = store.getState().threads.find((t) => t.id === threadId);
      expect(thread?.title).toBe("Help me understand TypeScript generics");
    });

    it("truncates auto-title to 48 characters", () => {
      const threadId = store.newThread();
      const longText = "A".repeat(100);
      store.addMessage(threadId, {
        id: "msg-1",
        role: "user",
        content: longText,
        ts: Date.now(),
      });
      const thread = store.getState().threads.find((t) => t.id === threadId);
      expect(thread?.title.length).toBe(48);
    });

    it("does not re-title thread on subsequent messages", () => {
      const threadId = store.newThread();
      store.addMessage(threadId, {
        id: "msg-1",
        role: "user",
        content: "First message",
        ts: Date.now(),
      });
      store.addMessage(threadId, {
        id: "msg-2",
        role: "assistant",
        content: "Response",
        ts: Date.now(),
      });
      store.addMessage(threadId, {
        id: "msg-3",
        role: "user",
        content: "Second user message",
        ts: Date.now(),
      });
      const thread = store.getState().threads.find((t) => t.id === threadId);
      expect(thread?.title).toBe("First message");
    });

    it("handles auto-title for video attachments", () => {
      const threadId = store.newThread();
      store.addMessage(threadId, {
        id: "msg-1",
        role: "user",
        content: "",
        ts: Date.now(),
        videoAttachments: ["video1.mp4"],
      });
      const thread = store.getState().threads.find((t) => t.id === threadId);
      expect(thread?.title).toBe("Video chat");
    });

    it("handles auto-title for image attachments", () => {
      const threadId = store.newThread();
      store.addMessage(threadId, {
        id: "msg-1",
        role: "user",
        content: "",
        ts: Date.now(),
        attachments: ["image1.png"],
      });
      const thread = store.getState().threads.find((t) => t.id === threadId);
      expect(thread?.title).toBe("Image chat");
    });
  });

  describe("deleteThread", () => {
    it("removes the thread from state", () => {
      const id = store.newThread();
      expect(store.getState().threads).toHaveLength(1);
      store.deleteThread(id);
      expect(store.getState().threads).toHaveLength(0);
    });

    it("clears activeThreadId when deleting the active thread", () => {
      const id = store.newThread();
      expect(store.getState().activeThreadId).toBe(id);
      store.deleteThread(id);
      expect(store.getState().activeThreadId).toBeNull();
    });

    it("keeps activeThreadId when deleting a non-active thread", () => {
      const id1 = store.newThread();
      const id2 = store.newThread();
      store.selectThread(id1);
      store.deleteThread(id2);
      expect(store.getState().activeThreadId).toBe(id1);
    });
  });

  describe("patchMessage", () => {
    it("updates a message in a thread", () => {
      const threadId = store.newThread();
      store.addMessage(threadId, {
        id: "msg-1",
        role: "user",
        content: "Hello",
        ts: Date.now(),
      });
      store.patchMessage(threadId, "msg-1", { content: "Updated" });
      const thread = store.getState().threads.find((t) => t.id === threadId);
      expect(thread?.messages[0].content).toBe("Updated");
    });

    it("does nothing for unknown thread", () => {
      store.patchMessage("unknown-thread", "msg-1", { content: "Nope" });
      expect(store.getState().threads).toHaveLength(0);
    });

    it("does nothing for unknown message id", () => {
      const threadId = store.newThread();
      store.patchMessage(threadId, "nonexistent", { content: "Nope" });
      const thread = store.getState().threads.find((t) => t.id === threadId);
      expect(thread?.messages).toHaveLength(0);
    });
  });

  describe("updateSettings", () => {
    it("merges partial settings", () => {
      store.updateSettings({ activeProviderId: "anthropic" });
      expect(store.getState().settings.activeProviderId).toBe("anthropic");
      // Other fields should remain at defaults
      expect(store.getState().settings.profile.displayName).toBe(
        defaultSettings.profile.displayName,
      );
    });

    it("merges nested profile fields", () => {
      store.updateSettings({
        profile: { displayName: "NewName" },
      });
      expect(store.getState().settings.profile.displayName).toBe("NewName");
      expect(store.getState().settings.userName).toBe("NewName");
    });
  });

  describe("updateProfile", () => {
    it("updates profile through updateSettings", () => {
      store.updateProfile({ displayName: "Custom", pronouns: "they/them" });
      const state = store.getState();
      expect(state.settings.profile.displayName).toBe("Custom");
      expect(state.settings.profile.pronouns).toBe("they/them");
    });
  });

  describe("updatePersonalization", () => {
    it("updates personalization through updateSettings", () => {
      store.updatePersonalization({ preferredTone: "minimal", reduceMotion: true });
      const state = store.getState();
      expect(state.settings.personalization.preferredTone).toBe("minimal");
      expect(state.settings.personalization.reduceMotion).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// resolveProvider
// ---------------------------------------------------------------------------
describe("resolveProvider", () => {
  it("returns the correct provider config for known ID", () => {
    const settings = {
      ...defaultSettings,
      providers: {
        openai: { apiKey: "sk-test-key", model: "gpt-4o" },
      },
    };
    const result = resolveProvider(settings, "openai");
    expect(result.provider.id).toBe("openai");
    expect(result.apiKey).toBe("sk-test-key");
    expect(result.model).toBe("gpt-4o");
    // OpenAI defaultBaseUrl is https://api.openai.com (chatPath: /v1/chat/completions)
    expect(result.baseUrl).toBe("https://api.openai.com");
  });

  it("falls back to active provider when no id given", () => {
    const settings = {
      ...defaultSettings,
      activeProviderId: "anthropic",
    };
    const result = resolveProvider(settings);
    expect(result.provider.id).toBe("anthropic");
  });

  it("falls back to first provider for unknown ids", () => {
    const result = resolveProvider(defaultSettings, "nonexistent");
    expect(result.provider.id).toBe(PROVIDERS[0].id);
  });

  it("uses overridden baseUrl when provided", () => {
    const settings = {
      ...defaultSettings,
      providers: {
        openai: { apiKey: "sk-test", baseUrl: "https://my-proxy.example.com/v1" },
      },
    };
    const result = resolveProvider(settings, "openai");
    expect(result.baseUrl).toBe("https://my-proxy.example.com/v1");
  });

  it("strips trailing slashes from baseUrl", () => {
    const settings = {
      ...defaultSettings,
      providers: {
        openai: { apiKey: "sk-test", baseUrl: "https://api.openai.com/v1///" },
      },
    };
    const result = resolveProvider(settings, "openai");
    expect(result.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("uses default model when none specified", () => {
    const settings = {
      ...defaultSettings,
      providers: {
        openai: { apiKey: "sk-test" },
      },
    };
    const result = resolveProvider(settings, "openai");
    expect(result.model).toBe(PROVIDERS.find((p) => p.id === "openai")?.defaultModel);
  });
});

// ---------------------------------------------------------------------------
// bumpProviderStat
// ---------------------------------------------------------------------------
describe("bumpProviderStat", () => {
  it("increments call count for a new provider", () => {
    bumpProviderStat("openai", "call");
    const stats = getProviderStats();
    expect(stats.openai).toEqual({ calls: 1, errors: 0 });
  });

  it("increments error count", () => {
    bumpProviderStat("openai", "error");
    const stats = getProviderStats();
    expect(stats.openai).toEqual({ calls: 0, errors: 1 });
  });

  it("accumulates calls across multiple bumps", () => {
    bumpProviderStat("openai", "call");
    bumpProviderStat("openai", "call");
    bumpProviderStat("openai", "error");
    const stats = getProviderStats();
    expect(stats.openai).toEqual({ calls: 2, errors: 1 });
  });

  it("tracks multiple providers independently", () => {
    bumpProviderStat("openai", "call");
    bumpProviderStat("anthropic", "error");
    const stats = getProviderStats();
    expect(stats.openai).toEqual({ calls: 1, errors: 0 });
    expect(stats.anthropic).toEqual({ calls: 0, errors: 1 });
  });
});

// ---------------------------------------------------------------------------
// recordTokenUsage
// ---------------------------------------------------------------------------
describe("recordTokenUsage", () => {
  it("records input and output tokens for a provider", () => {
    recordTokenUsage("openai", 100, 50);
    const stats = getProviderStats();
    expect(stats.openai).toEqual({ calls: 0, errors: 0, inputTokens: 100, outputTokens: 50 });
  });

  it("accumulates tokens across multiple records", () => {
    recordTokenUsage("openai", 100, 50);
    recordTokenUsage("openai", 200, 100);
    const stats = getProviderStats();
    expect(stats.openai).toEqual({ calls: 0, errors: 0, inputTokens: 300, outputTokens: 150 });
  });

  it("tracks tokens independently per provider", () => {
    recordTokenUsage("openai", 100, 50);
    recordTokenUsage("anthropic", 300, 150);
    const stats = getProviderStats();
    expect(stats.openai).toEqual({ calls: 0, errors: 0, inputTokens: 100, outputTokens: 50 });
    expect(stats.anthropic).toEqual({ calls: 0, errors: 0, inputTokens: 300, outputTokens: 150 });
  });
});

// ---------------------------------------------------------------------------
// Device-local import/export — no server calls required
// ---------------------------------------------------------------------------
describe("manual import/export locality", () => {
  it("exportThread returns local data without any fetch calls", () => {
    const threadId = store.newThread();
    store.addMessage(threadId, { id: "m1", role: "user", content: "Hello export", ts: 1 });
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockClear();
    const exported = store.exportThread(threadId, "json");
    expect(exported).not.toBeNull();
    const parsed = JSON.parse(exported!);
    // JSON format wraps the thread: { thread: { id, title, messages, ... } }
    expect(parsed.thread).toHaveProperty("id", threadId);
    expect(parsed.thread.messages[0].content).toBe("Hello export");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("importThreads writes to local state without any fetch calls", () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockClear();
    const thread = {
      id: "imported-1",
      title: "Imported Thread",
      messages: [{ id: "m1", role: "user" as const, content: "Imported msg", ts: 1 }],
      ts: 1,
      updatedAt: 1,
      archived: false,
      pinned: false,
      temporary: false,
    };
    store.importThreads([thread]);
    const found = store.getState().threads.find((t) => t.title === "Imported Thread");
    expect(found).toBeDefined();
    expect(found!.messages[0].content).toBe("Imported msg");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("importThreads does not call the server", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockClear();
    const thread = {
      id: "imported-2",
      title: "Imported Thread 2",
      messages: [],
      ts: 2,
      updatedAt: 2,
      archived: false,
      pinned: false,
      temporary: false,
    };
    store.importThreads([thread]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cross-tab sync
// ---------------------------------------------------------------------------
describe("cross-tab stats sync", () => {
  it("subscribeProviderStats is notified when stats change locally", () => {
    let notified = false;
    const unsub = subscribeProviderStats(() => {
      notified = true;
    });
    bumpProviderStat("test-cross-tab", "call");
    expect(notified).toBe(true);
    unsub();
  });

  it("subscribeProviderStats unsubscribe stops notifications", () => {
    let count = 0;
    const unsub = subscribeProviderStats(() => {
      count++;
    });
    bumpProviderStat("test-unsub", "call");
    unsub();
    bumpProviderStat("test-unsub", "call");
    expect(count).toBe(1); // only notified once before unsub
  });

  it("provider keys are not stored in the STATS_KEY localStorage entry", () => {
    bumpProviderStat("openai", "call");
    recordTokenUsage("openai", 100, 50);
    const raw = storage.get("cockpit.provider-stats.v1");
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    // Stats must only contain call counts and token numbers — no API key material
    const statsEntry = parsed.openai;
    expect(statsEntry).not.toHaveProperty("apiKey");
    expect(statsEntry).not.toHaveProperty("key");
    expect(statsEntry).not.toHaveProperty("secret");
    expect(statsEntry.calls).toBeDefined();
  });

  it("STATS_KEY storage event triggers statsListeners in setupCrossTabSync", () => {
    // Capture the storage handler by providing a window that records the callback
    let capturedStorageHandler: ((e: StorageEvent) => void) | null = null;
    vi.stubGlobal("window", {
      addEventListener: vi.fn((event: string, cb: (e: StorageEvent) => void) => {
        if (event === "storage") capturedStorageHandler = cb;
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    // Reset hydration so setupCrossTabSync runs again with our new window mock
    __resetHydration();
    store.getState(); // triggers hydrate() → setupCrossTabSync()

    // Verify the storage handler was registered
    expect(capturedStorageHandler).not.toBeNull();

    // Set up a stats subscriber
    let notifiedCount = 0;
    const unsub = subscribeProviderStats(() => {
      notifiedCount++;
    });

    // Simulate a STATS_KEY change event from another tab
    capturedStorageHandler!(
      new StorageEvent("storage", {
        key: "cockpit.provider-stats.v1",
        newValue: JSON.stringify({ openai: { calls: 3, errors: 0 } }),
      }),
    );

    expect(notifiedCount).toBe(1);
    unsub();
  });
});

// ---------------------------------------------------------------------------
// costOverrides
// ---------------------------------------------------------------------------
describe("costOverrides", () => {
  it("defaults costOverrides to empty object", () => {
    expect(defaultSettings.costOverrides).toEqual({});
  });

  it("normalizeSettings preserves valid costOverrides", () => {
    const result = normalizeSettings({
      costOverrides: { openai: { input: 0.001, output: 0.002 } },
    });
    expect(result.costOverrides?.openai?.input).toBe(0.001);
    expect(result.costOverrides?.openai?.output).toBe(0.002);
  });

  it("normalizeSettings falls back to empty object for invalid costOverrides", () => {
    const result = normalizeSettings({ costOverrides: "invalid" });
    expect(result.costOverrides).toEqual({});
  });

  it("normalizeSettings falls back to empty object for null costOverrides", () => {
    const result = normalizeSettings({ costOverrides: null });
    expect(result.costOverrides).toEqual({});
  });

  it("store.updateSettings persists costOverrides", () => {
    store.updateSettings({ costOverrides: { anthropic: { input: 0.005 } } });
    const state = store.getState();
    expect(state.settings.costOverrides?.anthropic?.input).toBe(0.005);
  });

  it("resetting costOverrides to empty clears all overrides", () => {
    store.updateSettings({ costOverrides: { openai: { input: 0.001 } } });
    store.updateSettings({ costOverrides: {} });
    const state = store.getState();
    expect(Object.keys(state.settings.costOverrides ?? {})).toHaveLength(0);
  });

  it("provider keys are not included in costOverrides", () => {
    store.updateSettings({
      costOverrides: { openai: { input: 0.001 } },
    });
    const raw = storage.get("cockpit.settings.v2");
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    // Cost overrides should not contain API key material
    const costJson = JSON.stringify(parsed.costOverrides ?? {});
    expect(costJson).not.toContain("apiKey");
    expect(costJson).not.toContain("secret");
  });
});

// ---------------------------------------------------------------------------
// Thread persistence after reload
// ---------------------------------------------------------------------------
describe("thread persistence after reload", () => {
  beforeEach(() => {
    __resetHydration();
    storage.clear();
    store.clearAll();
    __resetHydration();
  });

  it("recovers threads and messages from localStorage after reload", () => {
    const threadId = store.newThread();
    store.addMessage(threadId, {
      id: "msg-1",
      role: "user",
      content: "Hello",
      ts: Date.now(),
    });
    store.addMessage(threadId, {
      id: "msg-2",
      role: "assistant",
      content: "Hi there",
      ts: Date.now(),
    });

    // Verify localStorage has the data
    const rawThreads = storage.get("cockpit.threads.v1");
    expect(rawThreads).toBeDefined();
    const parsed = JSON.parse(rawThreads!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].messages).toHaveLength(2);

    // Simulate reload
    __resetHydration();
    const state = store.getState();

    expect(state.threads).toHaveLength(1);
    expect(state.threads[0].messages).toHaveLength(2);
    expect(state.threads[0].messages[0].content).toBe("Hello");
    expect(state.threads[0].messages[0].role).toBe("user");
    expect(state.threads[0].messages[1].content).toBe("Hi there");
    expect(state.threads[0].messages[1].role).toBe("assistant");
  });
});
