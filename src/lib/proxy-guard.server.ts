// Allowlist + per-session rate limit for /api/proxy/*.
// Prevents the deployment from being used as an open relay or SSRF surface.
import { PROVIDERS } from "@/lib/providers";

const buckets = new Map<string, { count: number; resetAt: number }>();
export const DEFAULT_WINDOW_MS = 60_000;
export const DEFAULT_PER_WINDOW = 120;

export type RateLimitConfig = {
  windowMs?: number;
  perWindow?: number;
};

export function rateLimit(
  key: string,
  config: RateLimitConfig = {},
): { ok: boolean; retryAfter?: number } {
  const windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
  const perWindow = config.perWindow ?? DEFAULT_PER_WINDOW;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (b.count >= perWindow) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count++;
  return { ok: true };
}

/** Clear all proxy-guard rate-limit buckets. Exposed for tests. */
export function clearProxyGuardBuckets(): void {
  buckets.clear();
}

function matchHost(pattern: string, host: string): boolean {
  if (pattern === "*") return true;
  if (pattern === host) return true;
  if (pattern.startsWith("*.")) return host === pattern.slice(2) || host.endsWith(pattern.slice(1));
  return false;
}

/**
 * Is a wildcard host pattern (*) allowed right now?
 *
 * In development: always allowed (local exploration).
 * In production:  only allowed when PROXY_ALLOW_CUSTOM_WILDCARD=true
 *                 is explicitly set (opt-in).  Without it, custom-provider
 *                 wildcard targets are rejected — the operator must
 *                 add explicit hosts to the provider's allowedHosts.
 */
export function isWildcardHostAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.PROXY_ALLOW_CUSTOM_WILDCARD === "true";
}

/**
 * Emit a startup log line so operators can see the effective policy.
 * Call at module init time (server.ts already does).
 */
export function logCustomProviderPolicy(): void {
  if (process.env.NODE_ENV !== "production") return;
  const allowed = isWildcardHostAllowed();
  console.warn(
    `[proxy-guard] Custom-provider wildcard hosts ("*") are ` +
      `${allowed ? "ALLOWED" : "BLOCKED"} in production. ` +
      `${allowed ? "" : "Set PROXY_ALLOW_CUSTOM_WILDCARD=true to opt in, "}` +
      `or add explicit hosts to the custom provider's allowedHosts.`,
  );
}

/** Parse a hostname that may be a decimal, hex, or octal-encoded IPv4 literal. */
function normalizeIpv4Literal(host: string): string | null {
  // Dotted quad, possibly with octal or hex components.
  const parts = host.split(".");
  if (parts.length === 4) {
    const octets = parts.map((p) => {
      if (/^0[xX][0-9a-fA-F]+$/.test(p)) return parseInt(p, 16);
      if (/^0[0-7]+$/.test(p)) return parseInt(p, 8);
      if (/^\d+$/.test(p)) return parseInt(p, 10);
      return NaN;
    });
    if (octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255)) {
      return octets.join(".");
    }
    return null;
  }
  // Bare integer forms: 2130706433, 0x7f000001, 017700000001.
  let value: number | null = null;
  if (/^0[xX][0-9a-fA-F]+$/.test(host)) value = parseInt(host, 16);
  else if (/^0[0-7]+$/.test(host)) value = parseInt(host, 8);
  else if (/^\d+$/.test(host)) value = parseInt(host, 10);
  if (value === null || !Number.isInteger(value) || value < 0 || value > 0xffffffff) return null;
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

function isBlockedIpv4(dotted: string): boolean {
  const [a, b] = dotted.split(".").map(Number);
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0) return true; // 192.0.0/24 protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a >= 224) return true; // 224/4 multicast + 240/4 reserved
  return false;
}

/**
 * Is this URL pointed at an IP literal in a range that must never be reached
 * from the server?
 *
 * NAME-based hosts are deliberately NOT resolved here: local providers
 * allowlist "localhost" and "127.0.0.1" by name on purpose, and resolving
 * names would both break that and be unavailable on Workers. This blocks the
 * encodings an attacker uses to smuggle an internal address past a name-based
 * allowlist. DNS rebinding remains open — it cannot be closed without
 * resolve-then-connect, which Workers does not offer.
 */
export function isBlockedNetworkTarget(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return true; // unparseable is not safe
  }

  // IPv6 literals arrive bracketed from URL.hostname ("[::1]",
  // "[::ffff:7f00:1]"), and IPv4-mapped addresses are canonicalized to hex.
  // Strip the brackets so the range checks below see the bare form.
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (host.includes(":")) {
    const v6 = host.toLowerCase();
    if (v6 === "::" || v6 === "::1") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true; // fc00::/7
    if (/^fe[89ab][0-9a-f]:/.test(v6)) return true; // fe80::/10
    const mapped = /^::ffff:(.+)$/.exec(v6);
    if (mapped) {
      const inner = normalizeIpv4Literal(mapped[1]);
      return inner ? isBlockedIpv4(inner) : true;
    }
    // Fail CLOSED on any other IPv6 literal. IPv4-compatible ([::127.0.0.1]),
    // 6to4 ([2002:7f00:1::]), NAT64 ([64:ff9b::127.0.0.1]), Teredo and ISATAP
    // all embed an IPv4 address that URL.hostname canonicalizes to hex, so the
    // range checks above cannot see it. No provider allowlists an IPv6 literal,
    // so blocking the unrecognized remainder costs nothing legitimate.
    return true;
  }

  const dotted = normalizeIpv4Literal(host);
  // Not an IP literal at all — a name. Leave it to the allowlist.
  if (!dotted) return false;
  return isBlockedIpv4(dotted);
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

  // Explicit (non-wildcard) allowlist entries are honoured as-is, with no IP
  // guard: local providers allowlist "127.0.0.1" and "localhost" on purpose.
  for (const pattern of allowed) {
    if (pattern === "*") continue;
    if (matchHost(pattern, host)) return true;
  }

  // Only a wildcard match is subject to the network-target guard.
  if (allowed.includes("*")) {
    if (!isWildcardHostAllowed()) {
      console.warn(
        `[proxy-guard] Custom-provider wildcard request blocked for host "${host}" ` +
          `(PROXY_ALLOW_CUSTOM_WILDCARD not enabled).`,
      );
      return false;
    }
    if (isBlockedNetworkTarget(url)) return false;
    return true;
  }

  return false;
}

export function urlAllowedAnyProvider(url: string): string | null {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }

  // First pass: explicit (non-wildcard) allowlist entries are honoured as-is,
  // with no IP guard — local providers allowlist "127.0.0.1" on purpose.
  for (const p of PROVIDERS) {
    const patterns = p.allowedHosts ?? [];
    for (const pattern of patterns) {
      if (pattern === "*") continue;
      if (matchHost(pattern, host)) return p.id;
    }
  }

  // Second pass: a wildcard match requires the same production opt-in
  // urlAllowedForProvider enforces, AND the network-target guard. Without the
  // opt-in, the `custom` provider's "*" would make every host reachable from
  // /api/proxy/detect.
  for (const p of PROVIDERS) {
    const patterns = p.allowedHosts ?? [];
    for (const pattern of patterns) {
      if (pattern !== "*") continue;
      if (!isWildcardHostAllowed()) continue;
      if (isBlockedNetworkTarget(url)) continue;
      return p.id;
    }
  }
  return null;
}
