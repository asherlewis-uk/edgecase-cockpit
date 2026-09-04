-- Migration 0000: V1 baseline schema.
--
-- 0001 opens with `ALTER TABLE threads ADD COLUMN user_id`, so the migration
-- chain assumed a database that had already been provisioned by hand from
-- src/lib/db/schema.sql. On an empty D1 — which is what
-- `wrangler d1 migrations apply DB --local` gets in CI — 0001 died with
-- "no such table: threads". This file is that missing starting point.
--
-- This is the PRE-0001 shape, recovered from src/lib/db/schema.sql as it stood
-- at a228d42^ (the last commit before the user-account architecture landed).
-- It is deliberately NOT the current schema.sql: that file is the POST-0004
-- shape, and seeding it here would make 0001 fail with "duplicate column name:
-- user_id".
--
-- Not created here:
--   users   — 0001 creates it (CREATE TABLE IF NOT EXISTS users).
--   the tables introduced by 0002/0003 (guest_sessions, user_provider_keys,
--           user_settings, pricing_cache, user_tool_permissions).
--   rate_limits — no migration touches it, and the limiter falls back to
--           in-memory when it is absent (src/lib/rate-limit.server.ts).
--
-- Every statement is IF NOT EXISTS, so applying this to an existing database
-- that already ran 0001-0004 is a no-op.

-- ── Sessions ───────────────────────────────────────────────────────────────
-- FK target for threads/vector_docs (0002) and provider_stats/usage_records
-- (0004).
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ── Threads ────────────────────────────────────────────────────────────────
-- No user_id (added by 0001); no sync_enabled / is_local (added by 0002).
-- session_id is NOT NULL here; 0002 rebuilds the table to make it nullable.
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  messages TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL,
  temporary INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_threads_session_updated
  ON threads(session_id, updated_at);

-- ── Provider Stats ─────────────────────────────────────────────────────────
-- No user_id (added by 0001). 0002 rebuilds this without the composite primary
-- key, replacing it with the two partial unique indexes.
CREATE TABLE IF NOT EXISTS provider_stats (
  session_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(session_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_stats_session
  ON provider_stats(session_id);

-- ── Usage Records ──────────────────────────────────────────────────────────
-- No user_id (added by 0001).
CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model TEXT,
  thread_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_session
  ON usage_records(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_usage_thread
  ON usage_records(session_id, thread_id);

-- ── Vector Docs ────────────────────────────────────────────────────────────
-- No user_id (added by 0001).
CREATE TABLE IF NOT EXISTS vector_docs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  text TEXT NOT NULL,
  embedding TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_vector_docs_session
  ON vector_docs(session_id, created_at);
