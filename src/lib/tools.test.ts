import { describe, it, expect, beforeEach } from "vitest";
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
  AnthropicStreamToolCallAccumulator,
  extractOpenAIToolCallDelta,
  extractAnthropicToolCallDelta,
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

// ── Anthropic streaming tool deltas ────────────────────────────────────────

describe("extractAnthropicToolCallDelta", () => {
  it("extracts tool_use start from content_block_start", () => {
    const delta = extractAnthropicToolCallDelta({
      type: "content_block_start",
      index: 0,
      content_block: { type: "tool_use", id: "toolu_1", name: "echo" },
    });
    expect(delta).not.toBeNull();
    expect(delta!.deltaType).toBe("start");
    expect(delta!.id).toBe("toolu_1");
    expect(delta!.name).toBe("echo");
  });

  it("extracts input_json_delta from content_block_delta", () => {
    const delta = extractAnthropicToolCallDelta({
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: '{"text":"hi"}' },
    });
    expect(delta).not.toBeNull();
    expect(delta!.deltaType).toBe("delta");
    expect(delta!.partialJson).toBe('{"text":"hi"}');
  });

  it("returns null for non-tool content_block_start", () => {
    const delta = extractAnthropicToolCallDelta({
      type: "content_block_start",
      content_block: { type: "text" },
    });
    expect(delta).toBeNull();
  });

  it("returns null for text content_block_delta", () => {
    const delta = extractAnthropicToolCallDelta({
      type: "content_block_delta",
      delta: { type: "text_delta", text: "hello" },
    });
    expect(delta).toBeNull();
  });

  it("returns null for non-SSE object", () => {
    expect(extractAnthropicToolCallDelta(null)).toBeNull();
    expect(extractAnthropicToolCallDelta(undefined)).toBeNull();
    expect(extractAnthropicToolCallDelta("string")).toBeNull();
  });
});

describe("AnthropicStreamToolCallAccumulator", () => {
  it("accumulates start + partial_json into complete call", () => {
    const acc = new AnthropicStreamToolCallAccumulator();
    acc.ingest({ deltaType: "start", index: 0, id: "toolu_1", name: "echo" });
    acc.ingest({ deltaType: "delta", index: 0, partialJson: '{"tex' });
    acc.ingest({ deltaType: "delta", index: 0, partialJson: 't":"hi"}' });
    const calls = acc.complete();
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe("toolu_1");
    expect(calls[0].name).toBe("echo");
    expect(calls[0].arguments).toBe('{"text":"hi"}');
  });

  it("accumulates multiple parallel tool blocks", () => {
    const acc = new AnthropicStreamToolCallAccumulator();
    acc.ingest({ deltaType: "start", index: 0, id: "toolu_a", name: "echo" });
    acc.ingest({ deltaType: "start", index: 1, id: "toolu_b", name: "word_count" });
    acc.ingest({ deltaType: "delta", index: 0, partialJson: '{"text":"hi"}' });
    acc.ingest({ deltaType: "delta", index: 1, partialJson: '{"text":"hello world"}' });
    const calls = acc.complete();
    expect(calls).toHaveLength(2);
  });

  it("drops blocks with unsafe names", () => {
    const acc = new AnthropicStreamToolCallAccumulator();
    acc.ingest({ deltaType: "start", index: 0, id: "t1", name: "safe" });
    acc.ingest({ deltaType: "start", index: 1, id: "t2", name: "rm -rf /" });
    acc.ingest({ deltaType: "delta", index: 0, partialJson: "{}" });
    acc.ingest({ deltaType: "delta", index: 1, partialJson: "{}" });
    const calls = acc.complete();
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("safe");
  });

  it("wraps non-JSON args as _partial_json", () => {
    const acc = new AnthropicStreamToolCallAccumulator();
    acc.ingest({ deltaType: "start", index: 0, id: "t1", name: "echo" });
    acc.ingest({ deltaType: "delta", index: 0, partialJson: '{"text":"h' });
    // Incomplete JSON
    const calls = acc.complete();
    expect(calls).toHaveLength(1);
    const parsed = JSON.parse(calls[0].arguments);
    expect(parsed._partial_json).toBe('{"text":"h');
  });

  it("reset clears accumulated state", () => {
    const acc = new AnthropicStreamToolCallAccumulator();
    acc.ingest({ deltaType: "start", index: 0, id: "t1", name: "echo" });
    acc.reset();
    expect(acc.complete()).toEqual([]);
  });
});

// ── Dynamic tool schema registry ───────────────────────────────────────────

import {
  getAllToolSchemas,
  getSerializableToolDefs,
  registerLocalTool,
  registerProviderTools,
  clearRegisteredTools,
  getToolSchemaCounts,
  __resetToolRegistry,
} from "@/lib/tools";

describe("dynamic tool schema registry", () => {
  beforeEach(() => {
    __resetToolRegistry();
  });

  describe("getAllToolSchemas", () => {
    it("returns built-in tools by default", () => {
      const schemas = getAllToolSchemas();
      const names = schemas.map((s) => s.name);
      expect(names).toContain("echo");
      expect(names).toContain("calculator");
      expect(schemas.every((s) => s.source === "built-in")).toBe(true);
    });
  });

  describe("getSerializableToolDefs", () => {
    it("returns all built-in as serializable ToolDefs", () => {
      const defs = getSerializableToolDefs();
      expect(defs.length).toBeGreaterThanOrEqual(4);
      expect(defs[0]).toHaveProperty("name");
      expect(defs[0]).toHaveProperty("description");
    });
  });

  describe("registerLocalTool", () => {
    it("registers a valid local tool", () => {
      const ok = registerLocalTool({
        name: "my_tool",
        description: "Custom tool",
      });
      expect(ok).toBe(true);
      const schemas = getAllToolSchemas();
      expect(schemas.some((s) => s.name === "my_tool" && s.source === "local")).toBe(true);
    });

    it("rejects tools with unsafe names", () => {
      expect(registerLocalTool({ name: "rm -rf /", description: "bad" })).toBe(false);
      expect(registerLocalTool({ name: "$(shell)", description: "bad" })).toBe(false);
    });

    it("rejects invalid tool defs (missing description)", () => {
      expect(registerLocalTool({ name: "missing_desc" })).toBe(false);
    });

    it("rejects duplicate names", () => {
      registerLocalTool({ name: "my_tool", description: "First" });
      expect(registerLocalTool({ name: "my_tool", description: "Dup" })).toBe(false);
    });

    it("rejects tool with name matching built-in", () => {
      expect(registerLocalTool({ name: "echo", description: "Override attempt" })).toBe(false);
    });

    it("does not allow local tools to execute (not a built-in)", () => {
      registerLocalTool({ name: "fetch_url", description: "Fetches a URL" });
      expect(isBuiltInTool("fetch_url")).toBe(false);
    });
  });

  describe("registerProviderTools", () => {
    it("registers valid provider tools and filters invalid ones", () => {
      const added = registerProviderTools("openai", [
        { name: "code_interpreter", description: "Run Python" },
        { name: "rm -rf /", description: "bad" },
        { name: "web_search", description: "Search web" },
      ]);
      expect(added).toBe(2);
      const schemas = getAllToolSchemas();
      const provider = schemas.filter((s) => s.source === "provider" && s.providerId === "openai");
      expect(provider).toHaveLength(2);
      expect(provider.map((s) => s.name)).toEqual(["code_interpreter", "web_search"]);
    });

    it("replaces old provider entries on re-registration", () => {
      registerProviderTools("openai", [{ name: "old_tool", description: "Old" }]);
      registerProviderTools("openai", [{ name: "new_tool", description: "New" }]);
      const schemas = getAllToolSchemas();
      const provider = schemas.filter((s) => s.source === "provider" && s.providerId === "openai");
      expect(provider).toHaveLength(1);
      expect(provider[0].name).toBe("new_tool");
    });

    it("does not override built-in tools", () => {
      registerProviderTools("openai", [{ name: "echo", description: "Override" }]);
      const schemas = getAllToolSchemas();
      const echo = schemas.filter((s) => s.name === "echo");
      expect(echo).toHaveLength(1);
      expect(echo[0].source).toBe("built-in");
    });
  });

  describe("clearRegisteredTools", () => {
    it("removes all local and provider tools", () => {
      registerLocalTool({ name: "local1", description: "A" });
      registerProviderTools("openai", [{ name: "prov1", description: "B" }]);
      clearRegisteredTools();
      const schemas = getAllToolSchemas();
      expect(schemas.every((s) => s.source === "built-in")).toBe(true);
    });
  });

  describe("getToolSchemaCounts", () => {
    it("shows correct breakdown by source", () => {
      registerLocalTool({ name: "local1", description: "A" });
      registerProviderTools("openai", [{ name: "code", description: "C" }]);
      const counts = getToolSchemaCounts();
      expect(counts.builtIn).toBe(4);
      expect(counts.local).toBe(1);
      expect(counts.provider.openai).toBe(1);
    });
  });
});
