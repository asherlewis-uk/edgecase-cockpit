-- D1 schema for Cockpit (real user-account architecture)
-- Run with: wrangler d1 execute cockpit-db --file=src/lib/db/schema.sql

-- ── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ── Guest Sessions (ephemeral anonymous mode) ──────────────────────────────
CREATE TABLE IF NOT EXISTS guest_sessions (
  id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guest_sessions_expires
  ON guest_sessions(expires_at);

-- ── Sessions (TanStack Start encrypted cookie storage) ───────────────────────
-- NOTE: sessions table now only stores the cookie session id; user data is
-- stored in user-scoped tables. The session.id is kept for CSRF/rate-limit
-- continuity but is NOT the primary owner of application data.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ── User Provider Keys (encrypted, server-side only) ───────────────────────
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

-- ── User Settings ──────────────────────────────────────────────────────────
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

-- ── Threads ─────────────────────────────────────────────────────────────────
-- Threads are offline-first by default (is_local = 1, sync_enabled = 0).
-- Only synced threads (sync_enabled = 1, is_local = 0) are stored in D1.
-- For authenticated users: user_id is required, session_id is nullable.
-- For guest sessions: session_id is required, user_id is null.
CREATE TABLE IF NOT EXISTS threads (
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

CREATE INDEX IF NOT EXISTS idx_threads_session_updated
  ON threads(session_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_threads_user
  ON threads(user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_threads_sync
  ON threads(user_id, sync_enabled, is_local, updated_at);

-- ── Provider Stats ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_stats (
  session_id TEXT,
  user_id TEXT,
  provider_id TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0
);

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

-- ── Usage Records ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_records (
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

CREATE INDEX IF NOT EXISTS idx_usage_session
  ON usage_records(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_usage_thread
  ON usage_records(session_id, thread_id);

CREATE INDEX IF NOT EXISTS idx_usage_user
  ON usage_records(user_id, created_at);

-- ── Vector Docs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vector_docs (
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

CREATE INDEX IF NOT EXISTS idx_vector_docs_session
  ON vector_docs(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_vector_docs_user
  ON vector_docs(user_id, created_at);

-- ── Rate Limits ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset
  ON rate_limits(reset_at);
