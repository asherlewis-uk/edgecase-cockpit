import { getDB } from "@/lib/platform.server";
import type { Message, Thread } from "@/lib/cockpit-store";
import { sanitizeMessage } from "@/lib/sanitize";

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function createSession(id: string): Promise<void> {
  const db = getDB();
  const now = Date.now();
  await db
    .prepare(
      "INSERT OR IGNORE INTO sessions (id, data, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(id, "{}", now, now)
    .run();
}

export async function getSession(
  id: string,
): Promise<{ id: string; data: string; created_at: number; updated_at: number } | null> {
  const db = getDB();
  const row = await db.prepare("SELECT * FROM sessions WHERE id = ?1").bind(id).first();
  if (!row) return null;
  return {
    id: row.id as string,
    data: (row.data as string) ?? "{}",
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  };
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

interface ThreadRow {
  id: string;
  session_id: string;
  title: string;
  messages: string;
  updated_at: number;
  temporary: number;
  pinned: number;
  archived: number;
}

function rowToThread(row: ThreadRow): Thread {
  let messages: Message[] = [];
  try {
    messages = JSON.parse(row.messages) as Message[];
  } catch {
    messages = [];
  }
  return {
    id: row.id,
    title: row.title,
    messages,
    updatedAt: row.updated_at,
    temporary: row.temporary === 1,
    pinned: row.pinned === 1,
    archived: row.archived === 1,
  };
}

export async function getThreads(sessionId: string): Promise<Thread[]> {
  const db = getDB();
  const result = await db
    .prepare("SELECT * FROM threads WHERE session_id = ?1 ORDER BY updated_at DESC")
    .bind(sessionId)
    .all();
  const rows = result.results as unknown as ThreadRow[];
  return rows.map(rowToThread);
}

export async function getThreadCount(sessionId: string): Promise<number> {
  const db = getDB();
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM threads WHERE session_id = ?1")
    .bind(sessionId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function createThread(sessionId: string, thread: Thread): Promise<void> {
  const db = getDB();
  const sanitizedMessages = thread.messages.map((m) => sanitizeMessage(m));
  await db
    .prepare(
      "INSERT OR REPLACE INTO threads (id, session_id, title, messages, updated_at, temporary, pinned, archived) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )
    .bind(
      thread.id,
      sessionId,
      thread.title,
      JSON.stringify(sanitizedMessages),
      thread.updatedAt,
      thread.temporary ? 1 : 0,
      thread.pinned ? 1 : 0,
      thread.archived ? 1 : 0,
    )
    .run();
}

export async function updateThread(
  sessionId: string,
  id: string,
  updates: Partial<Thread>,
): Promise<void> {
  const db = getDB();
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (updates.title !== undefined) {
    setClauses.push("title = ?");
    params.push(updates.title);
  }
  if (updates.messages !== undefined) {
    setClauses.push("messages = ?");
    const sanitizedMessages = updates.messages.map((m) => sanitizeMessage(m));
    params.push(JSON.stringify(sanitizedMessages));
  }
  if (updates.updatedAt !== undefined) {
    setClauses.push("updated_at = ?");
    params.push(updates.updatedAt);
  }
  if (updates.temporary !== undefined) {
    setClauses.push("temporary = ?");
    params.push(updates.temporary ? 1 : 0);
  }
  if (updates.pinned !== undefined) {
    setClauses.push("pinned = ?");
    params.push(updates.pinned ? 1 : 0);
  }
  if (updates.archived !== undefined) {
    setClauses.push("archived = ?");
    params.push(updates.archived ? 1 : 0);
  }

  if (setClauses.length === 0) return;

  // Add session_id and id as the last two params for the WHERE clause
  const sql = `UPDATE threads SET ${setClauses.join(", ")} WHERE session_id = ? AND id = ?`;
  params.push(sessionId, id);

  // D1 bind uses positional params
  const stmt = db.prepare(sql);
  await stmt.bind(...params).run();
}

export async function deleteThread(sessionId: string, id: string): Promise<void> {
  const db = getDB();
  await db
    .prepare("DELETE FROM threads WHERE session_id = ?1 AND id = ?2")
    .bind(sessionId, id)
    .run();
}

export async function deleteThreads(sessionId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = getDB();
  const placeholders = ids.map(() => "?").join(", ");
  const sql = `DELETE FROM threads WHERE session_id = ? AND id IN (${placeholders})`;
  const stmt = db.prepare(sql);
  const result = await stmt.bind(sessionId, ...ids).run();
  return (result.meta as { changes?: number }).changes ?? ids.length;
}

export async function getThread(sessionId: string, id: string): Promise<Thread | null> {
  const db = getDB();
  const row = await db
    .prepare("SELECT * FROM threads WHERE session_id = ?1 AND id = ?2")
    .bind(sessionId, id)
    .first();
  if (!row) return null;
  return rowToThread(row as unknown as ThreadRow);
}

export async function setThreadPinned(
  sessionId: string,
  id: string,
  pinned: boolean,
): Promise<void> {
  const db = getDB();
  await db
    .prepare("UPDATE threads SET pinned = ?1 WHERE session_id = ?2 AND id = ?3")
    .bind(pinned ? 1 : 0, sessionId, id)
    .run();
}

export async function setThreadArchived(
  sessionId: string,
  id: string,
  archived: boolean,
): Promise<void> {
  const db = getDB();
  await db
    .prepare("UPDATE threads SET archived = ?1 WHERE session_id = ?2 AND id = ?3")
    .bind(archived ? 1 : 0, sessionId, id)
    .run();
}

export async function getMessageCount(sessionId: string, threadId?: string): Promise<number> {
  const db = getDB();
  if (threadId) {
    const row = await db
      .prepare("SELECT messages FROM threads WHERE session_id = ?1 AND id = ?2")
      .bind(sessionId, threadId)
      .first<{ messages: string }>();
    if (!row) return 0;
    try {
      return (JSON.parse(row.messages) as unknown[]).length;
    } catch {
      return 0;
    }
  }
  // total across all threads
  const result = await db
    .prepare("SELECT messages FROM threads WHERE session_id = ?1")
    .bind(sessionId)
    .all<{ messages: string }>();
  let total = 0;
  for (const row of result.results) {
    try {
      total += (JSON.parse(row.messages) as unknown[]).length;
    } catch {
      // skip
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Provider Stats
// ---------------------------------------------------------------------------

interface StatRow {
  session_id: string;
  provider_id: string;
  calls: number;
  errors: number;
  input_tokens: number;
  output_tokens: number;
}

export async function getProviderStats(
  sessionId: string,
): Promise<
  Record<string, { calls: number; errors: number; inputTokens: number; outputTokens: number }>
> {
  const db = getDB();
  const result = await db
    .prepare("SELECT * FROM provider_stats WHERE session_id = ?1")
    .bind(sessionId)
    .all();
  const stats: Record<
    string,
    { calls: number; errors: number; inputTokens: number; outputTokens: number }
  > = {};
  for (const row of result.results as unknown as StatRow[]) {
    stats[row.provider_id] = {
      calls: row.calls,
      errors: row.errors,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
    };
  }
  return stats;
}

export async function upsertProviderStat(
  sessionId: string,
  providerId: string,
  kind: "call" | "error",
  inputTokens?: number,
  outputTokens?: number,
): Promise<void> {
  const db = getDB();
  const column = kind === "call" ? "calls" : "errors";
  const inputClause = typeof inputTokens === "number" ? ", input_tokens = input_tokens + ?" : "";
  const outputClause =
    typeof outputTokens === "number" ? ", output_tokens = output_tokens + ?" : "";
  const params: unknown[] = [sessionId, providerId];
  if (typeof inputTokens === "number") params.push(inputTokens);
  if (typeof outputTokens === "number") params.push(outputTokens);
  await db
    .prepare(
      `INSERT INTO provider_stats (session_id, provider_id, calls, errors, input_tokens, output_tokens) VALUES (?1, ?2, 0, 0, 0, 0)
       ON CONFLICT(session_id, provider_id) DO UPDATE SET ${column} = ${column} + 1${inputClause}${outputClause}`,
    )
    .bind(...params)
    .run();
}

export async function resetProviderStats(sessionId: string): Promise<void> {
  const db = getDB();
  await db.prepare("DELETE FROM provider_stats WHERE session_id = ?1").bind(sessionId).run();
}

export async function createUsageRecord(record: {
  id: string;
  sessionId: string;
  providerId: string;
  model?: string;
  threadId?: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  createdAt: number;
}): Promise<void> {
  const db = getDB();
  await db
    .prepare(
      "INSERT INTO usage_records (id, session_id, provider_id, model, thread_id, input_tokens, output_tokens, estimated_cost, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )
    .bind(
      record.id,
      record.sessionId,
      record.providerId,
      record.model ?? null,
      record.threadId ?? null,
      record.inputTokens,
      record.outputTokens,
      record.estimatedCost,
      record.createdAt,
    )
    .run();
}

export async function getUsageForThread(
  sessionId: string,
  threadId: string,
): Promise<{ inputTokens: number; outputTokens: number; estimatedCost: number; count: number }> {
  const db = getDB();
  const result = await db
    .prepare(
      "SELECT SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(estimated_cost) as estimated_cost, COUNT(*) as cnt FROM usage_records WHERE session_id = ?1 AND thread_id = ?2",
    )
    .bind(sessionId, threadId)
    .first<{
      input_tokens: number | null;
      output_tokens: number | null;
      estimated_cost: number | null;
      cnt: number | null;
    }>();
  return {
    inputTokens: result?.input_tokens ?? 0,
    outputTokens: result?.output_tokens ?? 0,
    estimatedCost: result?.estimated_cost ?? 0,
    count: result?.cnt ?? 0,
  };
}

export async function getAggregateUsage(sessionId: string): Promise<{
  totalCalls: number;
  totalErrors: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCost: number;
  perProvider: Record<
    string,
    { calls: number; errors: number; inputTokens: number; outputTokens: number }
  >;
}> {
  const providerStats = await getProviderStats(sessionId);
  let totalCalls = 0;
  let totalErrors = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const stat of Object.values(providerStats)) {
    totalCalls += stat.calls;
    totalErrors += stat.errors;
    totalInputTokens += stat.inputTokens;
    totalOutputTokens += stat.outputTokens;
  }
  const db = getDB();
  const costResult = await db
    .prepare("SELECT SUM(estimated_cost) as total FROM usage_records WHERE session_id = ?1")
    .bind(sessionId)
    .first<{ total: number | null }>();
  return {
    totalCalls,
    totalErrors,
    totalInputTokens,
    totalOutputTokens,
    totalEstimatedCost: costResult?.total ?? 0,
    perProvider: providerStats,
  };
}

// ---------------------------------------------------------------------------
// Vector Docs
// ---------------------------------------------------------------------------

export async function upsertVectorDoc(doc: {
  id: string;
  sessionId: string;
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  createdAt: number;
}): Promise<void> {
  const db = getDB();
  await db
    .prepare(
      "INSERT OR REPLACE INTO vector_docs (id, session_id, text, embedding, metadata, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(
      doc.id,
      doc.sessionId,
      doc.text,
      JSON.stringify(doc.embedding),
      doc.metadata ? JSON.stringify(doc.metadata) : null,
      doc.createdAt,
    )
    .run();
}

export async function getVectorDocs(sessionId: string): Promise<
  Array<{
    id: string;
    text: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }>
> {
  const db = getDB();
  const result = await db
    .prepare(
      "SELECT id, text, embedding, metadata FROM vector_docs WHERE session_id = ?1 ORDER BY created_at DESC",
    )
    .bind(sessionId)
    .all<{ id: string; text: string; embedding: string; metadata: string | null }>();
  return result.results.map((row) => ({
    id: row.id,
    text: row.text,
    embedding: JSON.parse(row.embedding) as number[],
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
  }));
}

export async function clearVectorDocs(sessionId: string): Promise<void> {
  const db = getDB();
  await db.prepare("DELETE FROM vector_docs WHERE session_id = ?1").bind(sessionId).run();
}
