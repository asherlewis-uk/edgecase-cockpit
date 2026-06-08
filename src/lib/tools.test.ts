import { describe, it, expect } from "vitest";
import {
  validateToolDef,
  toOpenAITools,
  toAnthropicTools,
  parseOpenAIToolCalls,
  parseAnthropicToolCalls,
  executeBuiltInTool,
  isBuiltInTool,
  BUILT_IN_TOOLS,
  StreamToolCallAccumulator,
  extractOpenAIToolCallDelta,
  validateToolName,
  sanitizeToolCallArgs,
  validateToolCall,
} from "@/lib/tools";

describe("validateToolDef", () => {
  it("accepts a valid tool", () => {
    expect(validateToolDef({ name: "echo", description: "Echo text" })).toBe(true);
  });

  it("rejects missing name", () => {
    expect(validateToolDef({ description: "No name" })).toBe(false);
  });

  it("rejects missing description", () => {
    expect(validateToolDef({ name: "x" })).toBe(false);
  });

  it("rejects non-object", () => {
    expect(validateToolDef("string")).toBe(false);
  });
});

describe("toOpenAITools", () => {
  it("serializes tools to OpenAI format", () => {
    const tools = [{ name: "echo", description: "Echo", parameters: { type: "object" } }];
    const out = toOpenAITools(tools);
    expect(out).toHaveLength(1);
    expect((out[0] as { type: string }).type).toBe("function");
    expect((out[0] as { function: { name: string } }).function.name).toBe("echo");
  });
});

describe("toAnthropicTools", () => {
  it("serializes tools to Anthropic format", () => {
    const tools = [{ name: "echo", description: "Echo", parameters: { type: "object" } }];
    const out = toAnthropicTools(tools);
    expect(out).toHaveLength(1);
    expect((out[0] as { name: string }).name).toBe("echo");
    expect((out[0] as { input_schema: unknown }).input_schema).toEqual({ type: "object" });
  });
});

describe("parseOpenAIToolCalls", () => {
  it("extracts tool calls from OpenAI response", () => {
    const raw = {
      choices: [
        {
          message: {
            tool_calls: [{ id: "call-1", function: { name: "echo", arguments: '{"text":"hi"}' } }],
          },
        },
      ],
    };
    const calls = parseOpenAIToolCalls(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe("call-1");
    expect(calls[0].name).toBe("echo");
    expect(calls[0].arguments).toBe('{"text":"hi"}');
  });

  it("returns empty array when no tool_calls", () => {
    expect(parseOpenAIToolCalls({ choices: [{ message: {} }] })).toEqual([]);
  });
});

describe("parseAnthropicToolCalls", () => {
  it("extracts tool_use blocks from Anthropic response", () => {
    const raw = {
      content: [{ type: "tool_use", id: "tu-1", name: "echo", input: { text: "hi" } }],
    };
    const calls = parseAnthropicToolCalls(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe("tu-1");
    expect(calls[0].name).toBe("echo");
    expect(calls[0].arguments).toBe('{"text":"hi"}');
  });

  it("returns empty array when no content", () => {
    expect(parseAnthropicToolCalls({})).toEqual([]);
  });
});

describe("executeBuiltInTool", () => {
  it("echoes text", async () => {
    const result = await executeBuiltInTool("echo", '{"text":"hello"}');
    expect(result).toBe("hello");
  });

  it("returns current time for get_current_time", async () => {
    const result = await executeBuiltInTool("get_current_time", "{}");
    expect(result).toContain("T"); // ISO string
  });

  it("counts words", async () => {
    const result = await executeBuiltInTool("word_count", '{"text":"one two three"}');
    expect(result).toBe("3");
  });

  it("evaluates calculator", async () => {
    const result = await executeBuiltInTool("calculator", '{"expression":"2 + 3 * 4"}');
    expect(result).toBe("14");
  });

  it("calculator rejects unsafe expressions", async () => {
    const result = await executeBuiltInTool("calculator", '{"expression":"process.exit()"}');
    expect(result).toContain("Invalid");
  });

  it("returns not-implemented for unknown tools", async () => {
    const result = await executeBuiltInTool("unknown", "{}");
    expect(result).toContain("not implemented");
  });
});

describe("isBuiltInTool", () => {
  it("returns true for known built-in tools", () => {
    expect(isBuiltInTool("echo")).toBe(true);
    expect(isBuiltInTool("get_current_time")).toBe(true);
    expect(isBuiltInTool("word_count")).toBe(true);
    expect(isBuiltInTool("calculator")).toBe(true);
  });

  it("returns false for unknown tools", () => {
    expect(isBuiltInTool("delete_everything")).toBe(false);
  });
});

describe("BUILT_IN_TOOLS", () => {
  it("contains all four built-in tools", () => {
    const names = BUILT_IN_TOOLS.map((t) => t.name);
    expect(names).toContain("echo");
    expect(names).toContain("get_current_time");
    expect(names).toContain("word_count");
    expect(names).toContain("calculator");
  });

  it("has 4 tools", () => {
    expect(BUILT_IN_TOOLS).toHaveLength(4);
  });
});

describe("StreamToolCallAccumulator", () => {
  it("accumulates tool call deltas into a complete call", () => {
    const acc = new StreamToolCallAccumulator();
    acc.ingest({ index: 0, id: "call-1", function: { name: "echo" } });
    acc.ingest({ index: 0, function: { arguments: '{"tex' } });
    acc.ingest({ index: 0, function: { arguments: 't":"hi"}' } });
    const calls = acc.complete();
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe("call-1");
    expect(calls[0].name).toBe("echo");
    expect(calls[0].arguments).toBe('{"text":"hi"}');
  });

  it("accumulates multiple parallel tool calls", () => {
    const acc = new StreamToolCallAccumulator();
    acc.ingest({ index: 0, id: "call-a", function: { name: "echo" } });
    acc.ingest({ index: 1, id: "call-b", function: { name: "word_count" } });
    acc.ingest({ index: 0, function: { arguments: '{"text":"hi"}' } });
    acc.ingest({ index: 1, function: { arguments: '{"text":"hello world"}' } });
    const calls = acc.complete();
    expect(calls).toHaveLength(2);
  });

  it("reset clears accumulated state", () => {
    const acc = new StreamToolCallAccumulator();
    acc.ingest({ index: 0, id: "call-1", function: { name: "echo" } });
    acc.reset();
    expect(acc.complete()).toEqual([]);
  });
});

describe("extractOpenAIToolCallDelta", () => {
  it("extracts tool call deltas from streaming chunk", () => {
    const chunk = {
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: "call-tc", function: { name: "echo", arguments: '{"text":"hi"}' } },
            ],
          },
        },
      ],
    };
    const deltas = extractOpenAIToolCallDelta(chunk);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].index).toBe(0);
    expect(deltas[0].id).toBe("call-tc");
  });

  it("returns empty for chunk without tool_calls", () => {
    const chunk = { choices: [{ delta: { content: "hello" } }] };
    expect(extractOpenAIToolCallDelta(chunk)).toEqual([]);
  });
});

// ── Tool name/validation safety guards ──────────────────────────────────────

describe("validateToolName", () => {
  it("accepts standard tool names", () => {
    expect(validateToolName("echo")).toBe(true);
    expect(validateToolName("get_current_time")).toBe(true);
    expect(validateToolName("word_count")).toBe(true);
    expect(validateToolName("calculator")).toBe(true);
  });

  it("accepts dotted names", () => {
    expect(validateToolName("my.tool.name")).toBe(true);
  });

  it("accepts hyphenated names", () => {
    expect(validateToolName("my-tool-name")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(validateToolName("")).toBe(false);
  });

  it("rejects null/undefined", () => {
    expect(validateToolName(null as unknown as string)).toBe(false);
    expect(validateToolName(undefined as unknown as string)).toBe(false);
  });

  it("rejects names with spaces", () => {
    expect(validateToolName("my tool")).toBe(false);
  });

  it("rejects names with shell metacharacters", () => {
    expect(validateToolName("rm -rf")).toBe(false);
    expect(validateToolName("$(whoami)")).toBe(false);
    expect(validateToolName("tool; ls")).toBe(false);
  });

  it("rejects names with path traversal", () => {
    expect(validateToolName("../../etc/passwd")).toBe(false);
  });

  it("rejects names with control characters", () => {
    expect(validateToolName("tool\nname")).toBe(false);
    expect(validateToolName("tool\tname")).toBe(false);
  });

  it("rejects names starting with non-alpha (non alphanumeric)", () => {
    expect(validateToolName("_private")).toBe(false);
    expect(validateToolName("-tool")).toBe(false);
    expect(validateToolName(".hidden")).toBe(false);
    expect(validateToolName("$env")).toBe(false);
  });

  it("rejects overly long names", () => {
    expect(validateToolName("a".repeat(200))).toBe(false);
  });

  it("accepts a 128-char name at the limit", () => {
    const name = "a" + "b".repeat(127); // 128 chars
    expect(validateToolName(name)).toBe(true);
  });
});

describe("sanitizeToolCallArgs", () => {
  it("parses valid JSON args", () => {
    const result = sanitizeToolCallArgs('{"text":"hello"}');
    expect(result).toEqual({ text: "hello" });
  });

  it("rejects invalid JSON", () => {
    expect(sanitizeToolCallArgs("not json")).toBeNull();
  });

  it("rejects arrays", () => {
    expect(sanitizeToolCallArgs("[1,2,3]")).toBeNull();
  });

  it("rejects null", () => {
    expect(sanitizeToolCallArgs("null")).toBeNull();
  });

  it("rejects primitive strings", () => {
    expect(sanitizeToolCallArgs('"hello"')).toBeNull();
  });

  it("rejects numbers", () => {
    expect(sanitizeToolCallArgs("42")).toBeNull();
  });

  it("rejects overly long args (over 16KB)", () => {
    const huge = JSON.stringify({ text: "x".repeat(17000) });
    expect(sanitizeToolCallArgs(huge)).toBeNull();
  });
});

describe("validateToolCall", () => {
  it("accepts valid tool calls", () => {
    expect(validateToolCall({ id: "call-1", name: "echo", arguments: '{"text":"hi"}' })).toBe(true);
  });

  it("rejects tool call with unsafe name", () => {
    expect(validateToolCall({ id: "call-1", name: "rm -rf /", arguments: "{}" })).toBe(false);
  });

  it("rejects tool call with empty id", () => {
    expect(validateToolCall({ id: "", name: "echo", arguments: "{}" })).toBe(false);
  });

  it("rejects non-object", () => {
    expect(validateToolCall("not a call")).toBe(false);
    expect(validateToolCall(null)).toBe(false);
  });
});

describe("parseOpenAIToolCalls safety", () => {
  it("rejects tool calls with unsafe names", () => {
    const raw = {
      choices: [
        {
          message: {
            tool_calls: [
              { id: "c1", function: { name: "safe_tool", arguments: "{}" } },
              { id: "c2", function: { name: "rm -rf /", arguments: "{}" } },
            ],
          },
        },
      ],
    };
    const calls = parseOpenAIToolCalls(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("safe_tool");
  });

  it("handles malformed raw input gracefully", () => {
    expect(parseOpenAIToolCalls(undefined)).toEqual([]);
    expect(parseOpenAIToolCalls(null)).toEqual([]);
    expect(parseOpenAIToolCalls("string")).toEqual([]);
  });
});

describe("parseAnthropicToolCalls safety", () => {
  it("rejects tool calls with unsafe names", () => {
    const raw = {
      content: [
        { type: "tool_use", id: "tu-1", name: "safe", input: {} },
        { type: "tool_use", id: "tu-2", name: "../../etc/passwd", input: {} },
      ],
    };
    const calls = parseAnthropicToolCalls(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("safe");
  });

  it("handles malformed raw input gracefully", () => {
    expect(parseAnthropicToolCalls(undefined)).toEqual([]);
    expect(parseAnthropicToolCalls(null)).toEqual([]);
    expect(parseAnthropicToolCalls("string")).toEqual([]);
  });
});

describe("StreamToolCallAccumulator safety", () => {
  it("filters unsafe names on complete()", () => {
    const acc = new StreamToolCallAccumulator();
    acc.ingest({ index: 0, id: "call-a", function: { name: "safe" } });
    acc.ingest({ index: 1, id: "call-b", function: { name: "$(malicious)" } });
    acc.ingest({ index: 0, function: { arguments: '{"x":1}' } });
    acc.ingest({ index: 1, function: { arguments: '{"y":2}' } });
    const calls = acc.complete();
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("safe");
  });
});
