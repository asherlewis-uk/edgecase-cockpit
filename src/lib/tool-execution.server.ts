// Server-side tool execution with user permission model.
// Built-in tools execute without permission. Non-built-in tools require an
// explicit grant stored in `user_tool_permissions` per user.

import {
  executeBuiltInTool,
  getAllToolSchemas,
  isBuiltInTool,
  sanitizeToolCallArgs,
  validateToolCall,
  validateToolName,
  type ToolCall,
} from "./tools";
import { getUserToolPermission, getUserToolPermissions } from "./db";

export type ToolExecutionResult = { ok: true; content: string } | { ok: false; error: string };

/**
 * Execute a tool call on behalf of a user, enforcing the permission model.
 *
 * - Built-in tools: always allowed.
 * - Registered non-built-in tools: allowed only if the user has granted
 *   permission in `user_tool_permissions`.
 * - Unknown tools: rejected.
 */
export async function executeToolCall(
  userId: string | undefined,
  call: ToolCall,
): Promise<ToolExecutionResult> {
  if (!validateToolCall(call)) {
    return { ok: false, error: "Invalid tool call shape" };
  }

  if (!validateToolName(call.name)) {
    return { ok: false, error: "Unsafe tool name" };
  }

  if (!sanitizeToolCallArgs(call.arguments)) {
    return { ok: false, error: "Invalid or oversized arguments" };
  }

  if (isBuiltInTool(call.name)) {
    const content = await executeBuiltInTool(call.name, call.arguments);
    return { ok: true, content };
  }

  // Non-built-in tools require user permission.
  if (!userId) {
    return { ok: false, error: "User-defined tools require an account" };
  }

  const permitted = await getUserToolPermission(userId, call.name);
  if (!permitted) {
    return {
      ok: false,
      error: `Tool "${call.name}" is not approved. Grant permission in Settings before executing it.`,
    };
  }

  // For approved non-built-in tools, only built-in safe execution is supported
  // in this release. The user sees the approved tool name in chat; execution
  // returns a placeholder noting that the tool is approved but not yet wired
  // to external logic. This boundary keeps arbitrary code execution blocked.
  return {
    ok: true,
    content: `[Tool "${call.name}" is approved but has no executable implementation in this release]`,
  };
}

/**
 * Return the list of registered non-built-in tool names and whether the given
 * user has approved each one.
 */
export async function getToolApprovalStatus(
  userId: string | undefined,
): Promise<Array<{ name: string; source: string; approved: boolean }>> {
  const schemas = getAllToolSchemas().filter((t) => t.source !== "built-in");
  if (!userId) {
    return schemas.map((t) => ({ name: t.name, source: t.source, approved: false }));
  }

  const approved = new Set(await getUserToolPermissions(userId));
  return schemas.map((t) => ({
    name: t.name,
    source: t.source,
    approved: approved.has(t.name),
  }));
}
