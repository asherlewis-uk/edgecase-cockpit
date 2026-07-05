# D1 Migrations

These Wrangler D1 migrations are a one-time path from the old anonymous-session
schema to the real user-account schema.

They are intentionally not fully idempotent: D1/SQLite does not support
`ALTER TABLE ADD COLUMN IF NOT EXISTS`. Use Wrangler's migration table to apply
them once, and run the preflight checks before production.

## Preflight

```bash
bunx wrangler d1 migrations list edgecase-cockpit --remote
bunx wrangler d1 execute edgecase-cockpit --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
bunx wrangler d1 execute edgecase-cockpit --remote --command "PRAGMA table_info(threads); PRAGMA table_info(provider_stats); PRAGMA table_info(usage_records); PRAGMA table_info(vector_docs);"
bunx wrangler d1 execute edgecase-cockpit --remote --command "SELECT COUNT(*) AS threads FROM threads; SELECT COUNT(*) AS provider_stats FROM provider_stats; SELECT COUNT(*) AS usage_records FROM usage_records; SELECT COUNT(*) AS vector_docs FROM vector_docs;"
bunx wrangler d1 time-travel info edgecase-cockpit
```

Expected current production state before first apply:

- No applied D1 migrations.
- `threads`, `provider_stats`, `usage_records`, and `vector_docs` do not yet
  have `user_id`.
- `threads`, `usage_records`, and `vector_docs` still have `session_id TEXT NOT
NULL`.
- Existing user-owned row counts are 0.

## Apply

```bash
bunx wrangler d1 migrations apply edgecase-cockpit --remote
```

## Rollback

Wrangler captures a D1 backup before applying migrations. Capture the current
bookmark before applying, then restore to that bookmark if the migration must be
rolled back:

```bash
bunx wrangler d1 time-travel info edgecase-cockpit
bunx wrangler d1 time-travel restore edgecase-cockpit --bookmark=<bookmark>
```
