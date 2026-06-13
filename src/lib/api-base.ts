/**
 * Native-safe API base URL detection.
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

const DEFAULT_NATIVE_API_URL = "https://tanstack-start-app.workers.dev";

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

/**
 * Fetch wrapper that prepends the native API base URL when running in a
 * native shell (Electron, Capacitor). In browser contexts it passes through
 * to the global fetch unchanged.
 *
 * Adds X-Native-App: 1 header in native contexts so the server can skip
 * same-origin CSRF checks for cross-origin native requests.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getApiBaseUrl();
  const url = base ? `${base}${path}` : path;

  if (!base) return fetch(url, init);

  // Native context: add bypass header and merge any caller-supplied headers.
  const headers = new Headers(init?.headers);
  headers.set("X-Native-App", "1");

  return fetch(url, { ...init, headers });
}
