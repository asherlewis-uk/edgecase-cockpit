import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  estimateMessageTokens,
  estimateThreadTokens,
  estimateCost,
  estimateThreadCost,
  formatCost,
  formatTokens,
  extractProviderUsage,
  setCostOverrides,
  getCostRates,
} from "@/lib/tokens";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns at least 1 for non-empty string", () => {
    expect(estimateTokens("hi")).toBeGreaterThanOrEqual(1);
  });

  it("scales roughly with text length", () => {
    const short = estimateTokens("hello world");
    const long = estimateTokens("hello world ".repeat(100));
    expect(long).toBeGreaterThan(short);
  });
});

describe("estimateMessageTokens", () => {
  it("estimates tokens for a message", () => {
    const tokens = estimateMessageTokens({ content: "This is a test message." });
    expect(tokens).toBeGreaterThanOrEqual(1);
  });
});

describe("estimateThreadTokens", () => {
  it("sums tokens for all messages", () => {
    const thread = {
      messages: [{ content: "Hello" }, { content: "World" }],
    };
    const tokens = estimateThreadTokens(thread);
    expect(tokens).toBe(
      estimateMessageTokens({ content: "Hello" }) + estimateMessageTokens({ content: "World" }),
    );
  });
});

describe("estimateCost", () => {
  it("returns a positive cost for known provider", () => {
    const cost = estimateCost("openai", 1000, 500);
    expect(cost).toBeGreaterThan(0);
  });

  it("falls back to openai rates for unknown provider", () => {
    const cost = estimateCost("unknown-provider", 1000, 500);
    expect(cost).toBe(estimateCost("openai", 1000, 500));
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateCost("openai", 0, 0)).toBe(0);
  });
});

describe("estimateThreadCost", () => {
  it("treats user messages as input and assistant as output", () => {
    const thread = {
      messages: [
        { content: "Hello", role: "user" },
        { content: "Hi there", role: "assistant" },
      ],
    };
    const cost = estimateThreadCost(thread, "openai");
    const inputTokens = estimateMessageTokens({ content: "Hello" });
    const outputTokens = estimateMessageTokens({ content: "Hi there" });
    expect(cost).toBe(estimateCost("openai", inputTokens, outputTokens));
  });
});

describe("formatCost", () => {
  it("formats dollars with 2 decimals when >= 0.01", () => {
    expect(formatCost(1.5)).toBe("$1.50");
  });

  it("returns $0 for zero", () => {
    expect(formatCost(0)).toBe("$0");
  });

  it("shows sub-cent precision", () => {
    expect(formatCost(0.001)).toContain("$0.001");
  });
});

describe("formatTokens", () => {
  it("formats with locale grouping", () => {
    expect(formatTokens(1234)).toBe("1,234");
  });
});

describe("extractProviderUsage", () => {
  it("extracts OpenAI usage format", () => {
    const raw = { usage: { prompt_tokens: 100, completion_tokens: 50 } };
    const usage = extractProviderUsage(raw, "openai");
    expect(usage).not.toBeNull();
    expect(usage!.inputTokens).toBe(100);
    expect(usage!.outputTokens).toBe(50);
    expect(usage!.exact).toBe(true);
  });

  it("extracts Anthropic usage format", () => {
    const raw = { usage: { input_tokens: 200, output_tokens: 75 } };
    const usage = extractProviderUsage(raw, "anthropic");
    expect(usage).not.toBeNull();
    expect(usage!.inputTokens).toBe(200);
    expect(usage!.outputTokens).toBe(75);
    expect(usage!.exact).toBe(true);
  });

  it("returns null when no usage data present", () => {
    const raw = { choices: [{ message: { content: "hi" } }] };
    expect(extractProviderUsage(raw, "openai")).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(extractProviderUsage("string", "openai")).toBeNull();
    expect(extractProviderUsage(null, "openai")).toBeNull();
  });
});

describe("getCostRates / setCostOverrides", () => {
  it("returns defaults for known providers", () => {
    const rates = getCostRates("openai");
    expect(rates.input).toBeGreaterThan(0);
    expect(rates.output).toBeGreaterThan(0);
  });

  it("falls back to openai for unknown providers", () => {
    const unknown = getCostRates("unknown-xyz");
    const openai = getCostRates("openai");
    expect(unknown).toEqual(openai);
  });

  it("allows overriding cost rates", () => {
    setCostOverrides({ openai: { input: 0.001, output: 0.002 } });
    const rates = getCostRates("openai");
    expect(rates.input).toBe(0.001);
    expect(rates.output).toBe(0.002);
    setCostOverrides({});
  });
});
