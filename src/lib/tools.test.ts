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
