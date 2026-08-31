# Edgecase Account Separation — Surface Audit

This document ground-truths the claims in `ACCOUNT_SEPARATION_PLAN.md` against the actual repo. It captures what is correct, what is slightly off, and what is unknown before reconstruction begins.

## Scope of Audit

Files inspected:

- `src/lib/cockpit-store.ts` (1,478 lines — core state, hydration, auth helpers)
- `src/lib/vector-store.ts` (262 lines — RAG memory bucket switching)
- `src/lib/session.server.ts` (127 lines — encrypted cookie session)
- `src/lib/db/index.ts` (1,039 lines — D1, `claimGuestSession`, auth/data isolation)
- `src/routes/api/auth/register.ts` (64 lines)
- `src/routes/api/auth/login.ts` (71 lines)
- `src/routes/api/auth/logout.ts` (18 lines)
- `src/routes/api/auth/me.ts` (24 lines)
- `src/routes/index.tsx` (944 lines — main Cockpit route, OnboardingModal usage)
- `src/components/cockpit/OnboardingModal.tsx` (282 lines)
- `src/components/cockpit/AccountMenu.tsx` (89 lines)
- `src/routes/api/-auth.test.ts` (exists; not fully read yet)
- `src/lib/cockpit-store.test.ts` (exists; not fully read yet)

## ✅ Correct Claims

### Local Storage Scope by `user.id` or `"guest"`

- `getSettingsKey()`, `getThreadsKey()`, `getStatsKey()` all fall back to `"guest"` when `state.user` is null (`cockpit-store.ts:133`, `:149`, `:175`).
- Equivalent explicit helpers exist: `getGuestSettingsKey()`, `getGuestThreadsKey()`, `getGuestStatsKey()` (`:142`, `:158`, `:184`).

### Server-Side D1 Isolation

- `claimGuestSession(guestId, userId)` (`db/index.ts:633`) reassigns `session_id` rows to `user_id` for:
  - `provider_stats`
  - `threads`
  - `usage_records`
  - `vector_docs`
- All auth-scoped queries elsewhere use `user_id` vs `session_id` correctly (e.g. provider keys, user settings, synced threads).

### Auto-Claim on Login/Register

- `register.ts` captures `guestId = await getGuestSessionId()` before `setAuthSession`, then calls `claimGuestSession(guestId, user.id)` (`:49-58`).
- `login.ts` does the same (`:57-65`).
- There is no user choice today; the plan’s goal here is accurate.

### Account Switching Helpers

- `setUser(user)` (`cockpit-store.ts:648`) loads the correct user bucket and clears caches.
- `clearUser()` (`:669`) returns to `"guest"` bucket.
- `loadVectorStoreForUser(userId | null)` (`vector-store.ts:103`) switches RAG bucket.

### Guest/Local is Currently a Fallback

- `AccountMenu.tsx` renders a "guest" explainer when `!user` (`:25-49`).
- Text says: "You’re using Cockpit as a guest. Settings, chats, RAG memory, and usage stats stay on this device only."
- The plan’s reframing to "Local Profile" matches this behavior.

### Hydration Loads `"guest"` Before `fetchMe`

- `hydrate()` is synchronous and immediately reads the guest bucket (`cockpit-store.ts:543-577`).
- It starts `loadVectorStoreForUser(null)` (guest bucket) at `:576`.
- It fires `void fetchMe()` at `:574` as fire-and-forget.
- This confirms the reload flash risk described in the plan.

## ⚠️ Partially Correct / Needs Precision

### 1. Persistent `localProfileId`

The plan proposes `cockpit.local-profile.id` as a stable local identity.

**Current state:** there is no such key today. The guest bucket is keyed literally to `"guest"`, not to a generated local profile id. The plan’s table is conceptually right but technically inaccurate: `localStorage` does **not** currently use a stable UUID; it uses the hardcoded string `"guest"`. Introducing `localProfileId` is a real storage change, not just a rename.

**Implication:** Phase 1 must generate and persist `cockpit.local-profile.id`, then migrate any existing `"guest"` bucket data into `cockpit.settings.v2:<localProfileId>` etc.

### 2. `claimGuestData` Server Parameter

The plan says: "Remove hardcoded `claimGuestSession` from `login.ts` and `register.ts`" and add a `claimGuestData: boolean` body parameter defaulting `true`.

**Reality check:**

- `register.ts` and `login.ts` both call `claimGuestSession` unconditionally today.
- The server-side `claimGuestSession` only migrates **server-side** data from `session_id` to `user_id`.
- The plan’s `Copy` / `Move` / `Keep Separate` choices are intended to control **client-side localStorage** migration, not server-side session migration.
- A `claimGuestData: false` register call would prevent the server from moving `session_id` rows. That is semantically the right lever, but the plan’s wording mixes "server-side guest data" and "local data" in a way that could confuse implementers.

**Implication:** when a user chooses **Keep Separate**, the register request should send `claimGuestData: false`. When they choose **Move**, send `claimGuestData: true` (default). When they choose **Copy**, also send `claimGuestData: false` because the server must not delete the guest session data; the client copies it into the user bucket.

### 3. Vector Store Copy/Move

The plan’s pseudocode in section 2.4 references `saveVectorStoreForUser(userId, docs)` and `getAllMemoryDocs()`.

**Reality check:**

- `vector-store.ts` has `loadVectorStoreForUser`, `searchVectorStoreForUser`, `addVectorDocsForUser`, and `clearVectorStoreCache`.
- It does **not** expose `saveVectorStoreForUser()` or `getAllMemoryDocs()`.
- `addVectorDocsForUser` exists but does not replace; it only appends deduplicated docs by id.

**Implication:** implementers must add:

- `export function saveVectorStoreForUser(userId: string | null, docs: VectorDoc[]): void`
- `export function getAllVectorDocsForUser(userId: string | null): VectorDoc[]`
- Or clear + re-add via existing helpers. Plan’s pseudocode needs adjustment.

### 4. First-Launch Identity Gate in `src/routes/index.tsx`

The plan proposes replacing the unconditional `<OnboardingModal />` with an identity gate.

**Reality check:**

- `src/routes/index.tsx` imports `OnboardingModal` at line 36 but the file was truncated before the render portion was reached.
- Search results did not show `OnboardingModal` rendered inside `index.tsx`; it may be rendered via a different route or via `useOnboardingState`.
- Need to inspect lines 500-944 of `index.tsx` to confirm where and how `OnboardingModal` is currently invoked.

**Implication:** before implementing the identity gate, verify the actual render site. The plan assumes `index.tsx` but the evidence is incomplete.

### 5. Logout Cookie Behavior

The plan says: "Keep the `id` (session UUID) in the cookie so the local profile's CSRF continuity is preserved. Do NOT clear `guestSessionId`."

**Reality check:**

- `session.server.ts` already keeps `id` during `clearAuthSession()` (`:53-56`).
- `logout.ts` calls `clearAuthSession()` and `clearGuestSessionId()` — the latter removes `guestSessionId` from the session.
- `getGuestSessionId()` regenerates a new `guestSessionId` from `s.data.id` if missing.

**Implication:** the plan is mostly correct. After logout, the same `id` remains and a fresh `guestSessionId` is created on the next anonymous request. Local profile CSRF continuity is preserved because `id` does not change. The plan’s recommendation to "regenerate" rather than clear is consistent with current behavior (clearing triggers regeneration next call). No code change is strictly necessary here unless we want to avoid the regeneration step by keeping `guestSessionId` as the local profile id itself.

### 6. Offline Queue

The plan mentions `cockpit.offline-queue.v1` as a global queue that needs clearing on switch.

**Reality check:** no file search result returned a match for `offline-queue` in the inspected files. This may exist in `use-chat.ts` or a hook not yet audited.

**Implication:** verify whether an offline queue still exists and is actually used. If not, this risk can be downgraded.

### 7. `authRequest` Does Not Persist `accountMode`

The plan assumes `enterServerMode(user)` will persist `accountMode = 'server'` to `localStorage`.

**Reality check:**

- `authRequest` in `cockpit-store.ts:1096` sets `state.user` and switches the bucket but does not write `localStorage` account metadata.
- `enterServerMode` / `enterLocalMode` do not yet exist.

**Implication:** these new helpers must be responsible for persisting `cockpit.account.mode` and reading it during `hydrateAsync()`.

## ❌ Discrepancies / Things the Plan Got Wrong

### A. `src/routes/auth.tsx` May Not Exist

- Search for `src/routes/auth.tsx` returned zero results.
- The auth route likely uses TanStack Start file-based routing elsewhere, or is named `src/routes/(auth).tsx` or `src/routes/login.tsx`.

**Implication:** the plan’s file-by-file table references `src/routes/auth.tsx` but this file path is unverified. Find the actual auth route before wiring the `DataMigrationDialog`.

### B. `DataMigrationDialog` Trigger Point

The plan says: "Wire it into the register flow when previous mode was `local-only`."

**Reality check:**

- `register()` in `cockpit-store.ts:1207` is a thin wrapper around `authRequest()`.
- There is no UI flow file yet to receive the migration prompt.

**Implication:** the migration dialog must be triggered from the actual register page component, not from `register()` itself. Need to locate that component.

### C. Server-Side Settings Sync

The plan says settings sync only fires when `state.user` is set.

**Reality check:**

- `updateSettings` calls `syncSettingsToServer(patch)` only if `state.user` is truthy (`cockpit-store.ts:744-746`).
- However, `authRequest` calls `loadSettingsFromServer()` after login (`:1132`), which may overwrite local settings with server settings.
- For local-only mode, no server sync happens, which is correct.

**Implication:** during a **Copy** or **Move** migration, the user’s local settings must be preserved until explicitly copied into the user bucket. `authRequest` currently carries `currentSettings` into the user bucket if no user-local settings exist (`:1114-1126`). This could inadvertently merge local settings into the server account even when the user chose **Keep Separate** if we are not careful.

## 🔍 Unknowns Requiring Further Inspection

1. **Where is `OnboardingModal` actually rendered?** Need to read `src/routes/index.tsx:500-944` and search for `useOnboardingState` / `OnboardingModal` usages.
2. **Where is the auth/register page component?** Search `src/routes/**` for `register`, `login`, `Sign in`, etc.
3. **Does an offline queue exist?** Search `src/hooks/use-chat.ts` and `src/lib/` for `offline` / `queue`.
4. **What tests currently assert guest/server isolation?** Read `src/lib/cockpit-store.test.ts` around lines 657-875 (guest bucket tests, user switch tests).
5. **Are there other consumers of `setUser(null)` / `clearUser()`?** Search usages outside tests.
6. **Is `syncThreadsEnabled` actually used?** It appears in `Settings` type and DB but its UI/behavior is not yet audited.

## Pre-Reconstruction Recommendations

Before writing `RECONSTRUCTION_PLAN.md`, answer the six unknowns above. The most critical are:

- Confirm the OnboardingModal render site.
- Confirm the register/login page components and paths.
- Read the relevant test files to understand existing assertions.

These answers will determine whether the identity gate lives in `index.tsx`, a layout, or a TanStack Start `_layout.tsx`, and where the migration dialog is injected.

## Risk Summary

| Area                                     | Risk Level | Notes                                                                        |
| ---------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| Storage scope rename to `localProfileId` | Medium     | Requires one-time migration of existing `"guest"` buckets.                   |
| Hydration flash fix                      | Medium     | Making hydration async touches the app bootstrap and may affect SSR/Workers. |
| Server `claimGuestData` parameter        | Low        | Straightforward Zod change; backward compatible if default `true`.           |
| Vector store copy/move helpers           | Low        | Additive change, isolated to `vector-store.ts`.                              |
| Auth route/component discovery           | Medium     | Cannot wire UI until exact paths/components are known.                       |
| Offline queue clearing                   | Unknown    | Verify existence first.                                                      |

---

_Generated as the next document after `ACCOUNT_SEPARATION_PLAN.md`. Feed its unknowns into `RECONSTRUCTION_PLAN.md` once resolved._
