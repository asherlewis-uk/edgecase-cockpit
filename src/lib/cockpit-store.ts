import { useSyncExternalStore } from "react";

export type EndpointLabel = {
  id: string;
  label: string;
  path: string; // e.g. /v1/chat/completions
  method: "GET" | "POST";
  cacheTtlSec: number; // 0 = no cache
  bodyTemplate?: string; // JSON template, {{messages}} {{model}} {{prompt}}
  headers?: string; // JSON string
  responsePath?: string; // dot path to text e.g. choices.0.message.content
  stream?: boolean;
  pinned?: boolean;
};

export type Settings = {
  userName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  defaultEndpointId: string;
  endpoints: EndpointLabel[];
  accent: "indigo" | "emerald" | "rose" | "amber";
};

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  endpointLabel?: string;
  endpointUsed?: string;
  cached?: boolean;
  error?: boolean;
  pending?: boolean;
  timestamp?: number;
  ts: number;
  attachments?: string[]; // data URLs
};

export type Thread = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

export type Kind = "chat" | "image" | "video" | "library" | "gems" | "notebook";

const SETTINGS_KEY = "cockpit.settings.v1";
const THREADS_KEY = "cockpit.threads.v1";
const CACHE_KEY = "cockpit.cache.v1";
const STATS_KEY = "cockpit.endpoint-stats.v1";

export type EndpointStat = { hits: number; misses: number };
type StatsMap = Record<string, EndpointStat>;

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
export function getEndpointStats(): StatsMap {
  return loadStats();
}
export function bumpEndpointStat(id: string, kind: "hit" | "miss") {
  const s = loadStats();
  const cur = s[id] ?? { hits: 0, misses: 0 };
  if (kind === "hit") cur.hits++;
  else cur.misses++;
  s[id] = cur;
  saveStats(s);
  statsListeners.forEach((l) => l());
}
export function resetEndpointStats() {
  saveStats({});
  statsListeners.forEach((l) => l());
}
const statsListeners = new Set<() => void>();
export function subscribeEndpointStats(l: () => void) {
  statsListeners.add(l);
  return () => statsListeners.delete(l);
}

const defaultEndpoints: EndpointLabel[] = [
  {
    id: "chat-default",
    label: "Chat",
    path: "/v1/chat/completions",
    method: "POST",
    cacheTtlSec: 0,
    bodyTemplate: JSON.stringify(
      { model: "{{model}}", messages: "{{messages}}", stream: false },
      null,
      2,
    ),
    responsePath: "choices.0.message.content",
  },
  {
    id: "models",
    label: "Models",
    path: "/v1/models",
    method: "GET",
    cacheTtlSec: 300,
  },
  {
    id: "embeddings",
    label: "Embed",
    path: "/v1/embeddings",
    method: "POST",
    cacheTtlSec: 3600,
    bodyTemplate: JSON.stringify(
      { model: "{{model}}", input: "{{prompt}}" },
      null,
      2,
    ),
    responsePath: "data.0.embedding",
  },
];

export const defaultSettings: Settings = {
  userName: "friend",
  baseUrl: "https://api.openai.com",
  apiKey: "",
  model: "gpt-4o-mini",
  defaultEndpointId: "chat-default",
  endpoints: defaultEndpoints,
  accent: "indigo",
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
  if (loadedSettings.baseUrl) {
    loadedSettings.baseUrl = normalizeBaseUrl(loadedSettings.baseUrl);
  }
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
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  localStorage.setItem(THREADS_KEY, JSON.stringify(state.threads));
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/v1")) return trimmed;
  return trimmed + "/v1";
}

function setupCrossTabSync() {
  if (typeof window === "undefined") return;
  window.addEventListener("storage", (e) => {
    if (e.key === SETTINGS_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue) as Settings;
        state = { ...state, settings: { ...defaultSettings, ...parsed } };
        emit();
      } catch {
        /* ignore corrupt storage */
      }
    }
    if (e.key === THREADS_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue) as Thread[];
        state = { ...state, threads: parsed };
        emit();
      } catch {
        /* ignore corrupt storage */
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
    if (patch.baseUrl !== undefined) {
      patch = { ...patch, baseUrl: normalizeBaseUrl(patch.baseUrl) };
    }
    state = { ...state, settings: { ...state.settings, ...patch } };
    persist();
    emit();
  },
  upsertEndpoint(ep: EndpointLabel) {
    const eps = [...state.settings.endpoints];
    const i = eps.findIndex((e) => e.id === ep.id);
    if (i >= 0) eps[i] = ep;
    else eps.push(ep);
    this.updateSettings({ endpoints: eps });
  },
  removeEndpoint(id: string) {
    this.updateSettings({
      endpoints: state.settings.endpoints.filter((e) => e.id !== id),
    });
  },
  newThread(): string {
    const t: Thread = {
      id: crypto.randomUUID(),
      title: "New chat",
      messages: [],
      updatedAt: Date.now(),
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

// --- Cache layer ---
type CacheEntry = { value: unknown; expires: number; label: string };
function loadCache(): Record<string, CacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveCache(c: Record<string, CacheEntry>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CACHE_KEY, JSON.stringify(c));
}
export function getCached(key: string): { value: unknown; label: string } | null {
  const c = loadCache();
  const e = c[key];
  if (!e) return null;
  if (e.expires < Date.now()) {
    delete c[key];
    saveCache(c);
    return null;
  }
  return { value: e.value, label: e.label };
}
export function setCached(key: string, value: unknown, ttlSec: number, label: string) {
  if (ttlSec <= 0) return;
  const c = loadCache();
  c[key] = { value, expires: Date.now() + ttlSec * 1000, label };
  saveCache(c);
}
export function clearCache() {
  if (typeof window !== "undefined") localStorage.removeItem(CACHE_KEY);
}

export function pickByPath(obj: unknown, path?: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc == null) return acc;
    const idx = /^\d+$/.test(k) ? Number(k) : k;
    return (acc as Record<string | number, unknown>)[idx];
  }, obj);
}

export class ApiError extends Error {
  status: number;
  retryAfter?: number;
  constructor(message: string, status: number, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export async function callEndpoint(opts: {
  endpoint: EndpointLabel;
  settings: Settings;
  messages: { role: string; content: unknown }[];
  prompt: string;
  signal?: AbortSignal;
  onDelta?: (chunk: string) => void;
}): Promise<{ text: string; raw: unknown; cached: boolean; label: string }> {
  const { endpoint, settings, messages, prompt, signal, onDelta } = opts;
  const url = settings.baseUrl.replace(/\/+$/, "") + endpoint.path;
  const cacheKey = JSON.stringify({
    url,
    method: endpoint.method,
    prompt,
    model: settings.model,
  });
  if (endpoint.cacheTtlSec > 0) {
    const hit = getCached(cacheKey);
    if (hit) {
      const picked = pickByPath(hit.value, endpoint.responsePath);
      const txt = typeof picked === "string" ? picked : JSON.stringify(picked, null, 2);
      onDelta?.(txt);
      bumpEndpointStat(endpoint.id, "hit");
      return {
        text: txt,
        raw: hit.value,
        cached: true,
        label: endpoint.label,
      };
    }
  }

  let body: string | undefined;
  const wantStream = !!endpoint.stream && endpoint.method === "POST" && !!onDelta;
  if (endpoint.method === "POST") {
    const tpl = endpoint.bodyTemplate?.trim();
    if (tpl) {
      let filled = tpl
        .replaceAll('"{{messages}}"', JSON.stringify(messages))
        .replaceAll('"{{model}}"', JSON.stringify(settings.model))
        .replaceAll('"{{prompt}}"', JSON.stringify(prompt))
        .replaceAll("{{model}}", settings.model)
        .replaceAll("{{prompt}}", prompt.replace(/"/g, '\\"'));
      if (wantStream) {
        try {
          const parsed = JSON.parse(filled);
          parsed.stream = true;
          filled = JSON.stringify(parsed);
        } catch { /* ignore */ }
      }
      body = filled;
    } else {
      body = JSON.stringify({ model: settings.model, messages, stream: wantStream });
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (settings.apiKey) headers["Authorization"] = `Bearer ${settings.apiKey}`;
  if (endpoint.headers) {
    try {
      Object.assign(headers, JSON.parse(endpoint.headers));
    } catch {
      /* ignore */
    }
  }

  const res = await fetch(url, { method: endpoint.method, headers, body, signal });

  if (wantStream && res.ok && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let acc = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const delta =
            j?.choices?.[0]?.delta?.content ??
            j?.choices?.[0]?.message?.content ??
            "";
          if (delta) {
            acc += delta;
            onDelta?.(delta);
          }
        } catch { /* ignore */ }
      }
    }
    bumpEndpointStat(endpoint.id, "miss");
    return { text: acc, raw: acc, cached: false, label: endpoint.label };
  }

  const text = await res.text();
  let raw: unknown = text;
  try {
    raw = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const errMsg =
      typeof raw === "object" && raw && "error" in raw
        ? JSON.stringify((raw as { error: unknown }).error)
        : typeof raw === "string"
          ? raw
          : `HTTP ${res.status}`;
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    throw new ApiError(
      `${endpoint.label} → ${res.status}: ${errMsg}`,
      res.status,
      Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }
  if (endpoint.cacheTtlSec > 0) {
    setCached(cacheKey, raw, endpoint.cacheTtlSec, endpoint.label);
  }
  bumpEndpointStat(endpoint.id, "miss");
  const picked = pickByPath(raw, endpoint.responsePath);
  const out =
    typeof picked === "string"
      ? picked
      : JSON.stringify(picked ?? raw, null, 2);
  onDelta?.(out);
  return { text: out, raw, cached: false, label: endpoint.label };
}