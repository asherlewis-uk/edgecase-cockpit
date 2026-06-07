// CSRF protection using double-submit cookie pattern.
// The server sets a random token in a readable (non-httpOnly) cookie.
// The client reads it and sends it back as the X-CSRF-Token header.
// The server validates that the header value matches the cookie value.
//
// Security: only same-origin JavaScript can read the cookie, so a cross-origin
// attacker cannot forge the matching header.

const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "X-CSRF-Token";
const TOKEN_BYTES = 32;

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
 * Validate a CSRF token from the X-CSRF-Token header against the csrf-token cookie.
 * For safe methods (GET, HEAD, OPTIONS), validation is skipped.
 * Returns true if valid, or a Response object with a 403 error if invalid.
 */
export function validateCsrfToken(request: Request): true | Response {
  const method = request.method.toUpperCase();

  // Safe methods don't need CSRF protection
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;

  const headerToken = request.headers.get(CSRF_HEADER);
  if (!headerToken) {
    return Response.json({ error: "Missing CSRF token" }, { status: 403 });
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);
  const cookieToken = cookies[CSRF_COOKIE];

  if (!cookieToken || headerToken !== cookieToken) {
    return Response.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  return true;
}

export { CSRF_COOKIE, CSRF_HEADER };
