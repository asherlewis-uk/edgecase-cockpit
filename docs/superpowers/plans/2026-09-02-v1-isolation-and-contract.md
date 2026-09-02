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

---

## File Structure

### Files created

| File                              | Responsibility                                                                                                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/account-buckets.ts`      | Pure bucket-key derivation. Owns `SETTINGS_KEY_BASE`/`THREADS_KEY_BASE`/`STATS_KEY_BASE`/`VECTOR_KEY_BASE` and the `scope → key` functions. No state, no `localStorage`. Breaks the `cockpit-store ↔ vector-store` import cycle. |
| `src/lib/account-buckets.test.ts` | Tests for the above.                                                                                                                                                                                                             |
| `src/lib/store.ts`                | **Facade.** The only module routes/components may import for store access. Re-exports the narrow surface from `cockpit-store.ts`.                                                                                                |
| `src/lib/provider-api.ts`         | **Facade.** The only module routes/components may import for provider access: catalog, detection, routing, model-list, status.                                                                                                   |
| `src/lib/provider-api.test.ts`    | Catalog-integrity test (all 15 entries) + facade surface test.                                                                                                                                                                   |
| `src/styles/tokens.css`           | Design-token layer from `docs/product-direction.md` §5. Imported by `src/styles.css`.                                                                                                                                            |
| `src/styles/tokens.test.ts`       | Asserts every required token family is declared.                                                                                                                                                                                 |

### Files modified

| File                               | Change                                                                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/cockpit-store.ts`         | Remove `"guest"` key fallback; split hydration gates; add `switchAccountBucket`; bucket `providerValidationStatus`; delegate key math to `account-buckets.ts`; mark the narrow surface. |
| `src/lib/vector-store.ts`          | Use `account-buckets.ts`; drop the `"guest"` fallback in `getStoreKey()`.                                                                                                               |
| `src/lib/tools.ts`                 | Registry becomes owner-scoped (`Map<ownerId, RegisteredTool[]>`).                                                                                                                       |
| `src/lib/tool-execution.server.ts` | `getToolApprovalStatus` reads the owner-scoped registry.                                                                                                                                |
| `src/routes/api/tools/schemas.ts`  | Require a signed-in user for `POST`; scope `GET`/`POST` to that user.                                                                                                                   |
| `src/routes/api/auth/register.ts`  | `claimGuestData` default flips `true` → `false`.                                                                                                                                        |
| `src/routes/api/auth/login.ts`     | Same default flip.                                                                                                                                                                      |
| `src/routes/auth.tsx`              | Sign-in from local-only shows `DataMigrationDialog` too.                                                                                                                                |
| `src/routes/settings.tsx`          | `ToolPermissionsSection` refetches on account switch.                                                                                                                                   |
| `src/styles.css`                   | `@import` the token layer; map tokens into `@theme inline`.                                                                                                                             |
| `e2e/account-separation.spec.ts`   | Add copy/move branches + surface checks → true 17 steps.                                                                                                                                |
| `vitest.config.ts`                 | Raise coverage thresholds at the end (Task 12).                                                                                                                                         |

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
  `enterServerMode` (~:821), `enterLocalMode` (~:862)
- Modify: `src/lib/tools.ts` — add `clearRegisteredToolsForOwner`
- Test: `src/lib/cockpit-store.account-separation.test.ts` (extend)

**Interfaces:**

- Consumes: `getActiveScope()` (Task 1).
- Produces:
  ```ts
  // src/lib/cockpit-store.ts — module-private
  type BucketTarget = { user: UserPublic; scope: string } | { user: null; scope: string };
  function switchAccountBucket(target: BucketTarget): void;
  ```
  `enterServerMode` and `enterLocalMode` keep their exported signatures and both
  delegate to it.

**Why:** `clearRuntimeCaches()` clears only `providerKeyStatus` and
`providerValidationStatus`. `enterLocalMode` calls `loadVectorStoreForUser(id)`
and then `clearVectorStoreCache()` immediately after, throwing away the load it
just did. Nothing clears the tool registry. The two enter-mode functions have
drifted into near-duplicates with different cache handling — the divergence is
the bug surface.

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
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/cockpit-store.account-separation.test.ts`
Expected: the RAG assertion fails first — `searchVectorStore([1,0,0], 3)` returns
the local doc after entering server mode, because `enterLocalMode`'s trailing
`clearVectorStoreCache()` leaves `memoryDocs` null and the next read re-derives
from whichever scope happens to be current. Record the exact message you observe.

- [ ] **Step 3: Add the owner-scoped registry clear to `tools.ts`**

In `src/lib/tools.ts`, beside `clearRegisteredTools` (~:205):

```ts
/**
 * Drop every non-built-in tool registered for one owner. Called on account
 * switch so User A's registered schemas cannot appear in User B's approval list.
 */
export function clearRegisteredToolsForOwner(ownerId: string): void {
  _registeredTools = _registeredTools.filter(
    (t) => t.source === "built-in" || t.ownerId !== ownerId,
  );
}
```

(Task 6 introduces `ownerId` on `RegisteredTool`. If you are executing tasks in
order, add the field there and come back; if `RegisteredTool` already carries
`ownerId`, this compiles as written.)

- [ ] **Step 4: Write the single switch routine**

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
function clearCrossModeCaches(previousScope: string | null): void {
  state = {
    ...state,
    providerKeyStatus: {},
    providerValidationStatus: {},
  };
  clearOfflineQueue();
  clearVectorStoreCache();
  setCostOverrides({});
  if (previousScope) clearRegisteredToolsForOwner(previousScope);
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
  const previousScope = getActiveScope();
  clearCrossModeCaches(previousScope);

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

Import `clearRegisteredToolsForOwner` from `@/lib/tools` at the top of the file.

- [ ] **Step 5: Run and verify both new tests pass**

Run: `npx vitest run src/lib/cockpit-store.account-separation.test.ts` — expect PASS.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`

`src/lib/cockpit-store.auth.test.ts` has cases asserting the old call ordering
inside `enterServerMode` (settings-sync before key-status). That ordering is
preserved above — if one of them fails, read it carefully before changing it, and
report which behaviour actually changed.

- [ ] **Step 7: Verify and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
```

```bash
git add src/lib/cockpit-store.ts src/lib/tools.ts src/lib/cockpit-store.account-separation.test.ts
git commit -m "fix(account): route every mode switch through one bucket-switch routine

enterServerMode and enterLocalMode had drifted into near-duplicates with
different cache handling: enterLocalMode discarded the vector store it had
just loaded, neither cleared the tool registry, and cost overrides survived
the switch. One routine, one clear-then-load order.

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

## Task 6: Scope the server tool registry to its owner

Commit group 2.

**Files:**

- Modify: `src/lib/tools.ts` — `RegisteredTool` (~:91), `_registeredTools` (~:100),
  `initRegistry` (~:103), `getAllToolSchemas` (~:116),
  `getSerializableToolDefs` (~:126), `registerLocalTool` (~:141),
  `registerProviderTools` (~:169), `clearRegisteredTools` (~:205),
  `getToolSchemaCounts` (~:221)
- Modify: `src/lib/tool-execution.server.ts` — `getToolApprovalStatus` (~:74)
- Modify: `src/routes/api/tools/schemas.ts`
- Test: `src/lib/tools.test.ts` (extend), `src/routes/api/-tools-schemas.test.ts` (extend)

**Interfaces:**

- Consumes: nothing.
- Produces — every registry function gains a leading `ownerId: string` parameter,
  and `RegisteredTool` gains an owner field:
  ```ts
  export type RegisteredTool = ToolDef & {
    source: ToolSchemaSource;
    providerId?: string;
    /** Owning account scope. Undefined for built-ins, which belong to everyone. */
    ownerId?: string;
  };
  export function getAllToolSchemas(ownerId: string | null): RegisteredTool[];
  export function getSerializableToolDefs(ownerId: string | null): ToolDef[];
  export function registerLocalTool(ownerId: string, tool: unknown): boolean;
  export function registerProviderTools(
    ownerId: string,
    providerId: string,
    tools: ToolDef[],
  ): number;
  export function clearRegisteredTools(ownerId: string): void;
  export function clearRegisteredToolsForOwner(ownerId: string): void; // from Task 4
  export function getToolSchemaCounts(ownerId: string | null): {
    builtIn: number;
    local: number;
    provider: number;
    total: number;
  };
  ```
  A `null` ownerId means "built-ins only".
- Produces: `getToolApprovalStatus(userId: string | undefined)` keeps its
  signature and now passes `userId ?? null` through to `getAllToolSchemas`.

**Why:** `_registeredTools` is a single module-global array on the Worker, and
`POST /api/tools/schemas` has **no auth check** — it reads the session but never
requires a user. Any caller, guest included, can register a tool that then
appears in every signed-in user's approval list via `getToolApprovalStatus`.
That is a cross-account leak on the server, not just a stale client cache.

---

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/tools.test.ts`:

```ts
describe("registry ownership", () => {
  beforeEach(() => __resetToolRegistry());

  it("keeps one owner's tools out of another owner's schema list", () => {
    expect(registerLocalTool("owner-a", { name: "a_tool", description: "", parameters: [] })).toBe(
      true,
    );
    const forB = getAllToolSchemas("owner-b");
    expect(forB.map((t) => t.name)).not.toContain("a_tool");
    expect(getAllToolSchemas("owner-a").map((t) => t.name)).toContain("a_tool");
  });

  it("gives every owner the built-in tools", () => {
    const builtInNames = BUILT_IN_TOOLS.map((t) => t.name);
    for (const owner of ["owner-a", "owner-b", null]) {
      const names = getAllToolSchemas(owner).map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(builtInNames));
    }
  });

  it("clearRegisteredToolsForOwner leaves other owners and built-ins alone", () => {
    registerLocalTool("owner-a", { name: "a_tool", description: "", parameters: [] });
    registerLocalTool("owner-b", { name: "b_tool", description: "", parameters: [] });
    clearRegisteredToolsForOwner("owner-a");
    expect(getAllToolSchemas("owner-a").map((t) => t.name)).not.toContain("a_tool");
    expect(getAllToolSchemas("owner-b").map((t) => t.name)).toContain("b_tool");
    expect(getAllToolSchemas("owner-b").length).toBeGreaterThan(1);
  });
});
```

Append to `src/routes/api/-tools-schemas.test.ts`, mirroring the auth-mocking
style of `src/routes/api/-tools-permissions.test.ts`:

```ts
it("POST requires a signed-in user", async () => {
  getAuthUserIdMock.mockResolvedValue(undefined);
  const res = await callPost({ name: "x_tool", description: "", parameters: [] });
  expect(res.status).toBe(401);
});

it("GET returns only the caller's registered tools plus built-ins", async () => {
  getAuthUserIdMock.mockResolvedValue("owner-a");
  await callPost({ name: "a_tool", description: "", parameters: [] });

  getAuthUserIdMock.mockResolvedValue("owner-b");
  const res = await callGet();
  const json = (await res.json()) as { schemas: Array<{ name: string }> };
  expect(json.schemas.map((s) => s.name)).not.toContain("a_tool");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/tools.test.ts src/routes/api/-tools-schemas.test.ts`
Expected: compile errors on the new `ownerId` argument, and — once those are
past — `POST requires a signed-in user` FAILS with `expected 200 to be 401`.

- [ ] **Step 3: Make the registry owner-aware**

In `src/lib/tools.ts`, replace the registry state and the four readers:

```ts
export type RegisteredTool = ToolDef & {
  source: ToolSchemaSource;
  providerId?: string;
  /**
   * Owning account scope. Undefined for built-ins, which belong to every caller.
   * Non-built-in tools are visible only to their owner.
   */
  ownerId?: string;
};

const MAX_REGISTERED_TOOLS = 256;

// One flat array holding built-ins (ownerId undefined) plus every owner's tools.
// Reads filter by owner; the MAX cap is applied per owner.
let _registeredTools: RegisteredTool[] = [];
let _initialized = false;

function initRegistry() {
  if (_initialized) return;
  _initialized = true;
  _registeredTools = BUILT_IN_TOOLS.map((t) => ({ ...t, source: "built-in" as const }));
}

function visibleTo(ownerId: string | null): RegisteredTool[] {
  initRegistry();
  return _registeredTools.filter((t) => t.source === "built-in" || t.ownerId === ownerId);
}

/**
 * Return all tool schemas visible to one owner: the built-ins, plus that owner's
 * own registered tools. Built-in tools always come first.
 */
export function getAllToolSchemas(ownerId: string | null): RegisteredTool[] {
  return visibleTo(ownerId);
}

export function getSerializableToolDefs(ownerId: string | null): ToolDef[] {
  return visibleTo(ownerId)
    .filter((t) => validateToolName(t.name))
    .map(({ name, description, parameters }) => ({ name, description, parameters }));
}
```

Update `registerLocalTool`, `registerProviderTools`, `clearRegisteredTools`, and
`getToolSchemaCounts` to take `ownerId` first, stamp `ownerId` onto every tool
they insert, enforce the duplicate check and `MAX_REGISTERED_TOOLS` cap **within
that owner's slice**, and filter by owner respectively. Keep each function's
existing validation logic byte-for-byte; only the scoping changes.

- [ ] **Step 4: Update the consumers**

`src/lib/tool-execution.server.ts:74`:

```ts
export async function getToolApprovalStatus(
  userId: string | undefined,
): Promise<Array<{ name: string; source: string; approved: boolean }>> {
  const schemas = getAllToolSchemas(userId ?? null).filter((t) => t.source !== "built-in");
  // ...rest unchanged...
```

`src/routes/api/tools/schemas.ts` — add the auth gate to both handlers, after the
rate-limit check:

```ts
import { getAuthUserId } from "@/lib/auth.server";
```

GET:

```ts
const userId = await getAuthUserId();
const schemas = getAllToolSchemas(userId ?? null);
const counts = getToolSchemaCounts(userId ?? null);
```

POST:

```ts
const userId = await getAuthUserId();
if (!userId) {
  return Response.json({ error: "Registering a tool requires an account" }, { status: 401 });
}
// ...body parse unchanged...
const ok = registerLocalTool(userId, body);
```

Check the exact export name and signature in `src/lib/auth.server.ts` before
writing the import — use whatever the sibling route
`src/routes/api/tools/permissions.ts` already uses to resolve the user id, so the
two routes stay consistent.

- [ ] **Step 5: Run and verify**

Run: `npx vitest run src/lib/tools.test.ts src/routes/api/-tools-schemas.test.ts` — PASS.
Run: `npx vitest run && npx tsc --noEmit && npx eslint .`

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools.ts src/lib/tools.test.ts src/lib/tool-execution.server.ts src/routes/api/tools/schemas.ts src/routes/api/-tools-schemas.test.ts
git commit -m "fix(tools): scope the schema registry to its owner and gate registration

POST /api/tools/schemas had no auth check and wrote into a process-global
array, so any caller could register a tool that then appeared in every
signed-in user's approval list.

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

    // Pricing: a cost override that renders a distinctive number in Usage.
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
  // Price override must not cross accounts.
  await expect(page.getByTestId("usage-total-cost")).not.toContainText("42.5");
  // Neither may a validated endpoint.
  await expect(page.getByTestId("v1-local-capability-label")).not.toHaveText("Verified ready");
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
  await expect(page.getByTestId("usage-total-cost")).toBeVisible();

  const docs = await page.evaluate(() => {
    const scope = localStorage.getItem("cockpit.local-profile.id") ?? "";
    return JSON.parse(localStorage.getItem(`cockpit.vector-store.v1:${scope}`) ?? "[]").length;
  });
  expect(docs, "local RAG documents must return with the bucket").toBeGreaterThan(0);
}
```

`usage-total-cost` does not exist yet — add
`data-testid="usage-total-cost"` to the total-cost `<span>` in
`src/components/cockpit/settings/UsageSection.tsx:46`, and
`data-testid="v1-local-capability-label"` is already present in `settings.tsx`.

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

- [ ] **Step 6: Run the whole gate**

```bash
npx playwright test e2e/account-separation.spec.ts e2e/v1-local-loop.spec.ts e2e/smoke.spec.ts
```

All three must pass. Report pass/fail per test honestly.

- [ ] **Step 7: Confirm CI gates on it**

Read `.github/workflows/ci.yml`. The `web-e2e` job must run `bun run test:e2e:ci`
(which already includes all three specs) as a **failing** step — not
`continue-on-error`, and not only the non-asserting `runtime-audit`. Fix it if
not.

- [ ] **Step 8: Full verification and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
```

```bash
git add e2e/account-separation.spec.ts src/components/cockpit/settings/UsageSection.tsx .github/workflows/ci.yml
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

**The branch is not done if:** a provider card, tool approval, price number, or
RAG hit is wrong after a switch; the catalog is not 15 entries; any E2E step
fails; or the test count is below 710.

Report per-suite pass/fail honestly. Do not push — the owner publishes.

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

| #   | Already done (verified)                                                                                                                                           | Remaining gap                                                                                                                                               | Task    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | `ACCOUNT_MODE_KEY` + `LOCAL_PROFILE_ID_KEY` persisted; `migrateGuestBucketToLocalProfile` + `ensureLocalProfileId` exist and are wired                            | Key getters still fall back to the literal `"guest"`, and `hydrateAsync()` in undetermined mode **writes** `cockpit.settings.v2:guest` — confirmed by probe | 1       |
| 2   | `__root.tsx` blocks on `hydrateAsync()` behind `AccountLoadingSkeleton`; `fetchMe()` 401 → `returnToLocalProfile()`                                               | One shared `hydrated` flag lets a first-render `getState()` cancel `hydrateAsync()`, stranding server mode at `user: null` — confirmed by probe             | 2       |
| 3   | `IdentityChoiceModal` gates undetermined; `DataMigrationDialog` lives on `/auth`, outside `register()`                                                            | Sign-in never offers the choice; `claimGuestData` defaults to `true` server-side                                                                            | 3       |
| 4   | `authRequest` does **not** push `currentSettings`; `enterServerMode` loads the account bucket before persisting                                                   | Reachable only through the item-3 default; covered by the same fix                                                                                          | 3       |
| 5   | `saveVectorStoreForUser` and `getAllVectorDocsForUser` **already exist** (the brief lists them as missing); threads/stats/settings/costOverrides already bucketed | Validation status is runtime-only; tool registry never cleared; `enterLocalMode` discards the vector store it just loaded                                   | 4, 5, 6 |
| 6   | `e2e/v1-local-loop.spec.ts` already drives the full inspect → ready/missing → model-list → recover loop from a genuine fresh first run                            | Nothing pins the catalog at 15, so deleting 14 entries would still go green                                                                                 | 9, 10   |
| 7   | —                                                                                                                                                                 | ~40 exports reachable from routes                                                                                                                           | 8       |
| 8   | —                                                                                                                                                                 | No facade                                                                                                                                                   | 9       |
| 9   | `claimGuestSession` **already** reassigns exactly `provider_stats`, `threads`, `usage_records`, `vector_docs`; both routes already honour an explicit `false`     | The default is `true`                                                                                                                                       | 3       |
| 10  | `clearOfflineQueue()` called on both switches; `clearVectorStoreCache()` exists                                                                                   | Price/cost-override, tool-permission and tool-registry caches survive the switch                                                                            | 4, 6, 7 |
| 11  | `docs/product-direction.md` §5 specifies the families                                                                                                             | `styles.css` has shadcn defaults only — no provider-status, voice, or media tokens                                                                          | 12      |
| 12  | `e2e/account-separation.spec.ts` covers 15 steps incl. reload-without-flash                                                                                       | Copy and Move branches never run; assertions are thread-titles only                                                                                         | 11      |

**One gap the brief did not name, found while reading the code:**
`POST /api/tools/schemas` has **no authentication check** and writes into a
process-global registry, so any caller — guest included — can register a tool
that then appears in every signed-in user's approval list via
`getToolApprovalStatus`. That is a cross-account leak on the server. Task 6
fixes it.
