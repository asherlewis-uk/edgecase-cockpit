// Provider-agnostic tool schema and safe built-in tool registry.
// For this pass, tools are parsed, rendered, and executed only for
// explicitly registered safe local functions. Cloud provider tool
// execution is not yet wired.

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
