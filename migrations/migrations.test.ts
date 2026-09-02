import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const dir = __dirname;
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(resolve(dir, f), "utf8"))
  .join("\n");

/**
 * Every table holding per-account rows must cascade on user deletion. A table
 * that survives its owner is a data-retention bug and a GDPR-deletion bug at
 * the same time.
 */
const PER_ACCOUNT_TABLES = [
  "threads",
  "vector_docs",
  "provider_stats",
  "usage_records",
  "user_provider_keys",
  "user_settings",
  "user_tool_permissions",
];

describe("migrations", () => {
  it.each(PER_ACCOUNT_TABLES)("%s cascades when its user is deleted", (table) => {
    // The FK may be declared on the table itself, on its _new rebuild (0002),
    // or on its _fk rebuild (0004).
    const declared = new RegExp(
      `CREATE TABLE[^;]*?\\b${table}(_new|_fk)?\\b[^;]*?FOREIGN KEY\\s*\\(\\s*user_id\\s*\\)[^;]*?ON DELETE CASCADE`,
      "is",
    );
    expect(sql, `${table} has no user_id FK with ON DELETE CASCADE`).toMatch(declared);
  });

  it("keeps guest and user provider_stats rows in separate unique indexes", () => {
    expect(sql).toMatch(/idx_provider_stats_guest_provider[\s\S]*?WHERE user_id IS NULL/);
    expect(sql).toMatch(/idx_provider_stats_user_provider[\s\S]*?WHERE user_id IS NOT NULL/);
  });

  it("keeps every index the 0002 rebuild was responsible for", () => {
    for (const idx of [
      "idx_threads_session_updated",
      "idx_threads_user",
      "idx_threads_sync",
      "idx_provider_stats_session",
      "idx_provider_stats_user",
      "idx_usage_session",
      "idx_usage_thread",
      "idx_usage_user",
      "idx_vector_docs_session",
      "idx_vector_docs_user",
    ]) {
      expect(sql, `${idx} is missing`).toContain(idx);
    }
  });
});
