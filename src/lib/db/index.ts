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
}

export async function getProviderStats(
  sessionId: string,
): Promise<Record<string, { calls: number; errors: number }>> {
  const db = getDB();
  const result = await db
    .prepare("SELECT * FROM provider_stats WHERE session_id = ?1")
    .bind(sessionId)
    .all();
  const stats: Record<string, { calls: number; errors: number }> = {};
  for (const row of result.results as unknown as StatRow[]) {
    stats[row.provider_id] = { calls: row.calls, errors: row.errors };
  }
  return stats;
}

export async function upsertProviderStat(
  sessionId: string,
  providerId: string,
  kind: "call" | "error",
): Promise<void> {
  const db = getDB();
  const column = kind === "call" ? "calls" : "errors";
  await db
    .prepare(
      `INSERT INTO provider_stats (session_id, provider_id, calls, errors) VALUES (?1, ?2, 0, 0)
       ON CONFLICT(session_id, provider_id) DO UPDATE SET ${column} = ${column} + 1`,
    )
    .bind(sessionId, providerId)
    .run();
}

export async function resetProviderStats(sessionId: string): Promise<void> {
  const db = getDB();
  await db.prepare("DELETE FROM provider_stats WHERE session_id = ?1").bind(sessionId).run();
}
