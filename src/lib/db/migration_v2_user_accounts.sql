-- Migration from anonymous-session architecture to real user-account architecture
-- Apply this to an existing D1 database that already has the V1 schema.
-- Run with: wrangler d1 execute cockpit-db --file=src/lib/db/migration_v2_user_accounts.sql

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
ALTER TABLE threads ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE threads ADD COLUMN is_local INTEGER NOT NULL DEFAULT 1;

-- Drop the old FK on sessions (it was too restrictive for authenticated users)
-- D1/SQLite doesn't enforce FKs unless PRAGMA foreign_keys=ON, so this is advisory.
-- We'll just update the index.

CREATE INDEX IF NOT EXISTS idx_threads_sync
  ON threads(user_id, sync_enabled, is_local, updated_at);

-- ── Provider Stats: change PK to user_id + provider_id ────────────────────
-- We need to handle the case where there are duplicate user_id/provider_id combos.
-- First, aggregate any duplicates, then recreate the table with the new PK.

-- Step 1: create a temp table with aggregated data
CREATE TABLE IF NOT EXISTS provider_stats_new (
  user_id TEXT,
  provider_id TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, provider_id)
);

-- Step 2: migrate aggregated data (if user_id exists, group by user_id+provider_id)
INSERT INTO provider_stats_new (user_id, provider_id, calls, errors, input_tokens, output_tokens)
SELECT user_id, provider_id, SUM(calls), SUM(errors), SUM(input_tokens), SUM(output_tokens)
FROM provider_stats
WHERE user_id IS NOT NULL
GROUP BY user_id, provider_id;

-- Step 3: drop old table and rename new one
DROP TABLE provider_stats;
ALTER TABLE provider_stats_new RENAME TO provider_stats;

CREATE INDEX IF NOT EXISTS idx_provider_stats_session
  ON provider_stats(session_id);

CREATE INDEX IF NOT EXISTS idx_provider_stats_user
  ON provider_stats(user_id);

-- ── Usage Records: add indexes ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_records(user_id, created_at);

-- ── Vector Docs: add indexes ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vector_docs_user ON vector_docs(user_id, created_at);
