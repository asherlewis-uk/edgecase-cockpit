// Transport client for the truthful Linux backend API.
// Encapsulates the BACKEND_ORIGIN check and URL construction so route handlers
// do not repeat them. Knows nothing about routes, D1, or response shapes.
import { getBackendOrigin, type EnvSource } from "@/lib/env.server";

export class BackendNotConfiguredError extends Error {
  constructor() {
    super("Linux backend is not configured (BACKEND_ORIGIN unset).");
    this.name = "BackendNotConfiguredError";
  }
}

// Join the configured origin to a request path.
//
// Deliberately a string join rather than `new URL(path, origin)`: URL
// resolution lets an absolute path argument replace the origin outright
// (`new URL("http://evil.example", origin)` is "http://evil.example/"), so any
// handler that forwards a user-supplied path would become an SSRF surface.
// Joining pins every request to BACKEND_ORIGIN. A base path in the origin is
// preserved; only the slashes at the seam are normalized.
function joinUrl(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, "");
  const suffix = path.replace(/^\/+/, "");
  return suffix === "" ? base : `${base}/${suffix}`;
}

/**
 * Fetch `path` from the configured Linux backend.
 *
 * Rejects with BackendNotConfiguredError when BACKEND_ORIGIN is unset, so
 * callers see one failure channel for both misconfiguration and network errors.
 */
export async function backendFetch(
  path: string,
  init?: RequestInit,
  envSource: EnvSource = process.env,
): Promise<Response> {
  const origin = getBackendOrigin(envSource);
  if (origin === undefined) {
    throw new BackendNotConfiguredError();
  }
  return fetch(joinUrl(origin, path), init);
}
