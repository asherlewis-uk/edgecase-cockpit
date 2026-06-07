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

  it("returns not-implemented for unknown tools", async () => {
    const result = await executeBuiltInTool("unknown", "{}");
    expect(result).toContain("not implemented");
  });
});

describe("isBuiltInTool", () => {
  it("returns true for known built-in tools", () => {
    expect(isBuiltInTool("echo")).toBe(true);
    expect(isBuiltInTool("get_current_time")).toBe(true);
  });

  it("returns false for unknown tools", () => {
    expect(isBuiltInTool("delete_everything")).toBe(false);
  });
});

describe("BUILT_IN_TOOLS", () => {
  it("contains at least echo and get_current_time", () => {
    const names = BUILT_IN_TOOLS.map((t) => t.name);
    expect(names).toContain("echo");
    expect(names).toContain("get_current_time");
  });
});
