// Content Security Policy header builder.
// This module is server-side only and generates a single CSP string suitable
// for the app's runtime (TanStack Start + Vite). Local/self-hosted provider
// calls go through /api/proxy/*, so the page's connect-src can stay same-origin.

export type CspMode = "production" | "development";

export function buildCsp(mode: CspMode = "production"): string {
  const isDev = mode === "development";

  // In development Vite injects inline scripts/styles for HMR and module
  // preloading. In production the build emits external chunks, but React
  // hydration may still require inline scripts depending on the framework
  // version. We keep script-src strictest-possible per mode.
  const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";

  const styleSrc = isDev ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline'";

  const directives: Record<string, string> = {
    "default-src": "'self'",
    "base-uri": "'self'",
    "object-src": "'none'",
    "frame-ancestors": "'none'",
    "script-src": scriptSrc,
    "style-src": styleSrc,
    "img-src": "'self' data: blob:",
    "connect-src": "'self'",
    "font-src": "'self'",
    "media-src": "'self' blob:",
    "form-action": "'self'",
    "frame-src": "'none'",
  };

  return Object.entries(directives)
    .map(([key, value]) => `${key} ${value}`)
    .join("; ");
}

/**
 * Add CSP headers to a Response. Preserves existing headers.
 */
export function withCspHeaders(response: Response, mode?: CspMode): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", buildCsp(mode));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
