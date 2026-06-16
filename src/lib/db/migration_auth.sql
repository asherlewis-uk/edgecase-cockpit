-- Auth migration for existing Cockpit databases
-- Apply this to an existing D1 database that already has the V1 schema.
-- Run with: wrangler d1 execute cockpit-db --file=src/lib/db/migration_auth.sql

-- ── Users table (new) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ── Add user_id columns to existing tables ────────────────────────────────
-- D1/SQLite supports ADD COLUMN for existing tables.
-- FK constraints are advisory-only unless PRAGMA foreign_keys=ON.

ALTER TABLE threads ADD COLUMN user_id TEXT;
ALTER TABLE provider_stats ADD COLUMN user_id TEXT;
ALTER TABLE usage_records ADD COLUMN user_id TEXT;
ALTER TABLE vector_docs ADD COLUMN user_id TEXT;

-- ── Create user-scoped indexes for performance ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_threads_user ON threads(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_provider_stats_user ON provider_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_records(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vector_docs_user ON vector_docs(user_id, created_at);
