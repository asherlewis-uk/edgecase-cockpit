// Allowlist + per-session rate limit for /api/proxy/*.
// Prevents the deployment from being used as an open relay or SSRF surface.
import { PROVIDERS } from "@/lib/providers";

const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const PER_WINDOW = 120;

export function rateLimit(key: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (b.count >= PER_WINDOW) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count++;
  return { ok: true };
}

export function threadRateLimiter(key: string): { ok: boolean; retryAfter?: number } {
  return rateLimit(key);
}

export function statsRateLimiter(key: string): { ok: boolean; retryAfter?: number } {
  return rateLimit(key);
}

export function sessionRateLimiter(key: string): { ok: boolean; retryAfter?: number } {
  return rateLimit(key);
}

function matchHost(pattern: string, host: string): boolean {
  if (pattern === "*") return true;
  if (pattern === host) return true;
  if (pattern.startsWith("*.")) return host === pattern.slice(2) || host.endsWith(pattern.slice(1));
  return false;
}

export function urlAllowedForProvider(providerId: string, url: string): boolean {
  const p = PROVIDERS.find((x) => x.id === providerId);
  if (!p) return false;
  const allowed = p.allowedHosts ?? [];
  if (allowed.length === 0) return false;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return allowed.some((pattern) => matchHost(pattern, host));
}

export function urlAllowedAnyProvider(url: string): string | null {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const p of PROVIDERS) {
    if ((p.allowedHosts ?? []).some((pat) => matchHost(pat, host))) return p.id;
  }
  return null;
}
