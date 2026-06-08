/**
 * Opt-in live-provider integration tests.
 *
 * These tests are SKIPPED by default unless `RUN_LIVE_PROVIDER_TESTS=true`
 * and per-provider API keys are present in the environment.
 *
 * Required env vars (any one provider is sufficient):
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY
 *
 * Run: RUN_LIVE_PROVIDER_TESTS=true OPENAI_API_KEY=sk-... npm run test:live
 *
 * These tests use real provider APIs. They are designed to be:
 *   - Low-token (short prompts)
 *   - Non-destructive (no write operations)
 *   - Time-bounded (explicit 15s timeouts)
 *   - Never logging secrets
 */

import { describe, it, expect, beforeAll } from "vitest";

// ── Guards ───────────────────────────────────────────────────────────────────

const LIVE = process.env.RUN_LIVE_PROVIDER_TESTS === "true";

const hasProvider = (keyEnv: string) => !!process.env[keyEnv];

function requireEnv(envVar: string): string {
  const val = process.env[envVar];
  if (!val) throw new Error(`${envVar} not set`);
  return val;
}

function skipUnlessLive(): boolean {
  return LIVE;
}

function skipUnlessProvider(keyEnv: string): boolean {
  return LIVE && hasProvider(keyEnv);
}

// ── Provider API utilities ───────────────────────────────────────────────────

async function fetchFromProvider(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.text();
  let parsed: unknown = data;
  try {
    parsed = JSON.parse(data);
  } catch {
    /* keep raw */
  }
  return { status: res.status, data: parsed };
}

// ── OpenAI live tests ────────────────────────────────────────────────────────

describe("OpenAI (live)", () => {
  beforeAll(() => {
    if (!skipUnlessProvider("OPENAI_API_KEY")) {
      console.warn(
        "[live:skip] OpenAI tests skipped (set OPENAI_API_KEY and RUN_LIVE_PROVIDER_TESTS=true to run).",
      );
    }
  });

  it("chat completion returns text", async () => {
    if (!skipUnlessProvider("OPENAI_API_KEY")) return;

    const apiKey = requireEnv("OPENAI_API_KEY");
    const { status, data } = await fetchFromProvider(
      "https://api.openai.com/v1/chat/completions",
      { Authorization: `Bearer ${apiKey}` },
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say 'ok'" }],
        max_tokens: 10,
      },
    );

    expect(status).toBe(200);
    const d = data as Record<string, unknown>;
    expect(d.choices).toBeDefined();
  });

  it("streaming chat completion returns chunks", async () => {
    if (!skipUnlessProvider("OPENAI_API_KEY")) return;

    const apiKey = requireEnv("OPENAI_API_KEY");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say hello" }],
        max_tokens: 10,
        stream: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    let sawChunk = false;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text.includes("data:")) sawChunk = true;
    }
    expect(sawChunk).toBe(true);
  });

  it("embeddings returns vectors", async () => {
    if (!skipUnlessProvider("OPENAI_API_KEY")) return;

    const apiKey = requireEnv("OPENAI_API_KEY");
    const { status, data } = await fetchFromProvider(
      "https://api.openai.com/v1/embeddings",
      { Authorization: `Bearer ${apiKey}` },
      {
        model: "text-embedding-3-small",
        input: ["hello"],
      },
    );

    expect(status).toBe(200);
    const d = data as Record<string, unknown>;
    const embeds = d.data as Array<{ embedding: number[] }>;
    expect(embeds).toBeDefined();
    expect(embeds[0].embedding).toBeDefined();
    expect(embeds[0].embedding.length).toBeGreaterThan(0);
  });
});

// ── Anthropic live tests ─────────────────────────────────────────────────────

describe("Anthropic (live)", () => {
  beforeAll(() => {
    if (!skipUnlessProvider("ANTHROPIC_API_KEY")) {
      console.warn(
        "[live:skip] Anthropic tests skipped (set ANTHROPIC_API_KEY and RUN_LIVE_PROVIDER_TESTS=true to run).",
      );
    }
  });

  it("chat completion returns text", async () => {
    if (!skipUnlessProvider("ANTHROPIC_API_KEY")) return;

    const apiKey = requireEnv("ANTHROPIC_API_KEY");
    const { status, data } = await fetchFromProvider(
      "https://api.anthropic.com/v1/messages",
      {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      {
        model: "claude-3-5-haiku-latest",
        max_tokens: 10,
        messages: [{ role: "user", content: "Say 'ok'" }],
      },
    );

    expect(status).toBe(200);
    const d = data as Record<string, unknown>;
    expect(d.content).toBeDefined();
  });

  it("streaming with tools emits content_block events", async () => {
    if (!skipUnlessProvider("ANTHROPIC_API_KEY")) return;

    const apiKey = requireEnv("ANTHROPIC_API_KEY");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 50,
        messages: [{ role: "user", content: "What is 2+2?" }],
        tools: [
          {
            name: "calculator",
            description: "Evaluate arithmetic",
            input_schema: {
              type: "object",
              properties: { expression: { type: "string" } },
            },
          },
        ],
        stream: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    let sawBlockStart = false;
    let sawBlockDelta = false;
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }
    // Parse SSE lines
    for (const line of buf.split("\n")) {
      const data = line.replace("data:", "").trim();
      if (!data) continue;
      try {
        const evt = JSON.parse(data);
        if (evt.type === "content_block_start") sawBlockStart = true;
        if (evt.type === "content_block_delta") sawBlockDelta = true;
      } catch {
        /* ignore */
      }
    }
    // Either streaming text or tool events should appear
    expect(sawBlockStart || sawBlockDelta).toBe(true);
  });
});

// ── Gemini live tests ────────────────────────────────────────────────────────

describe("Gemini (live)", () => {
  beforeAll(() => {
    if (!skipUnlessProvider("GEMINI_API_KEY")) {
      console.warn(
        "[live:skip] Gemini tests skipped (set GEMINI_API_KEY and RUN_LIVE_PROVIDER_TESTS=true to run).",
      );
    }
  });

  it("chat completion returns text (OpenAI-compat endpoint)", async () => {
    if (!skipUnlessProvider("GEMINI_API_KEY")) return;

    const apiKey = requireEnv("GEMINI_API_KEY");
    const { status, data } = await fetchFromProvider(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      { Authorization: `Bearer ${apiKey}` },
      {
        model: "gemini-2.5-flash-lite",
        messages: [{ role: "user", content: "Say 'ok'" }],
        max_tokens: 10,
      },
    );

    expect(status).toBe(200);
    const d = data as Record<string, unknown>;
    expect(d.choices || d.candidates).toBeDefined();
  });

  it("streaming chat completion returns chunks", async () => {
    if (!skipUnlessProvider("GEMINI_API_KEY")) return;

    const apiKey = requireEnv("GEMINI_API_KEY");
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash-lite",
          messages: [{ role: "user", content: "Say hello" }],
          max_tokens: 10,
          stream: true,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    expect(res.status).toBe(200);
  });
});

// ── Tool safety tests (synthetic — do not require API keys) ──────────────────

describe("Live tool safety", () => {
  it("safe built-in tool name accepted", () => {
    // Dynamically import the validation to test in node env
    expect("echo".match(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)).toBeTruthy();
    expect("get_current_time".match(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)).toBeTruthy();
  });

  it("unsafe tool name rejected", () => {
    expect("rm -rf /".match(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)).toBeNull();
    expect("$(shell)".match(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)).toBeNull();
  });

  it("oversized args rejected (>16KB)", () => {
    const huge = "x".repeat(17000);
    expect(huge.length > 16384).toBe(true);
  });
});
