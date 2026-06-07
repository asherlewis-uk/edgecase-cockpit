import { useSyncExternalStore } from "react";
import { PROVIDERS, getProvider, type ProviderDef } from "@/lib/providers";
import type { ToolCall, ToolResult } from "@/lib/tools";

export type ProviderConfig = {
  apiKey: string;
  baseUrl?: string; // override; falls back to provider.defaultBaseUrl
  model?: string; // override; falls back to provider.defaultModel
};

export type UserProfile = {
  displayName: string;
  handle?: string;
  avatarDataUrl?: string;
  initials?: string;
  pronouns?: string;
  roleLabel?: string;
};

export type Personalization = {
  assistantName: string;
  preferredTone: "direct" | "warm" | "technical" | "minimal";
  defaultPromptPlaceholder: string;
  visualMode: "dark" | "glass" | "solid";
  ambientIntensity: "low" | "medium" | "high";
  reduceMotion: boolean;
  showProviderInGreeting: boolean;
  showModelInGreeting: boolean;
  rememberLastProvider: boolean;
};

export type KeyboardShortcuts = {
  enabled: {
    commandPalette: boolean;
    newThread: boolean;
    sendMessage: boolean;
    help: boolean;
    escapeActions: boolean;
  };
  forceCtrl: boolean;
};

export type RagSettings = {
  enabled: boolean;
  providerId: string;
  model?: string;
};

export type Settings = {
  /** Legacy field retained for saved-settings migration compatibility. */
  userName: string;
  profile: UserProfile;
  personalization: Personalization;
  keyboardShortcuts: KeyboardShortcuts;
  rag: RagSettings;
  activeProviderId: string;
  providers: Record<string, ProviderConfig>;
  pinnedProviderIds: string[];
};

export type Message = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  providerId?: string;
  providerName?: string;
  cached?: boolean;
  error?: boolean;
  pending?: boolean;
  timestamp?: number;
  ts: number;
  attachments?: string[];
  videoAttachments?: string[];
  assistantImages?: string[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
};

export type Thread = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  temporary?: boolean;
  pinned?: boolean;
  archived?: boolean;
  color?: string;
};

function titleForFirstUserMessage(msg: Message) {
  const text = msg.content.trim();
  if (text) return text.slice(0, 48);
  if (msg.videoAttachments?.length) return "Video chat";
  if (msg.attachments?.length) return "Image chat";
  return "New chat";
}

const SETTINGS_KEY = "cockpit.settings.v2";
const THREADS_KEY = "cockpit.threads.v1";
const STATS_KEY = "cockpit.provider-stats.v1";

export type ProviderStat = {
  calls: number;
  errors: number;
  inputTokens?: number;
  outputTokens?: number;
};
type StatsMap = Record<string, ProviderStat>;

function loadStats(): StatsMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveStats(s: StatsMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}
export function getProviderStats(): StatsMap {
  return loadStats();
}
export function bumpProviderStat(id: string, kind: "call" | "error") {
  const s = loadStats();
  const cur = s[id] ?? { calls: 0, errors: 0 };
  if (kind === "call") cur.calls++;
  else cur.errors++;
  s[id] = cur;
  saveStats(s);
  statsListeners.forEach((l) => l());
}
export function recordTokenUsage(id: string, inputTokens: number, outputTokens: number) {
  const s = loadStats();
  const cur = s[id] ?? { calls: 0, errors: 0 };
  cur.inputTokens = (cur.inputTokens ?? 0) + inputTokens;
  cur.outputTokens = (cur.outputTokens ?? 0) + outputTokens;
  s[id] = cur;
  saveStats(s);
  statsListeners.forEach((l) => l());
}
export async function syncTokenUsageToServer(
  providerId: string,
  inputTokens: number,
  outputTokens: number,
  model?: string,
  threadId?: string,
) {
  try {
    await fetch("/api/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({
        providerId,
        kind: "call",
        inputTokens,
        outputTokens,
        model,
        threadId,
      }),
    });
  } catch {
    /* ignore network errors; local stats are source of truth */
  }
}
export function resetProviderStats() {
  saveStats({});
  statsListeners.forEach((l) => l());
}
const statsListeners = new Set<() => void>();
export function subscribeProviderStats(l: () => void) {
  statsListeners.add(l);
  return () => statsListeners.delete(l);
}

export function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AI";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export const defaultProfile: UserProfile = {
  displayName: "friend",
  initials: "AI",
};

export const defaultPersonalization: Personalization = {
  assistantName: "Cockpit",
  preferredTone: "warm",
  defaultPromptPlaceholder: "Message",
  visualMode: "glass",
  ambientIntensity: "medium",
  reduceMotion: false,
  showProviderInGreeting: true,
  showModelInGreeting: true,
  rememberLastProvider: true,
};

export const defaultKeyboardShortcuts: KeyboardShortcuts = {
  enabled: {
    commandPalette: true,
    newThread: true,
    sendMessage: true,
    help: true,
    escapeActions: true,
  },
  forceCtrl: false,
};

export const defaultRagSettings: RagSettings = {
  enabled: false,
  providerId: "openai",
};

export const defaultSettings: Settings = {
  userName: defaultProfile.displayName,
  profile: defaultProfile,
  personalization: defaultPersonalization,
  keyboardShortcuts: defaultKeyboardShortcuts,
  rag: defaultRagSettings,
  activeProviderId: "openai",
  providers: {},
  pinnedProviderIds: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeProfile(raw: unknown, legacyUserName?: string): UserProfile {
  const source = isRecord(raw) ? raw : {};
  const displayName =
    nonEmptyString(source.displayName) ??
    nonEmptyString(legacyUserName) ??
    defaultProfile.displayName;
  const fallbackInitials =
    displayName === defaultProfile.displayName
      ? defaultProfile.initials
      : deriveInitials(displayName);
  const avatarDataUrl = optionalString(source.avatarDataUrl);

  return {
    displayName,
    handle: optionalString(source.handle),
    avatarDataUrl: avatarDataUrl?.startsWith("data:image/") ? avatarDataUrl : undefined,
    initials: nonEmptyString(source.initials) ?? fallbackInitials,
    pronouns: optionalString(source.pronouns),
    roleLabel: optionalString(source.roleLabel),
  };
}

function normalizePersonalization(raw: unknown): Personalization {
  const source = isRecord(raw) ? raw : {};
  return {
    assistantName: nonEmptyString(source.assistantName) ?? defaultPersonalization.assistantName,
    preferredTone: oneOf(
      source.preferredTone,
      ["direct", "warm", "technical", "minimal"] as const,
      defaultPersonalization.preferredTone,
    ),
    defaultPromptPlaceholder:
      nonEmptyString(source.defaultPromptPlaceholder) ??
      defaultPersonalization.defaultPromptPlaceholder,
    visualMode: oneOf(
      source.visualMode,
      ["dark", "glass", "solid"] as const,
      defaultPersonalization.visualMode,
    ),
    ambientIntensity: oneOf(
      source.ambientIntensity,
      ["low", "medium", "high"] as const,
      defaultPersonalization.ambientIntensity,
    ),
    reduceMotion:
      typeof source.reduceMotion === "boolean"
        ? source.reduceMotion
        : defaultPersonalization.reduceMotion,
    showProviderInGreeting:
      typeof source.showProviderInGreeting === "boolean"
        ? source.showProviderInGreeting
        : defaultPersonalization.showProviderInGreeting,
    showModelInGreeting:
      typeof source.showModelInGreeting === "boolean"
        ? source.showModelInGreeting
        : defaultPersonalization.showModelInGreeting,
    rememberLastProvider:
      typeof source.rememberLastProvider === "boolean"
        ? source.rememberLastProvider
        : defaultPersonalization.rememberLastProvider,
  };
}

function normalizeKeyboardShortcuts(raw: unknown): KeyboardShortcuts {
  const source = isRecord(raw) ? raw : {};
  const enabled = isRecord(source.enabled) ? source.enabled : defaultKeyboardShortcuts.enabled;
  return {
    enabled: {
      commandPalette:
        typeof enabled.commandPalette === "boolean"
          ? enabled.commandPalette
          : defaultKeyboardShortcuts.enabled.commandPalette,
      newThread:
        typeof enabled.newThread === "boolean"
          ? enabled.newThread
          : defaultKeyboardShortcuts.enabled.newThread,
      sendMessage:
        typeof enabled.sendMessage === "boolean"
          ? enabled.sendMessage
          : defaultKeyboardShortcuts.enabled.sendMessage,
      help:
        typeof enabled.help === "boolean" ? enabled.help : defaultKeyboardShortcuts.enabled.help,
      escapeActions:
        typeof enabled.escapeActions === "boolean"
          ? enabled.escapeActions
          : defaultKeyboardShortcuts.enabled.escapeActions,
    },
    forceCtrl:
      typeof source.forceCtrl === "boolean" ? source.forceCtrl : defaultKeyboardShortcuts.forceCtrl,
  };
}

function normalizeRagSettings(raw: unknown): RagSettings {
  const source = isRecord(raw) ? raw : {};
  const providerIdCandidate = optionalString(source.providerId);
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : defaultRagSettings.enabled,
    providerId:
      providerIdCandidate && PROVIDERS.some((p) => p.id === providerIdCandidate)
        ? providerIdCandidate
        : defaultRagSettings.providerId,
    model: optionalString(source.model),
  };
}

function normalizeProviders(raw: unknown): Record<string, ProviderConfig> {
  if (!isRecord(raw)) return {};
  const providers: Record<string, ProviderConfig> = {};
  for (const [id, cfg] of Object.entries(raw)) {
    if (!isRecord(cfg)) continue;
    const next: ProviderConfig = { apiKey: "" };
    const baseUrl = optionalString(cfg.baseUrl);
    const model = optionalString(cfg.model);
    if (baseUrl !== undefined) next.baseUrl = baseUrl;
    if (model !== undefined) next.model = model;
    providers[id] = next;
  }
  return providers;
}

function normalizePinnedProviderIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((id): id is string => typeof id === "string")));
}

export function normalizeSettings(raw: Partial<Settings> | unknown): Settings {
  const source = isRecord(raw) ? raw : {};
  const profile = normalizeProfile(source.profile, optionalString(source.userName));
  const activeProviderCandidate = optionalString(source.activeProviderId);
  const activeProviderId =
    activeProviderCandidate && PROVIDERS.some((p) => p.id === activeProviderCandidate)
      ? activeProviderCandidate
      : defaultSettings.activeProviderId;

  return {
    userName: profile.displayName,
    profile,
    personalization: normalizePersonalization(source.personalization),
    keyboardShortcuts: normalizeKeyboardShortcuts(source.keyboardShortcuts),
    rag: normalizeRagSettings(source.rag),
    activeProviderId,
    providers: normalizeProviders(source.providers),
    pinnedProviderIds: normalizePinnedProviderIds(source.pinnedProviderIds),
  };
}

function readJson(key: string): unknown {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

type LegacyProviderKey = {
  providerId: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
};

function extractLegacyProviderKeys(raw: unknown): LegacyProviderKey[] {
  if (!isRecord(raw) || !isRecord(raw.providers)) return [];
  return Object.entries(raw.providers).flatMap(([providerId, cfg]) => {
    if (!isRecord(cfg) || !nonEmptyString(cfg.apiKey)) return [];
    return [
      {
        providerId,
        apiKey: nonEmptyString(cfg.apiKey) ?? "",
        baseUrl: optionalString(cfg.baseUrl),
        model: optionalString(cfg.model),
      },
    ];
  });
}

function readArr<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

type State = {
  settings: Settings;
  threads: Thread[];
  activeThreadId: string | null;
  /** Runtime-only: which provider ids have a key stored server-side. */
  providerKeyStatus: Record<string, boolean>;
};

let state: State = {
  settings: defaultSettings,
  threads: [],
  activeThreadId: null,
  providerKeyStatus: {},
};
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const rawSettings = readJson(SETTINGS_KEY);
  const legacyProviderKeys = extractLegacyProviderKeys(rawSettings);
  state = {
    settings: normalizeSettings(rawSettings),
    threads: readArr<Thread>(THREADS_KEY),
    activeThreadId: null,
    providerKeyStatus: {},
  };
  setupCrossTabSync();
  persist();
  // Migrate any legacy apiKeys persisted in localStorage to the server session,
  // then keep local settings stripped. Fire-and-forget; UI updates via emit().
  void migrateLocalKeysToServer(legacyProviderKeys);
  // Fetch server-side key status to populate readiness indicators.
  void refreshProviderKeyStatus();
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  if (typeof window === "undefined") return;
  // Strip apiKey before persisting — keys live server-side only.
  const safeProviders: Record<string, ProviderConfig> = {};
  for (const [id, cfg] of Object.entries(state.settings.providers)) {
    safeProviders[id] = { ...cfg, apiKey: "" };
  }
  const safeSettings = {
    ...state.settings,
    userName: state.settings.profile.displayName,
    activeProviderId: state.settings.personalization.rememberLastProvider
      ? state.settings.activeProviderId
      : defaultSettings.activeProviderId,
    providers: safeProviders,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(safeSettings));
  localStorage.setItem(THREADS_KEY, JSON.stringify(state.threads.filter((t) => !t.temporary)));
}

function setupCrossTabSync() {
  if (typeof window === "undefined") return;
  window.addEventListener("storage", (e) => {
    if (e.key === SETTINGS_KEY && e.newValue) {
      try {
        state = {
          ...state,
          settings: normalizeSettings(JSON.parse(e.newValue)),
        };
        emit();
      } catch {
        /* ignore */
      }
    }
    if (e.key === THREADS_KEY && e.newValue) {
      try {
        state = { ...state, threads: JSON.parse(e.newValue) };
        emit();
      } catch {
        /* ignore */
      }
    }
  });
}

export const store = {
  getState: () => {
    hydrate();
    return state;
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  updateSettings(patch: Partial<Settings>) {
    state = {
      ...state,
      settings: normalizeSettings({
        ...state.settings,
        ...patch,
        profile: patch.profile
          ? { ...state.settings.profile, ...patch.profile }
          : state.settings.profile,
        personalization: patch.personalization
          ? { ...state.settings.personalization, ...patch.personalization }
          : state.settings.personalization,
        providers: patch.providers
          ? { ...state.settings.providers, ...patch.providers }
          : state.settings.providers,
        pinnedProviderIds: patch.pinnedProviderIds ?? state.settings.pinnedProviderIds,
        keyboardShortcuts: patch.keyboardShortcuts
          ? {
              ...state.settings.keyboardShortcuts,
              ...patch.keyboardShortcuts,
              enabled: patch.keyboardShortcuts.enabled
                ? {
                    ...state.settings.keyboardShortcuts.enabled,
                    ...patch.keyboardShortcuts.enabled,
                  }
                : state.settings.keyboardShortcuts.enabled,
            }
          : state.settings.keyboardShortcuts,
      }),
    };
    persist();
    emit();
  },
  updateProfile(patch: Partial<UserProfile>) {
    this.updateSettings({
      profile: { ...state.settings.profile, ...patch },
    });
  },
  updatePersonalization(patch: Partial<Personalization>) {
    this.updateSettings({
      personalization: { ...state.settings.personalization, ...patch },
    });
  },
  updateKeyboardShortcuts(
    patch: Partial<Omit<KeyboardShortcuts, "enabled">> & {
      enabled?: Partial<KeyboardShortcuts["enabled"]>;
    },
  ) {
    this.updateSettings({
      keyboardShortcuts: {
        ...state.settings.keyboardShortcuts,
        ...patch,
        enabled: {
          ...state.settings.keyboardShortcuts.enabled,
          ...(patch.enabled ?? {}),
        },
      },
    });
  },
  resetProfile() {
    this.updateSettings({
      profile: defaultProfile,
      userName: defaultProfile.displayName,
    });
  },
  resetPersonalization() {
    this.updateSettings({ personalization: defaultPersonalization });
  },
  resetKeyboardShortcuts() {
    this.updateSettings({ keyboardShortcuts: defaultKeyboardShortcuts });
  },
  setActiveProvider(id: string) {
    this.updateSettings({ activeProviderId: id });
  },
  updateProviderConfig(id: string, patch: Partial<ProviderConfig>) {
    const cur = state.settings.providers[id] ?? { apiKey: "" };
    this.updateSettings({
      providers: { ...state.settings.providers, [id]: { ...cur, ...patch } },
    });
  },
  togglePinned(id: string) {
    const pinned = state.settings.pinnedProviderIds.includes(id)
      ? state.settings.pinnedProviderIds.filter((x) => x !== id)
      : [...state.settings.pinnedProviderIds, id];
    this.updateSettings({ pinnedProviderIds: pinned });
  },
  newThread(opts?: { temporary?: boolean }): string {
    const t: Thread = {
      id: crypto.randomUUID(),
      title: opts?.temporary ? "Temporary chat" : "New chat",
      messages: [],
      updatedAt: Date.now(),
      temporary: opts?.temporary,
      pinned: false,
      archived: false,
    };
    state = {
      ...state,
      threads: [t, ...state.threads],
      activeThreadId: t.id,
    };
    persist();
    emit();
    return t.id;
  },
  selectThread(id: string | null) {
    state = { ...state, activeThreadId: id };
    emit();
  },
  renameThread(id: string, title: string) {
    state = {
      ...state,
      threads: state.threads.map((t) => (t.id === id ? { ...t, title } : t)),
    };
    persist();
    emit();
  },
  setThreadTemporary(id: string, temporary: boolean) {
    state = {
      ...state,
      threads: state.threads.map((t) => (t.id === id ? { ...t, temporary } : t)),
    };
    persist();
    emit();
  },
  duplicateThread(id: string): string | null {
    const source = state.threads.find((t) => t.id === id);
    if (!source) return null;
    const copy: Thread = {
      ...source,
      id: crypto.randomUUID(),
      title: `Copy of ${source.title}`,
      messages: source.messages.map((m) => ({ ...m })),
      updatedAt: Date.now(),
      temporary: false,
      pinned: false,
      archived: false,
    };
    state = {
      ...state,
      threads: [copy, ...state.threads],
      activeThreadId: copy.id,
    };
    persist();
    emit();
    return copy.id;
  },
  pinThread(id: string) {
    state = {
      ...state,
      threads: state.threads.map((t) => (t.id === id ? { ...t, pinned: true } : t)),
    };
    persist();
    emit();
  },
  unpinThread(id: string) {
    state = {
      ...state,
      threads: state.threads.map((t) => (t.id === id ? { ...t, pinned: false } : t)),
    };
    persist();
    emit();
  },
  archiveThread(id: string) {
    state = {
      ...state,
      threads: state.threads.map((t) => (t.id === id ? { ...t, archived: true } : t)),
      activeThreadId: state.activeThreadId === id ? null : state.activeThreadId,
    };
    persist();
    emit();
  },
  unarchiveThread(id: string) {
    state = {
      ...state,
      threads: state.threads.map((t) => (t.id === id ? { ...t, archived: false } : t)),
    };
    persist();
    emit();
  },
  setThreadColor(id: string, color: string) {
    state = {
      ...state,
      threads: state.threads.map((t) => (t.id === id ? { ...t, color } : t)),
    };
    persist();
    emit();
  },
  reorderThreads(fromIndex: number, toIndex: number) {
    const next = [...state.threads];
    const [item] = next.splice(fromIndex, 1);
    if (!item) return;
    next.splice(toIndex, 0, item);
    state = { ...state, threads: next };
    persist();
    emit();
  },
  deleteThread(id: string) {
    state = {
      ...state,
      threads: state.threads.filter((t) => t.id !== id),
      activeThreadId: state.activeThreadId === id ? null : state.activeThreadId,
    };
    persist();
    emit();
  },
  setThreadMessages(threadId: string, messages: Message[]) {
    state = {
      ...state,
      threads: state.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              messages,
              updatedAt: Date.now(),
            }
          : t,
      ),
    };
    persist();
    emit();
  },
  addMessage(threadId: string, msg: Message) {
    state = {
      ...state,
      threads: state.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              messages: [...t.messages, msg],
              updatedAt: Date.now(),
              title:
                t.messages.length === 0 && msg.role === "user"
                  ? titleForFirstUserMessage(msg)
                  : t.title,
            }
          : t,
      ),
    };
    persist();
    emit();
  },
  deleteMessage(threadId: string, id: string) {
    state = {
      ...state,
      threads: state.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              messages: t.messages.filter((m) => m.id !== id),
              updatedAt: Date.now(),
            }
          : t,
      ),
    };
    persist();
    emit();
  },
  clearThreadMessages(threadId: string) {
    this.setThreadMessages(threadId, []);
  },
  patchMessage(threadId: string, id: string, patch: Partial<Message>) {
    state = {
      ...state,
      threads: state.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              messages: t.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
            }
          : t,
      ),
    };
    persist();
    emit();
  },
  exportThread(id: string, format: "json" | "markdown" | "txt" = "json"): string | null {
    const thread = state.threads.find((t) => t.id === id);
    if (!thread) return null;
    if (format === "json") return JSON.stringify({ thread }, null, 2);
    if (format === "markdown") {
      return [
        `# ${thread.title}`,
        "",
        ...thread.messages.flatMap((m) => [`## ${m.role}`, "", m.content || "_no content_", ""]),
      ].join("\n");
    }
    return thread.messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n");
  },
  importThreads(threads: Thread[]) {
    const now = Date.now();
    const next = threads.map((t) => ({
      ...t,
      id: t.id || crypto.randomUUID(),
      updatedAt: t.updatedAt || now,
      pinned: !!t.pinned,
      archived: !!t.archived,
    }));
    state = { ...state, threads: [...next, ...state.threads] };
    persist();
    emit();
  },
  mergeThreads(sourceId: string, targetId: string) {
    const source = state.threads.find((t) => t.id === sourceId);
    const target = state.threads.find((t) => t.id === targetId);
    if (!source || !target || source.id === target.id) return;
    const mergedMessages = [...target.messages, ...source.messages].sort((a, b) => a.ts - b.ts);
    state = {
      ...state,
      threads: state.threads
        .filter((t) => t.id !== sourceId)
        .map((t) =>
          t.id === targetId
            ? {
                ...t,
                messages: mergedMessages,
                updatedAt: Date.now(),
              }
            : t,
        ),
      activeThreadId: state.activeThreadId === sourceId ? targetId : state.activeThreadId,
    };
    persist();
    emit();
  },
  searchThreads(query: string): Thread[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return state.threads;
    return state.threads.filter(
      (t) =>
        t.title.toLowerCase().includes(needle) ||
        t.messages.some((m) => m.content.toLowerCase().includes(needle)),
    );
  },
  getTotalTokens(): number {
    return state.threads.reduce(
      (sum, t) =>
        sum + t.messages.reduce((messageSum, m) => messageSum + Math.ceil(m.content.length / 4), 0),
      0,
    );
  },
  getThreadCount(): number {
    return state.threads.length;
  },
  getMessageCount(): number {
    return state.threads.reduce((sum, t) => sum + t.messages.length, 0);
  },
  clearAll() {
    state = {
      settings: normalizeSettings(defaultSettings),
      threads: [],
      activeThreadId: null,
      providerKeyStatus: {},
    };
    persist();
    emit();
    void fetch("/api/keys/clear", { method: "POST" });
  },
};

async function migrateLocalKeysToServer(entries: LegacyProviderKey[]) {
  if (entries.length === 0) return;
  await Promise.all(
    entries.map((cfg) =>
      fetch("/api/keys/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: cfg.providerId,
          apiKey: cfg.apiKey,
          baseUrl: cfg.baseUrl,
          model: cfg.model,
        }),
      }).catch(() => null),
    ),
  );
  persist();
  emit();
  await refreshProviderKeyStatus();
}

export async function refreshProviderKeyStatus() {
  try {
    const res = await fetch("/api/keys/status");
    if (!res.ok) return;
    const json = (await res.json()) as { providers: Record<string, { hasKey: boolean }> };
    const map: Record<string, boolean> = {};
    for (const [id, v] of Object.entries(json.providers ?? {})) map[id] = !!v.hasKey;
    state = { ...state, providerKeyStatus: map };
    emit();
  } catch {
    /* ignore */
  }
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(state),
  );
}

// Resolve effective config for a provider.
export function resolveProvider(
  settings: Settings,
  id?: string,
): {
  provider: ProviderDef;
  baseUrl: string;
  apiKey: string;
  model: string;
} {
  const provider = getProvider(id ?? settings.activeProviderId);
  const cfg = settings.providers[provider.id] ?? { apiKey: "" };
  return {
    provider,
    baseUrl: (cfg.baseUrl?.trim() || provider.defaultBaseUrl).replace(/\/+$/, ""),
    apiKey: cfg.apiKey ?? "",
    model: cfg.model?.trim() || provider.defaultModel,
  };
}

export function isProviderReady(settings: Settings, id?: string): boolean {
  const r = resolveProvider(settings, id);
  const onServer = state.providerKeyStatus[r.provider.id];
  if (r.provider.needsApiKey && !r.apiKey && !onServer) return false;
  return !!r.baseUrl;
}

export function providerHasKey(id: string): boolean {
  return !!state.providerKeyStatus[id];
}

export function csrfHeaders(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const token = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("csrf-token="))
    ?.slice("csrf-token=".length);
  return token ? { "X-CSRF-Token": decodeURIComponent(token) } : {};
}

/** Sync a thread's current state to the server. Fire-and-forget; local state is source of truth. */
export async function syncThreadToServer(threadId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const thread = store.getState().threads.find((t) => t.id === threadId);
  if (!thread || thread.temporary) return;
  try {
    await fetch(`/api/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({
        messages: thread.messages,
        updatedAt: thread.updatedAt,
      }),
    });
  } catch {
    /* ignore network errors; local state is source of truth */
  }
}

export { PROVIDERS };
