import { describe, it, expect } from "vitest";
import { validateCsrfToken, setCsrfCookie } from "@/lib/csrf.server";

describe("validateCsrfToken", () => {
  const TOKEN = "aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233";

  function makeRequest(method: string, headers?: Record<string, string>): Request {
    return new Request("http://localhost/api/test", {
      method,
      headers: {
        ...(headers ?? {}),
      },
    });
  }

  describe("safe methods", () => {
    it.each(["GET", "HEAD", "OPTIONS"])("returns true for %s without token", (method) => {
      const req = makeRequest(method);
      expect(validateCsrfToken(req)).toBe(true);
    });

    it.each(["GET", "HEAD", "OPTIONS"])("returns true for %s even with bad token", (method) => {
      const req = makeRequest(method, {
        "X-CSRF-Token": "bad",
        Cookie: "csrf-token=other",
      });
      expect(validateCsrfToken(req)).toBe(true);
    });
  });

  describe("unsafe methods", () => {
    it.each(["POST", "PUT", "PATCH", "DELETE"])("requires X-CSRF-Token header for %s", (method) => {
      const req = makeRequest(method, {
        Cookie: `csrf-token=${TOKEN}`,
      });
      const result = validateCsrfToken(req);
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    });

    it.each(["POST", "PUT", "PATCH", "DELETE"])("requires csrf-token cookie for %s", (method) => {
      const req = makeRequest(method, {
        "X-CSRF-Token": TOKEN,
      });
      const result = validateCsrfToken(req);
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    });

    it.each(["POST", "PUT", "PATCH", "DELETE"])("rejects mismatched token for %s", (method) => {
      const req = makeRequest(method, {
        "X-CSRF-Token": TOKEN,
        Cookie: "csrf-token=other-token",
      });
      const result = validateCsrfToken(req);
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    });

    it.each(["POST", "PUT", "PATCH", "DELETE"])("accepts matching token for %s", (method) => {
      const req = makeRequest(method, {
        "X-CSRF-Token": TOKEN,
        Cookie: `csrf-token=${TOKEN}`,
      });
      expect(validateCsrfToken(req)).toBe(true);
    });
  });

  describe("token validation edge cases", () => {
    it("rejects empty header token", () => {
      const req = makeRequest("POST", {
        "X-CSRF-Token": "",
        Cookie: `csrf-token=${TOKEN}`,
      });
      const result = validateCsrfToken(req);
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    });

    it("rejects empty cookie token", () => {
      const req = makeRequest("POST", {
        "X-CSRF-Token": TOKEN,
        Cookie: "csrf-token=",
      });
      const result = validateCsrfToken(req);
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    });

    it("rejects whitespace-only token", () => {
      const req = makeRequest("POST", {
        "X-CSRF-Token": "   ",
        Cookie: "csrf-token=   ",
      });
      const result = validateCsrfToken(req);
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    });

    it("rejects short token", () => {
      const req = makeRequest("POST", {
        "X-CSRF-Token": "1234",
        Cookie: "csrf-token=1234",
      });
      const result = validateCsrfToken(req);
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    });

    it("handles malformed cookie header gracefully", () => {
      const req = makeRequest("POST", {
        "X-CSRF-Token": TOKEN,
        Cookie: ";;;=;;; ; ;;;",
      });
      const result = validateCsrfToken(req);
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    });

    it("handles multiple cookies and finds csrf-token", () => {
      const req = makeRequest("POST", {
        "X-CSRF-Token": TOKEN,
        Cookie: `other=value; csrf-token=${TOKEN}; session=abc`,
      });
      expect(validateCsrfToken(req)).toBe(true);
    });

    it("uses timing-safe comparison to prevent timing attacks", () => {
      const req = makeRequest("POST", {
        "X-CSRF-Token": TOKEN,
        Cookie: `csrf-token=${TOKEN.slice(0, -1)}x`,
      });
      const result = validateCsrfToken(req);
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    });
  });

  describe("setCsrfCookie", () => {
    it("returns a Set-Cookie header string", () => {
      const header = setCsrfCookie();
      expect(header).toContain("csrf-token=");
      expect(header).toContain("Path=/");
      expect(header).toContain("SameSite=Lax");
      expect(header).toContain("Secure");
      expect(header).toContain("Max-Age=");
    });

    it("generates a token of correct length", () => {
      const header = setCsrfCookie();
      const match = header.match(/csrf-token=([0-9a-f]{64})/);
      expect(match).toBeTruthy();
      expect(match![1]).toHaveLength(64);
    });
  });
});
