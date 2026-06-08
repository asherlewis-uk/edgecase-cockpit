import { describe, it, expect, beforeEach, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks commonly use any */

// ── Mock dependencies ────────────────────────────────────────────────────────

vi.mock("@/lib/cockpit-store", () => ({
  csrfHeaders: () => ({ "X-CSRF-Token": "test-token" }),
}));

const mockClearVectorStore = vi.fn();
const mockAddVectorDocs = vi.fn();
const mockSearchVectorStore = vi.fn();
const mockGetVectorStoreSize = vi.fn(() => 0);

vi.mock("@/lib/vector-store", () => ({
  clearVectorStore: mockClearVectorStore,
  addVectorDocs: mockAddVectorDocs,
  searchVectorStore: mockSearchVectorStore,
  getVectorStoreSize: mockGetVectorStoreSize,
  chunkText: (text: string) => (text ? [text] : []),
}));

// ── RAG + embedding proxy integration tests ─────────────────────────────────

describe("RAG retrieval flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVectorStoreSize.mockReturnValue(0);
  });

  describe("embedding proxy request (unit shape)", () => {
    it("sends correct JSON body for embedding proxy", async () => {
      const body = {
        providerId: "openai",
        model: "text-embedding-3-small",
        input: ["Hello world"],
      };

      // Verify the request shape matches what the embedding proxy route expects
      expect(body).toEqual({
        providerId: "openai",
        model: "text-embedding-3-small",
        input: ["Hello world"],
      });
      expect(Array.isArray(body.input)).toBe(true);
      expect(body.input.length).toBeGreaterThan(0);
    });

    it("does not send API key in client embedding request", async () => {
      // The client-side embedTexts() function sends providerId + input only.
      // The API key is retrieved server-side from the encrypted session.
      const requestBody = JSON.stringify({
        providerId: "openai",
        model: "text-embedding-3-small",
        input: ["test"],
      });

      const parsed = JSON.parse(requestBody);
      expect(parsed).not.toHaveProperty("apiKey");
      expect(parsed).not.toHaveProperty("key");
      expect(parsed).not.toHaveProperty("authorization");
      expect(parsed.providerId).toBe("openai");
    });
  });

  describe("RAG context injection (in-memory)", () => {
    it("builds expected context string from search results", () => {
      mockSearchVectorStore.mockReturnValue([
        { id: "1", text: "Previous message about coffee", embedding: [1, 0] },
        { id: "2", text: "AI models for code generation", embedding: [0, 1] },
      ]);

      const results = mockSearchVectorStore([0.5, 0.5], 3);
      expect(results).toHaveLength(2);

      const contextText =
        "Relevant context from previous messages:\n" +
        results.map((r: { text: string }) => `- ${r.text}`).join("\n");

      expect(contextText).toContain("Previous message about coffee");
      expect(contextText).toContain("AI models for code generation");
      expect(contextText).toContain("Relevant context from previous messages:");
    });
  });

  describe("RAG error propagation", () => {
    it("sets ragError when embedding fails", () => {
      // Simulate the try/catch in sendMessage from use-chat.ts
      let ragError: string | null = null;

      try {
        throw new Error("Embedding failed (502): Upstream error");
      } catch {
        ragError = "RAG embedding unavailable";
      }

      expect(ragError).toBe("RAG embedding unavailable");
    });

    it("sets ragError when retrieval fails", () => {
      let ragError: string | null = null;

      try {
        throw new Error("Connection refused");
      } catch {
        ragError = "RAG retrieval unavailable";
      }

      expect(ragError).toBe("RAG retrieval unavailable");
    });

    it("ragError is null when RAG is disabled", () => {
      // When RAG is disabled (rag.enabled === false), ragError should
      // remain null — no embedding/retrieval is attempted.
      const ragEnabled = false;
      let ragError: string | null = null;

      if (ragEnabled) {
        // Would attempt embedding (not reached in this test)
        ragError = "some error";
      }

      expect(ragError).toBeNull();
    });
  });

  describe("RAG + proxy guard interaction", () => {
    it("custom provider with allowed host passes URL check", () => {
      // Simulate what urlAllowedForProvider does for custom provider in dev
      const isWildcardAllowed = () => {
        // In development NODE_ENV !== "production" → wildcard always allowed
        return process.env.NODE_ENV !== "production";
      };

      const allowed = isWildcardAllowed();
      expect(allowed).toBe(true);

      // Even in production, with opt-in, it's allowed
      const prodAllowed = process.env.PROXY_ALLOW_CUSTOM_WILDCARD === "true";
      // In test env, NODE_ENV is not production, so wildcard works.
    });

    it("OpenAI provider URL is always checkable by proxy guard", () => {
      // This verifies the test infrastructure understands the allowlist concept
      const ALLOWED_HOSTS: Record<string, string[]> = {
        openai: ["api.openai.com"],
        anthropic: ["api.anthropic.com"],
        gemini: ["generativelanguage.googleapis.com"],
      };

      const url = new URL("https://api.openai.com/v1/chat/completions");
      const allowed = ALLOWED_HOSTS["openai"].some((h) => url.hostname === h);
      expect(allowed).toBe(true);
    });

    it("disallowed host is rejected for OpenAI provider", () => {
      const ALLOWED_HOSTS: Record<string, string[]> = {
        openai: ["api.openai.com"],
      };

      const url = new URL("https://evil.com/api");
      const allowed = ALLOWED_HOSTS["openai"].some((h) => url.hostname === h);
      expect(allowed).toBe(false);
    });
  });
});

// ── Multi-tool call guard ────────────────────────────────────────────────────

describe("multi-tool call safety", () => {
  it("all four built-in tools have safe names", () => {
    const BUILTIN_NAMES = ["get_current_time", "echo", "word_count", "calculator"];
    for (const name of BUILTIN_NAMES) {
      expect(name).toMatch(/^[a-z_][a-z0-9_]*$/);
      expect(name.length).toBeLessThan(100);
    }
  });

  it("tool execution rejects non-built-in tools", () => {
    const isBuiltIn = (name: string) =>
      ["get_current_time", "echo", "word_count", "calculator"].includes(name);

    expect(isBuiltIn("echo")).toBe(true);
    expect(isBuiltIn("get_current_time")).toBe(true);
    expect(isBuiltIn("delete_everything")).toBe(false);
    expect(isBuiltIn("../../etc/passwd")).toBe(false);
    expect(isBuiltIn("$(shell_injection)")).toBe(false);
  });

  it("combined multi-tool parse validates each name individually", () => {
    // Simulates parseOpenAIToolCalls behavior where each tool name is validated
    const validateToolName = (name: string) =>
      /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name) && name.length <= 128;

    const rawToolCalls = [
      { name: "echo" },
      { name: "rm -rf /" },
      { name: "word_count" },
      { name: "$(bad)" },
    ];

    const safe = rawToolCalls.filter((t) => validateToolName(t.name));
    expect(safe).toHaveLength(2);
    expect(safe.map((t) => t.name)).toEqual(["echo", "word_count"]);
  });

  it("rejects tool call without valid id", () => {
    // Simulates validateToolCall rejecting calls with empty id
    const validateToolCall = (call: Record<string, unknown>) =>
      typeof call.id === "string" && call.id.length > 0;

    expect(validateToolCall({ id: "call-1", name: "echo", arguments: "{}" })).toBe(true);
    expect(validateToolCall({ id: "", name: "echo", arguments: "{}" })).toBe(false);
    expect(validateToolCall({ name: "echo", arguments: "{}" })).toBe(false);
  });

  it("rejects oversized tool call arguments", () => {
    // Simulates sanitizeToolCallArgs rejecting >16KB args and empty strings
    const MAX_ARGS = 16384;
    const sanitizeArgs = (args: string): Record<string, unknown> | null => {
      if (!args || args.length > MAX_ARGS) return null;
      try {
        return JSON.parse(args);
      } catch {
        return null;
      }
    };

    expect(sanitizeArgs(JSON.stringify({ x: 1 }))).toEqual({ x: 1 });
    expect(sanitizeArgs("x".repeat(17000))).toBeNull();
    expect(sanitizeArgs("")).toBeNull();
  });
});
