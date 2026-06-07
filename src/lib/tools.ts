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
  const msg = (raw as { choices?: { message?: { tool_calls?: unknown[] } }[] } | undefined)
    ?.choices?.[0]?.message;
  if (!msg?.tool_calls || !Array.isArray(msg.tool_calls)) return [];
  const out: ToolCall[] = [];
  for (const tc of msg.tool_calls) {
    const t = tc as { id?: string; function?: { name?: string; arguments?: string } };
    if (t.id && t.function?.name) {
      out.push({
        id: String(t.id),
        name: t.function.name,
        arguments: String(t.function.arguments ?? "{}"),
      });
    }
  }
  return out;
}

/** Extract tool calls from an Anthropic response body. */
export function parseAnthropicToolCalls(raw: unknown): ToolCall[] {
  const content = (raw as { content?: unknown[] } | undefined)?.content;
  if (!Array.isArray(content)) return [];
  const out: ToolCall[] = [];
  for (const block of content) {
    const b = block as { type?: string; id?: string; name?: string; input?: unknown };
    if (b.type === "tool_use" && b.id && b.name) {
      out.push({
        id: String(b.id),
        name: b.name,
        arguments: JSON.stringify(b.input ?? {}),
      });
    }
  }
  return out;
}
