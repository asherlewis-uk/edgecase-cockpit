-- 0004: restore the foreign keys the 0002 rebuild dropped.
--
-- 0002 made session_id nullable on four tables by rebuilding them. threads and
-- vector_docs came out with their FKs intact; provider_stats and usage_records
-- came out with none at all, so deleting a user orphaned their statistics and
-- their per-request cost history.
--
-- Indexes are recreated verbatim from 0002 — the partial unique indexes are what
-- keep guest rows (user_id IS NULL) from colliding with user rows.

PRAGMA foreign_keys=OFF;

-- ── provider_stats ─────────────────────────────────────────────────────────
DROP TABLE IF EXISTS provider_stats_fk;

CREATE TABLE provider_stats_fk (
  session_id TEXT,
  user_id TEXT,
  provider_id TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO provider_stats_fk (
  session_id, user_id, provider_id, calls, errors, input_tokens, output_tokens
)
SELECT session_id, user_id, provider_id, calls, errors, input_tokens, output_tokens
FROM provider_stats
-- Drop rows whose owner no longer exists; they would violate the new FK.
WHERE user_id IS NULL OR user_id IN (SELECT id FROM users);

DROP TABLE provider_stats;
ALTER TABLE provider_stats_fk RENAME TO provider_stats;

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_stats_guest_provider
  ON provider_stats(session_id, provider_id)
  WHERE user_id IS NULL AND session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_stats_user_provider
  ON provider_stats(user_id, provider_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_stats_session ON provider_stats(session_id);
CREATE INDEX IF NOT EXISTS idx_provider_stats_user ON provider_stats(user_id);

-- ── usage_records ──────────────────────────────────────────────────────────
DROP TABLE IF EXISTS usage_records_fk;

CREATE TABLE usage_records_fk (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT,
  provider_id TEXT NOT NULL,
  model TEXT,
  thread_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO usage_records_fk (
  id, session_id, user_id, provider_id, model, thread_id,
  input_tokens, output_tokens, estimated_cost, created_at
)
SELECT id, session_id, user_id, provider_id, model, thread_id,
       input_tokens, output_tokens, estimated_cost, created_at
FROM usage_records
WHERE user_id IS NULL OR user_id IN (SELECT id FROM users);

DROP TABLE usage_records;
ALTER TABLE usage_records_fk RENAME TO usage_records;

CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_records(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_thread ON usage_records(session_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_records(user_id, created_at);

PRAGMA foreign_keys=ON;
