import { useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api-base";
import {
  PROVIDERS,
  getProvider,
  deriveLocalCapabilityState,
  V1_LOCAL_OPENAI_COMPAT_ENDPOINT_ID,
  V1_LOCAL_OPENAI_COMPAT_PROVIDER_ID,
  type DetectResult,
  type LocalCapabilityEnvironment,
  type LocalCapabilityState,
  type ModelListProbeResult,
  type ProviderDef,
} from "@/lib/providers";
import type { ToolCall, ToolResult } from "@/lib/tools";
import { setCostOverrides } from "@/lib/tokens";
import {
  loadVectorStoreForUser,
  clearVectorStoreCache,
  getAllVectorDocsForUser,
  saveVectorStoreForUser,
} from "@/lib/vector-store";
import {
  settingsKey as bucketSettingsKey,
  threadsKey as bucketThreadsKey,
  statsKey as bucketStatsKey,
  validationKey as bucketValidationKey,
  legacyGuestKeys,
  SETTINGS_KEY_BASE,
} from "@/lib/account-buckets";

export type ProviderConfig = {
  apiKey: string;
  baseUrl?: string; // override; falls back to provider.defaultBaseUrl
  model?: string; // override; falls back to provider.defaultModel
};

/** Public user profile returned by auth endpoints. Mirrors src/lib/auth.server.ts UserPublic. */
export type UserPublic = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: number;
  updated_at: number;
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
  /** Per-provider cost rate overrides (USD per 1,000 tokens). Persisted locally only. */
  costOverrides?: Record<string, { input?: number; output?: number }>;
  /** Onboarding completion state. Persisted locally only. */
  onboardingCompleted?: boolean;
  /** Whether backend thread sync is enabled for this account. */
  syncThreadsEnabled?: boolean;
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
  syncEnabled?: boolean;
  isLocal?: boolean;
};

function titleForFirstUserMessage(msg: Message) {
  const text = msg.content.trim();
  if (text) return text.slice(0, 48);
  if (msg.videoAttachments?.length) return "Video chat";
  if (msg.attachments?.length) return "Image chat";
  return "New chat";
}

/**
 * The active bucket scope, or null when identity is unresolved.
 *
 * null is a real answer, not an error: in "undetermined" mode nothing may be
 * read from or written to any bucket. Every caller must handle null rather than
 * substituting a default.
 */
function getActiveScope(): string | null {
  return state.user?.id ?? state.localProfileId ?? null;
}

function getSettingsKey(): string | null {
  const scope = getActiveScope();
  return scope ? bucketSettingsKey(scope) : null;
}

/** Return a key for a specific user id (used during account switch restore). */
function getSettingsKeyForUser(userId: string): string {
  return bucketSettingsKey(userId);
}

function getThreadsKey(): string | null {
  const scope = getActiveScope();
  return scope ? bucketThreadsKey(scope) : null;
}

/** Return a threads key for a specific user id (used during account switch restore). */
function getThreadsKeyForUser(userId: string): string {
  return bucketThreadsKey(userId);
}

/** Load stats for a specific account bucket without mutating current state. */
function loadStatsForKey(key: string): StatsMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(key) || "{}") as StatsMap;
  } catch {
    return {};
  }
}

function getStatsKey(): string | null {
  const scope = getActiveScope();
  return scope ? bucketStatsKey(scope) : null;
}

/** Return a stats key for a specific user id (used during account switch restore). */
function getStatsKeyForUser(userId: string): string {
  return bucketStatsKey(userId);
}

type ValidationMap = State["providerValidationStatus"];

/** Load validation status for a specific account bucket without mutating state. */
function loadValidationForKey(key: string): ValidationMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(key) || "{}") as ValidationMap;
  } catch {
    return {};
  }
}

/** Persist the current validation status into the active bucket. */
function saveValidationStatus(): void {
  if (typeof window === "undefined") return;
  const scope = getActiveScope();
  if (!scope) return;
  try {
    localStorage.setItem(
      bucketValidationKey(scope),
      JSON.stringify(state.providerValidationStatus),
    );
  } catch {
    /* quota exceeded or unavailable */
  }
}

// ── Account mode + local profile identity ──────────────────────────────────
// The active account mode is persisted so reloads can resolve identity before
// rendering any account-scoped data (no guest-first flash).
//   "undetermined" — user has not yet made an explicit identity choice.
//   "local-only"   — user chose the on-device local profile (stable localProfileId).
//   "server"       — a server account is currently authenticated.

export type AccountMode = "undetermined" | "local-only" | "server";

export const ACCOUNT_MODE_KEY = "cockpit.account.mode";
export const LOCAL_PROFILE_ID_KEY = "cockpit.local-profile.id";
const OFFLINE_QUEUE_KEY = "cockpit.offline-queue.v1";

export function readAccountMode(): AccountMode {
  if (typeof window === "undefined") return "undetermined";
  const raw = localStorage.getItem(ACCOUNT_MODE_KEY);
  if (raw === "local-only" || raw === "server") return raw;
  return "undetermined";
}

export function writeAccountMode(mode: AccountMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCOUNT_MODE_KEY, mode);
}

export function readLocalProfileId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LOCAL_PROFILE_ID_KEY);
}

export function writeLocalProfileId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_PROFILE_ID_KEY, id);
}

export function generateLocalProfileId(): string {
  return crypto.randomUUID();
}

export function getLocalProfileSettingsKey(id: string): string {
  return bucketSettingsKey(id);
}

export function getLocalProfileThreadsKey(id: string): string {
  return bucketThreadsKey(id);
}

export function getLocalProfileStatsKey(id: string): string {
  return bucketStatsKey(id);
}

/** Clear the global offline queue so queued prompts cannot fire under the wrong account. */
export function clearOfflineQueue(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {
    /* ignore */
  }
}

export type ProviderStat = {
  calls: number;
  errors: number;
  inputTokens?: number;
  outputTokens?: number;
};
type StatsMap = Record<string, ProviderStat>;

function loadStats(): StatsMap {
  if (typeof window === "undefined") return {};
  const key = getStatsKey();
  if (!key) return {};
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}
function saveStats(s: StatsMap) {
  if (typeof window === "undefined") return;
  const key = getStatsKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(s));
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
  costOverrides: {},
  onboardingCompleted: false,
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
    costOverrides:
      typeof source.costOverrides === "object" &&
      source.costOverrides !== null &&
      !Array.isArray(source.costOverrides)
        ? (source.costOverrides as Record<string, { input?: number; output?: number }>)
        : defaultSettings.costOverrides,
    onboardingCompleted:
      typeof source.onboardingCompleted === "boolean"
        ? source.onboardingCompleted
        : defaultSettings.onboardingCompleted,
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
  /** Runtime-only: currently authenticated user, or null for guests. */
  user: UserPublic | null;
  /** Runtime-only: which provider ids have a key stored server-side. */
  providerKeyStatus: Record<string, boolean>;
  /** Runtime-only: validation status for each provider. */
  stats: StatsMap;
  providerValidationStatus: Record<
    string,
    {
      status: "idle" | "validating" | "valid" | "invalid" | "error";
      message?: string;
      errorType?: "auth_failed" | "network_error" | "timeout" | "rate_limited" | "unknown";
      lastValidated?: number;
    }
  >;
  /** Resolved account mode. "undetermined" until the user makes an explicit identity choice. */
  accountMode: AccountMode;
  /** Stable on-device local profile identity (null until the user chooses local-only). */
  localProfileId: string | null;
};

let state: State = {
  settings: defaultSettings,
  threads: [],
  activeThreadId: null,
  user: null,
  providerKeyStatus: {},
  providerValidationStatus: {},
  stats: {},
  accountMode: "undetermined",
  localProfileId: null,
};
/**
 * Two independent hydration gates.
 *
 * syncHydrated  — the legacy synchronous path (store.getState()) has run once.
 * asyncHydrated — hydrateAsync() has completed identity resolution.
 *
 * They are deliberately NOT one flag. A component reading the store during the
 * first render must not be able to satisfy — and thereby cancel — the async
 * identity resolution that the UI gate is still waiting on.
 */
let syncHydrated = false;
let asyncHydrated = false;

/**
 * Incremented on every account switch.
 *
 * Async writers capture it before their fetch and discard their result if it
 * changed. A response that arrives after the user has switched accounts must
 * never write state or call persist() — persist() writes to whatever bucket is
 * active NOW, so a late response from User A lands in the local profile.
 */
let switchGeneration = 0;

/** The generation an async writer should capture before awaiting. */
function currentSwitchGeneration(): number {
  return switchGeneration;
}

/**
 * For tests: reset hydration state AND restore the clean initial state so a test
 * starts from a known neutral slate (no stale threads/settings/account mode from
 * a prior test). Subsequent store.getState() re-runs identity-safe hydrate()
 * against the cleared localStorage.
 */
export function __resetHydration(): void {
  syncHydrated = false;
  asyncHydrated = false;
  state = {
    settings: defaultSettings,
    threads: [],
    activeThreadId: null,
    user: null,
    providerKeyStatus: {},
    providerValidationStatus: {},
    stats: {},
    accountMode: "undetermined",
    localProfileId: null,
  };
}

/**
 * Identity-safe legacy hydration.
 *
 * This synchronous path is reachable via store.getState()/useStore. It must
 * NEVER load the legacy ":guest" bucket (or any wrong-account bucket) before
 * identity is resolved — that was the source of the reload flash for
 * authenticated users.
 *
 * Behaviour by persisted accountMode:
 *   - "undetermined": leave the neutral initial state; load no bucket and fire
 *     no server calls. The IdentityChoiceModal drives the next transition.
 *   - "local-only" (with a localProfileId): synchronously load the local
 *     profile bucket — this is safe because the local profile is the resolved
 *     identity and cannot flash another account's data.
 *   - "server": load NO bucket synchronously. Server identity requires an
 *     async /api/auth/me round-trip, which is handled by hydrateAsync(). The
 *     UI gate blocks rendering until hydrateAsync resolves, so hydrate() in
 *     server mode only marks itself satisfied and wires cross-tab sync.
 *
 * Tests that need bucket recovery must set up accountMode/localProfileId
 * explicitly rather than relying on a default guest-bucket load.
 */
function hydrate() {
  if (syncHydrated || typeof window === "undefined") return;
  syncHydrated = true;
  const mode = readAccountMode();
  const localProfileId = readLocalProfileId();

  if (mode === "local-only" && localProfileId) {
    const rawSettings = readJson(getLocalProfileSettingsKey(localProfileId));
    state = {
      ...state,
      settings: normalizeSettings(rawSettings),
      threads: readArr<Thread>(getLocalProfileThreadsKey(localProfileId)),
      activeThreadId: null,
      user: null,
      accountMode: "local-only",
      localProfileId,
      providerKeyStatus: {},
      providerValidationStatus: loadValidationForKey(bucketValidationKey(localProfileId)),
      stats: loadStatsForKey(getLocalProfileStatsKey(localProfileId)),
    };
    setupCrossTabSync();
    persist();
    setCostOverrides(state.settings.costOverrides ?? {});
    loadVectorStoreForUser(localProfileId);
    return;
  }

  if (mode === "server") {
    // Do NOT load any bucket synchronously and do NOT mark asyncHydrated.
    // Server identity requires the /api/auth/me round-trip that only
    // hydrateAsync() can make; the UI gate blocks on it.
    state = { ...state, accountMode: "server", localProfileId };
    setupCrossTabSync();
    return;
  }

  // undetermined (or local-only without an id): neutral state, no bucket load,
  // no server calls, no guest vector bucket.
  state = { ...state, accountMode: "undetermined", localProfileId: null };
  setupCrossTabSync();
}

const listeners = new Set<() => void>();
function emit() {
  // Keep cost overrides in sync with current settings so estimateCost()
  // always uses the latest user-configured rates.
  setCostOverrides(state.settings.costOverrides ?? {});
  listeners.forEach((l) => l());
}

function persist() {
  if (typeof window === "undefined") return;
  const settingsKey = getSettingsKey();
  const threadsKey = getThreadsKey();
  // No resolved identity → no bucket to write to. Silently doing nothing is
  // correct here: the alternative is inventing a ":guest" bucket that a later
  // sign-in would then have to disentangle.
  if (!settingsKey || !threadsKey) return;

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
  localStorage.setItem(settingsKey, JSON.stringify(safeSettings));
  localStorage.setItem(threadsKey, JSON.stringify(state.threads.filter((t) => !t.temporary)));
}

function setupCrossTabSync() {
  if (typeof window === "undefined") return;
  window.addEventListener("storage", (e) => {
    const currentKey = getSettingsKey();
    if (currentKey && e.key === currentKey && e.newValue) {
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
    const currentThreadsKey = getThreadsKey();
    if (currentThreadsKey && e.key === currentThreadsKey && e.newValue) {
      try {
        state = { ...state, threads: JSON.parse(e.newValue) };
        emit();
      } catch {
        /* ignore */
      }
    }
    const currentStatsKey = getStatsKey();
    if (currentStatsKey && e.key === currentStatsKey) {
      // Another tab wrote new stats — notify local subscribers so their
      // UI reflects the updated counts without a page reload.
      statsListeners.forEach((l) => l());
    }
  });
}

// ── Account-mode transitions ───────────────────────────────────────────────
// enterServerMode / enterLocalMode are the canonical account switches. They
// load the correct account bucket, clear runtime caches that could leak state
// across accounts, persist the account mode, and switch the vector store.

/**
 * Reset every runtime cache that is keyed by account rather than by bucket.
 *
 * These live outside localStorage — in module state, in memory, or in a global
 * localStorage key with no scope — so a bucket swap alone does not clear them.
 * A leftover entry here is one account's data showing up under another.
 */
function clearCrossModeCaches(): void {
  state = {
    ...state,
    providerKeyStatus: {},
    providerValidationStatus: {},
  };
  clearOfflineQueue();
  clearVectorStoreCache();
  setCostOverrides({});
  // The tool schema registry is deliberately NOT cleared here. It holds only
  // static built-ins, which belong to every caller; durable per-user tools live
  // in D1 and are owned by real-verification.md Task 7. See Task 6.
}

/** One-time migration of the legacy hardcoded ":guest" bucket into a local profile bucket. */
export function migrateGuestBucketToLocalProfile(localProfileId: string): void {
  if (typeof window === "undefined") return;
  const legacy = legacyGuestKeys();
  const guestSettings = readJson(legacy.settings);
  const guestThreads = readArr<Thread>(legacy.threads);
  const guestStats = loadStatsForKey(legacy.stats);
  const guestDocs = getAllVectorDocsForUser(null);

  if (isRecord(guestSettings)) {
    localStorage.setItem(getLocalProfileSettingsKey(localProfileId), JSON.stringify(guestSettings));
  }
  if (guestThreads.length) {
    localStorage.setItem(getLocalProfileThreadsKey(localProfileId), JSON.stringify(guestThreads));
  }
  if (Object.keys(guestStats).length) {
    localStorage.setItem(getLocalProfileStatsKey(localProfileId), JSON.stringify(guestStats));
  }
  if (guestDocs.length) {
    saveVectorStoreForUser(localProfileId, guestDocs);
  }
  // Intentionally do NOT delete the legacy ":guest" keys during the initial
  // migration — they remain as a rollback safety net.
}

/**
 * Ensure a local profile id exists, persisting a fresh one if needed, and lazily
 * migrating any legacy ":guest" bucket into it the first time it is used.
 * Returns the resolved local profile id.
 */
export function ensureLocalProfileId(): string {
  let id = readLocalProfileId();
  if (!id) {
    id = generateLocalProfileId();
    writeLocalProfileId(id);
  }
  const hasLocalData = readJson(getLocalProfileSettingsKey(id)) !== undefined;
  if (!hasLocalData) {
    migrateGuestBucketToLocalProfile(id);
  }
  return id;
}

/**
 * Return the runtime to the on-device local profile, establishing one if
 * needed. Used by logout / clearUser / fetchMe-failure so a server account
 * always lands on a first-class local profile — never an ambiguous guest state.
 */
function returnToLocalProfile(): void {
  const id = ensureLocalProfileId();
  enterLocalMode(id);
}

type BucketTarget = { user: UserPublic | null; scope: string };

/**
 * The single account switch. Both enterServerMode and enterLocalMode go through
 * here so the two paths cannot drift apart in which caches they reset.
 *
 * Order is load-bearing: clear the outgoing account's caches BEFORE loading the
 * incoming bucket, so nothing clears what was just loaded.
 */
function switchAccountBucket(target: BucketTarget): void {
  // Invalidate every in-flight async writer BEFORE anything else. A response
  // from the outgoing account must not land in the incoming account's bucket.
  switchGeneration++;
  clearCrossModeCaches();

  const accountSettings = normalizeSettings(readJson(bucketSettingsKey(target.scope)));
  const accountThreads = readArr<Thread>(bucketThreadsKey(target.scope));
  const accountStats = loadStatsForKey(bucketStatsKey(target.scope));
  const accountValidation = loadValidationForKey(bucketValidationKey(target.scope));

  state = {
    ...state,
    user: target.user,
    accountMode: target.user ? "server" : "local-only",
    localProfileId: target.user ? state.localProfileId : target.scope,
    settings: accountSettings,
    threads: accountThreads,
    activeThreadId: null,
    stats: accountStats,
    providerValidationStatus: accountValidation,
  };

  writeAccountMode(state.accountMode);
  if (!target.user) writeLocalProfileId(target.scope);

  // emit() re-applies costOverrides from the freshly loaded settings, undoing
  // the setCostOverrides({}) above with the incoming account's real rates.
  emit();
  persist();
  loadVectorStoreForUser(target.scope);
}

/** Switch the runtime to a server account. Loads the user bucket and clears caches. */
export function enterServerMode(user: UserPublic): void {
  const hadAccountSettings = readJson(getSettingsKeyForUser(user.id)) !== undefined;

  switchAccountBucket({ user, scope: user.id });

  // One-time legacy v1→v2 migration: if this user has no account-scoped settings
  // yet but a legacy global settings blob with apiKeys exists, push those keys to
  // the server session and keep local settings stripped.
  if (!hadAccountSettings) {
    const legacyKeys = extractLegacyProviderKeys(readJson(SETTINGS_KEY_BASE));
    if (legacyKeys.length) {
      void migrateLocalKeysToServer(legacyKeys);
    }
  }
  // Pull server-side settings first, then refresh provider key status. Ordering
  // matters: settings sync must consume the first post-auth response so legacy
  // callers/tests that mock a single settings payload still see it applied.
  void loadSettingsFromServer();
  void refreshProviderKeyStatus();
}

/** Switch the runtime to the on-device local profile. Loads the local bucket and clears caches. */
export function enterLocalMode(localProfileId: string): void {
  switchAccountBucket({ user: null, scope: localProfileId });
  // Local-only profiles never call server settings/key sync.
}

/**
 * Blocking async identity hydration. The UI must not render account-scoped data
 * until this resolves. Replaces the fire-and-forget guest-first hydration that
 * flashed local data on reload for authenticated users.
 */
export async function hydrateAsync(): Promise<void> {
  if (asyncHydrated || typeof window === "undefined") return;
  asyncHydrated = true;
  // Claim the sync gate too: once identity has been resolved asynchronously,
  // the legacy synchronous path must not run afterwards and re-derive state.
  syncHydrated = true;

  const mode = readAccountMode();
  let localProfileId = readLocalProfileId();

  if (mode === "server") {
    // fetchMe enters server mode on success, or falls back to the local profile
    // (via fetchMeFailureFallback) when a localProfileId is already established.
    const user = await fetchMe();
    if (!user) {
      // Session expired/invalid. If no local profile existed yet (e.g. the user
      // went straight to a server account from undetermined), establish one now
      // and lazily migrate any legacy ":guest" bucket — never land in an
      // ambiguous guest state.
      if (!localProfileId) {
        localProfileId = generateLocalProfileId();
        writeLocalProfileId(localProfileId);
        const hasLocalData = readJson(getLocalProfileSettingsKey(localProfileId)) !== undefined;
        if (!hasLocalData) {
          migrateGuestBucketToLocalProfile(localProfileId);
        }
        enterLocalMode(localProfileId);
      }
      // Otherwise fetchMeFailureFallback already entered local mode.
    }
  } else if (mode === "local-only") {
    if (!localProfileId) {
      localProfileId = generateLocalProfileId();
      writeLocalProfileId(localProfileId);
    }
    const hasLocalData = readJson(getLocalProfileSettingsKey(localProfileId)) !== undefined;
    if (!hasLocalData) {
      migrateGuestBucketToLocalProfile(localProfileId);
    }
    enterLocalMode(localProfileId);
  } else {
    // undetermined — leave state in the initial neutral state. Do NOT load the
    // legacy guest/local/server buckets; the IdentityChoiceModal drives the
    // next transition.
    state = { ...state, accountMode: "undetermined", localProfileId: null };
  }

  setupCrossTabSync();
  // persist() is already a no-op without a resolved scope (Task 1), but calling
  // it in the undetermined branch is still meaningless work — skip it outright.
  if (getActiveScope()) persist();
}

// ── Local → server data migration helpers (copy / move / keep-separate) ─────

/** Copy local profile settings/threads/stats/vector docs into a user bucket, preserving local data. */
export function copyLocalToServer(userId: string, localProfileId: string): void {
  if (typeof window === "undefined") return;
  const localSettings = readJson(getLocalProfileSettingsKey(localProfileId));
  const localThreads = readArr<Thread>(getLocalProfileThreadsKey(localProfileId));
  const localStats = loadStatsForKey(getLocalProfileStatsKey(localProfileId));
  const localDocs = getAllVectorDocsForUser(localProfileId);

  if (localSettings !== undefined) {
    localStorage.setItem(getSettingsKeyForUser(userId), JSON.stringify(localSettings));
  }
  if (localThreads.length) {
    localStorage.setItem(getThreadsKeyForUser(userId), JSON.stringify(localThreads));
  }
  if (Object.keys(localStats).length) {
    localStorage.setItem(getStatsKeyForUser(userId), JSON.stringify(localStats));
  }
  if (localDocs.length) {
    saveVectorStoreForUser(userId, localDocs);
  }
}

/** Copy local profile data into a user bucket, then clear the local profile bucket. */
export function moveLocalToServer(userId: string, localProfileId: string): void {
  copyLocalToServer(userId, localProfileId);
  if (typeof window === "undefined") return;
  localStorage.removeItem(getLocalProfileSettingsKey(localProfileId));
  localStorage.removeItem(getLocalProfileThreadsKey(localProfileId));
  localStorage.removeItem(getLocalProfileStatsKey(localProfileId));
  saveVectorStoreForUser(localProfileId, []);
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
  setUser(user: UserPublic | null) {
    if (user) {
      // Low-level server bucket switch. Deliberately fetch-free: server
      // settings/key sync are handled by the authRequest/fetchMe/hydrateAsync
      // paths via enterServerMode. This keeps setUser usable from contexts
      // (and tests) that must not trigger network calls. switchAccountBucket
      // bumps switchGeneration so an in-flight async writer from the outgoing
      // account cannot land in the incoming bucket.
      switchAccountBucket({ user, scope: user.id });
      return;
    }
    // null: prefer the local profile if one is established; otherwise return to
    // the legacy ":guest" bucket (backward compatibility).
    const existingLocalId = state.localProfileId ?? readLocalProfileId();
    if (existingLocalId) {
      enterLocalMode(existingLocalId);
      return;
    }
    const legacy = legacyGuestKeys();
    const guestSettings = normalizeSettings(readJson(legacy.settings));
    const guestThreads = readArr<Thread>(legacy.threads);
    clearCrossModeCaches();
    state = {
      ...state,
      user: null,
      accountMode: "undetermined",
      localProfileId: null,
      settings: guestSettings,
      threads: guestThreads,
      activeThreadId: null,
      stats: loadStatsForKey(legacy.stats),
    };
    emit();
    clearOfflineQueue();
    loadVectorStoreForUser(null);
    clearVectorStoreCache();
  },
  enterServerMode,
  enterLocalMode,
  clearUser() {
    // Always return to the local profile (establishing one if needed) so a
    // server account never lands in an ambiguous guest state.
    returnToLocalProfile();
  },
  async logout() {
    await logout();
  },
  async refreshProviderKeyStatus() {
    await refreshProviderKeyStatus();
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
    // Sync to cloud when authenticated. Fire-and-forget; the local cache remains authoritative.
    if (state.user) {
      void syncSettingsToServer(patch);
    }
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
  completeOnboarding() {
    this.updateSettings({ onboardingCompleted: true });
  },
  skipOnboarding() {
    this.updateSettings({ onboardingCompleted: true });
  },
  resetOnboarding() {
    this.updateSettings({ onboardingCompleted: false });
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
      isLocal: true,
      syncEnabled: false,
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
      isLocal: true,
      syncEnabled: false,
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
      isLocal: t.isLocal !== false,
      syncEnabled: t.syncEnabled === true,
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
      user: null,
      providerKeyStatus: {},
      providerValidationStatus: {},
      stats: {},
      accountMode: state.accountMode,
      localProfileId: state.localProfileId,
    };
    persist();
    emit();
    void apiFetch("/api/keys/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
    });
  },
};

type AuthRequestOpts = {
  /** When true, the server claims guest session data. Defaults to false — an omitted flag means "do not claim". */
  claimGuestData?: boolean;
  /**
   * Hook fired after credentials are validated but before the runtime switches
   * to the server account. Return false to suppress the auto-switch (e.g. to
   * show a data-migration dialog); the caller then calls enterServerMode(user).
   */
  onBeforeEnterServer?: (user: UserPublic) => boolean;
};

async function authRequest(
  path: string,
  body: Record<string, unknown>,
  opts?: AuthRequestOpts,
): Promise<{ ok: true; user: UserPublic } | { ok: false; error: string }> {
  try {
    const res = await apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: typeof json.error === "string" ? json.error : "Request failed" };
    }
    const user = (json.user ?? null) as UserPublic | null;
    if (!user) {
      return { ok: false, error: "Invalid response from server" };
    }
    // Allow the caller to intercept the transition (e.g. local → server migration
    // dialog). When intercepted, do NOT switch buckets; the caller drives the
    // final enterServerMode(user) call after the migration choice.
    if (opts?.onBeforeEnterServer && !opts.onBeforeEnterServer(user)) {
      return { ok: true, user };
    }
    enterServerMode(user);
    return { ok: true, user };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function fetchMe(): Promise<UserPublic | null> {
  try {
    const res = await apiFetch("/api/auth/me");
    if (!res.ok) {
      fetchMeFailureFallback();
      return null;
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const user = (json.user ?? null) as UserPublic | null;
    if (!user) {
      fetchMeFailureFallback();
      return null;
    }
    // Success: delegate to the canonical server-mode transition so accountMode,
    // caches, vector store, and server settings/key sync are handled uniformly.
    enterServerMode(user);
    return user;
  } catch {
    fetchMeFailureFallback();
    return null;
  }
}

/**
 * Failure fallback for fetchMe (401 / no user / network error). Never loads the
 * legacy ":guest" bucket when a local profile is established — returns to the
 * local profile instead. When no local profile exists (legacy/test state), falls
 * back to the neutral guest bucket for backward compatibility.
 */
function fetchMeFailureFallback(): void {
  // Never load the legacy ":guest" bucket. Always return to the local profile,
  // establishing one if needed (lazily migrating any legacy guest data).
  returnToLocalProfile();
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
  opts?: AuthRequestOpts,
): Promise<{ ok: true; user: UserPublic } | { ok: false; error: string }> {
  const body: Record<string, unknown> = { email, password, displayName };
  if (opts?.claimGuestData !== undefined) {
    body.claimGuestData = opts.claimGuestData;
  }
  return authRequest("/api/auth/register", body, opts);
}

export async function login(
  email: string,
  password: string,
  opts?: AuthRequestOpts,
): Promise<{ ok: true; user: UserPublic } | { ok: false; error: string }> {
  const body: Record<string, unknown> = { email, password };
  if (opts?.claimGuestData !== undefined) {
    body.claimGuestData = opts.claimGuestData;
  }
  return authRequest("/api/auth/login", body, opts);
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
    });
  } catch {
    /* ignore */
  }
  // Logging out of a server account always returns to the local-only profile,
  // establishing one if needed — never an empty ambiguous guest state.
  returnToLocalProfile();
}

async function migrateLocalKeysToServer(entries: LegacyProviderKey[]) {
  if (entries.length === 0) return;
  const generation = currentSwitchGeneration();
  await Promise.all(
    entries.map((cfg) =>
      apiFetch("/api/keys/set", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({
          providerId: cfg.providerId,
          apiKey: cfg.apiKey,
          baseUrl: cfg.baseUrl,
          model: cfg.model,
        }),
      }).catch(() => null),
    ),
  );
  // Keys were pushed to the server for the account that requested it; if the
  // user has since switched, do not touch the new account's local state.
  if (generation !== currentSwitchGeneration()) return;
  persist();
  emit();
  await refreshProviderKeyStatus();
}

async function syncSettingsToServer(patch: Partial<Settings>): Promise<void> {
  const generation = currentSwitchGeneration();
  const body: Record<string, unknown> = {};
  if (patch.profile !== undefined) body.profile = patch.profile;
  if (patch.personalization !== undefined) body.personalization = patch.personalization;
  if (patch.keyboardShortcuts !== undefined) body.keyboardShortcuts = patch.keyboardShortcuts;
  if (patch.rag !== undefined) body.rag = patch.rag;
  if (patch.activeProviderId !== undefined) body.activeProviderId = patch.activeProviderId;
  if (patch.pinnedProviderIds !== undefined) body.pinnedProviderIds = patch.pinnedProviderIds;
  if (patch.costOverrides !== undefined) body.costOverrides = patch.costOverrides;
  if (patch.onboardingCompleted !== undefined) body.onboardingCompleted = patch.onboardingCompleted;

  if (Object.keys(body).length === 0) return;
  // The account may have changed while the patch was being built; do not push a
  // departed account's settings to the server.
  if (generation !== currentSwitchGeneration()) return;

  try {
    await apiFetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(body),
    });
  } catch {
    /* ignore; local storage is source of truth */
  }
}

async function loadSettingsFromServer(): Promise<void> {
  if (!state.user) return;
  const generation = currentSwitchGeneration();
  try {
    const res = await apiFetch("/api/settings");
    // The account may have changed while this was in flight.
    if (generation !== currentSwitchGeneration()) return;
    if (!res.ok) return;
    const json = (await res.json()) as Partial<Settings>;
    if (generation !== currentSwitchGeneration()) return;
    const patch: Partial<Settings> = {};
    if (json.profile !== undefined) patch.profile = json.profile;
    if (json.personalization !== undefined) patch.personalization = json.personalization;
    if (json.keyboardShortcuts !== undefined) patch.keyboardShortcuts = json.keyboardShortcuts;
    if (json.rag !== undefined) patch.rag = json.rag;
    if (json.activeProviderId !== undefined) patch.activeProviderId = json.activeProviderId;
    if (json.pinnedProviderIds !== undefined) patch.pinnedProviderIds = json.pinnedProviderIds;
    if (json.costOverrides !== undefined) patch.costOverrides = json.costOverrides;
    if (json.onboardingCompleted !== undefined)
      patch.onboardingCompleted = json.onboardingCompleted;

    if (Object.keys(patch).length === 0) return;

    state = {
      ...state,
      settings: normalizeSettings({ ...state.settings, ...patch }),
    };
    persist();
    emit();
  } catch {
    /* ignore; local storage is source of truth */
  }
}
export async function refreshProviderKeyStatus() {
  const generation = currentSwitchGeneration();
  try {
    const res = await apiFetch("/api/keys/status");
    // The account may have changed while this was in flight.
    if (generation !== currentSwitchGeneration()) return;
    if (!res.ok) return;
    const json = (await res.json()) as {
      providers: Record<string, { hasKey: boolean; baseUrl?: string; model?: string }>;
    };
    if (generation !== currentSwitchGeneration()) return;
    const map: Record<string, boolean> = {};
    const providersPatch: Record<string, ProviderConfig> = {};
    for (const [id, v] of Object.entries(json.providers ?? {})) {
      map[id] = !!v.hasKey;
      // Merge server-stored config (baseUrl/model) into the account-scoped local cache.
      if (state.user && v.hasKey) {
        const cur = state.settings.providers[id] ?? { apiKey: "" };
        providersPatch[id] = {
          ...cur,
          apiKey: "",
          ...(v.baseUrl !== undefined ? { baseUrl: v.baseUrl } : {}),
          ...(v.model !== undefined ? { model: v.model } : {}),
        };
      }
    }
    state = {
      ...state,
      providerKeyStatus: map,
      settings: Object.keys(providersPatch).length
        ? normalizeSettings({
            ...state.settings,
            providers: { ...state.settings.providers, ...providersPatch },
          })
        : state.settings,
    };
    if (Object.keys(providersPatch).length) {
      persist();
    }
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

export function deriveV1LocalEndpointCapabilityState(
  settings: Settings,
  input: {
    detect?: DetectResult;
    modelList?: ModelListProbeResult;
    checking?: boolean;
    environment?: LocalCapabilityEnvironment;
  } = {},
): LocalCapabilityState {
  const provider = getProvider(V1_LOCAL_OPENAI_COMPAT_PROVIDER_ID);
  const cfg = settings.providers[provider.id] ?? { apiKey: "" };
  const baseUrl = (cfg.baseUrl?.trim() || provider.defaultBaseUrl).replace(/\/+$/, "");
  const model = cfg.model?.trim();

  return deriveLocalCapabilityState({
    endpointId: V1_LOCAL_OPENAI_COMPAT_ENDPOINT_ID,
    providerId: provider.id,
    baseUrl,
    model,
    chatPath: provider.chatPath,
    modelsPath: provider.modelsPath,
    detect: input.detect,
    modelList: input.modelList,
    checking: input.checking,
    environment: input.environment,
  });
}

export function providerHasKey(id: string): boolean {
  return !!state.providerKeyStatus[id];
}

const IDLE_VALIDATION_STATUS = { status: "idle" } as const;

export function getProviderValidationStatus(id: string) {
  return state.providerValidationStatus[id] ?? IDLE_VALIDATION_STATUS;
}

export function setProviderValidationStatus(
  id: string,
  status: {
    status: "idle" | "validating" | "valid" | "invalid" | "error";
    message?: string;
    errorType?: "auth_failed" | "network_error" | "timeout" | "rate_limited" | "unknown";
  },
) {
  const current = state.providerValidationStatus[id] ?? { status: "idle" };
  state = {
    ...state,
    providerValidationStatus: {
      ...state.providerValidationStatus,
      [id]: { ...current, ...status, lastValidated: Date.now() },
    },
  };
  emit();
  saveValidationStatus();
}

export function clearProviderValidationStatus(id: string) {
  const newStatus = { ...state.providerValidationStatus };
  delete newStatus[id];
  state = { ...state, providerValidationStatus: newStatus };
  emit();
  saveValidationStatus();
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

export function useOnboardingState() {
  return useStore((s) => s.settings.onboardingCompleted);
}
