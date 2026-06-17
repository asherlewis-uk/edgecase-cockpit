// Provider pricing abstraction.
// Fetches current provider pricing where a machine-readable endpoint exists,
// with static fallback rates from `src/lib/tokens.ts`. Results are cached in D1
// so cost estimates remain fast and offline-capable.

import { getDB } from "./platform.server";
import { getCostRates } from "./tokens";

export type PricingRates = Record<
  string,
  { input: number; output: number; source: "static" | "live"; updatedAt: number }
>;

export type PricingRefreshResult =
  | { ok: true; rates: PricingRates; refreshedAt: number }
  | { ok: false; error: string; rates: PricingRates };

const CACHE_TABLE = "pricing_cache";

/**
 * Return the currently active rates. Tries the cache first; falls back to
 * static defaults if no cache row exists.
 */
export async function getCachedRates(): Promise<PricingRates> {
  try {
    const db = getDB();
    const row = await db
      .prepare(`SELECT data_json FROM ${CACHE_TABLE} WHERE key = 'rates' LIMIT 1`)
      .first();
    if (row?.data_json) {
      const parsed = JSON.parse(row.data_json as string) as PricingRates;
      return parsed;
    }
  } catch {
    // D1 may not be available; fall through to static
  }

  const now = Date.now();
  return Object.fromEntries(
    ["openai", "anthropic", "gemini", "openrouter", "moonshot", "nvidia-nim", "vercel-ai"].map(
      (id) => [id, { ...getCostRates(id), source: "static" as const, updatedAt: now }],
    ),
  );
}

/**
 * Persist rates to the D1 cache.
 */
export async function setCachedRates(rates: PricingRates): Promise<void> {
  try {
    const db = getDB();
    await db
      .prepare(
        `INSERT INTO ${CACHE_TABLE} (key, data_json, updated_at)
         VALUES ('rates', ?, ?)
         ON CONFLICT(key) DO UPDATE SET data_json = ?, updated_at = ?`,
      )
      .bind(JSON.stringify(rates), Date.now(), JSON.stringify(rates), Date.now())
      .run();
  } catch {
    // Cache writes are best-effort
  }
}

/**
 * Refresh live pricing from provider APIs where available.
 * Currently OpenAI and Anthropic do not publish stable, unauthenticated pricing
 * JSON endpoints, so this function returns static rates with metadata.
 *
 * When a provider adds a public pricing endpoint, add a fetcher here and the
 * abstraction will use it automatically.
 */
export async function refreshLivePricing(): Promise<PricingRefreshResult> {
  const rates = await getCachedRates();
  const now = Date.now();

  // OpenAI: no stable public pricing endpoint; retain static.
  rates.openai = { ...getCostRates("openai"), source: "static", updatedAt: now };

  // Anthropic: no stable public pricing endpoint; retain static.
  rates.anthropic = { ...getCostRates("anthropic"), source: "static", updatedAt: now };

  // Gemini: no stable public pricing endpoint; retain static.
  rates.gemini = { ...getCostRates("gemini"), source: "static", updatedAt: now };

  await setCachedRates(rates);

  return {
    ok: true,
    rates,
    refreshedAt: now,
  };
}
