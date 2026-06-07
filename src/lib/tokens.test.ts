import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  estimateMessageTokens,
  estimateThreadTokens,
  estimateCost,
  estimateThreadCost,
  formatCost,
  formatTokens,
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
