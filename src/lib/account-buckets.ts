/**
 * Pure bucket-key derivation for account-scoped localStorage.
 *
 * Every key is derived from an explicit, non-null scope: a server user id or a
 * local profile id. There is deliberately NO default scope — code that has not
 * yet resolved an identity must not write anything. The legacy ":guest" keys are
 * readable (for one-time migration) but never derivable from a live scope.
 */

export type BucketScope = string;

export const SETTINGS_KEY_BASE = "cockpit.settings.v2";
export const THREADS_KEY_BASE = "cockpit.threads.v1";
export const STATS_KEY_BASE = "cockpit.provider-stats.v1";
export const VECTOR_KEY_BASE = "cockpit.vector-store.v1";
export const VALIDATION_KEY_BASE = "cockpit.provider-validation.v1";

/** The pre-identity bucket. Read-only: migrated from, never written to. */
export const LEGACY_GUEST_SCOPE = "guest";

export function settingsKey(scope: BucketScope): string {
  return `${SETTINGS_KEY_BASE}:${scope}`;
}

export function threadsKey(scope: BucketScope): string {
  return `${THREADS_KEY_BASE}:${scope}`;
}

export function statsKey(scope: BucketScope): string {
  return `${STATS_KEY_BASE}:${scope}`;
}

export function vectorKey(scope: BucketScope): string {
  return `${VECTOR_KEY_BASE}:${scope}`;
}

export function validationKey(scope: BucketScope): string {
  return `${VALIDATION_KEY_BASE}:${scope}`;
}

export function legacyGuestKeys(): {
  settings: string;
  threads: string;
  stats: string;
  vector: string;
} {
  return {
    settings: settingsKey(LEGACY_GUEST_SCOPE),
    threads: threadsKey(LEGACY_GUEST_SCOPE),
    stats: statsKey(LEGACY_GUEST_SCOPE),
    vector: vectorKey(LEGACY_GUEST_SCOPE),
  };
}
