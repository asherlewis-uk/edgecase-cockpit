// Token counting and cost estimation for LLM provider usage.
// Uses gpt-tokenizer (OpenAI-compatible BPE) when available, with a lightweight
// character/word heuristic fallback. The tokenizer is lazy-loaded so the main
// bundle is not inflated unless token estimation is actually invoked.

// ---------------------------------------------------------------------------
// Lazy tokenizer
// ---------------------------------------------------------------------------

type TokenizerApi = { encode: (text: string) => number[] };
let _tokenizer: TokenizerApi | null | "loading" = null;
let _tokenizerPromise: Promise<TokenizerApi | null> | null = null;

async function loadTokenizer(): Promise<TokenizerApi | null> {
  if (_tokenizer && _tokenizer !== "loading") return _tokenizer;
  if (_tokenizerPromise) return _tokenizerPromise;

  _tokenizer = "loading";
  _tokenizerPromise = import("gpt-tokenizer/esm/encoding/cl100k_base")
    .then((mod) => {
      const api = mod.default ?? mod;
      _tokenizer = api as TokenizerApi;
      return _tokenizer;
    })
    .catch((err) => {
      console.warn("Failed to load gpt-tokenizer, falling back to heuristic:", err);
      _tokenizer = null;
      return null;
    });

  return _tokenizerPromise;
}

/** Start loading the tokenizer in the background. Safe to call repeatedly. */
export function primeTokenizer(): void {
  void loadTokenizer();
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimate token count for a string of text.
 *
 * Uses gpt-tokenizer (OpenAI BPE) when available. Falls back to the previous
 * lightweight heuristic:
 *   1. ~4 characters per token
 *   2. words × 1.3
 * The fallback is kept for environments where the tokenizer module cannot be
 * loaded (e.g. constrained Worker deployments) and for synchronous callers.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // If the tokenizer has already loaded synchronously (it won't; imports are
  // async), use it. Otherwise use the heuristic synchronously. Async callers
  // that need the exact count can call estimateTokensAsync.
  if (_tokenizer && _tokenizer !== "loading") {
    try {
      return Math.max(1, _tokenizer.encode(text).length);
    } catch {
      // fall through
    }
  }

  const charEstimate = text.length / 4;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const wordEstimate = wordCount * 1.3;
  return Math.max(1, Math.round((charEstimate + wordEstimate) / 2));
}

/** Async variant that attempts to load the real tokenizer first. */
export async function estimateTokensAsync(text: string): Promise<number> {
  if (!text) return 0;
  const tokenizer = await loadTokenizer();
  if (tokenizer) {
    try {
      return Math.max(1, tokenizer.encode(text).length);
    } catch {
      // fall through to heuristic
    }
  }
  return estimateTokens(text);
}

export function estimateMessageTokens(msg: { content: string }): number {
  return estimateTokens(msg.content);
}

export function estimateThreadTokens(thread: { messages: Array<{ content: string }> }): number {
  return thread.messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

// ---------------------------------------------------------------------------
// Cost rates (per 1,000 tokens, $USD)
// ---------------------------------------------------------------------------

/**
 * Provider cost rates per 1,000 tokens.
 * Based on current public pricing as of mid-2025.
 * Overridable per-provider via settings.rag.costOverrides or server config.
 */
const _COST_DEFAULTS: Record<string, { input: number; output: number }> = {
  openai: { input: 0.00015, output: 0.0006 },
  anthropic: { input: 0.003, output: 0.015 },
  gemini: { input: 0.000075, output: 0.0003 },
  openrouter: { input: 0.00015, output: 0.0006 },
  moonshot: { input: 0.001, output: 0.004 },
  "nvidia-nim": { input: 0.00035, output: 0.0011 },
  "vercel-ai": { input: 0.00015, output: 0.0006 },
};

let _costOverrides: Record<string, { input?: number; output?: number }> = {};

export function setCostOverrides(overrides: Record<string, { input?: number; output?: number }>) {
  _costOverrides = overrides;
}

export function getCostRates(providerId: string): { input: number; output: number } {
  const defaults = _COST_DEFAULTS[providerId] ?? _COST_DEFAULTS.openai;
  const overrides = _costOverrides[providerId] ?? {};
  return {
    input: overrides.input ?? defaults.input,
    output: overrides.output ?? defaults.output,
  };
}

/**
 * Estimate cost for a provider given input and output token counts.
 * Falls back to openai rates for unknown providers.
 */
export function estimateCost(
  providerId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = getCostRates(providerId);
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
}

/**
 * Estimate total cost for a thread's messages against a provider.
 * Treats user + system messages as input; assistant messages as output.
 */
export function estimateThreadCost(
  thread: { messages: Array<{ content: string; role: string }> },
  providerId: string,
): number {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const m of thread.messages) {
    const tokens = estimateMessageTokens(m);
    if (m.role === "assistant") {
      outputTokens += tokens;
    } else {
      inputTokens += tokens;
    }
  }
  return estimateCost(providerId, inputTokens, outputTokens);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a USD cost with appropriate precision:
 *   - >= $0.01: 2 decimal places
 *   - < $0.01: up to 6 decimal places, stripping trailing zeros past 2
 */
export function formatCost(cost: number): string {
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  if (cost === 0) return "$0";
  // For sub-cent costs, show up to 6 decimal places then strip trailing zeros
  const fixed = cost.toFixed(6);
  const stripped = fixed.replace(/0+$/, "").replace(/\.$/, "");
  return `$${stripped}`;
}

/**
 * Format a token count with locale-aware grouping (e.g. "1,234").
 */
export function formatTokens(tokens: number): string {
  return tokens.toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// Exact usage extraction from provider responses
// ---------------------------------------------------------------------------

export type ProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  exact: boolean;
};

/**
 * Extract exact token usage from provider response data.
 * Returns null when no usage data is present.
 */
export function extractProviderUsage(raw: unknown, bodyStyle: string): ProviderUsage | null {
  if (!raw || typeof raw !== "object") return null;

  // OpenAI / OpenAI-compatible format: { usage: { prompt_tokens, completion_tokens } }
  const oaUsage = (raw as { usage?: { prompt_tokens?: number; completion_tokens?: number } })
    ?.usage;
  if (
    oaUsage &&
    (typeof oaUsage.prompt_tokens === "number" || typeof oaUsage.completion_tokens === "number")
  ) {
    return {
      inputTokens: oaUsage.prompt_tokens ?? 0,
      outputTokens: oaUsage.completion_tokens ?? 0,
      exact: true,
    };
  }

  // Anthropic format: { usage: { input_tokens, output_tokens } }
  if (bodyStyle === "anthropic") {
    const anUsage = (raw as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage;
    if (
      anUsage &&
      (typeof anUsage.input_tokens === "number" || typeof anUsage.output_tokens === "number")
    ) {
      return {
        inputTokens: anUsage.input_tokens ?? 0,
        outputTokens: anUsage.output_tokens ?? 0,
        exact: true,
      };
    }
  }

  // Gemini OpenAI-compat may return usage fields
  const geminiUsage = (
    raw as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
  )?.usageMetadata;
  if (
    geminiUsage &&
    (typeof geminiUsage.promptTokenCount === "number" ||
      typeof geminiUsage.candidatesTokenCount === "number")
  ) {
    return {
      inputTokens: geminiUsage.promptTokenCount ?? 0,
      outputTokens: geminiUsage.candidatesTokenCount ?? 0,
      exact: true,
    };
  }

  return null;
}
