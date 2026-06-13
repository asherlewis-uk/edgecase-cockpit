// CSRF protection using double-submit cookie pattern.
// The server sets a random token in a readable (non-httpOnly) cookie.
// The client reads it and sends it back as the X-CSRF-Token header.
// The server validates that the header value matches the cookie value.
//
// Security: only same-origin JavaScript can read the cookie, so a cross-origin
// attacker cannot forge the matching header.
//
// Native apps (Electron, Capacitor) load from file:// or capacitor:// and make
// cross-origin API calls to the deployed Worker. They cannot read the Worker's
// cookies, so CSRF validation is skipped when the X-Native-App: 1 header is present.

const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "X-CSRF-Token";
const NATIVE_APP_HEADER = "X-Native-App";
const TOKEN_BYTES = 32;
const EXPECTED_TOKEN_LENGTH = TOKEN_BYTES * 2; // hex encoding

function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function tokenCookieHeader(token: string): string {
  return `${CSRF_COOKIE}=${token}; Path=/; SameSite=Lax; Secure; Max-Age=2592000`;
}

/**
 * Return a Set-Cookie header value for the CSRF token cookie.
 * Generates a fresh token each call — no session dependency.
 */
export function setCsrfCookie(): string {
  const token = generateToken();
  return tokenCookieHeader(token);
}

/**
 * Parse a cookie header string into a key-value map.
 */
function parseCookies(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq > 0) {
      result[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  }
  return result;
}

/**
 * Constant-time comparison of two hex strings to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Validate a CSRF token from the X-CSRF-Token header against the csrf-token cookie.
 *
 * Skipped for:
 * - Safe methods (GET, HEAD, OPTIONS)
 * - Native app requests (X-Native-App: 1) — native shells cannot read Worker cookies
 *
 * Returns true if valid, or a Response object with a 403 error if invalid.
 */
export function validateCsrfToken(request: Request): true | Response {
  const method = request.method.toUpperCase();

  // Safe methods don't need CSRF protection
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;

  // Native apps (Electron, Capacitor) make cross-origin requests and
  // cannot read the Worker's cookies. Skip CSRF for these clients.
  if (request.headers.get(NATIVE_APP_HEADER) === "1") return true;

  const headerToken = request.headers.get(CSRF_HEADER)?.trim();
  if (!headerToken) {
    return Response.json({ error: "Missing CSRF token" }, { status: 403 });
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);
  const cookieToken = cookies[CSRF_COOKIE]?.trim();

  if (
    !cookieToken ||
    cookieToken.length !== EXPECTED_TOKEN_LENGTH ||
    headerToken.length !== EXPECTED_TOKEN_LENGTH ||
    !timingSafeEqual(headerToken, cookieToken)
  ) {
    return Response.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  return true;
}

export { CSRF_COOKIE, CSRF_HEADER, NATIVE_APP_HEADER };
