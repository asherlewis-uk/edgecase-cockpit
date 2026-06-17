-- Migration 0002: complete real user-account data ownership.
-- One-time D1 migration after 0001_auth_user_columns.sql.
-- Preferred command:
--   wrangler d1 migrations apply edgecase-cockpit --remote

-- ── Guest Sessions table (new) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guest_sessions (
  id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guest_sessions_expires
  ON guest_sessions(expires_at);

-- ── User Provider Keys table (new) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_provider_keys (
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  base_url TEXT,
  model TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_provider_keys_user
  ON user_provider_keys(user_id);

-- ── User Settings table (new) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL DEFAULT '{}',
  personalization_json TEXT NOT NULL DEFAULT '{}',
  keyboard_shortcuts_json TEXT NOT NULL DEFAULT '{}',
  rag_json TEXT NOT NULL DEFAULT '{}',
  active_provider_id TEXT,
  pinned_provider_ids_json TEXT NOT NULL DEFAULT '[]',
  cost_overrides_json TEXT,
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  sync_threads_enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Threads: add sync flags ──────────────────────────────────────────────
-- D1/SQLite ADD COLUMN is not fully idempotent. Run the README preflight
-- checks first; this migration should be applied once through Wrangler.
ALTER TABLE threads ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE threads ADD COLUMN is_local INTEGER NOT NULL DEFAULT 1;

-- ── Threads: make session_id nullable for authenticated user-owned rows ────
-- Existing production user data rows are currently 0; this still preserves any
-- anonymous rows by copying all existing records.
DROP TABLE IF EXISTS threads_new;

CREATE TABLE threads_new (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT,
  title TEXT NOT NULL,
  messages TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL,
  temporary INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  sync_enabled INTEGER NOT NULL DEFAULT 0,
  is_local INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO threads_new (
  id,
  session_id,
  user_id,
  title,
  messages,
  updated_at,
  temporary,
  pinned,
  archived,
  sync_enabled,
  is_local
)
SELECT
  id,
  session_id,
  user_id,
  title,
  messages,
  updated_at,
  temporary,
  pinned,
  archived,
  sync_enabled,
  is_local
FROM threads;

DROP TABLE threads;
ALTER TABLE threads_new RENAME TO threads;

CREATE INDEX IF NOT EXISTS idx_threads_session_updated
  ON threads(session_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_threads_user
  ON threads(user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_threads_sync
  ON threads(user_id, sync_enabled, is_local, updated_at);

-- ── Provider Stats: support authenticated and guest ownership ─────────────
-- Authenticated rows are unique by user_id/provider_id. Guest rows are unique
-- by session_id/provider_id while user_id is null.
DROP TABLE IF EXISTS provider_stats_new;

CREATE TABLE provider_stats_new (
  session_id TEXT,
  user_id TEXT,
  provider_id TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0
);

INSERT INTO provider_stats_new (
  session_id,
  user_id,
  provider_id,
  calls,
  errors,
  input_tokens,
  output_tokens
)
SELECT
  CASE WHEN user_id IS NULL THEN session_id ELSE NULL END,
  user_id,
  provider_id,
  SUM(calls),
  SUM(errors),
  SUM(input_tokens),
  SUM(output_tokens)
FROM provider_stats
GROUP BY
  CASE WHEN user_id IS NULL THEN session_id ELSE NULL END,
  user_id,
  provider_id;

DROP TABLE provider_stats;
ALTER TABLE provider_stats_new RENAME TO provider_stats;

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_stats_guest_provider
  ON provider_stats(session_id, provider_id)
  WHERE user_id IS NULL AND session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_stats_user_provider
  ON provider_stats(user_id, provider_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_stats_session
  ON provider_stats(session_id);

CREATE INDEX IF NOT EXISTS idx_provider_stats_user
  ON provider_stats(user_id);

-- ── Usage Records: make session_id nullable for authenticated rows ────────
DROP TABLE IF EXISTS usage_records_new;

CREATE TABLE usage_records_new (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT,
  provider_id TEXT NOT NULL,
  model TEXT,
  thread_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

INSERT INTO usage_records_new (
  id,
  session_id,
  user_id,
  provider_id,
  model,
  thread_id,
  input_tokens,
  output_tokens,
  estimated_cost,
  created_at
)
SELECT
  id,
  session_id,
  user_id,
  provider_id,
  model,
  thread_id,
  input_tokens,
  output_tokens,
  estimated_cost,
  created_at
FROM usage_records;

DROP TABLE usage_records;
ALTER TABLE usage_records_new RENAME TO usage_records;

CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_records(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_thread ON usage_records(session_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_records(user_id, created_at);

-- ── Vector Docs: make session_id nullable for authenticated rows ──────────
DROP TABLE IF EXISTS vector_docs_new;

CREATE TABLE vector_docs_new (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT,
  text TEXT NOT NULL,
  embedding TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO vector_docs_new (
  id,
  session_id,
  user_id,
  text,
  embedding,
  metadata,
  created_at
)
SELECT
  id,
  session_id,
  user_id,
  text,
  embedding,
  metadata,
  created_at
FROM vector_docs;

DROP TABLE vector_docs;
ALTER TABLE vector_docs_new RENAME TO vector_docs;

CREATE INDEX IF NOT EXISTS idx_vector_docs_session
  ON vector_docs(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_vector_docs_user ON vector_docs(user_id, created_at);
