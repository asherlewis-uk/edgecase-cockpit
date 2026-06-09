// Provider-agnostic tool schema, safe built-in tool registry, dynamic schema
// registry, and streaming tool-call accumulator.
// Built-in tool execution is implemented for 4 safe tools (get_current_time,
// echo, word_count, calculator). Registered non-built-in schemas are
// serializable to providers but require explicit safe-registry addition to execute.

export type ToolParameter = {
  type: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, ToolParameter>;
  required?: string[];
  items?: ToolParameter;
};

export type ToolDef = {
  name: string;
  description: string;
  parameters?: ToolParameter;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: string; // JSON string
};

export type ToolResult = {
  callId: string;
  name: string;
  content: string;
};

/** Safe built-in tools that require no external access. */
export const BUILT_IN_TOOLS: ToolDef[] = [
  {
    name: "get_current_time",
    description: "Returns the current local date and time.",
  },
  {
    name: "echo",
    description: "Echoes the provided text back unchanged.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The text to echo.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "word_count",
    description: "Returns the number of words in the provided text.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The text to count words in.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "calculator",
    description:
      "Evaluates a safe arithmetic expression (+, -, *, /, %, **, parentheses) and returns the numeric result. Only arithmetic operations are allowed.",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "A simple arithmetic expression using +, -, *, /, %, **, and parentheses.",
        },
      },
      required: ["expression"],
    },
  },
];

// ── Dynamic tool schema registry ────────────────────────────────────────────

/** Where a tool schema was loaded from. */
export type ToolSchemaSource = "built-in" | "local" | "provider";

/** A registered tool with its source metadata. */
export type RegisteredTool = ToolDef & {
  source: ToolSchemaSource;
  providerId?: string; // for provider-sourced schemas
  registeredAt?: number; // timestamp when registered (local/provider only)
};

/** Maximum number of registered tools (excluding built-in). */
const MAX_REGISTERED_TOOLS = 256;

let _registeredTools: RegisteredTool[] = [];
let _initialized = false;

function initRegistry() {
  if (_initialized) return;
  _initialized = true;
  _registeredTools = BUILT_IN_TOOLS.map((t) => ({
    ...t,
    source: "built-in" as const,
  }));
}

/**
 * Return all currently available tool schemas (built-in + registered).
 * Built-in tools always come first.
 */
export function getAllToolSchemas(): RegisteredTool[] {
  initRegistry();
  return _registeredTools;
}

/**
 * Return only schemas that can be serialized to providers.
 * Built-in tools are always safe to include.
 * Registered local/provider tools are included if they pass validation.
 */
export function getSerializableToolDefs(): ToolDef[] {
  initRegistry();
  return _registeredTools
    .filter((t) => validateToolName(t.name))
    .map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));
}

/**
 * Register a locally-configured tool schema.
 * Returns true if registered, false if rejected (invalid, duplicate, or limit).
 */
export function registerLocalTool(tool: unknown): boolean {
  initRegistry();
  if (!validateToolDef(tool)) return false;
  const t = tool as ToolDef;
  if (!validateToolName(t.name)) return false;

  // Check for duplicates
  if (_registeredTools.some((r) => r.name === t.name)) return false;

  // Enforce size limit on registered tools
  const nonBuiltIn = _registeredTools.filter((r) => r.source !== "built-in");
  if (nonBuiltIn.length >= MAX_REGISTERED_TOOLS) return false;

  _registeredTools.push({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    source: "local",
    registeredAt: Date.now(),
  });

  return true;
}

/**
 * Register provider-declared tool schemas (replaces old provider entries).
 * Each tool is validated; unsafe names are silently dropped.
 */
export function registerProviderTools(providerId: string, tools: ToolDef[]): number {
  initRegistry();

  // Remove old entries for this provider
  _registeredTools = _registeredTools.filter(
    (r) => !(r.source === "provider" && r.providerId === providerId),
  );

  let added = 0;
  const now = Date.now();
  for (const tool of tools) {
    if (!validateToolDef(tool)) continue;
    if (!validateToolName(tool.name)) continue;
    // Allow overwriting built-in? No — built-in always wins
    if (_registeredTools.some((r) => r.source === "built-in" && r.name === tool.name)) continue;

    const nonBuiltIn = _registeredTools.filter((r) => r.source !== "built-in");
    if (nonBuiltIn.length >= MAX_REGISTERED_TOOLS) break;

    _registeredTools.push({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      source: "provider",
      providerId,
      registeredAt: now,
    });
    added++;
  }

  return added;
}

/**
 * Remove all locally-registered and provider tools, leaving only built-ins.
 */
export function clearRegisteredTools(): void {
  _registeredTools = BUILT_IN_TOOLS.map((t) => ({
    ...t,
    source: "built-in" as const,
  }));
}

/** For tests: reset the registry to pristine state. */
export function __resetToolRegistry(): void {
  _initialized = false;
  _registeredTools = [];
}

/**
 * Schema count by source. Used for status display.
 */
export function getToolSchemaCounts(): {
  builtIn: number;
  local: number;
  provider: Record<string, number>;
} {
  initRegistry();
  const builtIn = _registeredTools.filter((t) => t.source === "built-in").length;
  const local = _registeredTools.filter((t) => t.source === "local").length;
  const provider: Record<string, number> = {};
  for (const t of _registeredTools) {
    if (t.source === "provider" && t.providerId) {
      provider[t.providerId] = (provider[t.providerId] ?? 0) + 1;
    }
  }
  return { builtIn, local, provider };
}

export function isBuiltInTool(name: string): boolean {
  return BUILT_IN_TOOLS.some((t) => t.name === name);
}

export async function executeBuiltInTool(name: string, args: string): Promise<string> {
  if (name === "get_current_time") {
    return new Date().toISOString();
  }
  if (name === "echo") {
    try {
      const parsed = JSON.parse(args) as { text?: string };
      return parsed.text ?? "";
    } catch {
      return args;
    }
  }
  if (name === "word_count") {
    try {
      const parsed = JSON.parse(args) as { text?: string };
      const text = parsed.text ?? "";
      return String(text.split(/\s+/).filter(Boolean).length);
    } catch {
      return "0";
    }
  }
  if (name === "calculator") {
    try {
      const parsed = JSON.parse(args) as { expression?: string };
      const expr = parsed.expression ?? "";
      if (!/^[0-9+\-*/().%\s]+$/.test(expr)) return "[Invalid expression]";
      const result = Function(`"use strict"; return (${expr})`)();
      if (typeof result !== "number" || !isFinite(result)) return "[Invalid result]";
      return String(result);
    } catch {
      return "[Evaluation error]";
    }
  }
  return `[Tool "${name}" is not implemented]`;
}

/** Validate a tool definition shape. */
export function validateToolDef(tool: unknown): tool is ToolDef {
  if (typeof tool !== "object" || tool === null) return false;
  const t = tool as Record<string, unknown>;
  if (typeof t.name !== "string" || !t.name.trim()) return false;
  if (typeof t.description !== "string") return false;
  return true;
}

/** Maximum length for tool names to prevent injection/buffer abuse. */
const MAX_TOOL_NAME_LENGTH = 128;
/** Maximum length for tool call arguments JSON string. */
const MAX_TOOL_ARGS_LENGTH = 16384;

/**
 * Validate that a tool name looks like a legitimate, safe identifier.
 * Rejects: empty strings, overly long names, names with control characters
 * or suspicious patterns (shell metacharacters, path traversal).
 */
export function validateToolName(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  if (name.length > MAX_TOOL_NAME_LENGTH) return false;
  // Only allow alphanumeric, underscore, hyphen, dot — standard tool naming.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) return false;
  return true;
}

/**
 * Validate that tool call arguments is safe JSON.
 * Returns the parsed object, or null if invalid/dangerous.
 */
export function sanitizeToolCallArgs(args: string): Record<string, unknown> | null {
  if (!args || typeof args !== "string" || args.length > MAX_TOOL_ARGS_LENGTH) return null;
  try {
    const parsed = JSON.parse(args);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Validate a tool call is well-formed and safe.
 */
export function validateToolCall(call: unknown): call is ToolCall {
  if (typeof call !== "object" || call === null) return false;
  const t = call as Record<string, unknown>;
  if (typeof t.id !== "string" || !t.id) return false;
  if (typeof t.name !== "string" || !validateToolName(t.name)) return false;
  if (typeof t.arguments !== "string") return false;
  return true;
}

/** Serialize tools for OpenAI-compatible request bodies. */
export function toOpenAITools(tools: ToolDef[]): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters ?? { type: "object" },
    },
  }));
}

/** Serialize tools for Anthropic request bodies. */
export function toAnthropicTools(tools: ToolDef[]): unknown[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters ?? { type: "object" },
  }));
}

/** Extract tool calls from an OpenAI-compatible response body. */
export function parseOpenAIToolCalls(raw: unknown): ToolCall[] {
  try {
    const msg = (raw as { choices?: { message?: { tool_calls?: unknown[] } }[] } | undefined)
      ?.choices?.[0]?.message;
    if (!msg?.tool_calls || !Array.isArray(msg.tool_calls)) return [];
    const out: ToolCall[] = [];
    for (const tc of msg.tool_calls) {
      const t = tc as { id?: string; function?: { name?: string; arguments?: string } };
      if (t.id && t.function?.name && validateToolName(t.function.name)) {
        out.push({
          id: String(t.id),
          name: t.function.name,
          arguments: String(t.function.arguments ?? "{}"),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Extract tool calls from an Anthropic response body. */
export function parseAnthropicToolCalls(raw: unknown): ToolCall[] {
  try {
    const content = (raw as { content?: unknown[] } | undefined)?.content;
    if (!Array.isArray(content)) return [];
    const out: ToolCall[] = [];
    for (const block of content) {
      const b = block as { type?: string; id?: string; name?: string; input?: unknown };
      if (b.type === "tool_use" && b.id && b.name && validateToolName(b.name)) {
        out.push({
          id: String(b.id),
          name: b.name,
          arguments: JSON.stringify(b.input ?? {}),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Streaming tool-call delta accumulator for OpenAI-compatible SSE streams.
 * Each chunk delta may contain a partial tool_call with index, id, name, and
 * a fragment of arguments. This merges them into complete ToolCall[] once
 * function arguments finish streaming.
 */
export type ToolCallDelta = {
  index: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

export class StreamToolCallAccumulator {
  private calls = new Map<number, { id: string; name: string; args: string }>();

  ingest(delta: ToolCallDelta) {
    const c = this.calls.get(delta.index) ?? { id: "", name: "", args: "" };
    if (delta.id) c.id = delta.id;
    if (delta.function?.name) c.name = delta.function.name;
    if (delta.function?.arguments) c.args += delta.function.arguments;
    this.calls.set(delta.index, c);
  }

  complete(): ToolCall[] {
    const out: ToolCall[] = [];
    for (const [, c] of this.calls) {
      if (c.id && c.name && validateToolName(c.name)) {
        out.push({ id: c.id, name: c.name, arguments: c.args || "{}" });
      }
    }
    return out;
  }

  reset() {
    this.calls.clear();
  }
}

/**
 * Extract tool_call deltas from an OpenAI streaming chunk.
 * Returns null if no tool_call delta is present.
 */
export function extractOpenAIToolCallDelta(chunk: unknown): ToolCallDelta[] {
  const choices = (chunk as { choices?: unknown[] } | undefined)?.choices;
  if (!Array.isArray(choices)) return [];
  const deltas: ToolCallDelta[] = [];
  for (const c of choices) {
    const delta = (c as { delta?: { tool_calls?: unknown[] } })?.delta;
    if (!delta?.tool_calls || !Array.isArray(delta.tool_calls)) continue;
    for (const tc of delta.tool_calls) {
      const t = tc as {
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      };
      if (typeof t.index === "number") {
        deltas.push(t as ToolCallDelta);
      }
    }
  }
  return deltas;
}

// ── Anthropic streaming tool-use delta support ─────────────────────────────

/**
 * Anthropic SSE streaming chunk shape.
 * Events: content_block_start, content_block_delta, content_block_stop.
 * Tool use blocks arrive via content_block_start (name+id) followed by
 * content_block_delta (partial_json fragments).
 */
export type AnthropicSSEEvent = {
  type: string;
  index?: number;
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
  };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
  };
};

/**
 * Extract tool-use deltas from an Anthropic SSE chunk.
 * Handles content_block_start (records tool id/name/index) and
 * content_block_delta (accumulates partial_json arguments).
 */
export function extractAnthropicToolCallDelta(chunk: unknown): {
  deltaType: "start" | "delta";
  index: number;
  id?: string;
  name?: string;
  partialJson?: string;
} | null {
  const evt = chunk as AnthropicSSEEvent;
  if (!evt || typeof evt.type !== "string") return null;

  // content_block_start: tool_use block begins
  if (evt.type === "content_block_start") {
    const block = evt.content_block;
    if (block?.type === "tool_use" && block.id && block.name) {
      return {
        deltaType: "start",
        index: evt.index ?? 0,
        id: block.id,
        name: block.name,
      };
    }
    return null;
  }

  // content_block_delta: input_json_delta fragment
  if (evt.type === "content_block_delta") {
    const delta = evt.delta;
    if (delta?.type === "input_json_delta" && delta.partial_json !== undefined) {
      return {
        deltaType: "delta",
        index: evt.index ?? 0,
        partialJson: delta.partial_json,
      };
    }
    return null;
  }

  return null;
}

/**
 * Streaming accumulator for Anthropic tool_use streaming deltas.
 * Tracks tool-use blocks by index across content_block_start/delta events.
 */
export class AnthropicStreamToolCallAccumulator {
  private calls = new Map<number, { id: string; name: string; args: string }>();

  ingest(delta: {
    deltaType: "start" | "delta";
    index: number;
    id?: string;
    name?: string;
    partialJson?: string;
  }) {
    const c = this.calls.get(delta.index) ?? { id: "", name: "", args: "" };

    if (delta.deltaType === "start") {
      if (delta.id) c.id = delta.id;
      if (delta.name && validateToolName(delta.name)) c.name = delta.name;
      else if (delta.name) return; // drop unsafe names — don't accumulate
    }

    if (delta.deltaType === "delta" && delta.partialJson) {
      c.args += delta.partialJson;
    }

    this.calls.set(delta.index, c);
  }

  complete(): ToolCall[] {
    const out: ToolCall[] = [];
    for (const [, c] of this.calls) {
      if (c.id && c.name && c.args) {
        // Try to parse to valid JSON object; accept partial if needed
        let args = c.args;
        try {
          JSON.parse(args);
        } catch {
          // If not yet valid JSON, wrap as raw text
          args = JSON.stringify({ _partial_json: c.args });
        }
        out.push({ id: c.id, name: c.name, arguments: args });
      }
    }
    return out;
  }

  reset() {
    this.calls.clear();
  }
}
