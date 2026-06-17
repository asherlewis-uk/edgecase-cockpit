-- Migration 0003: add pricing cache and user tool permission tables.
-- Apply after 0002_user_account_ownership.sql.

-- Pricing cache for live/provider rates with static fallback.
CREATE TABLE IF NOT EXISTS pricing_cache (
  key TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- User-approved non-built-in tools.
-- Each row grants execution permission for one tool schema to one user.
CREATE TABLE IF NOT EXISTS user_tool_permissions (
  user_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, tool_name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_tool_permissions_user
  ON user_tool_permissions(user_id);
