import { useSyncExternalStore } from "react";
import { PROVIDERS, getProvider, type ProviderDef } from "@/lib/providers";

export type ProviderConfig = {
  apiKey: string;
  baseUrl?: string; // override; falls back to provider.defaultBaseUrl
  model?: string; // override; falls back to provider.defaultModel
};

export type Settings = {
  userName: string;
  activeProviderId: string;
  providers: Record<string, ProviderConfig>;
  pinnedProviderIds: string[];
};

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
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
};

export type Thread = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  temporary?: boolean;
};

const SETTINGS_KEY = "cockpit.settings.v2";
const THREADS_KEY = "cockpit.threads.v1";
const STATS_KEY = "cockpit.provider-stats.v1";

export type ProviderStat = { calls: number; errors: number };
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
export function resetProviderStats() {
  saveStats({});
  statsListeners.forEach((l) => l());
}
const statsListeners = new Set<() => void>();
export function subscribeProviderStats(l: () => void) {
  statsListeners.add(l);
  return () => statsListeners.delete(l);
}

export const defaultSettings: Settings = {
  userName: "friend",
  activeProviderId: "openai",
  providers: {},
  pinnedProviderIds: [],
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...(fallback as object), ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
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
};

let state: State = {
  settings: defaultSettings,
  threads: [],
  activeThreadId: null,
};
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const loadedSettings = read<Settings>(SETTINGS_KEY, defaultSettings);
  state = {
    settings: loadedSettings,
    threads: readArr<Thread>(THREADS_KEY),
    activeThreadId: null,
  };
  setupCrossTabSync();
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
  const safeSettings = { ...state.settings, providers: safeProviders };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(safeSettings));
  localStorage.setItem(
    THREADS_KEY,
    JSON.stringify(state.threads.filter((t) => !t.temporary)),
  );
}

function setupCrossTabSync() {
  if (typeof window === "undefined") return;
  window.addEventListener("storage", (e) => {
    if (e.key === SETTINGS_KEY && e.newValue) {
      try {
        state = {
          ...state,
          settings: { ...defaultSettings, ...JSON.parse(e.newValue) },
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
    state = { ...state, settings: { ...state.settings, ...patch } };
    persist();
    emit();
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
  deleteThread(id: string) {
    state = {
      ...state,
      threads: state.threads.filter((t) => t.id !== id),
      activeThreadId: state.activeThreadId === id ? null : state.activeThreadId,
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
                  ? msg.content.slice(0, 48)
                  : t.title,
            }
          : t,
      ),
    };
    persist();
    emit();
  },
  patchMessage(threadId: string, id: string, patch: Partial<Message>) {
    state = {
      ...state,
      threads: state.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              messages: t.messages.map((m) =>
                m.id === id ? { ...m, ...patch } : m,
              ),
            }
          : t,
      ),
    };
    persist();
    emit();
  },
  clearAll() {
    state = { settings: defaultSettings, threads: [], activeThreadId: null };
    persist();
    emit();
  },
};

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(state),
  );
}

// Resolve effective config for a provider.
export function resolveProvider(settings: Settings, id?: string): {
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
  if (r.provider.needsApiKey && !r.apiKey) return false;
  return !!r.baseUrl;
}

export { PROVIDERS };