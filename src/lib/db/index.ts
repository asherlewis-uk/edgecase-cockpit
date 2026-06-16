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
// Users
// ---------------------------------------------------------------------------
// NOTE: User CRUD and authentication are handled in src/lib/auth.server.ts.
// The db/index.ts file only contains data-layer functions for threads, stats,
// usage, and vector docs. Do not add user auth functions here.

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

interface ThreadRow {
  id: string;
  session_id: string;
  user_id: string | null;
  title: string;
  messages: string;
  updated_at: number;
  temporary: number;
  pinned: number;
  archived: number;
  sync_enabled: number;
  is_local: number;
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
    syncEnabled: row.sync_enabled === 1,
    isLocal: row.is_local === 1,
  };
}

/** Build an ownership WHERE clause and bind params. */
function ownerWhere(
  userId: string | undefined,
  sessionId: string,
  prefix = "",
): { sql: string; params: unknown[] } {
  if (userId) {
    return { sql: `${prefix}user_id = ?1`, params: [userId] };
  }
  return { sql: `${prefix}session_id = ?1`, params: [sessionId] };
}

export async function getThreads(sessionId: string, userId?: string): Promise<Thread[]> {
  const db = getDB();
  const { sql, params } = ownerWhere(userId, sessionId);
  const result = await db
    .prepare(`SELECT * FROM threads WHERE ${sql} ORDER BY updated_at DESC`)
    .bind(...params)
    .all();
  const rows = result.results as unknown as ThreadRow[];
  return rows.map(rowToThread);
}

export async function getThreadCount(sessionId: string, userId?: string): Promise<number> {
  const db = getDB();
  const { sql, params } = ownerWhere(userId, sessionId);
  const row = await db
    .prepare(`SELECT COUNT(*) as count FROM threads WHERE ${sql}`)
    .bind(...params)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function createThread(
  sessionId: string,
  thread: Thread,
  userId?: string,
): Promise<void> {
  const db = getDB();
  const sanitizedMessages = thread.messages.map((m) => sanitizeMessage(m));
  await db
    .prepare(
      "INSERT OR REPLACE INTO threads (id, session_id, user_id, title, messages, updated_at, temporary, pinned, archived, sync_enabled, is_local) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
    )
    .bind(
      thread.id,
      sessionId,
      userId ?? null,
      thread.title,
      JSON.stringify(sanitizedMessages),
      thread.updatedAt,
      thread.temporary ? 1 : 0,
      thread.pinned ? 1 : 0,
      thread.archived ? 1 : 0,
      thread.syncEnabled ? 1 : 0,
      thread.isLocal !== false ? 1 : 0,
    )
    .run();
}

export async function updateThread(
  sessionId: string,
  id: string,
  updates: Partial<Thread>,
  userId?: string,
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
  if (updates.syncEnabled !== undefined) {
    setClauses.push("sync_enabled = ?");
    params.push(updates.syncEnabled ? 1 : 0);
  }
  if (updates.isLocal !== undefined) {
    setClauses.push("is_local = ?");
    params.push(updates.isLocal ? 1 : 0);
  }

  if (setClauses.length === 0) return;

  const { sql: whereSql, params: whereParams } = ownerWhere(userId, sessionId);
  const sql = `UPDATE threads SET ${setClauses.join(", ")} WHERE ${whereSql} AND id = ?`;
  params.push(...whereParams, id);

  const stmt = db.prepare(sql);
  await stmt.bind(...params).run();
}

export async function deleteThread(sessionId: string, id: string, userId?: string): Promise<void> {
  const db = getDB();
  const { sql, params } = ownerWhere(userId, sessionId);
  await db
    .prepare(`DELETE FROM threads WHERE ${sql} AND id = ?`)
    .bind(...params, id)
    .run();
}

export async function deleteThreads(
  sessionId: string,
  ids: string[],
  userId?: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const db = getDB();
  const placeholders = ids.map(() => "?").join(", ");
  const { sql, params } = ownerWhere(userId, sessionId);
  const sqlStr = `DELETE FROM threads WHERE ${sql} AND id IN (${placeholders})`;
  const stmt = db.prepare(sqlStr);
  const result = await stmt.bind(...params, ...ids).run();
  return (result.meta as { changes?: number }).changes ?? ids.length;
}

export async function getThread(
  sessionId: string,
  id: string,
  userId?: string,
): Promise<Thread | null> {
  const db = getDB();
  const { sql, params } = ownerWhere(userId, sessionId);
  const row = await db
    .prepare(`SELECT * FROM threads WHERE ${sql} AND id = ?`)
    .bind(...params, id)
    .first();
  if (!row) return null;
  return rowToThread(row as unknown as ThreadRow);
}

export async function setThreadPinned(
  sessionId: string,
  id: string,
  pinned: boolean,
  userId?: string,
): Promise<void> {
  const db = getDB();
  const { sql, params } = ownerWhere(userId, sessionId);
  await db
    .prepare(`UPDATE threads SET pinned = ?1 WHERE ${sql} AND id = ?`)
    .bind(pinned ? 1 : 0, ...params, id)
    .run();
}

export async function setThreadArchived(
  sessionId: string,
  id: string,
  archived: boolean,
  userId?: string,
): Promise<void> {
  const db = getDB();
  const { sql, params } = ownerWhere(userId, sessionId);
  await db
    .prepare(`UPDATE threads SET archived = ?1 WHERE ${sql} AND id = ?`)
    .bind(archived ? 1 : 0, ...params, id)
    .run();
}

export async function getMessageCount(
  sessionId: string,
  threadId?: string,
  userId?: string,
): Promise<number> {
  const db = getDB();
  const { sql, params } = ownerWhere(userId, sessionId);
  if (threadId) {
    const row = await db
      .prepare(`SELECT messages FROM threads WHERE ${sql} AND id = ?`)
      .bind(...params, threadId)
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
    .prepare(`SELECT messages FROM threads WHERE ${sql}`)
    .bind(...params)
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
  user_id: string | null;
  provider_id: string;
  calls: number;
  errors: number;
  input_tokens: number;
  output_tokens: number;
}

export async function getProviderStats(
  sessionId: string,
  userId?: string,
): Promise<
  Record<string, { calls: number; errors: number; inputTokens: number; outputTokens: number }>
> {
  const db = getDB();
  const { sql, params } = ownerWhere(userId, sessionId);
  const result = await db
    .prepare(`SELECT * FROM provider_stats WHERE ${sql}`)
    .bind(...params)
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
  userId?: string,
): Promise<void> {
  const db = getDB();
  const column = kind === "call" ? "calls" : "errors";
  const inputClause = typeof inputTokens === "number" ? ", input_tokens = input_tokens + ?" : "";
  const outputClause =
    typeof outputTokens === "number" ? ", output_tokens = output_tokens + ?" : "";
  const params: unknown[] = [sessionId, providerId, userId ?? null];
  if (typeof inputTokens === "number") params.push(inputTokens);
  if (typeof outputTokens === "number") params.push(outputTokens);
  await db
    .prepare(
      `INSERT INTO provider_stats (session_id, provider_id, user_id, calls, errors, input_tokens, output_tokens) VALUES (?1, ?2, ?3, 0, 0, 0, 0)
       ON CONFLICT(session_id, provider_id) DO UPDATE SET ${column} = ${column} + 1${inputClause}${outputClause}`,
    )
    .bind(...params)
    .run();
}

export async function resetProviderStats(sessionId: string, userId?: string): Promise<void> {
  const db = getDB();
  const { sql, params } = ownerWhere(userId, sessionId);
  await db
    .prepare(`DELETE FROM provider_stats WHERE ${sql}`)
    .bind(...params)
    .run();
}

// ---------------------------------------------------------------------------
// Usage Records
// ---------------------------------------------------------------------------

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
  userId?: string;
}): Promise<void> {
  const db = getDB();
  await db
    .prepare(
      "INSERT INTO usage_records (id, session_id, user_id, provider_id, model, thread_id, input_tokens, output_tokens, estimated_cost, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
    )
    .bind(
      record.id,
      record.sessionId,
      record.userId ?? null,
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
  userId?: string,
): Promise<{ inputTokens: number; outputTokens: number; estimatedCost: number; count: number }> {
  const db = getDB();
  const { sql, params } = ownerWhere(userId, sessionId);
  const result = await db
    .prepare(
      `SELECT SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(estimated_cost) as estimated_cost, COUNT(*) as cnt FROM usage_records WHERE ${sql} AND thread_id = ?`,
    )
    .bind(...params, threadId)
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

export async function getAggregateUsage(
  sessionId: string,
  userId?: string,
): Promise<{
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
  const providerStats = await getProviderStats(sessionId, userId);
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
  const { sql, params } = ownerWhere(userId, sessionId);
  const costResult = await db
    .prepare(`SELECT SUM(estimated_cost) as total FROM usage_records WHERE ${sql}`)
    .bind(...params)
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
  userId?: string;
}): Promise<void> {
  const db = getDB();
  await db
    .prepare(
      "INSERT OR REPLACE INTO vector_docs (id, session_id, user_id, text, embedding, metadata, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(
      doc.id,
      doc.sessionId,
      doc.userId ?? null,
      doc.text,
      JSON.stringify(doc.embedding),
      doc.metadata ? JSON.stringify(doc.metadata) : null,
      doc.createdAt,
    )
    .run();
}

export async function getVectorDocs(
  sessionId: string,
  userId?: string,
): Promise<
  Array<{
    id: string;
    text: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }>
> {
  const db = getDB();
  const { sql, params } = ownerWhere(userId, sessionId);
  const result = await db
    .prepare(
      `SELECT id, text, embedding, metadata FROM vector_docs WHERE ${sql} ORDER BY created_at DESC`,
    )
    .bind(...params)
    .all<{ id: string; text: string; embedding: string; metadata: string | null }>();
  return result.results.map((row) => ({
    id: row.id,
    text: row.text,
    embedding: JSON.parse(row.embedding) as number[],
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Guest Sessions
// ---------------------------------------------------------------------------

export async function createGuestSession(id: string, data: Record<string, unknown> = {}): Promise<void> {
  const db = getDB();
  const now = Date.now();
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days
  await db
    .prepare(
      "INSERT INTO guest_sessions (id, data_json, created_at, updated_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(id, JSON.stringify(data), now, now, expiresAt)
    .run();
}

export async function getGuestSession(
  id: string,
): Promise<{ id: string; data: Record<string, unknown>; created_at: number; updated_at: number; expires_at: number } | null> {
  const db = getDB();
  const row = await db.prepare("SELECT * FROM guest_sessions WHERE id = ?1").bind(id).first();
  if (!row) return null;
  const now = Date.now();
  if ((row.expires_at as number) < now) {
    await deleteGuestSession(id);
    return null;
  }
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse((row.data_json as string) || "{}") as Record<string, unknown>;
  } catch {
    data = {};
  }
  return {
    id: row.id as string,
    data,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    expires_at: row.expires_at as number,
  };
}

export async function updateGuestSession(id: string, data: Record<string, unknown>): Promise<void> {
  const db = getDB();
  const now = Date.now();
  await db
    .prepare("UPDATE guest_sessions SET data_json = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(JSON.stringify(data), now, id)
    .run();
}

export async function deleteGuestSession(id: string): Promise<void> {
  const db = getDB();
  await db.prepare("DELETE FROM guest_sessions WHERE id = ?1").bind(id).run();
}

export async function claimGuestSession(guestId: string, userId: string): Promise<void> {
  const db = getDB();

  // Migrate threads
  await db
    .prepare(
      "UPDATE threads SET user_id = ?1, session_id = NULL WHERE session_id = ?2 AND user_id IS NULL",
    )
    .bind(userId, guestId)
    .run();

  // Migrate provider_stats
  await db
    .prepare(
      "UPDATE provider_stats SET user_id = ?1, session_id = NULL WHERE session_id = ?2 AND user_id IS NULL",
    )
    .bind(userId, guestId)
    .run();

  // Migrate usage_records
  await db
    .prepare(
      "UPDATE usage_records SET user_id = ?1, session_id = NULL WHERE session_id = ?2 AND user_id IS NULL",
    )
    .bind(userId, guestId)
    .run();

  // Migrate vector_docs
  await db
    .prepare(
      "UPDATE vector_docs SET user_id = ?1, session_id = NULL WHERE session_id = ?2 AND user_id IS NULL",
    )
    .bind(userId, guestId)
    .run();

  // Delete the guest session
  await deleteGuestSession(guestId);
}

// ---------------------------------------------------------------------------
// User Provider Keys
// ---------------------------------------------------------------------------

export async function getUserProviderKey(
  userId: string,
  providerId: string,
): Promise<{ apiKeyEncrypted: string; baseUrl?: string; model?: string } | null> {
  const db = getDB();
  const row = await db
    .prepare("SELECT api_key_encrypted, base_url, model FROM user_provider_keys WHERE user_id = ?1 AND provider_id = ?2")
    .bind(userId, providerId)
    .first<{ api_key_encrypted: string; base_url: string | null; model: string | null }>();
  if (!row) return null;
  return {
    apiKeyEncrypted: row.api_key_encrypted,
    baseUrl: row.base_url ?? undefined,
    model: row.model ?? undefined,
  };
}

export async function setUserProviderKey(
  userId: string,
  providerId: string,
  apiKeyEncrypted: string,
  baseUrl?: string,
  model?: string,
): Promise<void> {
  const db = getDB();
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO user_provider_keys (user_id, provider_id, api_key_encrypted, base_url, model, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6) ON CONFLICT(user_id, provider_id) DO UPDATE SET api_key_encrypted = excluded.api_key_encrypted, base_url = excluded.base_url, model = excluded.model, updated_at = excluded.updated_at",
    )
    .bind(userId, providerId, apiKeyEncrypted, baseUrl ?? null, model ?? null, now)
    .run();
}

export async function clearUserProviderKey(userId: string, providerId?: string): Promise<void> {
  const db = getDB();
  if (!providerId) {
    await db.prepare("DELETE FROM user_provider_keys WHERE user_id = ?1").bind(userId).run();
    return;
  }
  await db
    .prepare("DELETE FROM user_provider_keys WHERE user_id = ?1 AND provider_id = ?2")
    .bind(userId, providerId)
    .run();
}

export async function getAllUserProviderKeys(
  userId: string,
): Promise<Record<string, { apiKeyEncrypted: string; baseUrl?: string; model?: string }>> {
  const db = getDB();
  const result = await db
    .prepare("SELECT provider_id, api_key_encrypted, base_url, model FROM user_provider_keys WHERE user_id = ?1")
    .bind(userId)
    .all<{ provider_id: string; api_key_encrypted: string; base_url: string | null; model: string | null }>();
  const keys: Record<string, { apiKeyEncrypted: string; baseUrl?: string; model?: string }> = {};
  for (const row of result.results) {
    keys[row.provider_id] = {
      apiKeyEncrypted: row.api_key_encrypted,
      baseUrl: row.base_url ?? undefined,
      model: row.model ?? undefined,
    };
  }
  return keys;
}

// ---------------------------------------------------------------------------
// User Settings
// ---------------------------------------------------------------------------

export async function getUserSettings(userId: string): Promise<{
  profileJson: string;
  personalizationJson: string;
  keyboardShortcutsJson: string;
  ragJson: string;
  activeProviderId: string | null;
  pinnedProviderIdsJson: string;
  costOverridesJson: string | null;
  onboardingCompleted: boolean;
  syncThreadsEnabled: boolean;
} | null> {
  const db = getDB();
  const row = await db
    .prepare("SELECT * FROM user_settings WHERE user_id = ?1")
    .bind(userId)
    .first<{
      profile_json: string;
      personalization_json: string;
      keyboard_shortcuts_json: string;
      rag_json: string;
      active_provider_id: string | null;
      pinned_provider_ids_json: string;
      cost_overrides_json: string | null;
      onboarding_completed: number;
      sync_threads_enabled: number;
    }>();
  if (!row) return null;
  return {
    profileJson: row.profile_json,
    personalizationJson: row.personalization_json,
    keyboardShortcutsJson: row.keyboard_shortcuts_json,
    ragJson: row.rag_json,
    activeProviderId: row.active_provider_id,
    pinnedProviderIdsJson: row.pinned_provider_ids_json,
    costOverridesJson: row.cost_overrides_json,
    onboardingCompleted: row.onboarding_completed === 1,
    syncThreadsEnabled: row.sync_threads_enabled === 1,
  };
}

export async function setUserSettings(
  userId: string,
  settings: {
    profileJson?: string;
    personalizationJson?: string;
    keyboardShortcutsJson?: string;
    ragJson?: string;
    activeProviderId?: string;
    pinnedProviderIdsJson?: string;
    costOverridesJson?: string;
    onboardingCompleted?: boolean;
    syncThreadsEnabled?: boolean;
  },
): Promise<void> {
  const db = getDB();
  const now = Date.now();

  const existing = await db
    .prepare("SELECT user_id FROM user_settings WHERE user_id = ?1")
    .bind(userId)
    .first();

  if (!existing) {
    await db
      .prepare(
        "INSERT INTO user_settings (user_id, profile_json, personalization_json, keyboard_shortcuts_json, rag_json, active_provider_id, pinned_provider_ids_json, cost_overrides_json, onboarding_completed, sync_threads_enabled, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
      )
      .bind(
        userId,
        settings.profileJson ?? "{}",
        settings.personalizationJson ?? "{}",
        settings.keyboardShortcutsJson ?? "{}",
        settings.ragJson ?? "{}",
        settings.activeProviderId ?? null,
        settings.pinnedProviderIdsJson ?? "[]",
        settings.costOverridesJson ?? null,
        settings.onboardingCompleted === true ? 1 : 0,
        settings.syncThreadsEnabled === true ? 1 : 0,
        now,
      )
      .run();
    return;
  }

  const fields: string[] = [];
  const params: unknown[] = [];

  if (settings.profileJson !== undefined) {
    fields.push("profile_json = ?");
    params.push(settings.profileJson);
  }
  if (settings.personalizationJson !== undefined) {
    fields.push("personalization_json = ?");
    params.push(settings.personalizationJson);
  }
  if (settings.keyboardShortcutsJson !== undefined) {
    fields.push("keyboard_shortcuts_json = ?");
    params.push(settings.keyboardShortcutsJson);
  }
  if (settings.ragJson !== undefined) {
    fields.push("rag_json = ?");
    params.push(settings.ragJson);
  }
  if (settings.activeProviderId !== undefined) {
    fields.push("active_provider_id = ?");
    params.push(settings.activeProviderId);
  }
  if (settings.pinnedProviderIdsJson !== undefined) {
    fields.push("pinned_provider_ids_json = ?");
    params.push(settings.pinnedProviderIdsJson);
  }
  if (settings.costOverridesJson !== undefined) {
    fields.push("cost_overrides_json = ?");
    params.push(settings.costOverridesJson);
  }
  if (settings.onboardingCompleted !== undefined) {
    fields.push("onboarding_completed = ?");
    params.push(settings.onboardingCompleted ? 1 : 0);
  }
  if (settings.syncThreadsEnabled !== undefined) {
    fields.push("sync_threads_enabled = ?");
    params.push(settings.syncThreadsEnabled ? 1 : 0);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = ?");
  params.push(now, userId);

  await db
    .prepare(`UPDATE user_settings SET ${fields.join(", ")} WHERE user_id = ?`)
    .bind(...params)
    .run();
}

// ---------------------------------------------------------------------------
// Thread Sync
// ---------------------------------------------------------------------------

export async function getSyncedThreads(userId: string): Promise<Thread[]> {
  const db = getDB();
  const result = await db
    .prepare("SELECT * FROM threads WHERE user_id = ?1 AND sync_enabled = 1 AND is_local = 0 ORDER BY updated_at DESC")
    .bind(userId)
    .all();
  const rows = result.results as unknown as ThreadRow[];
  return rows.map(rowToThread);
}

export async function getSyncedThreadCount(userId: string): Promise<number> {
  const db = getDB();
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM threads WHERE user_id = ?1 AND sync_enabled = 1 AND is_local = 0")
    .bind(userId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}


export async function clearVectorDocs(sessionId: string, userId?: string): Promise<void> {
  const db = getDB();
  const { sql, params } = ownerWhere(userId, sessionId);
  await db
    .prepare(`DELETE FROM vector_docs WHERE ${sql}`)
    .bind(...params)
    .run();
}
