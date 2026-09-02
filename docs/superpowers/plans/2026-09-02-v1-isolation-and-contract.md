# V1 Account Isolation + Surface Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the account-identity loop so every V1 surface — threads, provider
catalog and key status, tool registry and approvals, pricing and usage, and the
local RAG store — moves as one unit across the guest / local-profile / server
buckets, then narrow the store and provider public surfaces behind facades and
lock the design tokens.

**Architecture:** `src/lib/cockpit-store.ts` already persists `accountMode` +
`localProfileId` and gates the UI on `hydrateAsync()`. This plan removes the
remaining `"guest"` key fallback, makes the sync and async hydration paths stop
fighting each other, routes every mode switch through one `switchAccountBucket`
routine that resets _all_ cross-mode caches, scopes the server-side tool registry
per user, and then puts a narrow facade in front of both fat modules without
deleting them.

**Tech Stack:** TypeScript, React 19, TanStack Start/Router, Vite, Cloudflare
Workers + D1, Vitest (jsdom), Playwright, Tailwind v4 (`@theme inline`).

**Spec:** The owner's 12-item brief, reproduced verbatim in
[Appendix A](#appendix-a--the-12-item-brief). Companion context:
`docs/superpowers/plans/real-verification.md`, `docs/product-direction.md`,
`ACCOUNT_SEPARATION_PLAN.md`, `SURFACE_AUDIT.md`.

---

## Verified Starting State

Measured on branch `fix/v1-isolation-and-contract` at commit `5df92b1` before
any task in this plan:

| Check                                         | Result                                                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run`                              | 53 files, **710 tests, all pass**                                                                                                                          |
| `npx tsc --noEmit`                            | **clean**                                                                                                                                                  |
| Coverage thresholds in `vitest.config.ts`     | statements 43, branches 41, functions 35, lines 44                                                                                                         |
| `PROVIDERS` entries in `src/lib/providers.ts` | **15** (openai, anthropic, gemini, moonshot, openrouter, ollama-cloud, nvidia-nim, vercel-ai, ollama, lmstudio, hermes, openclaw, vllm, llama-cpp, custom) |
| `src/lib/cockpit-store.ts`                    | 1780 lines, ~40 named exports                                                                                                                              |
| `src/lib/providers.ts`                        | 1165 lines                                                                                                                                                 |
| `e2e/account-separation.spec.ts`              | one test, steps numbered 1–15                                                                                                                              |

**Several brief items are already implemented on this branch.** Do not redo them.
What is actually done, and what is actually missing, is itemised in
[Appendix B](#appendix-b--brief-item--task-map). Two of the missing pieces were
confirmed by running a throwaway probe spec against the current code; the exact
failure output is quoted in Tasks 1 and 2 so you can reproduce it.

---

## Global Constraints

These apply to **every** task. A task's requirements implicitly include this
section.

1. **TDD is mandatory.** Write the test, RUN it, watch it fail _for the stated
   reason_, then write the minimal code to pass. If a new test passes on its
   first run, it is not testing what you think — rewrite it.
2. **Test real code.** Never mock the module under test. Mock only true external
   boundaries: `fetch`, D1, Durable Object storage, `localStorage` is real
   (jsdom provides it).
3. **No vacuous assertions.** `expect(true).toBe(true)` and a lone
   `.not.toThrow()` are forbidden as a test's only assertion.
4. **Never weaken production code to make a test pass.** If a test exposes a real
   bug, fix the bug and say so.
5. **Do not delete provider catalog entries.** `PROVIDERS` must contain all 15
   ids listed above at the end of every task. Task 10 adds a test that enforces
   this.
6. **Do not split either fat module into packages.** Tasks 8 and 9 add facades in
   front of `cockpit-store.ts` and `providers.ts`. The implementation files stay
   where they are.
7. **Before finishing any task:** `npx vitest run`, `npx tsc --noEmit`, and
   `npx eslint .` must all be clean. Paste the real output into your report.
8. **Baseline must not regress.** 710 passing tests is the floor; the count only
   goes up.
9. **Commit at the end of each task** with a conventional-commit message, ending
   with the trailer:
   `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
   **Do not push.** The owner publishes.
10. **Do not dispatch subagents of your own.**
11. **You are the only reviewer.** No step in this plan may end by handing a
    judgment call to a human. There is no "check whether", no "confirm that", no
    "the owner should verify". Every task states a pass condition you evaluate
    yourself and either meet or fix. When a task turns up something outside its
    own scope, write it into your report as a named finding with a file and line
    — do not leave it as an open question.
12. **Secrets handling is settled — do not reopen it.** `.env.example` stays a
    committed template, app secrets ship via `wrangler secret put`, and user
    provider keys stay encrypted at rest in D1 by
    [encryption.server.ts](src/lib/encryption.server.ts). No task in this plan
    changes how secrets are stored, loaded, or injected.

---

## Execution Order

Tasks are numbered by subject, not by sequence. Run them in this order:

| Order | Tasks              | Why here                                                                                                                         |
| ----- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **15**             | Prove CI is a real gate. Every task after this one is verified by it.                                                            |
| 2     | **1–5, 7**         | Identity loop and bucket isolation. Task 4 carries the in-flight-response guard.                                                 |
| 3     | **6**              | The tools auth gate, reduced to one route.                                                                                       |
| 4     | **13, 14, 16, 17** | The four audits. Mutually independent — safe to run in parallel.                                                                 |
| 5     | **8–11**           | Facades, catalog proof, and the E2E gate.                                                                                        |
| 6     | —                  | `docs/superpowers/plans/real-verification.md` in full. It owns durable per-user tool storage (its Task 7) and the coverage work. |
| 7     | **12**             | Design tokens.                                                                                                                   |
| 8     | **18**             | Documentation consolidation.                                                                                                     |

**Ordering constraint with the companion plan:** `real-verification.md` Task 7
creates a `user_tools` D1 table keyed by `(user_id, name)` with an
`endpoint_url` column, and its Task 8 wires `executeToolCall` against it. That
is the durable home for user-registered tools. **This plan must complete before
that one starts** — Task 6 here deliberately leaves the in-memory registry alone
so the two plans cannot collide over the same function signatures.

---

## File Structure

### Files created

| File                                                                                     | Responsibility                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/account-buckets.ts`                                                             | Pure bucket-key derivation. Owns `SETTINGS_KEY_BASE`/`THREADS_KEY_BASE`/`STATS_KEY_BASE`/`VECTOR_KEY_BASE` and the `scope → key` functions. No state, no `localStorage`. Breaks the `cockpit-store ↔ vector-store` import cycle. |
| `src/lib/account-buckets.test.ts`                                                        | Tests for the above.                                                                                                                                                                                                             |
| `src/lib/store.ts`                                                                       | **Facade.** The only module routes/components may import for store access. Re-exports the narrow surface from `cockpit-store.ts`.                                                                                                |
| `src/lib/provider-api.ts`                                                                | **Facade.** The only module routes/components may import for provider access: catalog, detection, routing, model-list, status.                                                                                                   |
| `src/lib/provider-api.test.ts`                                                           | Catalog-integrity test (all 15 entries) + facade surface test.                                                                                                                                                                   |
| `src/styles/tokens.css`                                                                  | Design-token layer from `docs/product-direction.md` §5. Imported by `src/styles.css`.                                                                                                                                            |
| `src/styles/tokens.test.ts`                                                              | Asserts every required token family is declared.                                                                                                                                                                                 |
| `src/lib/validate-key.server.test.ts`                                                    | Proves an unallowlisted `baseUrl` never reaches `fetch` (Task 13). Append if `real-verification.md` Task 2 created it first.                                                                                                     |
| `src/lib/auth-core.contract.test.ts`                                                     | Pins the AES key-derivation contract (Task 16). Round-trip and tamper coverage stays with `real-verification.md` Task 5.                                                                                                         |
| `electron/main.hardening.test.ts`                                                        | Pins the Electron security posture against silent regression (Task 14).                                                                                                                                                          |
| `migrations/0004_restore_account_foreign_keys.sql`                                       | Rebuilds `provider_stats` and `usage_records` with the FKs the `0002` rebuild dropped (Task 17). **Takes number 0004** — `real-verification.md` Task 7's `user_tools` becomes 0005.                                              |
| `migrations/migrations.test.ts`                                                          | Asserts every per-account table cascades on user deletion and that no `0002` index went missing (Task 17).                                                                                                                       |
| `docs/architecture.md`, `docs/providers.md`, `docs/development.md`, `docs/deployment.md` | The README split (Task 18). Content moved verbatim.                                                                                                                                                                              |

### Files modified

| File                              | Change                                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/cockpit-store.ts`        | Remove `"guest"` key fallback; split hydration gates; add `switchAccountBucket`; bucket `providerValidationStatus`; delegate key math to `account-buckets.ts`; mark the narrow surface. |
| `src/lib/vector-store.ts`         | Use `account-buckets.ts`; drop the `"guest"` fallback in `getStoreKey()`.                                                                                                               |
| `src/routes/api/tools/schemas.ts` | Require a signed-in user for `POST`. **`src/lib/tools.ts` and `tool-execution.server.ts` are NOT modified** — the registry shape belongs to `real-verification.md` Task 7. See Task 6.  |
| `src/lib/proxy-guard.server.ts`   | Add `isBlockedNetworkTarget`; give `urlAllowedAnyProvider` the wildcard gate it was missing (Task 13).                                                                                  |
| `src/lib/validate-key.server.ts`  | Add the allowlist check it never had (Task 13).                                                                                                                                         |
| `src/lib/encryption.server.ts`    | Derive a fixed 256-bit AES key via SHA-256 instead of using the secret's raw bytes (Task 16).                                                                                           |
| `electron/main.ts`                | Explicit `sandbox`/`webSecurity`, a production CSP, and a `will-navigate` guard (Task 14).                                                                                              |
| `README.md`, `AGENTS.md`          | README split to a routing page; inbound links repointed (Task 18).                                                                                                                      |
| `src/routes/api/auth/register.ts` | `claimGuestData` default flips `true` → `false`.                                                                                                                                        |
| `src/routes/api/auth/login.ts`    | Same default flip.                                                                                                                                                                      |
| `src/routes/auth.tsx`             | Sign-in from local-only shows `DataMigrationDialog` too.                                                                                                                                |
| `src/routes/settings.tsx`         | `ToolPermissionsSection` refetches on account switch.                                                                                                                                   |
| `src/styles.css`                  | `@import` the token layer; map tokens into `@theme inline`.                                                                                                                             |
| `e2e/account-separation.spec.ts`  | Add copy/move branches + surface checks → true 17 steps; pair every negative assertion with a positive one.                                                                             |
| `e2e/v1-local-loop.spec.ts`       | Catalog-integrity check; pair `expectNoForbiddenRequests` with a positive assertion (Tasks 10, 11).                                                                                     |
| `vitest.config.ts`                | Widen `include` for `electron/` and `migrations/` tests (Tasks 14, 17); raise coverage thresholds at the end (Task 12).                                                                 |

### Files moved

| From                         | To                                        |
| ---------------------------- | ----------------------------------------- |
| `ACCOUNT_SEPARATION_PLAN.md` | `docs/archive/ACCOUNT_SEPARATION_PLAN.md` |
| `RECONSTRUCTION_PLAN.md`     | `docs/archive/RECONSTRUCTION_PLAN.md`     |
| `SURFACE_AUDIT.md`           | `docs/archive/SURFACE_AUDIT.md`           |

---

## Task 1: Stop keying any bucket as `"guest"`

Commit group 1 (identity loop + hydrate + bucket isolation).

**Files:**

- Create: `src/lib/account-buckets.ts`
- Create: `src/lib/account-buckets.test.ts`
- Modify: `src/lib/cockpit-store.ts` — `getSettingsKey` (~:137), `getThreadsKey`
  (~:153), `getStatsKey` (~:179), `persist()` (~:703), `setupCrossTabSync()`
  (~:722), `hydrateAsync()` (~:895)
- Modify: `src/lib/vector-store.ts` — `getStoreKey()` (~:17)
- Test: `src/lib/cockpit-store.account-separation.test.ts` (extend)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `src/lib/account-buckets.ts` exporting exactly —
  ```ts
  export type BucketScope = string;
  export const SETTINGS_KEY_BASE = "cockpit.settings.v2";
  export const THREADS_KEY_BASE = "cockpit.threads.v1";
  export const STATS_KEY_BASE = "cockpit.provider-stats.v1";
  export const VECTOR_KEY_BASE = "cockpit.vector-store.v1";
  export const VALIDATION_KEY_BASE = "cockpit.provider-validation.v1";
  export const LEGACY_GUEST_SCOPE = "guest";
  export function settingsKey(scope: BucketScope): string;
  export function threadsKey(scope: BucketScope): string;
  export function statsKey(scope: BucketScope): string;
  export function vectorKey(scope: BucketScope): string;
  export function validationKey(scope: BucketScope): string;
  export function legacyGuestKeys(): {
    settings: string;
    threads: string;
    stats: string;
    vector: string;
  };
  ```
  Every function takes a **non-null** scope. There is no overload that invents a
  default. Callers that have no scope must not call these.
- Produces (in `cockpit-store.ts`): `function getActiveScope(): string | null`.

---

- [ ] **Step 1: Write the failing test**

Append to `src/lib/cockpit-store.account-separation.test.ts` (inside the existing
`describe` that covers undetermined mode — match the file's existing
`beforeEach`/`setLocalJson` helpers):

```ts
it("hydrateAsync in undetermined mode writes no bucket at all", async () => {
  await hydrateAsync();
  const written = Object.keys(localStorage);
  expect(
    written.filter((k) => k.includes(":guest")),
    "undetermined hydration must not create a guest bucket",
  ).toEqual([]);
  expect(written.filter((k) => k.startsWith("cockpit.settings.v2:"))).toEqual([]);
  expect(written.filter((k) => k.startsWith("cockpit.threads.v1:"))).toEqual([]);
});
```

- [ ] **Step 2: Run it and confirm it fails for the right reason**

Run: `npx vitest run src/lib/cockpit-store.account-separation.test.ts`

Expected failure — this is the **actual observed output** from the current code:

```
AssertionError: undetermined hydration must not create a guest bucket
- Expected  - 0
+ Received  + 2
+ "cockpit.settings.v2:guest",
+ "cockpit.threads.v1:guest",
```

The cause: `hydrateAsync()` ends with an unconditional `persist()`, and
`getSettingsKey()`/`getThreadsKey()` fall back to the literal `"guest"` when both
`state.user` and `state.localProfileId` are null.

- [ ] **Step 3: Create the bucket-key module**

Create `src/lib/account-buckets.ts`:

```ts
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
```

- [ ] **Step 4: Write tests for the new module**

Create `src/lib/account-buckets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  settingsKey,
  threadsKey,
  statsKey,
  vectorKey,
  validationKey,
  legacyGuestKeys,
  LEGACY_GUEST_SCOPE,
} from "./account-buckets";

describe("account-buckets", () => {
  it("derives one key per family from a scope", () => {
    expect(settingsKey("u1")).toBe("cockpit.settings.v2:u1");
    expect(threadsKey("u1")).toBe("cockpit.threads.v1:u1");
    expect(statsKey("u1")).toBe("cockpit.provider-stats.v1:u1");
    expect(vectorKey("u1")).toBe("cockpit.vector-store.v1:u1");
    expect(validationKey("u1")).toBe("cockpit.provider-validation.v1:u1");
  });

  it("keeps distinct scopes in distinct buckets", () => {
    expect(settingsKey("a")).not.toBe(settingsKey("b"));
    expect(vectorKey("a")).not.toBe(vectorKey("b"));
  });

  it("exposes the legacy guest keys for one-time migration only", () => {
    expect(legacyGuestKeys()).toEqual({
      settings: "cockpit.settings.v2:guest",
      threads: "cockpit.threads.v1:guest",
      stats: "cockpit.provider-stats.v1:guest",
      vector: "cockpit.vector-store.v1:guest",
    });
    expect(LEGACY_GUEST_SCOPE).toBe("guest");
  });
});
```

Run: `npx vitest run src/lib/account-buckets.test.ts` — expect PASS.

- [ ] **Step 5: Make the store's scope explicit and nullable**

In `src/lib/cockpit-store.ts`, **first delete the three local base constants** —
they now live in `account-buckets.ts` and would collide with the import:

- `const SETTINGS_KEY_BASE = "cockpit.settings.v2";` (~:134)
- `const THREADS_KEY_BASE = "cockpit.threads.v1";` (~:150)
- `const STATS_KEY_BASE = "cockpit.provider-stats.v1";` (~:176)

`SETTINGS_KEY_BASE` is still _read_ by `enterServerMode`'s legacy v1→v2 migration
(`readJson(SETTINGS_KEY_BASE)` — the unscoped legacy blob), so it must come in
through the import rather than simply disappearing.

Then rewrite the three exported local-profile key helpers (~:232–242) to
delegate instead of re-deriving:

```ts
export function getLocalProfileSettingsKey(id: string): string {
  return bucketSettingsKey(id);
}

export function getLocalProfileThreadsKey(id: string): string {
  return bucketThreadsKey(id);
}

export function getLocalProfileStatsKey(id: string): string {
  return bucketStatsKey(id);
}
```

Now add the import and replace the three key getters and their guest variants:

```ts
import {
  settingsKey as bucketSettingsKey,
  threadsKey as bucketThreadsKey,
  statsKey as bucketStatsKey,
  legacyGuestKeys,
  SETTINGS_KEY_BASE,
} from "@/lib/account-buckets";

/**
 * The active bucket scope, or null when identity is unresolved.
 *
 * null is a real answer, not an error: in "undetermined" mode nothing may be
 * read from or written to any bucket. Every caller must handle null rather than
 * substituting a default.
 */
function getActiveScope(): string | null {
  return state.user?.id ?? state.localProfileId ?? null;
}

function getSettingsKey(): string | null {
  const scope = getActiveScope();
  return scope ? bucketSettingsKey(scope) : null;
}

function getThreadsKey(): string | null {
  const scope = getActiveScope();
  return scope ? bucketThreadsKey(scope) : null;
}

function getStatsKey(): string | null {
  const scope = getActiveScope();
  return scope ? bucketStatsKey(scope) : null;
}

function getSettingsKeyForUser(userId: string): string {
  return bucketSettingsKey(userId);
}

function getThreadsKeyForUser(userId: string): string {
  return bucketThreadsKey(userId);
}

function getStatsKeyForUser(userId: string): string {
  return bucketStatsKey(userId);
}
```

Delete `getGuestSettingsKey`, `getGuestThreadsKey`, and `getGuestStatsKey`, and
update `migrateGuestBucketToLocalProfile` to read via `legacyGuestKeys()`:

```ts
export function migrateGuestBucketToLocalProfile(localProfileId: string): void {
  if (typeof window === "undefined") return;
  const legacy = legacyGuestKeys();
  const guestSettings = readJson(legacy.settings);
  const guestThreads = readArr<Thread>(legacy.threads);
  const guestStats = loadStatsForKey(legacy.stats);
  const guestDocs = getAllVectorDocsForUser(null);
  // ...body below this line is unchanged...
```

- [ ] **Step 6: Make `persist()` refuse to write without a scope**

Replace `persist()`:

```ts
function persist() {
  if (typeof window === "undefined") return;
  const settingsKey = getSettingsKey();
  const threadsKey = getThreadsKey();
  // No resolved identity → no bucket to write to. Silently doing nothing is
  // correct here: the alternative is inventing a ":guest" bucket that a later
  // sign-in would then have to disentangle.
  if (!settingsKey || !threadsKey) return;

  // Strip apiKey before persisting — keys live server-side only.
  const safeProviders: Record<string, ProviderConfig> = {};
  for (const [id, cfg] of Object.entries(state.settings.providers)) {
    safeProviders[id] = { ...cfg, apiKey: "" };
  }
  const safeSettings = {
    ...state.settings,
    userName: state.settings.profile.displayName,
    activeProviderId: state.settings.personalization.rememberLastProvider
      ? state.settings.activeProviderId
      : defaultSettings.activeProviderId,
    providers: safeProviders,
  };
  localStorage.setItem(settingsKey, JSON.stringify(safeSettings));
  localStorage.setItem(threadsKey, JSON.stringify(state.threads.filter((t) => !t.temporary)));
}
```

- [ ] **Step 7: Make cross-tab sync scope-safe**

In `setupCrossTabSync()`, the three key comparisons now handle null. Replace the
listener body:

```ts
window.addEventListener("storage", (e) => {
  const currentKey = getSettingsKey();
  if (currentKey && e.key === currentKey && e.newValue) {
    try {
      state = { ...state, settings: normalizeSettings(JSON.parse(e.newValue)) };
      emit();
    } catch {
      /* ignore */
    }
  }
  const currentThreadsKey = getThreadsKey();
  if (currentThreadsKey && e.key === currentThreadsKey && e.newValue) {
    try {
      state = { ...state, threads: JSON.parse(e.newValue) };
      emit();
    } catch {
      /* ignore */
    }
  }
  const currentStatsKey = getStatsKey();
  if (currentStatsKey && e.key === currentStatsKey) {
    statsListeners.forEach((l) => l());
  }
});
```

Also update `saveStats()` (~:270) and `loadStats()` (~:262) the same way — they
call `getStatsKey()`. `saveStats` returns early when the key is null;
`loadStats` returns `{}`.

- [ ] **Step 8: Do the same in `vector-store.ts`**

Replace `getStoreKey`, `getStoreKeyForUser`, and `getGuestStoreKey` in
`src/lib/vector-store.ts`:

```ts
import { vectorKey, legacyGuestKeys } from "@/lib/account-buckets";

/** The active vector-store key, or null when identity is unresolved. */
function getStoreKey(): string | null {
  const s = store.getState();
  const scope = s.user?.id ?? s.localProfileId ?? null;
  return scope ? vectorKey(scope) : null;
}

function getStoreKeyForUser(userId: string): string {
  return vectorKey(userId);
}

/** Legacy pre-identity bucket. Read for migration; never written by live code. */
function getLegacyGuestStoreKey(): string {
  return legacyGuestKeys().vector;
}
```

`loadDocs()` returns `[]` and `saveDocs()` returns early when `getStoreKey()` is
null. `ensureVectorStoreCrossTabSync`'s listener guards on a non-null key.

The five `*ForUser(userId: string | null, ...)` helpers keep their `null`
parameter — `null` there means _the legacy guest bucket_, which
`migrateGuestBucketToLocalProfile` and the existing tests rely on. Route those
through `getLegacyGuestStoreKey()`.

- [ ] **Step 9: Run the whole suite and fix the fallout**

Run: `npx vitest run`

Some existing tests assert the old guest-write behaviour and will now fail. The
known set, with the correct resolution for each:

- `src/lib/cockpit-store.test.ts:657` and `:748` read
  `cockpit.provider-stats.v1:guest` / `cockpit.settings.v2:guest` after mutating
  a store with no resolved identity. **Fix the tests**, not the code: establish a
  local profile first via `enterLocalMode("test-profile")` and assert against
  `cockpit.settings.v2:test-profile`. Writing without an identity is exactly the
  bug this task removes.
- `src/lib/cockpit-store.test.ts:695` dispatches a `StorageEvent` for the guest
  stats key. Same fix — dispatch for the local-profile key.
- `src/lib/cockpit-store.auth.test.ts` cases at `:303`, `:374`, `:452`, `:566`,
  `:647`, `:671`, `:691` all use "guest" as a stand-in for "signed out".
  Rename the setup to establish a local profile and assert against it. Keep the
  _behaviour_ each test asserts (no leak into a signed-in user) — only the bucket
  name changes.
- `src/lib/vector-store.test.ts:152` and `:223` exercise the legacy-guest
  helpers deliberately. These should still pass unchanged; if they don't, you
  broke the `null` → legacy-guest path in Step 8.

Do not silence a failure by restoring a default scope.

- [ ] **Step 10: Verify and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
```

```bash
git add src/lib/account-buckets.ts src/lib/account-buckets.test.ts src/lib/cockpit-store.ts src/lib/vector-store.ts src/lib/cockpit-store.test.ts src/lib/cockpit-store.auth.test.ts src/lib/cockpit-store.account-separation.test.ts
git commit -m "fix(identity): stop keying account data as guest

Bucket keys now derive from an explicit non-null scope (server user id or
local profile id). Undetermined mode writes nothing at all instead of
creating a cockpit.settings.v2:guest bucket that a later sign-in would have
to disentangle.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: One hydration gate — `getState()` must not disable `hydrateAsync()`

Commit group 1.

**Files:**

- Modify: `src/lib/cockpit-store.ts` — `hydrated` flag (~:608), `__resetHydration`
  (~:616), `hydrate()` (~:653), `hydrateAsync()` (~:895), `store.getState` (~:978)
- Test: `src/lib/cockpit-store.account-separation.test.ts` (extend)

**Interfaces:**

- Consumes: `getActiveScope()` from Task 1.
- Produces: no new exports. `__resetHydration()` keeps its signature and now
  clears both gates.

**Why this matters:** `hydrate()` and `hydrateAsync()` share a single `hydrated`
boolean. Any component that touches `useStore`/`store.getState()` during the
first render — before `__root.tsx`'s `useEffect` fires — flips that flag, and
`hydrateAsync()` then returns immediately having done nothing. In `server` mode
that leaves `accountMode: "server"` with `user: null` and no bucket loaded: the
exact wrong-account state item 2 of the brief forbids.

---

- [ ] **Step 1: Write the failing test**

Append to `src/lib/cockpit-store.account-separation.test.ts`:

```ts
it("a getState() before hydrateAsync does not cancel async identity resolution", async () => {
  // Persisted state says "server", but the session is gone (fetchMe 401).
  // Correct landing: the local profile. Never a half-resolved server mode.
  localStorage.setItem("cockpit.account.mode", "server");
  localStorage.setItem("cockpit.local-profile.id", "lp-1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 401 })),
  );

  // Simulate a component reading the store during first render.
  store.getState();

  await hydrateAsync();

  expect(store.getState().accountMode).toBe("local-only");
  expect(store.getState().localProfileId).toBe("lp-1");
  expect(store.getState().user).toBeNull();
});
```

- [ ] **Step 2: Run it and confirm it fails for the right reason**

Run: `npx vitest run src/lib/cockpit-store.account-separation.test.ts`

Expected failure — **actual observed output** from the current code:

```
AssertionError: expected 'server' to be 'local-only' // Object.is equality

Expected: "local-only"
Received: "server"
```

- [ ] **Step 3: Split the gate into two flags**

In `src/lib/cockpit-store.ts`, replace `let hydrated = false;`:

```ts
/**
 * Two independent hydration gates.
 *
 * syncHydrated  — the legacy synchronous path (store.getState()) has run once.
 * asyncHydrated — hydrateAsync() has completed identity resolution.
 *
 * They are deliberately NOT one flag. A component reading the store during the
 * first render must not be able to satisfy — and thereby cancel — the async
 * identity resolution that the UI gate is still waiting on.
 */
let syncHydrated = false;
let asyncHydrated = false;
```

Update `__resetHydration()` to clear both:

```ts
export function __resetHydration(): void {
  syncHydrated = false;
  asyncHydrated = false;
  state = {
    settings: defaultSettings,
    threads: [],
    activeThreadId: null,
    user: null,
    providerKeyStatus: {},
    providerValidationStatus: {},
    stats: {},
    accountMode: "undetermined",
    localProfileId: null,
  };
}
```

- [ ] **Step 4: Point each hydration path at its own gate**

In `hydrate()`, replace the guard line:

```ts
function hydrate() {
  if (syncHydrated || typeof window === "undefined") return;
  syncHydrated = true;
```

and in the `mode === "server"` branch of `hydrate()`, leave `asyncHydrated`
untouched so `hydrateAsync()` still has work to do. Add the comment:

```ts
if (mode === "server") {
  // Do NOT load any bucket synchronously and do NOT mark asyncHydrated.
  // Server identity requires the /api/auth/me round-trip that only
  // hydrateAsync() can make; the UI gate blocks on it.
  state = { ...state, accountMode: "server", localProfileId };
  setupCrossTabSync();
  return;
}
```

In `hydrateAsync()`, replace the guard and add the completion marker:

```ts
export async function hydrateAsync(): Promise<void> {
  if (asyncHydrated || typeof window === "undefined") return;
  asyncHydrated = true;
  // Claim the sync gate too: once identity has been resolved asynchronously,
  // the legacy synchronous path must not run afterwards and re-derive state.
  syncHydrated = true;
```

- [ ] **Step 5: Only persist when a scope exists**

At the end of `hydrateAsync()`, replace the unconditional tail:

```ts
  setupCrossTabSync();
  // persist() is already a no-op without a resolved scope (Task 1), but calling
  // it in the undetermined branch is still meaningless work — skip it outright.
  if (getActiveScope()) persist();
}
```

- [ ] **Step 6: Run tests and verify both new tests pass**

Run: `npx vitest run src/lib/cockpit-store.account-separation.test.ts`
Expected: PASS, including the Task 1 test.

Run: `npx vitest run`
Expected: full suite green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cockpit-store.ts src/lib/cockpit-store.account-separation.test.ts
git commit -m "fix(identity): separate sync and async hydration gates

A component reading the store during first render flipped the single
'hydrated' flag, making hydrateAsync() a no-op and stranding server-mode
sessions in accountMode=server with user=null and no bucket loaded.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `claimGuestData` must default to false, and sign-in must ask

Commit group 1.

**Files:**

- Modify: `src/routes/api/auth/register.ts:16`
- Modify: `src/routes/api/auth/login.ts:18`
- Modify: `src/routes/auth.tsx` — `handleLogin`, `performMigrationRegister`
- Test: `src/routes/api/-auth.test.ts` (extend), `src/routes/auth.test.tsx` (extend)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `src/routes/auth.tsx` gains
  `performMigrationAuth(values, choice, kind: "register" | "signin")`, replacing
  `performMigrationRegister`. Same body, parameterised by which of
  `register`/`login` it calls.

**Why:** `claimGuestSession` in `src/lib/db/index.ts:633` already reassigns
`provider_stats`, `threads`, `usage_records`, and `vector_docs`, and both auth
routes already respect an explicit `claimGuestData: false`. The hole is the
**default**: `z.boolean().optional().default(true)`. `handleLogin` in
`auth.tsx:88` sends no opts at all, so signing in from a local profile silently
merges server-side guest rows into the account — Keep Separate is unreachable
from the sign-in path.

---

- [ ] **Step 1: Write the failing server tests**

Append to `src/routes/api/-auth.test.ts`, matching the file's existing mock
setup for `@/lib/db` and `@/lib/session.server`:

```ts
it("register does not claim guest data when the client is silent", async () => {
  const res = await callRegister({ email: "a@b.co", password: "password123" });
  expect(res.status).toBe(200);
  expect(claimGuestSessionMock).not.toHaveBeenCalled();
});

it("register claims guest data only on an explicit opt-in", async () => {
  await callRegister({ email: "a@b.co", password: "password123", claimGuestData: true });
  expect(claimGuestSessionMock).toHaveBeenCalledWith("guest-1", expect.any(String));
});

it("login does not claim guest data when the client is silent", async () => {
  const res = await callLogin({ email: "a@b.co", password: "password123" });
  expect(res.status).toBe(200);
  expect(claimGuestSessionMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/routes/api/-auth.test.ts`
Expected: the two "does not claim" tests FAIL with
`expected "claimGuestSession" to not be called at all, but it was called once`.

- [ ] **Step 3: Flip both defaults**

`src/routes/api/auth/register.ts` — replace the `claimGuestData` field and its
comment:

```ts
  // Whether the server should claim guest session data into this account.
  // Defaults to FALSE: an unstated intent must never merge one identity's data
  // into another. The local → server migration dialog sends true only for Move.
  claimGuestData: z.boolean().optional().default(false),
```

`src/routes/api/auth/login.ts` — same replacement.

- [ ] **Step 4: Run and confirm the server tests pass**

Run: `npx vitest run src/routes/api/-auth.test.ts` — expect PASS.

- [ ] **Step 5: Write the failing client test for the sign-in path**

Append to `src/routes/auth.test.tsx`, following the file's existing render and
mock conventions:

```ts
it("signing in from a local-only profile requires a migration choice first", async () => {
  storeState.accountMode = "local-only";
  storeState.localProfileId = "lp-1";
  renderAuthPage({ mode: "signin" });

  await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
  await userEvent.type(screen.getByLabelText(/password/i), "password123");
  await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

  expect(await screen.findByTestId("data-migration-dialog")).toBeInTheDocument();
  expect(loginMock).not.toHaveBeenCalled();
});

it("choosing keep-separate on sign-in sends claimGuestData false", async () => {
  storeState.accountMode = "local-only";
  storeState.localProfileId = "lp-1";
  renderAuthPage({ mode: "signin" });

  await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
  await userEvent.type(screen.getByLabelText(/password/i), "password123");
  await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
  await userEvent.click(await screen.findByTestId("migration-choice-keep-separate"));

  expect(loginMock).toHaveBeenCalledWith(
    "a@b.co",
    "password123",
    expect.objectContaining({ claimGuestData: false }),
  );
});
```

- [ ] **Step 6: Run and confirm failure**

Run: `npx vitest run src/routes/auth.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="data-migration-dialog"]`,
because `handleLogin` calls `login()` immediately.

- [ ] **Step 7: Route sign-in through the same dialog**

In `src/routes/auth.tsx`, widen the pending state and generalise the handler.
Replace the `pendingRegistration` state declaration:

```ts
// When set, a local-only user is authenticating and must choose a migration
// behaviour before the request is sent. Holds which flow triggered it so the
// dialog drives register and sign-in identically.
const [pendingAuth, setPendingAuth] = useState<
  { kind: "register"; values: RegisterForm } | { kind: "signin"; values: LoginForm } | null
>(null);
```

Replace `handleLogin`:

```ts
const handleLogin = async (values: LoginForm) => {
  setGlobalError(null);
  if (store.getState().accountMode === "local-only") {
    // Local → server sign-in: require an explicit migration choice BEFORE the
    // request so claimGuestData matches intent and no local data is eaten.
    setPendingAuth({ kind: "signin", values });
    return;
  }
  const result = await login(values.email, values.password, { claimGuestData: false });
  if (result.ok) {
    toast.success("Signed in successfully");
    navigate({ to: redirect });
    return;
  }
  setGlobalError(result.error);
};
```

Replace `handleRegister`'s intercept branch to use the new state:

```ts
if (previousMode === "local-only") {
  setPendingAuth({ kind: "register", values });
  return;
}
```

and its non-intercepted call to be explicit:

```ts
const result = await register(values.email, values.password, values.displayName, {
  claimGuestData: false,
});
```

- [ ] **Step 8: Generalise the migration performer**

Replace `performMigrationRegister` wholesale:

```ts
const performMigrationAuth = async (
  pending: NonNullable<typeof pendingAuth>,
  choice: MigrationChoice,
) => {
  setGlobalError(null);
  setMigrationSubmitting(true);
  // claimGuestData is true only for Move — the one choice where the user asked
  // for their data to be relocated into the account. Copy and Keep Separate
  // leave server-side guest rows where they are.
  const claimGuestData = choice === "move";
  const opts = {
    claimGuestData,
    // Do not auto-enter server mode; run the client-side migration first, then
    // enter server mode against the correctly-populated bucket.
    onBeforeEnterServer: () => false,
  };

  const result =
    pending.kind === "register"
      ? await register(
          pending.values.email,
          pending.values.password,
          pending.values.displayName,
          opts,
        )
      : await login(pending.values.email, pending.values.password, opts);

  if (!result.ok) {
    setMigrationSubmitting(false);
    setGlobalError(result.error);
    setPendingAuth(null);
    return;
  }

  const user = result.user as UserPublic;
  const localProfileId = store.getState().localProfileId;
  if (localProfileId) {
    if (choice === "copy") {
      copyLocalToServer(user.id, localProfileId);
    } else if (choice === "move") {
      moveLocalToServer(user.id, localProfileId);
    }
    // keep-separate: local data untouched; the account bucket starts clean.
  }
  enterServerMode(user);
  setMigrationSubmitting(false);
  setPendingAuth(null);
  toast.success(pending.kind === "register" ? "Account created" : "Signed in successfully");
  navigate({ to: redirect });
};
```

Update the JSX at the bottom of the component:

```tsx
{
  pendingAuth && (
    <DataMigrationDialog
      submitting={migrationSubmitting}
      onCancel={() => {
        setGlobalError(null);
        setPendingAuth(null);
      }}
      onChoose={(choice) => {
        void performMigrationAuth(pendingAuth, choice);
      }}
    />
  );
}
```

- [ ] **Step 9: Run and verify**

Run: `npx vitest run src/routes/auth.test.tsx src/routes/api/-auth.test.ts`
Expected: PASS.

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`

- [ ] **Step 10: Commit**

```bash
git add src/routes/api/auth/register.ts src/routes/api/auth/login.ts src/routes/auth.tsx src/routes/auth.test.tsx src/routes/api/-auth.test.ts
git commit -m "fix(auth): default claimGuestData to false and gate sign-in on a choice

An unstated claimGuestData merged guest rows into the new account. Signing
in from a local profile never offered Copy/Move/Keep Separate at all, so
Keep Separate was unreachable from that path.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: One `switchAccountBucket` routine that resets every cross-mode cache

Commit group 2 (catalog/tools/pricing/local RAG across buckets).

**Files:**

- Modify: `src/lib/cockpit-store.ts` — `clearRuntimeCaches` (~:760),
  `enterServerMode` (~:821), `enterLocalMode` (~:862),
  `loadSettingsFromServer` (~:1597), `refreshProviderKeyStatus` (~:1626),
  `migrateLocalKeysToServer` (~:1552), `syncSettingsToServer` (~:1573)
- Test: `src/lib/cockpit-store.account-separation.test.ts` (extend)

**Interfaces:**

- Consumes: `getActiveScope()` (Task 1).
- Produces:
  ```ts
  // src/lib/cockpit-store.ts — module-private
  type BucketTarget = { user: UserPublic; scope: string } | { user: null; scope: string };
  function switchAccountBucket(target: BucketTarget): void;
  function currentSwitchGeneration(): number;
  ```
  `enterServerMode` and `enterLocalMode` keep their exported signatures and both
  delegate to `switchAccountBucket`.

**Two bugs, one root cause — both fixed here:**

**(a) Divergent cache handling.** `clearRuntimeCaches()` clears only
`providerKeyStatus` and `providerValidationStatus`. `enterLocalMode` calls
`loadVectorStoreForUser(id)` and then `clearVectorStoreCache()` immediately
after, throwing away the load it just did. The two enter-mode functions have
drifted into near-duplicates with different cache handling.

**(b) In-flight responses write into the wrong bucket.** Verified in
[cockpit-store.ts:857-858](src/lib/cockpit-store.ts:857) — `enterServerMode` ends
with `void loadSettingsFromServer(); void refreshProviderKeyStatus();`. Neither
re-checks identity after its `await`. `loadSettingsFromServer` has
`if (!state.user) return;` but that guard runs **before** the fetch. So: sign in
as User A → log out → User A's response resolves → it writes `state.settings` and
calls `persist()`, which writes into whatever bucket is active _now_ — the local
profile. That is the same cross-account leak this branch exists to close, and
neither the identity work in Tasks 1–3 nor the cache work in (a) catches it.

Four fire-and-forget call sites need the guard, all confirmed present:
[:851](src/lib/cockpit-store.ts:851) `migrateLocalKeysToServer`,
[:857](src/lib/cockpit-store.ts:857) `loadSettingsFromServer`,
[:858](src/lib/cockpit-store.ts:858) `refreshProviderKeyStatus`,
[:1082](src/lib/cockpit-store.ts:1082) `syncSettingsToServer`.
The fifth, [:1428](src/lib/cockpit-store.ts:1428) `void apiFetch("/api/keys/clear")`
inside `store.clearAll`, ignores its response entirely and writes nothing back —
leave it alone, and say so in your report so the next reader does not re-audit it.

---

- [ ] **Step 1: Write the failing test**

Append to `src/lib/cockpit-store.account-separation.test.ts`:

```ts
describe("mode switch carries the whole V1 surface", () => {
  it("restores threads, stats, cost overrides and RAG together for each bucket", () => {
    // Seed a local profile bucket with one of every surface.
    enterLocalMode("lp-1");
    store.updateSettings({ costOverrides: { openai: { input: 9.99, output: 9.99 } } });
    const localThread = store.newThread();
    store.renameThread(localThread, "local thread");
    bumpProviderStat("openai", "call");
    addVectorDocsForUser("lp-1", [{ id: "d-local", text: "local memory", embedding: [1, 0, 0] }]);

    // Switch to a server account with its own data.
    enterServerMode({
      id: "u-a",
      email: "a@b.co",
      display_name: null,
      created_at: 0,
      updated_at: 0,
    });

    expect(store.getState().threads.map((t) => t.title)).not.toContain("local thread");
    expect(store.getState().settings.costOverrides ?? {}).toEqual({});
    expect(store.getState().stats.openai).toBeUndefined();
    expect(searchVectorStore([1, 0, 0], 3)).toEqual([]);

    // Switch back: the local surface returns intact.
    enterLocalMode("lp-1");
    expect(store.getState().threads.map((t) => t.title)).toContain("local thread");
    expect(store.getState().settings.costOverrides?.openai?.input).toBe(9.99);
    expect(store.getState().stats.openai?.calls).toBe(1);
    expect(searchVectorStore([1, 0, 0], 1).map((d) => d.id)).toEqual(["d-local"]);
  });

  it("clears the offline queue and provider status on every switch", () => {
    enterLocalMode("lp-1");
    localStorage.setItem("cockpit.offline-queue.v1", JSON.stringify([{ prompt: "leak me" }]));
    setProviderValidationStatus("openai", { status: "valid" });

    enterServerMode({
      id: "u-a",
      email: "a@b.co",
      display_name: null,
      created_at: 0,
      updated_at: 0,
    });

    expect(localStorage.getItem("cockpit.offline-queue.v1")).toBeNull();
    expect(getProviderValidationStatus("openai").status).toBe("idle");
    expect(store.getState().providerKeyStatus).toEqual({});
  });

  it("discards a server response that arrives after the account switched", async () => {
    // A deferred fetch: enterServerMode fires it, we switch accounts, THEN resolve.
    let releaseSettings!: (value: Response) => void;
    const settingsResponse = new Promise<Response>((resolve) => {
      releaseSettings = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/settings")) return settingsResponse;
        if (url.includes("/api/keys/status")) {
          return Promise.resolve(
            new Response(JSON.stringify({ providers: { openai: { hasKey: true } } })),
          );
        }
        return Promise.resolve(new Response("{}", { status: 404 }));
      }),
    );

    enterServerMode({
      id: "u-a",
      email: "a@b.co",
      display_name: null,
      created_at: 0,
      updated_at: 0,
    });

    // User logs out mid-flight. The local profile is now the active bucket.
    enterLocalMode("lp-1");
    const settingsBefore = JSON.stringify(store.getState().settings);

    // User A's settings finally arrive. They must go nowhere.
    releaseSettings(
      new Response(
        JSON.stringify({ profile: { displayName: "User A" }, activeProviderId: "anthropic" }),
      ),
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(store.getState().accountMode).toBe("local-only");
    expect(store.getState().user).toBeNull();
    expect(store.getState().settings.profile.displayName).not.toBe("User A");
    expect(JSON.stringify(store.getState().settings)).toBe(settingsBefore);
    expect(store.getState().providerKeyStatus).toEqual({});
    // ...and nothing was written into the local profile's bucket either.
    const persisted = JSON.parse(localStorage.getItem("cockpit.settings.v2:lp-1") ?? "{}");
    expect(persisted.profile?.displayName).not.toBe("User A");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/cockpit-store.account-separation.test.ts`
Expected, in order:

1. The RAG assertion fails first — `searchVectorStore([1,0,0], 3)` returns the
   local doc after entering server mode, because `enterLocalMode`'s trailing
   `clearVectorStoreCache()` leaves `memoryDocs` null and the next read
   re-derives from whichever scope happens to be current.
2. The in-flight test fails on
   `expect(store.getState().settings.profile.displayName).not.toBe("User A")` —
   User A's late response overwrites the local profile's settings and persists
   them into `cockpit.settings.v2:lp-1`.

Paste both observed failure messages into your report verbatim. If either passes
on the first run, the test is not exercising the bug — the deferred promise is
the mechanism, so verify `fetch` is actually being stubbed before
`enterServerMode` runs.

- [ ] **Step 3: Add the switch-generation counter**

In `src/lib/cockpit-store.ts`, beside the `syncHydrated` / `asyncHydrated` flags
from Task 2:

```ts
/**
 * Incremented on every account switch.
 *
 * Async writers capture it before their fetch and discard their result if it
 * changed. A response that arrives after the user has switched accounts must
 * never write state or call persist() — persist() writes to whatever bucket is
 * active NOW, so a late response from User A lands in the local profile.
 */
let switchGeneration = 0;

/** The generation an async writer should capture before awaiting. */
function currentSwitchGeneration(): number {
  return switchGeneration;
}
```

- [ ] **Step 4: Guard every fire-and-forget writer**

Four call sites write state after an `await`. Each captures the generation first
and returns before touching state if it moved.

`loadSettingsFromServer` (~:1597) — replace the guard and add the post-await check:

```ts
async function loadSettingsFromServer(): Promise<void> {
  if (!state.user) return;
  const generation = currentSwitchGeneration();
  try {
    const res = await apiFetch("/api/settings");
    // The account may have changed while this was in flight.
    if (generation !== currentSwitchGeneration()) return;
    if (!res.ok) return;
    const json = (await res.json()) as Partial<Settings>;
    if (generation !== currentSwitchGeneration()) return;
    // ...patch construction unchanged...
```

Both checks are needed: `res.json()` is a second await.

`refreshProviderKeyStatus` (~:1626) — same shape:

```ts
export async function refreshProviderKeyStatus() {
  const generation = currentSwitchGeneration();
  try {
    const res = await apiFetch("/api/keys/status");
    if (generation !== currentSwitchGeneration()) return;
    if (!res.ok) return;
    const json = (await res.json()) as {
      providers: Record<string, { hasKey: boolean; baseUrl?: string; model?: string }>;
    };
    if (generation !== currentSwitchGeneration()) return;
    // ...map construction unchanged...
```

`migrateLocalKeysToServer` (~:1552) — it ends with `persist(); emit(); await
refreshProviderKeyStatus();`, so guard before that tail:

```ts
async function migrateLocalKeysToServer(entries: LegacyProviderKey[]) {
  if (entries.length === 0) return;
  const generation = currentSwitchGeneration();
  await Promise.all(
    entries.map((cfg) =>
      apiFetch("/api/keys/set", {
        // ...unchanged...
      }).catch(() => null),
    ),
  );
  // Keys were pushed to the server for the account that requested it; if the
  // user has since switched, do not touch the new account's local state.
  if (generation !== currentSwitchGeneration()) return;
  persist();
  emit();
  await refreshProviderKeyStatus();
}
```

`syncSettingsToServer` (~:1573) — it writes nothing back on success, but it must
not push a departed account's settings either. Guard at entry to the fetch:

```ts
async function syncSettingsToServer(patch: Partial<Settings>): Promise<void> {
  const generation = currentSwitchGeneration();
  // ...body construction unchanged...
  if (Object.keys(body).length === 0) return;
  if (generation !== currentSwitchGeneration()) return;
  try {
    await apiFetch("/api/settings", {
      // ...unchanged...
```

Leave [:1428](src/lib/cockpit-store.ts:1428) `void apiFetch("/api/keys/clear")`
in `store.clearAll` unguarded — it discards its response and writes nothing back.
State that explicitly in your report.

- [ ] **Step 5: Write the single switch routine**

In `src/lib/cockpit-store.ts`, replace `clearRuntimeCaches` and both enter-mode
bodies:

```ts
/**
 * Reset every runtime cache that is keyed by account rather than by bucket.
 *
 * These live outside localStorage — in module state, in memory, or in a global
 * localStorage key with no scope — so a bucket swap alone does not clear them.
 * A leftover entry here is one account's data showing up under another.
 */
function clearCrossModeCaches(): void {
  state = {
    ...state,
    providerKeyStatus: {},
    providerValidationStatus: {},
  };
  clearOfflineQueue();
  clearVectorStoreCache();
  setCostOverrides({});
  // The tool schema registry is deliberately NOT cleared here. It holds only
  // static built-ins, which belong to every caller; durable per-user tools live
  // in D1 and are owned by real-verification.md Task 7. See Task 6.
}

type BucketTarget = { user: UserPublic | null; scope: string };

/**
 * The single account switch. Both enterServerMode and enterLocalMode go through
 * here so the two paths cannot drift apart in which caches they reset.
 *
 * Order is load-bearing: clear the outgoing account's caches BEFORE loading the
 * incoming bucket, so nothing clears what was just loaded.
 */
function switchAccountBucket(target: BucketTarget): void {
  // Invalidate every in-flight async writer BEFORE anything else. A response
  // from the outgoing account must not land in the incoming account's bucket.
  switchGeneration++;
  clearCrossModeCaches();

  const accountSettings = normalizeSettings(readJson(bucketSettingsKey(target.scope)));
  const accountThreads = readArr<Thread>(bucketThreadsKey(target.scope));
  const accountStats = loadStatsForKey(bucketStatsKey(target.scope));

  state = {
    ...state,
    user: target.user,
    accountMode: target.user ? "server" : "local-only",
    localProfileId: target.user ? state.localProfileId : target.scope,
    settings: accountSettings,
    threads: accountThreads,
    activeThreadId: null,
    stats: accountStats,
  };

  writeAccountMode(state.accountMode);
  if (!target.user) writeLocalProfileId(target.scope);

  // emit() re-applies costOverrides from the freshly loaded settings, undoing
  // the setCostOverrides({}) above with the incoming account's real rates.
  emit();
  persist();
  loadVectorStoreForUser(target.scope);
}

/** Switch the runtime to a server account. Loads the user bucket and clears caches. */
export function enterServerMode(user: UserPublic): void {
  const hadAccountSettings = readJson(getSettingsKeyForUser(user.id)) !== undefined;

  switchAccountBucket({ user, scope: user.id });

  // One-time legacy v1→v2 migration: if this user has no account-scoped settings
  // yet but a legacy global settings blob with apiKeys exists, push those keys to
  // the server session and keep local settings stripped.
  if (!hadAccountSettings) {
    const legacyKeys = extractLegacyProviderKeys(readJson(SETTINGS_KEY_BASE));
    if (legacyKeys.length) {
      void migrateLocalKeysToServer(legacyKeys);
    }
  }
  // Pull server-side settings first, then refresh provider key status. Ordering
  // matters: settings sync must consume the first post-auth response so legacy
  // callers/tests that mock a single settings payload still see it applied.
  void loadSettingsFromServer();
  void refreshProviderKeyStatus();
}

/** Switch the runtime to the on-device local profile. Loads the local bucket and clears caches. */
export function enterLocalMode(localProfileId: string): void {
  switchAccountBucket({ user: null, scope: localProfileId });
  // Local-only profiles never call server settings/key sync.
}
```

No import from `@/lib/tools` is added — this task does not touch the registry.

- [ ] **Step 6: Run and verify all three new tests pass**

Run: `npx vitest run src/lib/cockpit-store.account-separation.test.ts` — expect PASS.

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`

`src/lib/cockpit-store.auth.test.ts` has cases asserting the call ordering inside
`enterServerMode` (settings-sync before key-status). That ordering is preserved
above. **Decision rule if one fails:** the generation guard changes _whether_ a
late response applies, never the _order_ in which the two calls are made. If a
failing test asserts ordering, the refactor broke it — restore the order. If a
failing test asserts that a response applied after a simulated switch, the test
was encoding the bug — update the test and name it in your report as an
expectation that changed.

- [ ] **Step 8: Verify and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
```

```bash
git add src/lib/cockpit-store.ts src/lib/cockpit-store.account-separation.test.ts
git commit -m "fix(account): one bucket-switch routine, and discard late responses

enterServerMode and enterLocalMode had drifted into near-duplicates with
different cache handling: enterLocalMode discarded the vector store it had
just loaded and cost overrides survived the switch.

Separately, loadSettingsFromServer and refreshProviderKeyStatus were fired
with void and never re-checked identity after their await, so signing out
mid-flight let User A's response write state and persist() it into the local
profile's bucket. A switch-generation counter now invalidates in-flight
writers on every account switch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Bucket the provider validation status

Commit group 2.

**Files:**

- Modify: `src/lib/cockpit-store.ts` — `setProviderValidationStatus` (~:1740),
  `clearProviderValidationStatus` (~:1759), `switchAccountBucket` (Task 4)
- Test: `src/lib/cockpit-store.account-separation.test.ts` (extend)

**Interfaces:**

- Consumes: `switchAccountBucket` (Task 4), `validationKey` (Task 1).
- Produces: no signature changes.
  `setProviderValidationStatus(id, status)` and `getProviderValidationStatus(id)`
  keep their shapes; the state is now persisted to
  `cockpit.provider-validation.v1:<scope>` and reloaded on switch.

**Why:** A local-only user validates their local endpoint, switches to a server
account and back, and the endpoint reads "unvalidated" again — the V1 surface did
not survive the round trip. Item 5 of the brief calls this out explicitly:
"provider catalog + key/validation status (all 15 entries)".

---

- [ ] **Step 1: Write the failing test**

```ts
it("provider validation status survives a bucket round trip", () => {
  enterLocalMode("lp-1");
  setProviderValidationStatus("custom", { status: "valid", lastValidated: 1234 });
  expect(getProviderValidationStatus("custom").status).toBe("valid");

  enterServerMode({
    id: "u-a",
    email: "a@b.co",
    display_name: null,
    created_at: 0,
    updated_at: 0,
  });
  // User A must not inherit the local profile's validation state.
  expect(getProviderValidationStatus("custom").status).toBe("idle");

  enterLocalMode("lp-1");
  // ...and the local profile gets its own state back.
  expect(getProviderValidationStatus("custom").status).toBe("valid");
  expect(getProviderValidationStatus("custom").lastValidated).toBe(1234);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/cockpit-store.account-separation.test.ts`
Expected: the final assertion FAILS with
`expected 'idle' to be 'valid'` — the status is cleared on switch and never
restored, because it is runtime-only state.

- [ ] **Step 3: Persist validation status per bucket**

In `src/lib/cockpit-store.ts`, import `validationKey as bucketValidationKey` from
`@/lib/account-buckets` and add beside the stats helpers:

```ts
type ValidationMap = State["providerValidationStatus"];

/** Load validation status for a specific account bucket without mutating state. */
function loadValidationForKey(key: string): ValidationMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(key) || "{}") as ValidationMap;
  } catch {
    return {};
  }
}

/** Persist the current validation status into the active bucket. */
function saveValidationStatus(): void {
  if (typeof window === "undefined") return;
  const scope = getActiveScope();
  if (!scope) return;
  try {
    localStorage.setItem(
      bucketValidationKey(scope),
      JSON.stringify(state.providerValidationStatus),
    );
  } catch {
    /* quota exceeded or unavailable */
  }
}
```

Add `saveValidationStatus()` as the last statement of both
`setProviderValidationStatus` and `clearProviderValidationStatus`, after their
existing `emit()`.

- [ ] **Step 4: Restore it on switch**

In `switchAccountBucket` (Task 4), add the load beside the other three and
include it in the state assignment:

```ts
const accountStats = loadStatsForKey(bucketStatsKey(target.scope));
const accountValidation = loadValidationForKey(bucketValidationKey(target.scope));

state = {
  ...state,
  user: target.user,
  accountMode: target.user ? "server" : "local-only",
  localProfileId: target.user ? state.localProfileId : target.scope,
  settings: accountSettings,
  threads: accountThreads,
  activeThreadId: null,
  stats: accountStats,
  providerValidationStatus: accountValidation,
};
```

- [ ] **Step 5: Run and verify**

Run: `npx vitest run src/lib/cockpit-store.account-separation.test.ts` — PASS.
Run: `npx vitest run && npx tsc --noEmit && npx eslint .`

- [ ] **Step 6: Commit**

```bash
git add src/lib/cockpit-store.ts src/lib/cockpit-store.account-separation.test.ts
git commit -m "fix(providers): bucket provider validation status per account

Validation state was runtime-only, so a local profile lost its verified
endpoint the moment the user signed in and back out.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Require an account to register a tool schema

Commit group 2.

**Files:**

- Modify: `src/routes/api/tools/schemas.ts`
- Test: `src/routes/api/-tools-schemas.test.ts` (extend)

**Interfaces:**

- Consumes: nothing.
- Produces: no new exports. `src/lib/tools.ts` is **not modified** by this task —
  `RegisteredTool`, `getAllToolSchemas`, `getSerializableToolDefs`,
  `registerLocalTool`, `registerProviderTools`, `clearRegisteredTools`, and
  `getToolSchemaCounts` all keep their current signatures exactly.

**The defect, verified:** [schemas.ts](src/routes/api/tools/schemas.ts) reads the
session but never requires a user. `POST` calls
`registerLocalTool(body)` for any caller — guest included — writing into the
module-global `_registeredTools` array. `getToolApprovalStatus` then lists that
tool for every signed-in user. The sibling route
[permissions.ts:27-30](src/routes/api/tools/permissions.ts:27) already gates its
`POST` on `getAuthUserId()` and returns
`{ error: "Authentication required" }` with status 401. This route does not.

**Why the fix stops at the auth gate — and does not scope the registry:**

An earlier draft of this task keyed `_registeredTools` by owner. That was the
wrong layer, for three reasons:

1. **The durable home is D1, not module memory.**
   `docs/superpowers/plans/real-verification.md` Task 7 creates a `user_tools`
   table keyed by `(user_id, name)` with an `endpoint_url` column, and its Task 8
   wires `executeToolCall` against it. Once user tools live there, the
   cross-account leak is not merely fixed — it is no longer expressible, because
   there is no shared array to leak from and no cross-account cache to clear.
2. **A module-global array on Workers is not durable anyway.** Isolates recycle,
   and concurrent isolates hold separate arrays. An owner-scoped registry would
   be correctly isolated and still unreliable: a user's registered tools would
   appear and disappear depending on which isolate served the request. Fixing the
   isolation without fixing the durability produces a bug that is harder to
   diagnose, not easier.
3. **It would collide with the companion plan.** Adding `ownerId` to
   `RegisteredTool` and prefixing every registry function with an owner parameter
   changes the exact signatures `real-verification.md` Task 8 builds on.

So this task closes the hole that is real today — anonymous registration — and
leaves the registry shape alone for the plan that owns it.

**Explicitly out of scope, do not do:**

- Do **not** add `ownerId` to `RegisteredTool`.
- Do **not** add `clearRegisteredToolsForOwner`.
- Do **not** change any function signature in `src/lib/tools.ts`.
- Built-in tools stay module-global. They are static and belong to every caller.

---

- [ ] **Step 1: Write the failing test**

Append to `src/routes/api/-tools-schemas.test.ts`, mirroring the auth-mocking
style already used in `src/routes/api/-tools-permissions.test.ts` (which mocks
`getAuthUserId` from `@/lib/session.server`):

```ts
it("POST rejects an anonymous caller with 401", async () => {
  getAuthUserIdMock.mockResolvedValue(undefined);
  const res = await callPost({ name: "x_tool", description: "", parameters: [] });
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "Authentication required" });
});

it("POST does not register anything for an anonymous caller", async () => {
  getAuthUserIdMock.mockResolvedValue(undefined);
  await callPost({ name: "ghost_tool", description: "", parameters: [] });

  // A signed-in caller must not see the tool the anonymous request tried to add.
  getAuthUserIdMock.mockResolvedValue("user-a");
  const res = await callGet();
  const json = (await res.json()) as { schemas: Array<{ name: string }> };
  expect(json.schemas.map((s) => s.name)).not.toContain("ghost_tool");
});

it("POST accepts a signed-in caller", async () => {
  getAuthUserIdMock.mockResolvedValue("user-a");
  const res = await callPost({ name: "real_tool", description: "", parameters: [] });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
```

The second test is the one that matters: a 401 that still mutated the registry
would be a fix in name only.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/routes/api/-tools-schemas.test.ts`

Expected: `POST rejects an anonymous caller with 401` FAILS with
`expected 200 to be 401`, and `POST does not register anything for an anonymous
caller` FAILS because `ghost_tool` is present in the schema list. Paste both
observed messages into your report.

- [ ] **Step 3: Add the auth gate**

In `src/routes/api/tools/schemas.ts`, add the import:

```ts
import { getAuthUserId } from "@/lib/session.server";
```

`getAuthUserId` returns `Promise<string | undefined>`. This is the same helper
`permissions.ts` uses, so the two sibling routes resolve identity identically.

In the `POST` handler, insert the gate immediately after the CSRF check and
before the rate limit — an anonymous caller should be rejected on identity, not
burn a rate-limit bucket:

```ts
      POST: async ({ request }) => {
        const csrfCheck = validateCsrfToken(request);
        if (csrfCheck !== true) return csrfCheck;

        // Registering a tool schema mutates process-global state that every
        // caller reads. Anonymous callers may not write to it.
        const userId = await getAuthUserId();
        if (!userId) {
          return Response.json({ error: "Authentication required" }, { status: 401 });
        }

        const rl = await sessionRateLimit(`tools-schemas:${userId}`);
        if (!rl.ok) return rateLimitResponse(rl.retryAfter);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const ok = registerLocalTool(body);
        if (!ok) {
          return Response.json({ error: "Invalid, duplicate, or limit reached" }, { status: 400 });
        }

        return Response.json({ ok: true });
      },
```

Leave the `GET` handler as it is. It returns built-ins plus whatever is
registered, which is the current contract; narrowing what `GET` returns is
`real-verification.md` Task 8's job once tools live in D1.

- [ ] **Step 4: Run and verify**

Run: `npx vitest run src/routes/api/-tools-schemas.test.ts` — expect PASS.

- [ ] **Step 5: Record the residual risk**

`src/lib/tools.ts` is untouched, so a tool registered by one signed-in user is
still visible to every other signed-in user through `getAllToolSchemas`. That is
deliberate and temporary. Write this line into your report verbatim so it is not
mistaken for an oversight:

> Registry sharing between signed-in users remains open by design. It closes in
> `real-verification.md` Task 7, which moves user-registered tools into the
> `user_tools` D1 table keyed by `(user_id, name)`. This plan must land first.

- [ ] **Step 6: Full verification and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
```

```bash
git add src/routes/api/tools/schemas.ts src/routes/api/-tools-schemas.test.ts
git commit -m "fix(tools): require an account to register a tool schema

POST /api/tools/schemas read the session but never required a user, so any
caller could write into the process-global registry that every signed-in
user reads. Matches the gate permissions.ts already applies.

Durable per-user tool storage is real-verification.md Task 7; the registry
shape is deliberately left alone here so the two plans do not collide.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Refetch tool permissions when the account changes

Commit group 2.

**Files:**

- Modify: `src/routes/settings.tsx` — `ToolPermissionsSection` (~:1224)
- Test: create `src/routes/-settings-tool-permissions.test.tsx`

**Interfaces:**

- Consumes: `useStore` from `@/lib/cockpit-store` (facade in Task 8 — import from
  `@/lib/cockpit-store` for now; Task 8 rewrites the import).
- Produces: no exports. `ToolPermissionsSection` stays a local component.

**Why:** the section's `useEffect` has an empty dependency array, so it fetches
once on mount and never again. Switching accounts inside the settings page leaves
User A's approval list rendered under User B.

---

- [ ] **Step 1: Write the failing test**

Create `src/routes/-settings-tool-permissions.test.tsx`. Follow the mocking style
of `src/components/cockpit/settings/ProviderCard.test.tsx` for
`@/lib/api-base` and `@/lib/cockpit-store`.

```tsx
it("refetches the approval list when the account scope changes", async () => {
  apiFetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ tools: [{ name: "a_tool", source: "local", approved: true }] })),
  );
  const { rerender } = render(<ToolPermissionsSection />);
  expect(await screen.findByText("a_tool")).toBeInTheDocument();

  apiFetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ tools: [{ name: "b_tool", source: "local", approved: false }] })),
  );
  actAsUser("u-b");
  rerender(<ToolPermissionsSection />);

  expect(await screen.findByText("b_tool")).toBeInTheDocument();
  expect(screen.queryByText("a_tool")).not.toBeInTheDocument();
});
```

`ToolPermissionsSection` is currently module-private in `settings.tsx`. Export it
(`export function ToolPermissionsSection()`) so the test can mount it in
isolation — exporting one component for testability is not the fat-route split,
which stays out of scope.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/routes/-settings-tool-permissions.test.tsx`
Expected: FAIL — `Unable to find an element with the text: b_tool`; the stale
`a_tool` row is still rendered.

- [ ] **Step 3: Key the effect on the account scope**

In `src/routes/settings.tsx`, replace the top of `ToolPermissionsSection`:

```tsx
export function ToolPermissionsSection() {
  const [tools, setTools] = useState<Array<{ name: string; source: string; approved: boolean }>>(
    [],
  );
  const [loading, setLoading] = useState(false);
  // Approvals are per-account. Re-key the fetch on the active scope so switching
  // accounts inside the settings page cannot leave the previous list rendered.
  const accountScope = useStore((s) => s.user?.id ?? s.localProfileId ?? null);

  useEffect(() => {
    let active = true;
    setTools([]);
    setLoading(true);
    apiFetch("/api/tools/permissions", { headers: csrfHeaders() })
      .then((res) => res.json())
      .then((json: { tools: Array<{ name: string; source: string; approved: boolean }> }) => {
        if (active) setTools(json.tools ?? []);
      })
      .catch(() => {
        if (active) setTools([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accountScope]);
```

The rest of the component is unchanged.

- [ ] **Step 4: Run and verify**

Run: `npx vitest run src/routes/-settings-tool-permissions.test.tsx` — PASS.
Run: `npx vitest run && npx tsc --noEmit && npx eslint .`

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings.tsx src/routes/-settings-tool-permissions.test.tsx
git commit -m "fix(settings): refetch tool approvals when the account scope changes

The approval list fetched once on mount, so switching accounts inside the
settings page left the previous account's tools rendered.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Narrow the cockpit-store public surface behind a facade

Commit group 3 (narrow store public surface without deleting those modules).

**Files:**

- Create: `src/lib/store.ts`
- Create: `src/lib/store.test.ts`
- Modify: every route and component importing `@/lib/cockpit-store` (list below)
- Modify: `eslint.config.js` — add a `no-restricted-imports` rule

**Interfaces:**

- Consumes: everything from Tasks 1–7.
- Produces — `src/lib/store.ts` exports **exactly** this and nothing more:
  ```ts
  export { store, useStore, hydrateAsync, enterLocalMode, enterServerMode } from "./cockpit-store";
  export { ensureLocalProfileId, copyLocalToServer, moveLocalToServer } from "./cockpit-store";
  export { register, login, logout, csrfHeaders } from "./cockpit-store";
  export { resolveProvider, isProviderReady, providerHasKey } from "./cockpit-store";
  export {
    getProviderValidationStatus,
    setProviderValidationStatus,
    clearProviderValidationStatus,
  } from "./cockpit-store";
  export { deriveV1LocalEndpointCapabilityState, useOnboardingState } from "./cockpit-store";
  export {
    getProviderStats,
    subscribeProviderStats,
    bumpProviderStat,
    recordTokenUsage,
    resetProviderStats,
  } from "./cockpit-store";
  export {
    defaultSettings,
    defaultProfile,
    defaultPersonalization,
    defaultKeyboardShortcuts,
    defaultRagSettings,
    deriveInitials,
  } from "./cockpit-store";
  export type {
    AccountMode,
    Settings,
    Thread,
    Message,
    UserPublic,
    UserProfile,
    Personalization,
    KeyboardShortcuts,
    RagSettings,
    ProviderConfig,
    ProviderStat,
  } from "./cockpit-store";
  ```

**Not re-exported** (and therefore off-limits to routes): `fetchMe`,
`refreshProviderKeyStatus`, `migrateGuestBucketToLocalProfile`,
`readAccountMode`, `writeAccountMode`, `readLocalProfileId`,
`writeLocalProfileId`, `generateLocalProfileId`, `getLocalProfileSettingsKey`,
`getLocalProfileThreadsKey`, `getLocalProfileStatsKey`, `clearOfflineQueue`,
`normalizeSettings`, `__resetHydration`, `ACCOUNT_MODE_KEY`,
`LOCAL_PROFILE_ID_KEY`, and the `PROVIDERS` re-export (Task 9 owns that).

`cockpit-store.ts` keeps every one of those exports — tests import them directly.
Only _routes and components_ are restricted.

---

- [ ] **Step 1: Write the failing surface test**

Create `src/lib/store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as facade from "./store";

const ALLOWED = [
  "store",
  "useStore",
  "hydrateAsync",
  "enterLocalMode",
  "enterServerMode",
  "ensureLocalProfileId",
  "copyLocalToServer",
  "moveLocalToServer",
  "register",
  "login",
  "logout",
  "csrfHeaders",
  "resolveProvider",
  "isProviderReady",
  "providerHasKey",
  "getProviderValidationStatus",
  "setProviderValidationStatus",
  "clearProviderValidationStatus",
  "deriveV1LocalEndpointCapabilityState",
  "useOnboardingState",
  "getProviderStats",
  "subscribeProviderStats",
  "bumpProviderStat",
  "recordTokenUsage",
  "resetProviderStats",
  "defaultSettings",
  "defaultProfile",
  "defaultPersonalization",
  "defaultKeyboardShortcuts",
  "defaultRagSettings",
  "deriveInitials",
].sort();

describe("store facade", () => {
  it("exposes exactly the sanctioned runtime surface", () => {
    expect(Object.keys(facade).sort()).toEqual(ALLOWED);
  });

  it("keeps persistence, auth-session and identity internals private", () => {
    for (const leaked of [
      "fetchMe",
      "refreshProviderKeyStatus",
      "migrateGuestBucketToLocalProfile",
      "writeAccountMode",
      "writeLocalProfileId",
      "normalizeSettings",
      "__resetHydration",
      "PROVIDERS",
    ]) {
      expect(facade, `${leaked} must not be reachable through the facade`).not.toHaveProperty(
        leaked,
      );
    }
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/store.test.ts`
Expected: FAIL — `Cannot find module './store'`.

- [ ] **Step 3: Create the facade**

Create `src/lib/store.ts` with a header comment and exactly the re-export list
from the **Interfaces** block above:

```ts
/**
 * The store facade: the only cockpit-store surface routes and components may use.
 *
 * cockpit-store.ts stays a single fat module — it is not being split — but its
 * auth-session, persistence, bucket-key, stats-internal, pricing and RAG plumbing
 * are no longer reachable from the UI layer. Tests still import cockpit-store.ts
 * directly; the eslint rule below restricts routes and components only.
 *
 * Adding an export here is a deliberate widening of the contract. Update
 * store.test.ts in the same commit so the surface stays asserted.
 */
```

- [ ] **Step 4: Run the surface test**

Run: `npx vitest run src/lib/store.test.ts` — expect PASS. If it fails on an
unexpected key, you exported something the contract does not include: remove it
rather than widening `ALLOWED`.

- [ ] **Step 5: Repoint every UI import**

Rewrite the `@/lib/cockpit-store` import to `@/lib/store` in exactly these files:

```
src/components/cockpit/AccountMenu.tsx
src/components/cockpit/ChatMessages.tsx
src/components/cockpit/CommandPalette.tsx
src/components/cockpit/Drawer.tsx
src/components/cockpit/IdentityChoiceModal.tsx
src/components/cockpit/MessageRow.tsx
src/components/cockpit/ModelPicker.tsx
src/components/cockpit/OnboardingModal.tsx
src/components/cockpit/ProviderStatus.tsx
src/components/cockpit/ShortcutHelp.tsx
src/components/cockpit/ThreadOverflowMenu.tsx
src/components/cockpit/settings/PersonalizationSection.tsx
src/components/cockpit/settings/ProfileSection.tsx
src/components/cockpit/settings/ProviderCard.tsx
src/components/cockpit/settings/UsageSection.tsx
src/hooks/use-chat.ts
src/hooks/use-keyboard-shortcuts.ts
src/routes/__root.tsx
src/routes/auth.tsx
src/routes/images.tsx
src/routes/index.tsx
src/routes/library.tsx
src/routes/settings.tsx
src/routes/thread.$id.tsx
src/routes/videos.tsx
```

Do **not** change these — they are server-side or infrastructure and legitimately
use internals: `src/lib/db/index.ts`, `src/lib/embeddings.ts`,
`src/lib/vector-store.ts`, `src/lib/providers.ts`, `src/routes/api/threads*.ts`.

Any UI file that turns out to need a non-exported symbol is telling you something:
either the symbol belongs in the facade (add it, and to `ALLOWED`, with a
one-line justification in your report) or the call belongs in the store. Do not
reach around the facade.

- [ ] **Step 6: Enforce it in eslint**

Add to `eslint.config.js`, in a config block scoped to
`["src/routes/**/*.tsx", "src/components/**/*.tsx", "src/hooks/**/*.ts"]`:

```js
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/cockpit-store",
              message:
                "Import from @/lib/store instead. cockpit-store internals (auth session, persistence, bucket keys, stats/pricing/RAG plumbing) are not part of the UI contract.",
            },
          ],
        },
      ],
```

Keep `src/**/*.test.{ts,tsx}` out of that scope — tests import internals on
purpose.

- [ ] **Step 7: Run and verify**

Run: `npx eslint .` — expect clean. A violation here means a Step 5 file was
missed.

Run: `npx vitest run && npx tsc --noEmit`

- [ ] **Step 8: Commit**

```bash
git add src/lib/store.ts src/lib/store.test.ts eslint.config.js src/routes src/components src/hooks
git commit -m "refactor(store): put a narrow facade in front of cockpit-store

Routes and components now import @/lib/store, which exposes the store,
hydration, mode switches and bucketed helpers. Auth-session, persistence,
stats, pricing, tools and RAG internals stay behind it, enforced by eslint.
cockpit-store.ts is unchanged in size and keeps every export for tests.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Give `providers.ts` the same treatment

Commit group 3.

**Files:**

- Create: `src/lib/provider-api.ts`
- Create: `src/lib/provider-api.test.ts`
- Modify: the provider consumers listed in Step 4
- Modify: `eslint.config.js` — extend the `no-restricted-imports` paths

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces — `src/lib/provider-api.ts` exports exactly:
  ```ts
  // Catalog
  export { PROVIDERS, getProvider } from "./providers";
  export {
    V1_LOCAL_OPENAI_COMPAT_ENDPOINT_ID,
    V1_LOCAL_OPENAI_COMPAT_PROVIDER_ID,
  } from "./providers";
  // Detection + status
  export { detectProvider, deriveLocalCapabilityState } from "./providers";
  // Model list
  export { probeLocalOpenAICompatibleModels } from "./providers";
  // Routing
  export {
    callProviderChat,
    callProviderChatViaProxy,
    transcribeAudioViaProxy,
    ProviderError,
  } from "./providers";
  export type {
    ProviderDef,
    Capability,
    BodyStyle,
    AuthStyle,
    Model,
    ChatMessage,
    ProviderCallOpts,
    DetectResult,
    ModelListProbeResult,
    ModelListProbeOptions,
    LocalCapabilityState,
    LocalCapabilityStatus,
    LocalCapabilityEnvironment,
    LocalCapabilityStateInput,
  } from "./providers";
  ```

**Constraint restated:** the catalog stays at 15 entries. This task adds the test
that makes deleting one a red build.

---

- [ ] **Step 1: Write the failing catalog-integrity test**

Create `src/lib/provider-api.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as api from "./provider-api";

/**
 * The catalog contract. Cloud providers are supported infrastructure, not
 * clutter to be trimmed so a local-first story reads better. Removing an entry
 * from this list is a product decision, and it goes through this test.
 */
const CATALOG = [
  "openai",
  "anthropic",
  "gemini",
  "moonshot",
  "openrouter",
  "ollama-cloud",
  "nvidia-nim",
  "vercel-ai",
  "ollama",
  "lmstudio",
  "hermes",
  "openclaw",
  "vllm",
  "llama-cpp",
  "custom",
];

describe("provider catalog", () => {
  it("keeps all 15 entries, cloud and local alike", () => {
    expect(api.PROVIDERS.map((p) => p.id)).toEqual(CATALOG);
  });

  it("keeps the generic local OpenAI-compatible endpoint pointed at a real entry", () => {
    expect(api.V1_LOCAL_OPENAI_COMPAT_PROVIDER_ID).toBe("custom");
    expect(CATALOG).toContain(api.V1_LOCAL_OPENAI_COMPAT_PROVIDER_ID);
    expect(api.getProvider(api.V1_LOCAL_OPENAI_COMPAT_PROVIDER_ID).id).toBe("custom");
  });

  it("exposes catalog, detection, model-list, routing and status through one facade", () => {
    for (const fn of [
      "getProvider",
      "detectProvider",
      "deriveLocalCapabilityState",
      "probeLocalOpenAICompatibleModels",
      "callProviderChat",
      "callProviderChatViaProxy",
      "transcribeAudioViaProxy",
    ]) {
      expect(typeof api[fn as keyof typeof api], `${fn} missing from facade`).toBe("function");
    }
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/provider-api.test.ts`
Expected: FAIL — `Cannot find module './provider-api'`.

- [ ] **Step 3: Create the facade**

Create `src/lib/provider-api.ts` with the re-export list from **Interfaces**, led
by:

```ts
/**
 * The provider facade: one surface for catalog, detection, routing, model-list
 * and status.
 *
 * providers.ts stays one module — this is not a monorepo split. What this buys
 * is a single place to read what the UI is allowed to ask of a provider, and a
 * single test (provider-api.test.ts) asserting the catalog keeps all 15 entries.
 * Cloud providers are supported infrastructure; they are not hidden to make the
 * product look more local-first.
 */
```

- [ ] **Step 4: Repoint the UI consumers**

Rewrite `@/lib/providers` → `@/lib/provider-api` in:

```
src/components/cockpit/CommandPalette.tsx
src/components/cockpit/Drawer.tsx
src/components/cockpit/ModelPicker.tsx
src/components/cockpit/OnboardingModal.tsx
src/components/cockpit/settings/ProviderCard.tsx
src/hooks/use-chat.ts
src/routes/index.tsx
src/routes/settings.tsx
```

Leave the server routes (`src/routes/api/keys/*.ts`, `src/routes/api/proxy/*.ts`),
`src/lib/proxy-guard.server.ts`, and `src/lib/cockpit-store.ts` importing
`@/lib/providers` directly — they use the transport internals the facade
deliberately omits.

`src/lib/cockpit-store.ts` currently ends with `export { PROVIDERS };` (~:1776).
Delete that line — `PROVIDERS` now comes from `@/lib/provider-api`. Update the
two UI files that import `PROVIDERS` from the store (grep for
`PROVIDERS` in `src/routes` and `src/components`).

- [ ] **Step 5: Extend the eslint restriction**

Add a second entry to the `paths` array from Task 8, Step 6:

```js
            {
              name: "@/lib/providers",
              message:
                "Import from @/lib/provider-api instead. providers.ts transport internals are not part of the UI contract.",
            },
```

- [ ] **Step 6: Run and verify**

Run: `npx vitest run src/lib/provider-api.test.ts` — PASS.
Run: `npx vitest run && npx tsc --noEmit && npx eslint .`

- [ ] **Step 7: Commit**

```bash
git add src/lib/provider-api.ts src/lib/provider-api.test.ts src/lib/cockpit-store.ts eslint.config.js src/routes src/components src/hooks
git commit -m "refactor(providers): one facade for catalog, detection, routing and status

Adds a catalog-integrity test pinning all 15 entries so no one trims cloud
providers to make a local-first story read better. providers.ts is unchanged
and unsplit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Prove the generic local endpoint on a genuine first run

Commit group 4 (first-run still proves the generic local endpoint).

**Files:**

- Modify: `e2e/v1-local-loop.spec.ts` — `openSettingsAsFreshGuest` (~:139),
  add one test
- Test: the spec is the test

**Interfaces:**

- Consumes: the identity flow from Tasks 1–3, the catalog test from Task 9.
- Produces: no code exports.

**What already holds** (verified — do not rebuild it): the spec's five tests
already clear cookies, land on the identity gate, choose local-only, reach
`/settings` without signing in, and drive inspect → ready/missing → one model
list → recover, asserting no request touches `/api/keys/*`, `/api/proxy/*`,
OAuth, or marketplace routes.

**What is missing:** nothing proves the _catalog survived_ the first run, and
nothing proves the other 14 entries are still on screen. A first run that passes
because someone deleted 14 providers would go green today.

---

- [ ] **Step 1: Write the failing test**

Append to `e2e/v1-local-loop.spec.ts`, inside the
`"V1 local OpenAI-compatible endpoint loop"` describe:

```ts
test("first run shows the whole provider catalog, not just the local endpoint", async ({
  page,
}) => {
  await openSettingsAsFreshGuest(page, new Map());

  // The V1 acceptance path is the generic local endpoint — but proving it must
  // not come at the cost of the catalog. Named presets are not the proof set.
  const cards = page.getByTestId("provider-card");
  await expect(cards).toHaveCount(15);

  for (const name of ["OpenAI", "Anthropic", "Ollama", "LM Studio"]) {
    await expect(
      page.getByTestId("provider-card").filter({ hasText: name }),
      `${name} must remain in the catalog on first run`,
    ).toHaveCount(1);
  }

  // And the generic endpoint is reachable without any of them being configured.
  await expect(v1Section(page)).toContainText("Generic local OpenAI-compatible endpoint");
  await expect(checkModelsButton(page)).toBeVisible();
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx playwright test e2e/v1-local-loop.spec.ts -g "whole provider catalog"
```

Expected: FAIL — `expect(locator).toHaveCount(expected) … Received: 0`, because
`ProviderCard` does not carry a `data-testid`. Record the actual message.

- [ ] **Step 3: Add the test hook to the card**

In `src/components/cockpit/settings/ProviderCard.tsx`, add `data-testid` to the
card's outermost element:

```tsx
    <div data-testid="provider-card" data-provider-id={provider.id} className={/* unchanged */}>
```

Do not restructure the component.

- [ ] **Step 4: Run and verify**

```bash
npx playwright test e2e/v1-local-loop.spec.ts
```

Expected: all six tests pass on the dev runtime. If the count assertion reports a
number other than 15, `PROVIDERS` was modified — restore it; the catalog is the
contract.

- [ ] **Step 5: Full verification**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
```

- [ ] **Step 6: Commit**

```bash
git add e2e/v1-local-loop.spec.ts src/components/cockpit/settings/ProviderCard.tsx
git commit -m "test(e2e): assert the full catalog survives the V1 first-run proof

The local-endpoint loop would have gone green with 14 providers deleted.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: The 17-step account E2E, with surface checks

Commit group 4. **This is the gate. The branch is not done until it passes.**

**Files:**

- Modify: `e2e/account-separation.spec.ts`
- Modify: `.github/workflows/ci.yml` — confirm the asserting suite is gating
- Test: the spec is the test

**Interfaces:**

- Consumes: Tasks 1–10.
- Produces: no code exports. New helpers inside the spec:
  ```ts
  async function registerFromLocal(
    page: Page,
    user: TestUser,
    choice: MigrationChoice,
  ): Promise<void>;
  async function seedLocalSurfaces(page: Page, tag: string): Promise<void>;
  async function expectSurfacesAbsent(page: Page, tag: string): Promise<void>;
  async function expectSurfacesPresent(page: Page, tag: string): Promise<void>;
  ```

**What already holds:** the existing single test covers 15 numbered steps —
identity gate → local-only → local chat → register User A → Keep Separate →
isolation → logout → local returns → User B → reload without flash → logout →
sign back in as A. Reuse its helpers (`dismissOnboarding`, `createChat`,
`openMenu`, `logoutViaUi`, `expectSignedInAs`, `signInFromAuth`).

**What is missing:** only Keep Separate is exercised (Copy and Move never run),
and every assertion is about thread titles — no provider card, tool approval,
price number, or RAG hit is checked after a switch.

---

- [ ] **Step 1: Add the surface helpers**

Add to `e2e/account-separation.spec.ts`, above the `test.describe`:

```ts
/**
 * Seed one of every V1 surface into the current bucket: a chat, a RAG document,
 * a cost override that produces a visible price, and a validated local endpoint.
 * A mode switch that keeps threads but drops RAG, prices, or provider state is a
 * failed isolation change, so all four are seeded and all four are asserted.
 */
async function seedLocalSurfaces(page: Page, tag: string): Promise<void> {
  await createChat(page, `chat ${tag}`);

  await page.evaluate((t) => {
    const scope = localStorage.getItem("cockpit.local-profile.id") ?? "";
    if (!scope) throw new Error("no local profile id — identity was not resolved");

    // RAG: one document in this bucket's vector store.
    localStorage.setItem(
      `cockpit.vector-store.v1:${scope}`,
      JSON.stringify([{ id: `doc-${t}`, text: `memory ${t}`, embedding: [1, 0, 0] }]),
    );

    // Pricing: an override AND the token counts it multiplies.
    //
    // The override alone renders $0.00 — UsageSection computes
    // estimateCost(providerId, inputTokens, outputTokens), so with zero tokens
    // the rate is irrelevant and any assertion against the total is vacuous.
    // 1000 input + 1000 output at 42.5 USD per 1k each = 85.00 exactly.
    localStorage.setItem(
      `cockpit.provider-stats.v1:${scope}`,
      JSON.stringify({
        openai: { calls: 2, errors: 0, inputTokens: 1000, outputTokens: 1000 },
      }),
    );
    const settingsKey = `cockpit.settings.v2:${scope}`;
    const settings = JSON.parse(localStorage.getItem(settingsKey) ?? "{}");
    settings.costOverrides = { openai: { input: 42.5, output: 42.5 } };
    localStorage.setItem(settingsKey, JSON.stringify(settings));

    // Provider state: a validated custom endpoint.
    localStorage.setItem(
      `cockpit.provider-validation.v1:${scope}`,
      JSON.stringify({ custom: { status: "valid", lastValidated: 1 } }),
    );
  }, tag);

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("account-loading-skeleton")).toHaveCount(0, { timeout: 15_000 });
}

/** The figure seedLocalSurfaces produces: (1000/1000 tokens) x (42.5/42.5 per 1k). */
const SEEDED_COST_TEXT = "$85.00";

/** Assert none of the tagged surfaces are visible under the current account. */
async function expectSurfacesAbsent(page: Page, tag: string): Promise<void> {
  await openMenu(page);
  await expect(page.getByText(`chat ${tag}`)).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await dismissOnboarding(page);

  // Catalog is always fully present, regardless of account.
  await expect(page.getByTestId("provider-card")).toHaveCount(15);

  // Price: the seeded figure must not appear, AND the total must be the
  // zero-state. Asserting only the first would pass on a blank page.
  const total = page.getByTestId("usage-total-cost");
  await expect(total).toBeVisible();
  await expect(total).not.toContainText(SEEDED_COST_TEXT);
  await expect(total).toHaveText("$0.00");

  // Neither may a validated endpoint cross over.
  await expect(page.getByTestId("v1-local-capability-label")).not.toHaveText("Verified ready");

  // RAG: this account's vector bucket must be empty.
  const docs = await page.evaluate(() => {
    const s = localStorage.getItem("cockpit.local-profile.id") ?? "";
    const u = localStorage.getItem("cockpit.account.mode") === "server" ? null : s;
    if (!u) return -1; // server mode: checked by the caller via the account id
    return JSON.parse(localStorage.getItem(`cockpit.vector-store.v1:${u}`) ?? "[]").length;
  });
  expect(docs === -1 || docs === 0, "no RAG documents may cross accounts").toBe(true);
}

/** Assert every tagged surface is back under the current account. */
async function expectSurfacesPresent(page: Page, tag: string): Promise<void> {
  await openMenu(page);
  await expect(page.getByText(`chat ${tag}`)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");

  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await dismissOnboarding(page);
  await expect(page.getByTestId("provider-card")).toHaveCount(15);

  // The exact seeded figure, not merely "a total is rendered".
  await expect(page.getByTestId("usage-total-cost")).toHaveText(SEEDED_COST_TEXT);

  const docs = await page.evaluate(() => {
    const scope = localStorage.getItem("cockpit.local-profile.id") ?? "";
    return JSON.parse(localStorage.getItem(`cockpit.vector-store.v1:${scope}`) ?? "[]").length;
  });
  expect(docs, "local RAG documents must return with the bucket").toBeGreaterThan(0);
}
```

**Two test hooks are needed.** `data-testid="v1-local-capability-label"` already
exists in `settings.tsx`. `usage-total-cost` does not — add it to the total-cost
`<span>` at
[UsageSection.tsx:46](src/components/cockpit/settings/UsageSection.tsx:46):

```tsx
<span data-testid="usage-total-cost" className="text-white/80">
  {formatCost(totalCost)}
</span>
```

**Confirm the arithmetic before relying on it.** `formatCost` and
`estimateCost` live in [tokens.ts](src/lib/tokens.ts); `getCostRates` applies
`costOverrides` over `_COST_DEFAULTS`. Run this one-off to get the real string,
and set `SEEDED_COST_TEXT` to whatever it prints rather than to `"$85.00"` on
faith:

```bash
npx vitest run --testNamePattern="__cost_probe" src/lib/tokens.test.ts
```

Add the probe to `src/lib/tokens.test.ts` first:

```ts
it("__cost_probe", () => {
  setCostOverrides({ openai: { input: 42.5, output: 42.5 } });
  // eslint-disable-next-line no-console
  console.log("SEEDED_COST_TEXT =", formatCost(estimateCost("openai", 1000, 1000)));
  expect(estimateCost("openai", 1000, 1000)).toBeGreaterThan(0);
});
```

Delete the probe once you have the string — it must not ship.

- [ ] **Step 2: Add the migration-choice helper**

```ts
type MigrationChoice = "copy" | "move" | "keep-separate";

/** Register a server account from local-only mode with an explicit data choice. */
async function registerFromLocal(
  page: Page,
  user: TestUser,
  choice: MigrationChoice,
): Promise<void> {
  await registerFromAuth(page, user);
  await expect(page.getByTestId("data-migration-dialog")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId(`migration-choice-${choice}`).click();
  await expect(page.getByTestId("data-migration-dialog")).toHaveCount(0, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}
```

- [ ] **Step 3: Extend the flow to 17 steps with surface checks**

Insert after the existing step 4 (local data creation) and renumber:

```ts
// 4b. Seed the full V1 surface into the local bucket, not just a chat.
await seedLocalSurfaces(page, "local");
await expectSurfacesPresent(page, "local");
```

Insert a new step 16 exercising **Copy**:

```ts
// 16. Copy: a third account receives the local data AND the local profile
//     keeps it. Both sides must hold afterwards.
await logoutViaUi(page);
await registerFromLocal(page, USER_C, "copy");
await expectSignedInAs(page, USER_C.email);
await expectSurfacesPresent(page, "local"); // copied into User C
await logoutViaUi(page);
await expectSurfacesPresent(page, "local"); // and still on the local profile
```

Insert a new step 17 exercising **Move**:

```ts
// 17. Move: a fourth account takes the local data and the local profile is
//     left empty. "Move" that leaves a copy behind is not a move.
await registerFromLocal(page, USER_D, "move");
await expectSignedInAs(page, USER_D.email);
await expectSurfacesPresent(page, "local"); // moved into User D
await logoutViaUi(page);
await expect(page.getByText("chat local")).toHaveCount(0);
```

Add `USER_C` and `USER_D` beside the existing `USER_A`/`USER_B` fixtures, using
the same unique-email pattern (`now`-suffixed).

Add the surface checks to the existing isolation steps: replace the bare
`await expect(page.getByText(\`Local chat ${now}\`)).toHaveCount(0);`assertions
at steps 7, 10 and 12 with`await expectSurfacesAbsent(page, "local");`.

- [ ] **Step 4: Run and confirm it fails**

```bash
npx playwright test e2e/account-separation.spec.ts
```

Expected: FAIL. Record which step fails and why — that failure is the branch's
remaining work. Likely first failure is the missing `usage-total-cost` testid,
then the Copy/Move branches.

- [ ] **Step 5: Fix what it finds**

Work each failure back to its cause. For each one, say in your report whether it
was (a) a missing test hook, (b) a stale test expectation, or (c) a real
isolation bug that Tasks 1–7 did not cover. Fix real bugs in the source; never
weaken an assertion to get green.

- [ ] **Step 6: Audit every negative assertion in this spec and Task 10's**

A `toHaveCount(0)` or `not.toContainText(...)` passes against a page that failed
to render at all — the same failure mode as the `$0.00` price assertion Fix B
removed. Both specs are full of them, because isolation testing is inherently
about absence.

**The rule:** every negative assertion must sit next to a positive one proving
the surface actually rendered. Go through both specs and apply it:

- `e2e/account-separation.spec.ts` — every
  `await expect(page.getByText(...)).toHaveCount(0)` must be preceded, in the
  same block, by an assertion that the thread list rendered at all. Add:

  ```ts
  // Prove the list rendered before asserting what is not in it.
  await expect(page.getByTestId("thread-list")).toBeVisible({ timeout: 10_000 });
  ```

  If no such testid exists, add `data-testid="thread-list"` to the container in
  `src/components/cockpit/Drawer.tsx` and note it in your report.

- `expectNoForbiddenRequests` in `e2e/v1-local-loop.spec.ts` asserts an empty
  array of forbidden requests. A page that made **no** requests at all also
  passes. Add a positive counterpart in the same helper:

  ```ts
  expect(
    modelListRequests.length + forbiddenRequests.length,
    "the page must have made at least one request — an inert page passes any forbidden-request check",
  ).toBeGreaterThan(0);
  ```

  Confirm against the actual call sites which of the two arrays is populated in
  each scenario before wiring this in; if a scenario legitimately makes no
  requests, assert a rendered element instead and say which scenario in your
  report.

- `await expect(page).not.toHaveURL(/\/auth/)` in `v1-local-loop.spec.ts` passes
  on a crashed page. It is already paired with visible-element assertions in
  every test — verify that is true in all five and add one where it is not.

**Pass condition:** you have walked every negative assertion in both specs and
each is paired. List in your report the count you audited and the ones you
changed. "No changes needed" is an acceptable outcome only with the count.

- [ ] **Step 7: Run the whole gate**

```bash
npx playwright test e2e/account-separation.spec.ts e2e/v1-local-loop.spec.ts e2e/smoke.spec.ts
```

All three must pass. Report pass/fail per test.

- [ ] **Step 8: Full verification and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
```

```bash
git add e2e/account-separation.spec.ts e2e/v1-local-loop.spec.ts src/components/cockpit/settings/UsageSection.tsx src/components/cockpit/Drawer.tsx
git commit -m "test(e2e): 17-step account flow with provider, tool, price and RAG checks

Adds the Copy and Move branches, which never ran, and replaces thread-title-
only isolation assertions with checks on the provider catalog, price
estimate, endpoint validation state and local RAG store.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: Lock the design tokens

Commit group 5 (tokens / route splits last).

**Files:**

- Create: `src/styles/tokens.css`
- Create: `src/styles/tokens.test.ts`
- Modify: `src/styles.css` — import the layer, map into `@theme inline`
- Modify: `vitest.config.ts` — raise coverage thresholds

**Interfaces:**

- Consumes: nothing.
- Produces: CSS custom properties only. No TS exports.

**Scope discipline:** this task declares tokens and wires them into Tailwind's
`@theme inline`. It does **not** restyle `settings.tsx` or `index.tsx`. Fat
routes are a later split; `docs/product-direction.md` §8 puts "lock design
tokens" first and "only then" everything else, and §7 lists "redesigning every
component before token foundations are stable" as a non-goal.

---

- [ ] **Step 1: Write the failing test**

Create `src/styles/tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "./tokens.css"), "utf8");

/**
 * The token families from docs/product-direction.md §5. This test is the visual
 * contract: docs/product-direction.md says token names describe product
 * semantics first and raw color second, so each family is asserted by its
 * semantic prefix rather than by any specific color value.
 */
const REQUIRED_FAMILIES: Array<[string, string[]]> = [
  ["base canvas", ["--canvas-void", "--canvas-gradient-from", "--canvas-gradient-to"]],
  [
    "translucent surface",
    [
      "--surface-shell-background",
      "--surface-prompt-background",
      "--surface-sidebar-background",
      "--surface-modal-background",
      "--surface-overlay-scrim",
    ],
  ],
  [
    "elevated panel",
    ["--panel-card-background", "--panel-menu-background", "--panel-input-background"],
  ],
  ["border and hairline", ["--hairline-subtle", "--hairline-edge-highlight", "--hairline-card"]],
  ["glow and accent", ["--glow-ambient", "--glow-accent", "--glow-hover"]],
  [
    "provider status",
    [
      "--provider-active-fill",
      "--provider-inactive-fill",
      "--provider-unavailable-fill",
      "--provider-missing-credentials-border",
      "--provider-local-ready-fill",
      "--provider-cloud-ready-fill",
    ],
  ],
  [
    "severity",
    [
      "--warning-text",
      "--warning-border",
      "--warning-fill",
      "--error-text",
      "--error-border",
      "--error-fill",
      "--success-text",
      "--success-border",
      "--success-fill",
    ],
  ],
  ["focus", ["--focus-ring", "--focus-screenshot-ring", "--focus-hover-ring"]],
  [
    "voice state",
    [
      "--voice-idle-fill",
      "--voice-listening-fill",
      "--voice-recording-fill",
      "--voice-transcribing-fill",
      "--voice-sending-fill",
      "--voice-muted-fill",
      "--voice-unavailable-fill",
    ],
  ],
  [
    "media state",
    [
      "--media-empty-fill",
      "--media-attached-fill",
      "--media-uploading-fill",
      "--media-processing-fill",
      "--media-generated-fill",
      "--media-failed-fill",
      "--media-selected-fill",
    ],
  ],
  [
    "motion and easing",
    [
      "--motion-sidebar-slide",
      "--motion-backdrop-fade",
      "--motion-hover",
      "--motion-status",
      "--motion-voice-cycle",
    ],
  ],
  [
    "blur and saturation",
    ["--blur-backdrop", "--blur-surface", "--blur-elevated", "--saturate-ambient"],
  ],
];

describe("design tokens", () => {
  for (const [family, tokens] of REQUIRED_FAMILIES) {
    it(`declares the ${family} family`, () => {
      const missing = tokens.filter((t) => !css.includes(`${t}:`));
      expect(missing, `missing ${family} tokens`).toEqual([]);
    });
  }

  it("keeps the reduce-motion escape hatch", () => {
    expect(css).toContain("prefers-reduced-motion");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/styles/tokens.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, open '.../src/styles/tokens.css'`.

- [ ] **Step 3: Write the token layer**

Create `src/styles/tokens.css` declaring every token above on `:root`, with the
palette taken from `docs/product-direction.md` §4 and the catalogue frames in
`edgecase-cockpit-video-catalog/frames/` (the voice-state frames
`0015_29s_voice-btn-pink.png`, `0016_31s_voice-btn-red.png`,
`0017_33s_voice-btn-yellow.png` and the focus frame
`0018_35s_image-icon-focus-ring.png` are the colour references for those
families). Use `oklch()` to match the existing `styles.css` convention. Structure:

```css
/**
 * Design tokens — the visual contract from docs/product-direction.md §5.
 *
 * Names are product-semantic first, colour second: `--provider-warning-border`,
 * not `--amber-400`. Components consume these; they do not hardcode colour.
 *
 * This file DECLARES the system. Applying it to the shell, sidebar, cards, and
 * prompt surface is the next pass (product-direction §8, step 2) — deliberately
 * not done here, so a token change is reviewable on its own.
 */

:root {
  /* ── Base canvas ─────────────────────────────────────────────────────── */
  /* --canvas-void matches the existing --background in styles.css so the
     shell's ground colour does not shift when components adopt the token. */
  --canvas-void: oklch(0.04 0.01 260);
  --canvas-gradient-from: oklch(0.09 0.035 268);
  --canvas-gradient-to: oklch(0.04 0.01 260);

  /* ── Translucent surfaces ────────────────────────────────────────────── */
  /* Opacity climbs with elevation: shell < prompt < sidebar < modal. */
  --surface-shell-background: oklch(0.14 0.02 265 / 0.45);
  --surface-prompt-background: oklch(0.16 0.025 265 / 0.6);
  --surface-sidebar-background: oklch(0.12 0.02 265 / 0.75);
  --surface-modal-background: oklch(0.13 0.02 265 / 0.9);
  --surface-overlay-scrim: oklch(0.02 0 0 / 0.72);

  /* ── Elevated panels ─────────────────────────────────────────────────── */
  --panel-card-background: oklch(1 0 0 / 0.03);
  --panel-menu-background: oklch(0.16 0.02 265 / 0.92);
  --panel-input-background: oklch(1 0 0 / 0.05);

  /* ── Borders and hairlines ───────────────────────────────────────────── */
  --hairline-subtle: oklch(1 0 0 / 0.08);
  --hairline-edge-highlight: oklch(1 0 0 / 0.16);
  --hairline-card: oklch(1 0 0 / 0.1);

  /* ── Glow and accent ─────────────────────────────────────────────────── */
  --glow-ambient: oklch(0.6 0.18 285 / 0.25);
  --glow-accent: oklch(0.78 0.16 300 / 0.55);
  --glow-hover: oklch(1 0 0 / 0.12);

  /* ── Provider status ─────────────────────────────────────────────────── */
  /* Local-ready and cloud-ready are deliberately distinguishable: the user
     needs to know which side of the routing boundary a ready provider is on. */
  --provider-active-fill: oklch(0.72 0.17 155);
  --provider-inactive-fill: oklch(0.55 0.01 265);
  --provider-unavailable-fill: oklch(0.45 0.02 265);
  --provider-missing-credentials-border: oklch(0.75 0.15 75);
  --provider-local-ready-fill: oklch(0.75 0.15 190);
  --provider-cloud-ready-fill: oklch(0.7 0.15 250);

  /* ── Severity: warning, error, success ───────────────────────────────── */
  --warning-text: oklch(0.85 0.12 80);
  --warning-border: oklch(0.75 0.15 75 / 0.35);
  --warning-fill: oklch(0.75 0.15 75 / 0.12);
  --error-text: oklch(0.8 0.14 25);
  --error-border: oklch(0.65 0.2 27 / 0.35);
  --error-fill: oklch(0.65 0.2 27 / 0.12);
  --success-text: oklch(0.85 0.13 155);
  --success-border: oklch(0.72 0.17 155 / 0.35);
  --success-fill: oklch(0.72 0.17 155 / 0.12);

  /* ── Focus ───────────────────────────────────────────────────────────── */
  /* Catalogue frame 0018_35s_image-icon-focus-ring.png is the orange focus
     reference; 0019_36s_screenshot-selection-mode.png is the dashed variant. */
  --focus-ring: oklch(0.78 0.16 60);
  --focus-screenshot-ring: oklch(0.78 0.16 60 / 0.7);
  --focus-hover-ring: oklch(1 0 0 / 0.3);

  /* ── Voice states ────────────────────────────────────────────────────── */
  /* Cycle order from the catalogue: cyan → green → yellow → pink → red
     (frames 0015–0017). */
  --voice-idle-fill: oklch(0.55 0.02 265);
  --voice-listening-fill: oklch(0.8 0.14 195);
  --voice-recording-fill: oklch(0.65 0.22 25);
  --voice-transcribing-fill: oklch(0.82 0.15 95);
  --voice-sending-fill: oklch(0.75 0.19 340);
  --voice-muted-fill: oklch(0.4 0.01 265);
  --voice-unavailable-fill: oklch(0.35 0.01 265);

  /* ── Media states ────────────────────────────────────────────────────── */
  --media-empty-fill: oklch(1 0 0 / 0.04);
  --media-attached-fill: oklch(0.7 0.13 250 / 0.18);
  --media-uploading-fill: oklch(0.8 0.14 195 / 0.2);
  --media-processing-fill: oklch(0.82 0.15 95 / 0.2);
  --media-generated-fill: oklch(0.72 0.17 155 / 0.2);
  --media-failed-fill: oklch(0.65 0.2 27 / 0.2);
  --media-selected-fill: oklch(0.78 0.16 60 / 0.22);

  /* ── Motion and easing ───────────────────────────────────────────────── */
  /* Durations only. Product-direction section 6: motion communicates state,
     it does not decorate. */
  --motion-sidebar-slide: 220ms;
  --motion-backdrop-fade: 160ms;
  --motion-hover: 120ms;
  --motion-status: 260ms;
  --motion-voice-cycle: 900ms;

  /* ── Blur and saturation ─────────────────────────────────────────────── */
  --blur-backdrop: 24px;
  --blur-surface: 12px;
  --blur-elevated: 32px;
  --saturate-ambient: 1.4;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-sidebar-slide: 0ms;
    --motion-backdrop-fade: 0ms;
    --motion-hover: 0ms;
    --motion-status: 0ms;
    --motion-voice-cycle: 0ms;
  }
}
```

Every value above is a starting point drawn from the existing `styles.css`
palette and the catalogue frames, not a mandate. Adjust a colour if the frame
disagrees — but do not rename a token or drop a family, because the test asserts
both.

- [ ] **Step 4: Wire it into the stylesheet**

At the top of `src/styles.css`, after the existing Tailwind import, add:

```css
@import "./styles/tokens.css";
```

Then extend the `@theme inline` block so the semantic tokens are reachable as
utility classes, following the existing `--color-<name>: var(--<name>)` pattern
documented in that file's header comment:

```css
--color-provider-active: var(--provider-active-fill);
--color-provider-unavailable: var(--provider-unavailable-fill);
--color-provider-local-ready: var(--provider-local-ready-fill);
--color-provider-cloud-ready: var(--provider-cloud-ready-fill);
--color-warning: var(--warning-fill);
--color-success: var(--success-fill);
```

Do not remove or repoint any existing shadcn token — those are load-bearing for
every current component.

- [ ] **Step 5: Verify the token test and the build**

Run: `npx vitest run src/styles/tokens.test.ts` — expect PASS.
Run: `npx vite build` — expect success. A Tailwind v4 `@theme` error here means a
token name collides with an existing one; rename the new token, not the old.

- [ ] **Step 6: Confirm nothing looks different yet**

```bash
npx playwright test e2e/smoke.spec.ts
```

This task adds tokens without consuming them, so the smoke suite must pass
unchanged. If a screenshot or visual assertion moves, the `@theme inline` edit
repointed an existing token — revert that part.

- [ ] **Step 7: Raise the coverage floor**

```bash
npx vitest run --coverage
```

Read the summary. Raise the four thresholds in `vitest.config.ts` to just below
the newly achieved numbers, rounded **down** to whole percent:

```ts
      thresholds: {
        statements: <achieved-1>,
        branches: <achieved-1>,
        functions: <achieved-1>,
        lines: <achieved-1>,
      },
```

Never lower a threshold. If a number came out below the current floor (43/41/35/44),
that is a regression this plan introduced — find it and fix it rather than
adjusting the gate.

- [ ] **Step 8: Full verification and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint . && npx vite build
```

```bash
git add src/styles/tokens.css src/styles/tokens.test.ts src/styles.css vitest.config.ts
git commit -m "feat(design): declare the product-direction token system

Twelve token families from docs/product-direction.md section 5, asserted by
test. Declaration only — applying them to the shell, sidebar, cards and
prompt surface is the next pass, and settings.tsx / index.tsx are untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 13: Close the SSRF hole in the proxy

Run in commit group 4 (audits). **This task fixes two confirmed live defects, it
is not a reading exercise.**

**Files:**

- Modify: `src/lib/proxy-guard.server.ts` — `urlAllowedAnyProvider` (~:103),
  `matchHost` (~:37)
- Modify: `src/lib/validate-key.server.ts` — `validateProviderKey` (~:14)
- Test: `src/lib/proxy-guard.server.test.ts` (extend),
  create `src/lib/validate-key.server.test.ts` if absent

**Interfaces:**

- Consumes: nothing.
- Produces:
  ```ts
  // src/lib/proxy-guard.server.ts
  export function isBlockedNetworkTarget(url: string): boolean;
  export function urlAllowedAnyProvider(url: string): string | null; // signature unchanged
  export function urlAllowedForProvider(providerId: string, url: string): boolean; // unchanged
  ```

### What was verified, and what it means

The product's core promise is "point it at your local endpoint", and
`V1_LOCAL_OPENAI_COMPAT_PROVIDER_ID` is `custom` — the feature and the risk are
the same feature. Two questions with different answers, both now settled:

**The local model-list probe is client-side and out of scope.**
`probeLocalOpenAICompatibleModels` in
[providers.ts:895](src/lib/providers.ts:895) takes `fetchImpl = directFetch` and
is called from `settings.tsx` in the browser. It fetches from the user's own
machine to the user's own machine. Nothing to fix; do not add a guard there, and
do not let the audit conclude otherwise.

**Six server-side fetches take a user-controlled host.** Inventory:

| Route / function                                                                         | Host check              | Verdict                                   |
| ---------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------- |
| `POST /api/proxy/detect` ([detect.ts:37](src/routes/api/proxy/detect.ts:37))             | `urlAllowedAnyProvider` | **BROKEN — any host reaches the fetch**   |
| `GET /api/proxy/models` ([models.ts:17](src/routes/api/proxy/models.ts:17))              | `urlAllowedForProvider` | wildcard gated in prod; no IP blocking    |
| `POST /api/proxy/chat` ([chat.ts:72](src/routes/api/proxy/chat.ts:72))                   | `urlAllowedForProvider` | same                                      |
| `POST /api/proxy/embeddings` ([embeddings.ts:61](src/routes/api/proxy/embeddings.ts:61)) | `urlAllowedForProvider` | same                                      |
| `POST /api/proxy/transcribe` ([transcribe.ts:57](src/routes/api/proxy/transcribe.ts:57)) | `urlAllowedForProvider` | same                                      |
| `validateProviderKey` ([validate-key.server.ts:30](src/lib/validate-key.server.ts:30))   | **none at all**         | **BROKEN — no allowlist call whatsoever** |

**Defect 1 — `urlAllowedAnyProvider` has no wildcard gate.** The `custom`
provider declares `allowedHosts: ["*"]`
([providers.ts:335](src/lib/providers.ts:335)) and `matchHost` returns `true`
unconditionally for `"*"`. `urlAllowedForProvider` calls `isWildcardHostAllowed()`
before honouring a wildcard — but `urlAllowedAnyProvider` **does not**. It loops
every provider and returns the first match, so `custom`'s `"*"` matches every
host, in production, with no `PROXY_ALLOW_CUSTOM_WILDCARD` opt-in. `/api/proxy/detect`
will therefore server-side fetch any URL a session asks for, returning
reachability and status. That is a blind SSRF port-scanner.

**Defect 2 — `validateProviderKey` calls no allowlist function at all.** It
builds a URL from `creds.baseUrl` and fetches it. Reached from
`/api/keys/validate` and `/api/keys/validate/$providerId`.

**Defect 3 — nothing anywhere blocks private-range or loopback IP literals.**
Not a bug on its own (local providers legitimately allowlist `localhost` and
`127.0.0.1`), but it means a wildcard or a `*.local` match reaches link-local and
RFC1918 space unfiltered.

---

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/proxy-guard.server.test.ts`:

```ts
describe("urlAllowedAnyProvider does not honour the custom wildcard in production", () => {
  const priorEnv = process.env.NODE_ENV;
  const priorOptIn = process.env.PROXY_ALLOW_CUSTOM_WILDCARD;
  afterEach(() => {
    process.env.NODE_ENV = priorEnv;
    process.env.PROXY_ALLOW_CUSTOM_WILDCARD = priorOptIn;
  });

  it("rejects an arbitrary host in production without the opt-in", () => {
    process.env.NODE_ENV = "production";
    delete process.env.PROXY_ALLOW_CUSTOM_WILDCARD;
    expect(urlAllowedAnyProvider("https://attacker.example.com/x")).toBeNull();
  });

  it("rejects the cloud metadata address even with the wildcard opt-in", () => {
    process.env.NODE_ENV = "production";
    process.env.PROXY_ALLOW_CUSTOM_WILDCARD = "true";
    expect(urlAllowedAnyProvider("http://169.254.169.254/latest/meta-data/")).toBeNull();
  });

  it("still resolves a genuinely allowlisted cloud host", () => {
    process.env.NODE_ENV = "production";
    expect(urlAllowedAnyProvider("https://api.openai.com/v1/models")).toBe("openai");
  });
});

describe("isBlockedNetworkTarget", () => {
  // One case per attack. Each name states what it blocks.
  it.each([
    ["cloud metadata service", "http://169.254.169.254/latest/meta-data/"],
    ["link-local range", "http://169.254.1.1/"],
    ["RFC1918 10/8", "http://10.0.0.1/"],
    ["RFC1918 192.168/16", "http://192.168.1.1/"],
    ["RFC1918 172.16/12", "http://172.16.0.1/"],
    ["carrier-grade NAT 100.64/10", "http://100.64.0.1/"],
    ["decimal-encoded loopback", "http://2130706433/"],
    ["hex-encoded loopback", "http://0x7f000001/"],
    ["octal-encoded loopback", "http://0177.0.0.1/"],
    ["IPv6 loopback", "http://[::1]/"],
    ["IPv6 unspecified", "http://[::]/"],
    ["IPv6 unique-local fc00::/7", "http://[fc00::1]/"],
    ["IPv6 link-local fe80::/10", "http://[fe80::1]/"],
    ["IPv4-mapped IPv6 loopback", "http://[::ffff:127.0.0.1]/"],
    ["IPv4-mapped IPv6 metadata", "http://[::ffff:169.254.169.254]/"],
    ["0.0.0.0/8", "http://0.0.0.0/"],
  ])("blocks %s", (_label, url) => {
    expect(isBlockedNetworkTarget(url)).toBe(true);
  });

  it("does not block a normal public host", () => {
    expect(isBlockedNetworkTarget("https://api.openai.com/v1/models")).toBe(false);
  });

  it("does not block plain localhost, which local providers legitimately use", () => {
    // localhost/127.0.0.1 are allowlisted BY NAME for ollama/lmstudio/vllm/
    // llama-cpp. Blocking them here would break the product's core promise;
    // the wildcard gate is what stops `custom` from reaching them uninvited.
    expect(isBlockedNetworkTarget("http://localhost:11434/api/tags")).toBe(false);
  });
});
```

Create `src/lib/validate-key.server.test.ts` (or extend it if
`real-verification.md` Task 2 has already created it — in that case append,
do not overwrite):

```ts
it("refuses to fetch a baseUrl that is not allowlisted for the provider", async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const openai = PROVIDERS.find((p) => p.id === "openai")!;

  const result = await validateProviderKey(openai, "sk-test", "http://169.254.169.254");

  expect(result).toEqual({ valid: false, error: "host_not_allowed" });
  expect(fetchSpy, "an unallowlisted host must never reach fetch").not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and confirm every one fails**

```bash
npx vitest run src/lib/proxy-guard.server.test.ts src/lib/validate-key.server.test.ts
```

Expected: `isBlockedNetworkTarget` tests fail to compile (`not exported`); the
two `urlAllowedAnyProvider` production tests fail with a provider id where `null`
was expected; the validate-key test fails because `fetch` was called. Paste the
observed output.

- [ ] **Step 3: Write the network-target guard**

Add to `src/lib/proxy-guard.server.ts`. Do not invent a second guard spec — this
mirrors the one `real-verification.md` Task 6 specifies for
`assertSafeWebhookUrl`, so the two stay consistent:

```ts
/** Parse a hostname that may be a decimal, hex, or octal-encoded IPv4 literal. */
function normalizeIpv4Literal(host: string): string | null {
  // Dotted quad, possibly with octal or hex components.
  const parts = host.split(".");
  if (parts.length === 4) {
    const octets = parts.map((p) => {
      if (/^0[xX][0-9a-fA-F]+$/.test(p)) return parseInt(p, 16);
      if (/^0[0-7]+$/.test(p)) return parseInt(p, 8);
      if (/^\d+$/.test(p)) return parseInt(p, 10);
      return NaN;
    });
    if (octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255)) {
      return octets.join(".");
    }
    return null;
  }
  // Bare integer forms: 2130706433, 0x7f000001, 017700000001.
  let value: number | null = null;
  if (/^0[xX][0-9a-fA-F]+$/.test(host)) value = parseInt(host, 16);
  else if (/^0[0-7]+$/.test(host)) value = parseInt(host, 8);
  else if (/^\d+$/.test(host)) value = parseInt(host, 10);
  if (value === null || !Number.isInteger(value) || value < 0 || value > 0xffffffff) return null;
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

function isBlockedIpv4(dotted: string): boolean {
  const [a, b] = dotted.split(".").map(Number);
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0) return true; // 192.0.0/24 protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a >= 224) return true; // 224/4 multicast + 240/4 reserved
  return false;
}

/**
 * Is this URL pointed at an IP literal in a range that must never be reached
 * from the server?
 *
 * NAME-based hosts are deliberately NOT resolved here: local providers
 * allowlist "localhost" and "127.0.0.1" by name on purpose, and resolving
 * names would both break that and be unavailable on Workers. This blocks the
 * encodings an attacker uses to smuggle an internal address past a name-based
 * allowlist. DNS rebinding remains open — it cannot be closed without
 * resolve-then-connect, which Workers does not offer.
 */
export function isBlockedNetworkTarget(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return true; // unparseable is not safe
  }

  // IPv6 literals arrive bracket-stripped from URL.hostname.
  if (host.includes(":")) {
    const v6 = host.toLowerCase();
    if (v6 === "::" || v6 === "::1") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true; // fc00::/7
    if (/^fe[89ab][0-9a-f]:/.test(v6)) return true; // fe80::/10
    const mapped = /^::ffff:(.+)$/.exec(v6);
    if (mapped) {
      const inner = normalizeIpv4Literal(mapped[1]);
      return inner ? isBlockedIpv4(inner) : true;
    }
    return false;
  }

  const dotted = normalizeIpv4Literal(host);
  // Not an IP literal at all — a name. Leave it to the allowlist.
  if (!dotted) return false;
  return isBlockedIpv4(dotted);
}
```

- [ ] **Step 4: Apply the guard at all three decision points**

`urlAllowedAnyProvider` — add the wildcard gate it is missing and the IP guard:

```ts
export function urlAllowedAnyProvider(url: string): string | null {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  // An IP literal in a blocked range is never allowed, whatever matches it.
  if (isBlockedNetworkTarget(url)) return null;

  for (const p of PROVIDERS) {
    const patterns = p.allowedHosts ?? [];
    for (const pattern of patterns) {
      // A wildcard requires the same production opt-in urlAllowedForProvider
      // enforces. Without this, the `custom` provider's "*" made every host
      // reachable from /api/proxy/detect.
      if (pattern === "*" && !isWildcardHostAllowed()) continue;
      if (matchHost(pattern, host)) return p.id;
    }
  }
  return null;
}
```

`urlAllowedForProvider` — add the IP guard as its first check, immediately after
the provider lookup:

```ts
export function urlAllowedForProvider(providerId: string, url: string): boolean {
  const p = PROVIDERS.find((x) => x.id === providerId);
  if (!p) return false;
  if (isBlockedNetworkTarget(url)) return false;
  const allowed = p.allowedHosts ?? [];
  // ...rest of the existing body unchanged...
```

`validateProviderKey` — it has no allowlist call at all. Add one:

```ts
import { urlAllowedForProvider } from "./proxy-guard.server";

export async function validateProviderKey(
  provider: ProviderDef,
  apiKey: string,
  baseUrl?: string,
): Promise<ValidateResult> {
  if (provider.authStyle === "none") {
    return { valid: true };
  }

  const url = buildValidationUrl(provider, baseUrl);
  // This is a server-side fetch to a caller-supplied base URL. It gets the same
  // allowlist the /api/proxy/* routes use.
  if (!urlAllowedForProvider(provider.id, url)) {
    return { valid: false, error: "host_not_allowed" };
  }

  const headers = buildAuthHeaders(provider, apiKey);
  // ...rest unchanged...
```

- [ ] **Step 5: Run and verify**

```bash
npx vitest run src/lib/proxy-guard.server.test.ts src/lib/validate-key.server.test.ts
```

Expect PASS. Then the full suite:

```bash
npx vitest run
```

Existing proxy tests that assert a localhost host is allowed must still pass —
if one fails, `isBlockedNetworkTarget` is blocking a name it should not.
`localhost` is a name, not an IP literal, so it must return `false`.

- [ ] **Step 6: Verify the local product path still works end to end**

```bash
npx playwright test e2e/v1-local-loop.spec.ts
```

All six tests must pass. This is the check that the SSRF fix did not break "point
it at your local endpoint" — the whole point of the product.

- [ ] **Step 7: Write the inventory into your report**

Reproduce the six-row table from this task with a **verdict column filled in by
you after the fix**, and state plainly which vectors remain open. At minimum:

> DNS rebinding is not closed. A hostname that resolves to a public address at
> allowlist time and a private one at connect time will pass. Closing it requires
> resolve-then-connect, which the Workers runtime does not expose.

- [ ] **Step 8: Commit**

```bash
git add src/lib/proxy-guard.server.ts src/lib/proxy-guard.server.test.ts src/lib/validate-key.server.ts src/lib/validate-key.server.test.ts
git commit -m "fix(proxy): close SSRF via the custom-provider wildcard and key validation

urlAllowedAnyProvider looped every provider and returned the first match
without the production wildcard gate that urlAllowedForProvider applies. The
custom provider declares allowedHosts ['*'], so POST /api/proxy/detect would
server-side fetch any host a session named, in production, with no opt-in.

validateProviderKey fetched a caller-supplied baseUrl with no allowlist call
at all.

Adds isBlockedNetworkTarget covering loopback, RFC1918, link-local incl.
169.254.169.254, CGNAT, multicast, and the decimal/hex/octal/IPv4-mapped-IPv6
encodings used to smuggle them past a name-based allowlist.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 14: Electron hardening

Run in commit group 4 (audits).

**Files:**

- Modify: `electron/main.ts` — `webPreferences` (~:110), `createWindow` (~:100)
- Test: create `electron/main.hardening.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: no runtime exports. `createWindow`'s `webPreferences` object gains
  explicit `sandbox` and `webSecurity` fields; the module gains a
  `will-navigate` handler and a CSP response header.

### What was verified

| Control                 | State                                                                      | Action                |
| ----------------------- | -------------------------------------------------------------------------- | --------------------- |
| `contextIsolation`      | `true` ([main.ts:113](electron/main.ts:113))                               | keep                  |
| `nodeIntegration`       | `false` ([main.ts:115](electron/main.ts:115))                              | keep                  |
| `sandbox`               | **not set** — relies on the Electron ≥20 default                           | **set explicitly**    |
| `webSecurity`           | not modified, so `true`                                                    | **assert explicitly** |
| Content-Security-Policy | **absent** — no CSP header, no meta tag                                    | **add**               |
| `setWindowOpenHandler`  | present, denies and opens externally ([main.ts:208](electron/main.ts:208)) | keep                  |
| `will-navigate`         | **absent** — the renderer can navigate itself anywhere                     | **add**               |
| Preload surface         | `module.exports = {}` — nothing bridged at all                             | keep                  |

The preload is already at the ideal end state: it exposes no API, so there is no
`ipcRenderer` surface to bound. Do not add one.

One thing to leave alone deliberately: the `onHeadersReceived` interceptor at
[main.ts:138](electron/main.ts:138) injects
`Access-Control-Allow-Origin: *` for localhost provider ports. That is the
mechanism that makes on-device models work without a proxy — it is the product.
Its URL filter is already scoped to `LOCAL_PROVIDER_PORTS` plus the deployed
Worker origin, not to `<all_urls>`. Confirm the filter list is unchanged by your
edits and say so in your report.

---

- [ ] **Step 1: Write the failing test**

Create `electron/main.hardening.test.ts`. The Electron main process cannot be
imported under jsdom, so assert against the source text — crude, but it pins the
security posture against silent regression, which is the point:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const main = readFileSync(resolve(__dirname, "./main.ts"), "utf8");
const preload = readFileSync(resolve(__dirname, "./preload.cjs"), "utf8");

describe("electron hardening", () => {
  it("isolates the renderer from Node", () => {
    expect(main).toMatch(/contextIsolation:\s*true/);
    expect(main).toMatch(/nodeIntegration:\s*false/);
  });

  it("sets sandbox and webSecurity explicitly rather than relying on defaults", () => {
    expect(main).toMatch(/sandbox:\s*true/);
    expect(main).toMatch(/webSecurity:\s*true/);
  });

  it("sets a Content-Security-Policy on renderer responses", () => {
    expect(main).toMatch(/Content-Security-Policy/);
    expect(main).toMatch(/default-src\s+'self'/);
  });

  it("denies renderer-initiated navigation away from the app origin", () => {
    expect(main).toMatch(/will-navigate/);
  });

  it("opens external links in the system browser, never in-app", () => {
    expect(main).toMatch(/setWindowOpenHandler/);
    expect(main).toMatch(/action:\s*"deny"/);
  });

  it("exposes no bridged API surface from the preload", () => {
    expect(preload).not.toMatch(/exposeInMainWorld/);
    expect(preload).not.toMatch(/ipcRenderer/);
  });

  it("scopes the CORS header interceptor to known local provider ports", () => {
    expect(main).toMatch(/LOCAL_PROVIDER_PORTS/);
    expect(main, "the interceptor must never match <all_urls>").not.toMatch(/<all_urls>/);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run electron/main.hardening.test.ts
```

Expected: the `sandbox`/`webSecurity`, CSP, and `will-navigate` tests FAIL. The
isolation, window-open, preload, and CORS-scope tests PASS — they document what
is already correct. Paste the output.

If `vitest` does not pick the file up, `vitest.config.ts` has
`include: ["src/**/*.test.{ts,tsx}"]`. Widen it to
`["src/**/*.test.{ts,tsx}", "electron/**/*.test.ts"]` and note the change.

- [ ] **Step 3: Make the two implicit defaults explicit**

In `electron/main.ts`, extend `webPreferences`:

```ts
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.cjs"),
      // Context isolation keeps Node.js APIs out of renderer code.
      contextIsolation: true,
      // nodeIntegration must stay false — renderer talks to the CF Worker, not Node.
      nodeIntegration: false,
      // Both of the following are the Electron default. Stated explicitly so a
      // future edit that flips one is visible in review rather than implied by
      // an omission.
      sandbox: true,
      webSecurity: true,
      // Partition keeps session cookies persistent between launches.
      partition: "persist:cockpit",
    },
```

- [ ] **Step 4: Add the CSP**

The renderer loads from the privileged `app://` scheme in production and the Vite
dev server in development. Add a CSP to the same session the window uses, right
after the `onHeadersReceived` CORS block:

```ts
// Content-Security-Policy for renderer documents. The renderer only ever
// talks to the deployed Worker and to local provider ports, so connect-src is
// the one directive that must stay permissive about http://localhost.
win.webContents.session.webRequest.onHeadersReceived(
  { urls: ["app://*/*", "file://*/*"] },
  (details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    responseHeaders["Content-Security-Policy"] = [
      [
        "default-src 'self' app:",
        "script-src 'self' app:",
        // Tailwind and the app inject styles at runtime.
        "style-src 'self' app: 'unsafe-inline'",
        "img-src 'self' app: data: blob:",
        "font-src 'self' app: data:",
        `connect-src 'self' app: ${NATIVE_API_URL} http://localhost:* http://127.0.0.1:*`,
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ].join("; "),
    ];
    callback({ responseHeaders, cancel: false });
  },
);
```

Apply it only in production — in dev the Vite server needs `'unsafe-eval'` for
HMR, and weakening the production policy to match dev would defeat the purpose:

```ts
if (!DEV) {
  // ...the onHeadersReceived CSP block above...
}
```

- [ ] **Step 5: Add the navigation guard**

Beside the existing `setWindowOpenHandler`:

```ts
// Renderer-initiated navigation (window.location =, a link with no target)
// must not be able to leave the app origin. setWindowOpenHandler only covers
// new windows; this covers the current one.
win.webContents.on("will-navigate", (event, url) => {
  const allowedPrefix = DEV ? DEV_URL : "app://";
  if (!url.startsWith(allowedPrefix)) {
    event.preventDefault();
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
  }
});
```

- [ ] **Step 6: Run and verify**

```bash
npx vitest run electron/main.hardening.test.ts
```

Expect PASS on all seven.

- [ ] **Step 7: Verify the packaged app still launches**

```bash
npx tsc --project electron/tsconfig.json
```

Then build and launch it, because a CSP that blocks the app's own bundle is a
regression a source-text test cannot catch:

```bash
npm run native:desktop:dev
```

The window must render the cockpit, not a blank page. Open the dev tools console
and confirm there are no `Refused to load` CSP violations. Paste any violation
text into your report and fix the directive that caused it — do not delete the
CSP.

- [ ] **Step 8: Commit**

```bash
git add electron/main.ts electron/main.hardening.test.ts vitest.config.ts
git commit -m "fix(electron): add CSP and navigation guard, pin the security posture

sandbox and webSecurity were relying on Electron defaults, there was no CSP,
and will-navigate was unhandled so the renderer could navigate itself off the
app origin. contextIsolation, nodeIntegration, setWindowOpenHandler and the
empty preload were already correct and are now asserted by test.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 15: Prove CI can actually fail

**Run this task first, before anything else in the plan.**

**Files:**

- Modify: `.github/workflows/ci.yml` (only if a gap is found)
- Temporary: a throwaway branch, deleted by the end of the task

**Interfaces:**

- Consumes: nothing.
- Produces: no code. Produces a report entry containing a real failing CI run URL.

### Why this runs first

A prior audit found the only E2E spec CI ran had zero assertions and could not
fail. `test:e2e:ci` now exists in `package.json`, and reading
[ci.yml](.github/workflows/ci.yml) shows the `web-e2e` job runs
`bun run test:e2e:ci` at a step titled "Run asserting E2E suite" with **no**
`continue-on-error` — while the runtime-audit step below it does carry
`continue-on-error: true`. On paper it gates.

Reading YAML is not proof. `continue-on-error`, job-level `if:` conditions, and
`needs:` chains are all easy to misread, and a job that never runs cannot fail.
Every task after this one reports "CI is green" as evidence — that claim is worth
nothing until CI has been observed going red.

---

- [ ] **Step 1: Create a throwaway branch**

```bash
git checkout -b ci-gate-probe
```

- [ ] **Step 2: Introduce one deliberate failure in the unit suite**

Pick a test that is fast and unambiguous. Edit exactly one line in
`src/lib/account-buckets.test.ts` (or, if Task 1 has not run yet,
`src/lib/tokens.test.ts`):

```ts
// CI GATE PROBE — revert in Task 15 Step 6
expect(settingsKey("u1")).toBe("cockpit.settings.v2:DELIBERATELY-WRONG");
```

- [ ] **Step 3: Push and observe**

```bash
git add -A && git commit -m "test: ci gate probe, do not merge" && git push -u origin ci-gate-probe
```

```bash
gh run watch --exit-status
```

**Pass condition:** the `validate` job fails, and `gh run watch` exits non-zero.
Record the run URL and the failing job name.

If the run goes **green**, the gate is broken. Diagnose it in this task and fix
`ci.yml`: the likely causes are a job-level `if:` that skipped it, a `needs:`
chain that never reached it, or a `continue-on-error` you did not expect. Push
the fix on the same branch and re-observe until it goes red.

- [ ] **Step 4: Probe the E2E gate separately**

The unit gate and the E2E gate are different jobs. Revert the unit failure, then
break one E2E assertion instead:

```ts
// CI GATE PROBE — revert in Task 15 Step 6
await expect(page.getByTestId("identity-choice-modal")).toHaveCount(999);
```

in `e2e/smoke.spec.ts`. Commit, push, and watch again.

**Pass condition:** the `web-e2e` job fails and the run is red. Record the run
URL.

If `web-e2e` was **skipped** rather than run, that is the finding — `needs: build`
means an upstream failure silently removes the E2E gate. Note it in your report
with the exact behaviour observed.

- [ ] **Step 5: Confirm the diagnostics step is genuinely non-gating**

The runtime-audit step carries `continue-on-error: true` by design. Confirm from
the two runs above that a red `web-e2e` job is caused by the asserting suite and
not by the audit step — the job summary names the failing step. Record which step
failed in each run.

- [ ] **Step 6: Revert and clean up**

```bash
git checkout -- . && git checkout fix/v1-isolation-and-contract
```

```bash
git branch -D ci-gate-probe && git push origin --delete ci-gate-probe
```

Verify the working tree is clean and the probe edits are gone:

```bash
git status --short && npx vitest run
```

- [ ] **Step 7: Settle the build-output tracking question**

Already verified: `.output` and `coverage/` are both listed in `.gitignore`, and
`git ls-files .output coverage` returns nothing — neither is tracked. Re-run that
check to confirm it still holds, and record the result:

```bash
git ls-files .output coverage .wrangler dist | head
```

**Pass condition:** empty output. If anything is listed, `git rm -r --cached` it,
confirm the path is in `.gitignore`, and commit that as part of this task.

- [ ] **Step 8: Write the report**

Your report must contain, verbatim:

- The URL and failing job name of the red unit run.
- The URL and failing job name of the red E2E run.
- The `git ls-files` output from Step 7.
- One sentence stating whether `web-e2e` can be silently skipped by an upstream
  failure, and if so, whether you changed anything.

No commit is expected from this task unless Step 3, 4, or 7 found a real gap. If
nothing needed fixing, say so and move on — an empty diff is the good outcome
here.

---

## Task 16: Auth core review

Run in commit group 4 (audits).

**Files:**

- Read + fix: `src/lib/auth.server.ts`, `src/lib/session.server.ts`,
  `src/lib/csrf.server.ts`, `src/lib/encryption.server.ts`
- Test: create `src/lib/auth-core.contract.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: no signature changes expected. If a defect is found that requires
  one, name it in your report before making it.

### What was verified, and the one real defect

These four files carry the entire account-separation branch. Current state:

| Control            | Finding                                                                                                                                                                    | Verdict                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Password hashing   | PBKDF2-SHA256, 100,000 iterations, 256-bit output, per-password random salt ([auth.server.ts:8](src/lib/auth.server.ts:8))                                                 | acceptable, see note            |
| Hash encoding      | `pbkdf2:sha256:<iterations>:<salt>:<hash>` — iteration count travels with the hash, so it can be raised later without invalidating existing passwords                      | good                            |
| Session cookie     | `httpOnly: true`, `secure: true`, `sameSite: "lax"`, 30-day maxAge ([session.server.ts:28-32](src/lib/session.server.ts:28))                                               | good                            |
| CSRF comparison    | XOR-accumulate over equal-length hex strings ([csrf.server.ts:55](src/lib/csrf.server.ts:55)) — constant-time; the early length return is fine, token length is not secret | good                            |
| Encryption mode    | AES-256-GCM, 96-bit IV from `crypto.getRandomValues` per operation ([encryption.server.ts:53](src/lib/encryption.server.ts:53))                                            | authenticated, unique IV — good |
| **Key derivation** | `importKey("raw", encoder.encode(secret))` — the UTF-8 bytes of `ENCRYPTION_KEY` **are** the AES key, with no KDF                                                          | **DEFECT**                      |

**The defect:** `getEncryptionKey()` accepts any key with `length >= 32`, but
`deriveAesKey` passes those raw bytes straight to `importKey` for AES-GCM, which
accepts only 128-, 192-, or 256-bit keys. A 32-character ASCII key is exactly 32
bytes and works. **A 33-character key passes validation and then throws at
`importKey`** — at encrypt time, in production, on a user saving a provider key.
The `AES_KEY_LENGTH = 256` constant at
[encryption.server.ts:6](src/lib/encryption.server.ts:6) is declared and never
used, which is how the mismatch went unnoticed.

The PBKDF2 iteration count is below the OWASP 2023 recommendation of 600,000.
The comment at [auth.server.ts:8](src/lib/auth.server.ts:8) already documents
this as a Cloudflare Workers Web Crypto ceiling. **Do not change it** — it is a
platform constraint, correctly recorded. State it in your report as a known,
accepted limit so it is not rediscovered as news.

---

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth-core.contract.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { encrypt, decrypt } from "./encryption.server";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("encryption key derivation", () => {
  it("works with a key longer than 32 characters", async () => {
    // getEncryptionKey accepts length >= 32, so a 40-char key must work end to
    // end. Today it passes validation and throws inside importKey.
    process.env.ENCRYPTION_KEY = "k".repeat(40);
    const sealed = await encrypt("provider-api-key");
    expect(await decrypt(sealed)).toBe("provider-api-key");
  });

  it("works with a key of exactly 32 characters", async () => {
    process.env.ENCRYPTION_KEY = "k".repeat(32);
    const sealed = await encrypt("provider-api-key");
    expect(await decrypt(sealed)).toBe("provider-api-key");
  });

  it("produces a different ciphertext for the same plaintext each time", async () => {
    process.env.ENCRYPTION_KEY = "k".repeat(32);
    const a = await encrypt("same");
    const b = await encrypt("same");
    expect(a).not.toBe(b);
    expect(a.split(":")[0]).not.toBe(b.split(":")[0]); // distinct IVs
  });
});
```

Note: round-trip, tampering, and NODE_ENV branch coverage for
`encryption.server.ts` is owned by `real-verification.md` Task 5. These three
tests exist only to pin the key-length defect and must not be duplicated there —
say so in your report.

- [ ] **Step 2: Run and confirm the 40-character case fails**

```bash
npx vitest run src/lib/auth-core.contract.test.ts
```

Expected: `works with a key longer than 32 characters` FAILS with an
`OperationError` or `AES-GCM key length` error from `importKey`. The other two
pass. Paste the observed error text.

- [ ] **Step 3: Derive a fixed-length key**

In `src/lib/encryption.server.ts`, replace `deriveAesKey`:

```ts
/**
 * Derive a 256-bit AES key from the configured secret.
 *
 * The secret is operator-supplied text of arbitrary length >= 32. AES-GCM
 * accepts only 128/192/256-bit keys, so the raw bytes cannot be used directly:
 * a 33-character key passed validation and then threw inside importKey. SHA-256
 * gives a fixed 256-bit key for any input length.
 *
 * This changes the derived key for secrets that are not exactly 32 bytes. Those
 * secrets could never encrypt anything before this fix, so no readable
 * ciphertext exists under them and there is nothing to migrate. A 32-byte
 * secret's derived key DOES change — see the migration note below.
 */
async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: AES_ALGORITHM }, false, [
    "encrypt",
    "decrypt",
  ]);
}
```

Then use the declared constant instead of leaving it dead:

```ts
const AES_KEY_LENGTH = 256; // bits; SHA-256 digest length matches exactly
```

Add an assertion so the two can never drift:

```ts
if (digest.byteLength * 8 !== AES_KEY_LENGTH) {
  throw new Error("Derived AES key length does not match AES_KEY_LENGTH");
}
```

- [ ] **Step 4: Handle the re-encryption consequence**

This changes the derived key for a 32-byte secret, so provider keys already
encrypted in D1 under the old derivation will fail to decrypt. Determine the
actual exposure and act on it:

```bash
npx wrangler d1 execute edgecase-cockpit --command "SELECT COUNT(*) AS n FROM user_provider_keys" --remote
```

- **If the count is 0**, there is nothing to migrate. Record the query output in
  your report and move on.
- **If the count is non-zero**, do not silently break those rows. Make `decrypt`
  fall back to the legacy raw-bytes key on failure and re-encrypt under the new
  derivation, in this same task:

  ```ts
  /**
   * Legacy derivation: the secret's raw UTF-8 bytes used directly as the AES
   * key. Only valid for a secret of exactly 32 bytes. Retained so ciphertext
   * written before the SHA-256 derivation can still be read once, then rewritten.
   */
  async function deriveLegacyAesKey(secret: string): Promise<CryptoKey | null> {
    const raw = new TextEncoder().encode(secret);
    if (raw.byteLength !== 32) return null;
    return crypto.subtle.importKey("raw", raw, { name: AES_ALGORITHM }, false, ["decrypt"]);
  }
  ```

  Wire it as a fallback inside `decrypt` only, never inside `encrypt`, so every
  write uses the new derivation and the legacy path drains over time. Add a test
  proving a legacy-encrypted value still decrypts.

- [ ] **Step 5: Run and verify**

```bash
npx vitest run src/lib/auth-core.contract.test.ts && npx vitest run
```

All three contract tests pass, and the full suite stays green.

- [ ] **Step 6: Write the review into your report**

Reproduce the six-row control table above with your own verdicts, and add:

- The exact PBKDF2 parameters and the sentence that 100,000 is a Workers Web
  Crypto ceiling, not an oversight.
- The exact cookie flags, quoted from
  [session.server.ts:28-32](src/lib/session.server.ts:28).
- One sentence confirming the CSRF comparison is constant-time and why the
  length early-return is acceptable.
- The `user_provider_keys` row count from Step 4 and what you did about it.
- Anything you want `real-verification.md` Task 5 to cover that these three
  tests do not. Name it as a finding, not as a question.

- [ ] **Step 7: Commit**

```bash
git add src/lib/encryption.server.ts src/lib/auth-core.contract.test.ts
git commit -m "fix(encryption): derive a fixed-length AES key from the secret

getEncryptionKey accepted any secret of 32+ characters, but deriveAesKey fed
the raw UTF-8 bytes to importKey, which accepts only 128/192/256-bit keys. A
33-character ENCRYPTION_KEY passed validation and then threw at encrypt time,
in production, when a user saved a provider key. SHA-256 gives a 256-bit key
for any input length, and the previously-dead AES_KEY_LENGTH constant now
asserts it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 17: Migration review

Run in commit group 4 (audits).

**Files:**

- Read: `migrations/0001_auth_user_columns.sql`,
  `migrations/0002_user_account_ownership.sql`,
  `migrations/0003_pricing_and_tool_permissions.sql`
- Create: `migrations/0004_restore_account_foreign_keys.sql`
- Test: create `migrations/migrations.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `migrations/0004_restore_account_foreign_keys.sql`. Note the number —
  `real-verification.md` Task 7 also wants `0004_user_tools.sql`. **This plan
  runs first and takes 0004; that task becomes 0005.** Write that into your
  report so the renumber is not discovered as a conflict later.

### What was verified

`0002` rebuilds four tables to make `session_id` nullable. Two of the four came
out of the rebuild with their foreign keys intact and two did not:

| Table in `0002`      | `user_id` FK + `ON DELETE CASCADE`                                  | `session_id` FK                                                  |
| -------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `threads_new`        | present ([:75](migrations/0002_user_account_ownership.sql:75))      | present ([:74](migrations/0002_user_account_ownership.sql:74))   |
| `vector_docs_new`    | present ([:232](migrations/0002_user_account_ownership.sql:232))    | present ([:231](migrations/0002_user_account_ownership.sql:231)) |
| `provider_stats_new` | **ABSENT** ([:122](migrations/0002_user_account_ownership.sql:122)) | **ABSENT**                                                       |
| `usage_records_new`  | **ABSENT** ([:175](migrations/0002_user_account_ownership.sql:175)) | **ABSENT**                                                       |

`provider_stats` and `usage_records` have **no foreign keys at all**. Deleting a
user leaves their provider statistics and usage records orphaned in the database
forever. Both tables hold per-account data — `usage_records` holds per-request
cost history, which is exactly the kind of row a deletion request must remove.

The indexes are intact: `idx_provider_stats_guest_provider` (partial, `WHERE
user_id IS NULL AND session_id IS NOT NULL`) and `idx_provider_stats_user_provider`
(partial, `WHERE user_id IS NOT NULL`) correctly separate guest rows from user
rows, and `idx_usage_session` / `idx_usage_thread` / `idx_usage_user` are all
present after the rebuild. Do not touch them.

`user_provider_keys`, `user_settings` (`0002`) and `user_tool_permissions`
(`0003`) all have the FK with cascade. `pricing_cache` (`0003`) holds no
per-account data and correctly has none.

---

- [ ] **Step 1: Write the failing test**

Create `migrations/migrations.test.ts`:

```ts
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
    // The FK may be declared on the table itself or on its _new rebuild.
    const declared = new RegExp(
      `CREATE TABLE[^;]*?\\b${table}(_new)?\\b[^;]*?FOREIGN KEY\\s*\\(\\s*user_id\\s*\\)[^;]*?ON DELETE CASCADE`,
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
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run migrations/migrations.test.ts
```

Expected: `provider_stats cascades when its user is deleted` and
`usage_records cascades when its user is deleted` FAIL. The other five and both
index tests PASS. Paste the output.

If vitest does not collect the file, widen `include` in `vitest.config.ts` to
`["src/**/*.test.{ts,tsx}", "electron/**/*.test.ts", "migrations/**/*.test.ts"]`
— Task 14 may have already widened it for `electron/`.

- [ ] **Step 3: Write the repair migration**

SQLite cannot add a foreign key to an existing table, so both tables need the
same rebuild `0002` used. Create
`migrations/0004_restore_account_foreign_keys.sql`, following the exact style of
`0002` (`PRAGMA foreign_keys=OFF`, create `_new`, copy, drop, rename, recreate
indexes):

```sql
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
```

Compare the two `CREATE TABLE` bodies against
[0002 lines 122-131](migrations/0002_user_account_ownership.sql:122) and
[0002 lines 175-187](migrations/0002_user_account_ownership.sql:175) column by
column before running anything. A dropped column here is silent data loss.

- [ ] **Step 4: Run and verify the test passes**

```bash
npx vitest run migrations/migrations.test.ts
```

Expect PASS on all nine.

- [ ] **Step 5: Apply it locally and prove the cascade works**

```bash
npx wrangler d1 execute edgecase-cockpit --local --file=migrations/0004_restore_account_foreign_keys.sql
```

Then prove the behaviour the migration exists for:

```bash
npx wrangler d1 execute edgecase-cockpit --local --command "PRAGMA foreign_keys=ON; INSERT INTO users (id,email,password_hash,created_at,updated_at) VALUES ('fk-probe','fk@probe.test','x',0,0); INSERT INTO provider_stats (session_id,user_id,provider_id,calls) VALUES (NULL,'fk-probe','openai',1); INSERT INTO usage_records (id,session_id,user_id,provider_id,input_tokens,output_tokens,estimated_cost,created_at) VALUES ('u1',NULL,'fk-probe','openai',1,1,0.1,0); DELETE FROM users WHERE id='fk-probe'; SELECT (SELECT COUNT(*) FROM provider_stats WHERE user_id='fk-probe') AS stats, (SELECT COUNT(*) FROM usage_records WHERE user_id='fk-probe') AS usage;"
```

**Pass condition:** both counts are `0`. Paste the output into your report. A
non-zero count means the FK did not take — the most likely cause is
`PRAGMA foreign_keys` being off for the connection, which D1 controls; note that
explicitly if you hit it.

- [ ] **Step 6: Verify the app still works against the migrated schema**

```bash
npx vitest run && npx playwright test e2e/account-separation.spec.ts
```

- [ ] **Step 7: Commit**

```bash
git add migrations/0004_restore_account_foreign_keys.sql migrations/migrations.test.ts vitest.config.ts
git commit -m "fix(db): restore the foreign keys the 0002 rebuild dropped

0002 rebuilt four tables to make session_id nullable. threads and vector_docs
kept their FKs; provider_stats and usage_records came out with none at all, so
deleting a user orphaned their statistics and per-request cost history.

Rebuilds both with FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE
CASCADE, recreating every index from 0002 verbatim including the partial
unique indexes that separate guest rows from user rows.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 18: Consolidate the documentation

Run last, after Task 12.

**Files:**

- Move: `ACCOUNT_SEPARATION_PLAN.md` → `docs/archive/ACCOUNT_SEPARATION_PLAN.md`
- Move: `RECONSTRUCTION_PLAN.md` → `docs/archive/RECONSTRUCTION_PLAN.md`
- Move: `SURFACE_AUDIT.md` → `docs/archive/SURFACE_AUDIT.md`
- Split: `README.md` (75 KB) → short root `README.md` + `docs/` pages
- Modify: `AGENTS.md` if it points at any moved path

**Interfaces:**

- Consumes: nothing.
- Produces: no code. A root `README.md` under 200 lines whose job is routing, not
  reference.

**Why this matters and why it is last:** agents read the README before they read
code, and a 75 KB README is a context tax paid on every single session for the
rest of the project's life. It goes last because moving files while twelve other
tasks are editing them creates merge pain for no benefit.

Three root plans overlap with each other and with this one:
`ACCOUNT_SEPARATION_PLAN.md` (26 KB), `RECONSTRUCTION_PLAN.md` (32 KB),
`SURFACE_AUDIT.md` (12 KB). `docs/archive/` already exists and already holds
`MISMATCH_REPORT.md`, `AUTH_AUDIT.md`, and `USER_FLOWS.md` — these three belong
beside them.

---

- [ ] **Step 1: Inventory what the README actually contains**

```bash
grep -n "^#\{1,3\} " README.md
```

Classify every top-level section into exactly one of:

- **Routing** — what this project is, how to run it, where to find things. Stays
  in the root README.
- **Reference** — API surface, provider tables, env var lists, architecture
  detail. Moves to a `docs/` page.
- **Historical** — completed migrations, past decisions, changelog-shaped prose.
  Moves to `docs/archive/`.

Write the classification into your report as a table before moving anything. A
section you cannot classify is Reference.

- [ ] **Step 2: Move the three root plans**

```bash
git mv ACCOUNT_SEPARATION_PLAN.md RECONSTRUCTION_PLAN.md SURFACE_AUDIT.md docs/archive/
```

Add a one-line status banner to the top of each, so a future reader knows its
standing without reading it:

```markdown
> **Archived.** Superseded by `docs/superpowers/plans/2026-09-02-v1-isolation-and-contract.md`. Kept for the reasoning, not as current instruction.
```

- [ ] **Step 3: Split the README**

Create the reference pages your Step 1 table calls for, under `docs/`. At minimum
the split should produce:

- `docs/architecture.md` — the app's shape, the store, the provider layer, the
  bucket model.
- `docs/providers.md` — the 15-entry catalog, capabilities, allowlists, and how
  to add one.
- `docs/development.md` — setup, scripts, testing, the E2E suites and what each
  gates.
- `docs/deployment.md` — Cloudflare Worker, D1, migrations, secrets via
  `wrangler secret put`, native builds.

Move content verbatim. This task reorganises; it does not rewrite. If a section
is wrong, note it in your report rather than fixing it here — a move commit and a
content commit must not be the same commit.

- [ ] **Step 4: Write the root README**

Under 200 lines. It answers four questions and links out for everything else:

```markdown
# Edgecase Cockpit

One calm interface for running, selecting, monitoring, and conversing with AI
model providers — local and cloud — without terminal windows or provider
dashboards.

## Quick start

<!-- the actual commands, verbatim from the old README -->

## Where things are

| I want to...                        | Read                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| Understand the architecture         | [docs/architecture.md](docs/architecture.md)           |
| Add or configure a provider         | [docs/providers.md](docs/providers.md)                 |
| Set up a dev environment, run tests | [docs/development.md](docs/development.md)             |
| Deploy, migrate, manage secrets     | [docs/deployment.md](docs/deployment.md)               |
| Know where the product is going     | [docs/product-direction.md](docs/product-direction.md) |
| See current implementation plans    | [docs/superpowers/plans/](docs/superpowers/plans/)     |
| Read superseded plans and audits    | [docs/archive/](docs/archive/)                         |

## Status

<!-- one short paragraph: what works, what is in flight -->
```

- [ ] **Step 5: Fix every inbound link**

```bash
grep -rn "ACCOUNT_SEPARATION_PLAN\|RECONSTRUCTION_PLAN\|SURFACE_AUDIT" --include="*.md" --include="*.ts" --include="*.tsx" --include="*.yml" . | grep -v node_modules
```

Update each hit to the new path. Check `AGENTS.md` and `.github/` specifically —
a broken link in an agent instruction file misroutes every future session.

- [ ] **Step 6: Verify nothing broke**

```bash
npx vitest run && npx tsc --noEmit && npx eslint . && npx prettier --check .
```

```bash
wc -l README.md
```

**Pass condition:** README under 200 lines, the grep from Step 5 returns only
updated paths, and all four checks are clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: consolidate the root documentation into docs/

Splits a 75KB README into a routing README plus architecture, providers,
development and deployment pages, and archives the three overlapping root
plans beside the existing docs/archive material.

Agents read the README before they read code; 75KB was a context tax paid
every session. Content moved verbatim — no rewrites in this commit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Final Verification

Run every gate before reporting the branch complete. Paste the real output.

```bash
npx vitest run
```

```bash
npx tsc --noEmit
```

```bash
npx eslint .
```

```bash
npx vitest run --coverage
```

```bash
npx vite build
```

```bash
npx wrangler deploy --dry-run --outdir=/tmp/wr-verify
```

```bash
npx playwright test e2e/account-separation.spec.ts e2e/v1-local-loop.spec.ts e2e/smoke.spec.ts
```

```bash
npx wrangler d1 execute edgecase-cockpit --local --file=migrations/0004_restore_account_foreign_keys.sql
```

### The branch is done when all of these hold

Each row is a fact you establish, not a judgment anyone else makes.

| #   | Condition                                                                                                                      | Owner       |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| 1   | CI has been observed going **red** on a deliberate failure, in both the `validate` and `web-e2e` jobs, with run URLs recorded. | Task 15     |
| 2   | `hydrateAsync` in undetermined mode writes zero localStorage keys.                                                             | Task 1      |
| 3   | A `getState()` before `hydrateAsync` does not strand server mode at `user: null`.                                              | Task 2      |
| 4   | `claimGuestData` defaults to `false`, and sign-in from a local profile shows the migration dialog.                             | Task 3      |
| 5   | A server response arriving after an account switch writes nothing.                                                             | Task 4      |
| 6   | Threads, stats, cost overrides, validation status, and RAG all move together across every switch.                              | Tasks 4, 5  |
| 7   | `POST /api/tools/schemas` returns 401 to an anonymous caller **and** registers nothing.                                        | Task 6      |
| 8   | `urlAllowedAnyProvider` returns `null` for `169.254.169.254` in production with the wildcard opt-in on.                        | Task 13     |
| 9   | `validateProviderKey` never calls `fetch` for an unallowlisted host.                                                           | Task 13     |
| 10  | Electron sets `sandbox`, `webSecurity`, a CSP, and a `will-navigate` guard; the packaged app renders with no CSP violations.   | Task 14     |
| 11  | A 40-character `ENCRYPTION_KEY` round-trips through `encrypt`/`decrypt`.                                                       | Task 16     |
| 12  | Deleting a user removes their `provider_stats` and `usage_records` rows — proven by the local D1 probe returning `0, 0`.       | Task 17     |
| 13  | `PROVIDERS` has all 15 entries and the E2E asserts 15 provider cards.                                                          | Tasks 9, 10 |
| 14  | The 17-step E2E passes, including the Copy and Move branches.                                                                  | Task 11     |
| 15  | Every negative assertion in both E2E specs is paired with a positive one, with the audited count recorded.                     | Task 11     |
| 16  | Test count is **above 710** — the measured baseline. It never goes down.                                                       | all         |
| 17  | `vitest`, `tsc`, `eslint`, `vite build`, and `wrangler deploy --dry-run` are all clean, with output pasted.                    | all         |

Report per-suite pass/fail with real output. Do not push.

---

## Appendix A — the 12-item brief

Reproduced verbatim from the owner's instruction.

1. Close the identity loop. Persist localProfileId + accountMode. Stop keying
   local data as "guest". One-time migrate existing guest buckets. If this is
   wrong, every other item leaks.
2. Make hydrate blocking and bucket-correct. hydrateAsync must resolve identity
   before UI. No flash of the other account. fetchMe() 401 falls into local
   profile, not guest. Reload must land on the same bucket it left.
3. Wire choice and migration to the real auth UI. IdentityChoiceModal on
   undetermined. DataMigrationDialog on the register/login page, not inside
   register(). Copy / Move / Keep Separate must be the only claim path. Default
   claimGuestData must not silently eat local data.
4. Stop Keep Separate from merging. authRequest must not push currentSettings
   into the server user when the user chose Keep Separate. Same rule for threads,
   stats, provider key status, offline queue, and vector docs.
5. Move the whole V1 surface across buckets, not just chat. On mode switch,
   isolate and restore: provider catalog + key/validation status (all 15
   entries); built-in tools + schema registry + approval / permissions; price
   cache + cost overrides + usage stats; local RAG store (load and save; add the
   missing saveVectorStoreForUser / getAllMemoryDocs helpers). A mode switch that
   keeps threads but drops RAG, prices, or tools is a failed isolation change.
6. Prove the generic local OpenAI-compatible path on first run. That is the V1
   acceptance test: inspect endpoint, see ready/missing, one safe model-list,
   recover. Do not delete the other 14 catalog entries to make this pass. Named
   presets are not the proof set. The catalog stays.
7. Narrow cockpit-store public surface. Keep the fat file if you want. Export
   only what routes may touch: store, useStore, hydrateAsync, enterLocalMode,
   enterServerMode, and the bucketed load/save helpers. Auth, persistence, stats,
   pricing, tools, and RAG internals stay behind that facade.
8. Give providers.ts the same treatment. One facade for catalog, detection,
   routing, model-list, and status. Do not split into a monorepo. Do not hide
   cloud providers to look more "local-first."
9. Fix claimGuestSession on the server. It must honor claimGuestData. It must
   reassign only the chosen tables (provider_stats, threads, usage_records,
   vector_docs) when Copy/Move is explicit. Keep Separate means those rows stay
   put.
10. Clear cross-mode caches on every switch. Offline queue, in-memory provider
    status, price cache, tool permission cache, vector memory. Then reload from
    the destination bucket. No leftover User A price or RAG in User B.
11. Lock design tokens before restyling routes. docs/product-direction.md is the
    visual contract: translucent shell, provider-status tokens, warning/voice/
    media states. Do not redesign settings.tsx / index.tsx first. Fat routes are
    a later split, not the risk.
12. Gate on the 17-step account E2E, with surface checks added. Fresh install →
    identity choice → local-only chat + local RAG + tools + price estimate →
    register with each of copy/move/keep-separate → logout back to local profile
    → User B sees none of User A → reload does not flash. If a provider card,
    tool approval, price number, or RAG hit is wrong after a switch, the branch
    is not done.

**Commit order:** 1. identity loop + hydrate + bucket isolation. 2. keep
catalog/tools/pricing/local RAG working across guest / local / server buckets. 3. narrow store public surface without deleting those modules. 4. first-run still
proves the generic local endpoint. 5. tokens / route splits last.

---

## Appendix B — brief item → task map

Each row states what was **verified as already implemented** on this branch and
what this plan actually changes. Read this before starting: several items need
far less work than the brief implies, and one needs more.

| #   | Already done (verified)                                                                                                                                           | Remaining gap                                                                                                                                               | Task  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | `ACCOUNT_MODE_KEY` + `LOCAL_PROFILE_ID_KEY` persisted; `migrateGuestBucketToLocalProfile` + `ensureLocalProfileId` exist and are wired                            | Key getters still fall back to the literal `"guest"`, and `hydrateAsync()` in undetermined mode **writes** `cockpit.settings.v2:guest` — confirmed by probe | 1     |
| 2   | `__root.tsx` blocks on `hydrateAsync()` behind `AccountLoadingSkeleton`; `fetchMe()` 401 → `returnToLocalProfile()`                                               | One shared `hydrated` flag lets a first-render `getState()` cancel `hydrateAsync()`, stranding server mode at `user: null` — confirmed by probe             | 2     |
| 3   | `IdentityChoiceModal` gates undetermined; `DataMigrationDialog` lives on `/auth`, outside `register()`                                                            | Sign-in never offers the choice; `claimGuestData` defaults to `true` server-side                                                                            | 3     |
| 4   | `authRequest` does **not** push `currentSettings`; `enterServerMode` loads the account bucket before persisting                                                   | Reachable only through the item-3 default; covered by the same fix                                                                                          | 3     |
| 5   | `saveVectorStoreForUser` and `getAllVectorDocsForUser` **already exist** (the brief lists them as missing); threads/stats/settings/costOverrides already bucketed | Validation status is runtime-only; `enterLocalMode` discards the vector store it just loaded; in-flight responses write into the wrong bucket               | 4, 5  |
| 6   | `e2e/v1-local-loop.spec.ts` already drives the full inspect → ready/missing → model-list → recover loop from a genuine fresh first run                            | Nothing pins the catalog at 15, so deleting 14 entries would still go green                                                                                 | 9, 10 |
| 7   | —                                                                                                                                                                 | ~40 exports reachable from routes                                                                                                                           | 8     |
| 8   | —                                                                                                                                                                 | No facade                                                                                                                                                   | 9     |
| 9   | `claimGuestSession` **already** reassigns exactly `provider_stats`, `threads`, `usage_records`, `vector_docs`; both routes already honour an explicit `false`     | The default is `true`                                                                                                                                       | 3     |
| 10  | `clearOfflineQueue()` called on both switches; `clearVectorStoreCache()` exists                                                                                   | Cost-override and tool-permission caches survive the switch                                                                                                 | 4, 7  |
| 11  | `docs/product-direction.md` §5 specifies the families                                                                                                             | `styles.css` has shadcn defaults only — no provider-status, voice, or media tokens                                                                          | 12    |
| 12  | `e2e/account-separation.spec.ts` covers 15 steps incl. reload-without-flash                                                                                       | Copy and Move branches never run; assertions are thread-titles only                                                                                         | 11    |

---

## Appendix C — defects found outside the brief

Six subsystems the brief did not name. Every claim below was verified against the
file cited, not inferred. Each has a task with a pass condition.

| Defect                                                                                                                                                                                                                                                                                                                                                                                                                | Severity | Task |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---- |
| **SSRF via the custom-provider wildcard.** [`urlAllowedAnyProvider`](src/lib/proxy-guard.server.ts:103) loops every provider and returns the first `allowedHosts` match without calling `isWildcardHostAllowed()` — the gate its sibling `urlAllowedForProvider` does apply. `custom` declares `allowedHosts: ["*"]`, so `POST /api/proxy/detect` will server-side fetch **any** host, in production, with no opt-in. | High     | 13   |
| **`validateProviderKey` fetches a caller-supplied `baseUrl` with no allowlist call at all.** [validate-key.server.ts:30](src/lib/validate-key.server.ts:30), reached from both `/api/keys/validate` routes.                                                                                                                                                                                                           | High     | 13   |
| **No private-range or IP-literal blocking anywhere.** Loopback, RFC1918, link-local (`169.254.169.254`), and the decimal/hex/octal/IPv4-mapped-IPv6 encodings of each all pass every existing check.                                                                                                                                                                                                                  | High     | 13   |
| **In-flight responses write into the wrong bucket.** `enterServerMode` fires `void loadSettingsFromServer()` and `void refreshProviderKeyStatus()` ([cockpit-store.ts:857](src/lib/cockpit-store.ts:857)); neither re-checks identity after its `await`, so a response arriving after logout writes state and persists it into the local profile.                                                                     | High     | 4    |
| **`ENCRYPTION_KEY` longer than 32 characters throws at encrypt time.** `getEncryptionKey` accepts `length >= 32`, but [`deriveAesKey`](src/lib/encryption.server.ts:26) passes raw UTF-8 bytes to `importKey`, which takes only 128/192/256-bit keys. The declared `AES_KEY_LENGTH = 256` is never used.                                                                                                              | High     | 16   |
| **`provider_stats` and `usage_records` have no foreign keys.** The `0002` rebuild kept them on `threads_new` and `vector_docs_new` but dropped them on [provider_stats_new:122](migrations/0002_user_account_ownership.sql:122) and [usage_records_new:175](migrations/0002_user_account_ownership.sql:175). Deleting a user orphans their statistics and cost history permanently.                                   | Medium   | 17   |
| **`POST /api/tools/schemas` has no auth check.** It reads the session but never requires a user, so any caller can write into the process-global registry every signed-in user reads.                                                                                                                                                                                                                                 | Medium   | 6    |
| **Electron has no CSP and no `will-navigate` guard**, and relies on Electron's defaults for `sandbox` and `webSecurity` rather than stating them.                                                                                                                                                                                                                                                                     | Medium   | 14   |

### Verified correct — do not re-audit

Recorded so a later session does not spend context rediscovering them:

- **The local model-list probe is client-side.**
  [`probeLocalOpenAICompatibleModels`](src/lib/providers.ts:895) takes
  `fetchImpl = directFetch` and runs in the browser. Outside SSRF scope.
- **Password hashing** is PBKDF2-SHA256 at 100,000 iterations with a per-password
  random salt, and the iteration count travels inside the stored hash so it can
  be raised later. 100,000 is the Cloudflare Workers Web Crypto ceiling, already
  documented at [auth.server.ts:8](src/lib/auth.server.ts:8) — a platform limit,
  not an oversight.
- **Session cookies** set `httpOnly`, `secure`, and `sameSite: "lax"`
  ([session.server.ts:28](src/lib/session.server.ts:28)).
- **CSRF comparison is constant-time** — XOR-accumulate over equal-length hex
  ([csrf.server.ts:55](src/lib/csrf.server.ts:55)). The length early-return is
  fine; token length is not secret.
- **Encryption is authenticated with a unique IV per operation** — AES-256-GCM,
  96-bit IV from `crypto.getRandomValues`. Only the key _derivation_ is broken.
- **Electron's preload exposes nothing** (`module.exports = {}`), and
  `contextIsolation: true` / `nodeIntegration: false` /
  `setWindowOpenHandler` are all correct.
- **CI's asserting E2E step carries no `continue-on-error`** — only the
  runtime-audit diagnostics step does. Task 15 proves this empirically rather
  than taking the YAML's word for it.
- **`.output` and `coverage/` are gitignored and untracked.**
  `git ls-files .output coverage` returns nothing.
- **The `0002` indexes all survived the rebuild**, including the two partial
  unique indexes that separate guest `provider_stats` rows from user rows.
