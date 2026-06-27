import { describe, it, expect } from "vitest";
import { buildCsp, withCspHeaders } from "@/lib/csp.server";

describe("csp.server", () => {
  it("includes required directives in production", () => {
    const csp = buildCsp("production");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src");
    expect(csp).toContain("style-src");
    expect(csp).toContain("img-src");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("http://localhost:*");
    expect(csp).toContain("http://127.0.0.1:*");
    expect(csp).toContain("http://[::1]:*");
  });

  it("allows unsafe-inline for scripts in development", () => {
    const csp = buildCsp("development");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain("'unsafe-eval'");
  });

  it("does not include unsafe-eval in production", () => {
    const csp = buildCsp("production");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("adds CSP headers to a Response", () => {
    const original = new Response("<html></html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    const wrapped = withCspHeaders(original, "production");
    expect(wrapped.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(wrapped.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(wrapped.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("preserves the original response body and status", () => {
    const original = new Response("hello", { status: 200 });
    const wrapped = withCspHeaders(original, "production");
    expect(wrapped.status).toBe(200);
  });
});
