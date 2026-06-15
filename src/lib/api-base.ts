/**
 * Native-safe API base URL detection and direct fetch utilities.
 *
 * In browser/web contexts, returns "" (empty) so fetch("/api/...") resolves
 * same-origin against the Cloudflare Worker that served the page.
 *
 * In native contexts (Electron file://, Capacitor capacitor://), returns the
 * configured VITE_NATIVE_API_URL so API calls reach the deployed Worker.
 *
 * Vite injects VITE_* env vars at build time via @lovable.dev/vite-tanstack-config.
 * Set VITE_NATIVE_API_URL in .env.local (or CI env) to your deployed Worker URL,
 * e.g. https://edgecase-cockpit.workers.dev.
 */

const DEFAULT_NATIVE_API_URL = "https://edgecase-cockpit.asher-lewis-knight.workers.dev";

interface CapacitorWindow {
  Capacitor?: { isNativePlatform?: () => boolean };
}

function isNativeContext(): boolean {
  if (typeof window === "undefined") return false;
  // file:// protocol → Electron production
  // window.location may be unavailable in test environments; guard defensively.
  try {
    if (window.location?.protocol === "file:") return true;
  } catch {
    /* window.location unavailable (e.g. test env) — treat as non-native */
  }
  // Capacitor native bridge present → iOS/Android WebView
  try {
    const cw = window as unknown as CapacitorWindow;
    if (typeof cw.Capacitor?.isNativePlatform === "function") {
      return cw.Capacitor.isNativePlatform();
    }
  } catch {
    /* Capacitor bridge unavailable */
  }
  return false;
}

export function getApiBaseUrl(): string {
  if (!isNativeContext()) return "";

  // Vite injects VITE_* env vars as import.meta.env.* at build time.
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
  const nativeUrl = env?.VITE_NATIVE_API_URL?.trim() || DEFAULT_NATIVE_API_URL;
  return nativeUrl.replace(/\/+$/, "");
}

// ── URL helpers ───────────────────────────────────────────────────────────

export function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function isLocalProviderUrl(url: string): boolean {
  if (!isAbsoluteUrl(url)) return false;
  try {
    const u = new URL(url);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname.endsWith(".local");
  } catch {
    return false;
  }
}

// ── Direct fetch (local providers) ─────────────────────────────────────────

/**
 * Direct fetch for local provider URLs, bypassing the Cloudflare Worker proxy.
 *
 * In native contexts, platform CORS handling is configured externally:
 *   - Electron: main process injects CORS headers via webRequest.onHeadersReceived
 *   - Capacitor: CapacitorHttp plugin intercepts fetch calls natively
 *
 * In browser contexts this is a plain fetch(); local providers from https:// origins
 * will still be blocked by CORS / mixed-content, which is expected — browser users
 * should rely on the proxy for local providers, or run the app from a secure origin.
 */
export async function directFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

// ── API fetch (cloud / app infrastructure) ──────────────────────────────────

/**
 * Fetch wrapper that routes API calls through the Cloudflare Worker proxy
 * when in native contexts. Automatically bypasses the proxy for local provider
 * URLs (localhost, 127.0.0.1, *.local) to ensure zero network calls to app
 * infrastructure for on-device models.
 *
 * Adds X-Native-App: 1 header in native contexts so the server can skip
 * same-origin CSRF checks for cross-origin native requests.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // If this is a direct local provider URL, bypass the Cloudflare Worker
  if (isAbsoluteUrl(path) && isLocalProviderUrl(path)) {
    return directFetch(path, init);
  }

  const base = getApiBaseUrl();
  const url = base ? `${base}${path}` : path;

  if (!base) return fetch(url, init);

  // Native context: add bypass header and merge any caller-supplied headers.
  const headers = new Headers(init?.headers);
  headers.set("X-Native-App", "1");

  return fetch(url, { ...init, headers });
}
