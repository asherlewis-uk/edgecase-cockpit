# Edgecase Account Separation — Implementation Plan

> **Archived.** Superseded by `docs/superpowers/plans/2026-09-02-v1-isolation-and-contract.md`. Kept for the reasoning, not as current instruction.

## Executive Summary

No path or system blockers were found. The existing architecture already supports per-account localStorage scoping (`user.id` buckets) and server-side D1 isolation (`user_id` vs `session_id`). The gaps are purely **behavioral and UX-level**:

1. First launch implicitly starts as "guest" with no explicit identity choice.
2. Guest data is auto-claimed on login/register with no user choice.
3. The UI treats "guest" as a temporary state, not a persistent local profile.
4. Hydration loads the `"guest"` bucket before `fetchMe` resolves, causing a flash of local data on reload for authenticated users.

All are safely fixable within the current stack (React 19, TanStack, Cloudflare Workers, D1).

---

## 1. The Safest Approach: Minimum Structural Change

Rather than rebuilding storage or auth, we **reframe the existing architecture**:

| Current Concept                    | New Concept                                                      | Change                               |
| ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| `user === null` (guest)            | `accountMode === 'local-only'`                                   | Rename/refactor only                 |
| `localStorage` key scope `"guest"` | `localStorage` key scope `"local"` + persistent `localProfileId` | Storage key change + UUID generation |
| Auto-claim on login/register       | User-initiated claim with `copy / move / keep-separate` choice   | API + UI change                      |
| Onboarding wizard first            | Identity choice first, then onboarding                           | UI flow change                       |
| Fire-and-forget `fetchMe`          | Blocking hydration until account resolved                        | Async init change                    |

**Why this is safe:**

- No database schema changes required.
- No encryption or secure storage changes required.
- Local-only users already use local providers (no cloud API keys needed per current onboarding).
- Existing user data (`user.id` buckets) is untouched.
- Rollback is trivial: revert the identity choice gate and restore the old onboarding flow.

---

## 2. Architectural Changes

### 2.1 Local Profile Identity

**Goal:** Make the local profile a persistent, first-class identity, not a transient fallback.

**Implementation:**

1. **Generate a persistent local profile ID** on first launch:

   ```ts
   // localStorage key: cockpit.local-profile.id
   const localProfileId = localStorage.getItem("cockpit.local-profile.id") ?? crypto.randomUUID();
   localStorage.setItem("cockpit.local-profile.id", localProfileId);
   ```

   This ID survives cookie clears, reinstalls of the browser shell, and logout cycles. It is the stable identity for the local profile.

2. **Replace `"guest"` storage scope with `localProfileId`:**
   - `getGuestSettingsKey()` → `getLocalProfileSettingsKey()`
   - `getGuestThreadsKey()` → `getLocalProfileThreadsKey()`
   - `getGuestStatsKey()` → `getLocalProfileStatsKey()`
   - `getGuestStoreKey()` (vector store) → `getLocalProfileStoreKey()`

3. **Store the `accountMode` explicitly:**
   ```ts
   type AccountMode = "local-only" | "server" | "undetermined";
   localStorage.setItem("cockpit.account.mode", mode);
   ```
   `undetermined` is the state before the user has made their first-launch choice. The app blocks on this.

### 2.2 First-Launch Identity Choice Gate

**Goal:** Never start a user in an ambiguous state.

**Implementation:**

1. **Replace the unconditional `<OnboardingModal />` in `src/routes/index.tsx`** with a conditional gate:

   ```tsx
   if (accountMode === "undetermined") {
     return <IdentityChoiceModal />;
   }
   if (!settings.onboardingCompleted) {
     return <OnboardingModal />;
   }
   ```

2. **Create `src/components/cockpit/IdentityChoiceModal.tsx`:**
   Three explicit, equal-weighted choices:
   - **"Create Server Account"** → Sets `accountMode = 'server'`, then navigates to `/auth?mode=register` (or shows register inline).
   - **"Sign In to Existing Account"** → Sets `accountMode = 'server'`, then navigates to `/auth?mode=login`.
   - **"Use Local-Only Profile"** → Sets `accountMode = 'local-only'`, generates `localProfileId`, completes onboarding, then shows the normal onboarding wizard.

3. **The choice is irreversible without explicit action.** The user must click one of the three buttons. There is no "skip" or "close X" that enters an ambiguous state.

### 2.3 Account Mode Switching

**Goal:** Switching between local-only and server accounts must be visible, reversible, and isolated.

**Implementation:**

1. **Add `accountMode` to `cockpit-store.ts` `State`:**

   ```ts
   type State = {
     // ... existing fields
     accountMode: AccountMode;
     localProfileId: string | null;
   };
   ```

2. **Refactor `setUser(user)` to `enterServerMode(user)`:**
   - Loads the user's scoped `localStorage` bucket (`user.id`).
   - Sets `accountMode = 'server'`.
   - Clears runtime caches (`providerKeyStatus`, `providerValidationStatus`, `stats`).
   - Switches vector store to `user.id` bucket.
   - Persists `accountMode` to `localStorage`.

3. **Refactor `clearUser()` to `enterLocalMode()`:**
   - Loads the local profile's scoped `localStorage` bucket (`localProfileId`).
   - Sets `accountMode = 'local-only'`.
   - Clears runtime caches.
   - Switches vector store to `localProfileId` bucket.
   - Persists `accountMode` to `localStorage`.

4. **Update `AccountMenu.tsx`:**
   - Show "Local Profile" as the active identity when `accountMode === 'local-only'`.
   - Show the user's email/display name when `accountMode === 'server'`.
   - Add a "Switch to Local Profile" option when in server mode.
   - Add a "Sign In / Create Account" option when in local mode.

### 2.4 Data Migration on Sign-Up (Copy / Move / Keep-Separate)

**Goal:** When a local-only user creates a server account, they must choose what happens to their local data.

**Implementation:**

1. **Remove hardcoded `claimGuestSession` from `login.ts` and `register.ts`:**
   - Change the server handlers to accept an optional `claimGuestData: boolean` body parameter (default `true` for backward compatibility).
   - Only call `claimGuestSession(guestId, user.id)` if `claimGuestData === true`.

2. **Add a `DataMigrationDialog` component:**
   - Shown immediately after successful registration (before the main UI is entered).
   - Three options:
     - **Copy:** `copyLocalToServer(user.id)` — copies local settings, threads, stats, and vector store into the `user.id` bucket. Leaves the local profile intact. Server call: `claimGuestData: false` (server-side guest data is irrelevant for local-only users; local data never touched the server).
     - **Move:** `moveLocalToServer(user.id)` — copies local data to `user.id` bucket, then clears the local profile bucket. Server call: `claimGuestData: true` (if any server-side guest data exists, it gets migrated too; this is the current behavior).
     - **Keep Separate:** `startFreshServer(user.id)` — leaves the local profile untouched. Server call: `claimGuestData: false`. The server account starts empty.

3. **Client-side copy/move functions:**

   ```ts
   function copyLocalToServer(userId: string) {
     const localSettings = localStorage.getItem(getLocalProfileSettingsKey());
     const localThreads = localStorage.getItem(getLocalProfileThreadsKey());
     const localStats = localStorage.getItem(getLocalProfileStatsKey());
     if (localSettings) localStorage.setItem(getSettingsKeyForUser(userId), localSettings);
     if (localThreads) localStorage.setItem(getThreadsKeyForUser(userId), localThreads);
     if (localStats) localStorage.setItem(getStatsKeyForUser(userId), localStats);
     // Vector store: deep-copy the array
     loadVectorStoreForUser(localProfileId);
     const docs = getAllMemoryDocs(); // hypothetical
     saveVectorStoreForUser(userId, docs);
   }
   ```

4. **After migration, call `enterServerMode(user)`** to switch the runtime state to the new server account.

### 2.5 Logout Behavior

**Goal:** Logging out from a server account must return to the local profile, not an empty guest state.

**Implementation:**

1. **Update `logout()` in `cockpit-store.ts`:**
   - After the `/api/auth/logout` call succeeds, call `enterLocalMode()` instead of `clearUser()`.
   - The local profile's `localStorage` data is loaded into state.
   - `accountMode` is set to `'local-only'`.

2. **Update `logout.ts` API handler:**
   - Currently clears `userId`, `userEmail`, and `guestSessionId` from the cookie.
   - Keep the `id` (session UUID) in the cookie so the local profile's CSRF continuity is preserved. Do NOT clear `guestSessionId` because we want the local profile to have a stable session for rate-limiting. Or better: regenerate a fresh `guestSessionId` but keep the same session `id`.

3. **Update `fetchMe()`:**
   - If `/api/auth/me` returns 401, call `enterLocalMode()` instead of loading the `"guest"` bucket.
   - This ensures that after a cookie expires or is cleared, the app returns to the local profile, not an anonymous guest.

### 2.6 Hydration / Reload Isolation

**Goal:** After page reload, the correct account's data is shown immediately with no flash of the wrong account.

**Implementation:**

1. **Make `hydrate()` async and blocking:**
   - Currently `hydrate()` is synchronous and calls `void fetchMe()`.
   - Change the app initialization to await `fetchMe()` before rendering the main UI.
   - During the await, show a loading spinner (not the local profile data, not the previous user's data).

2. **Update `src/routes/index.tsx` or `src/router.tsx`:**

   ```tsx
   const [initializing, setInitializing] = useState(true);
   useEffect(() => {
     store.hydrateAsync().then(() => setInitializing(false));
   }, []);
   if (initializing) return <AccountLoadingSkeleton />;
   ```

3. **Implement `hydrateAsync()` in `cockpit-store.ts`:**

   ```ts
   async function hydrateAsync() {
     if (hydrated || typeof window === "undefined") return;
     hydrated = true;
     const mode = readAccountMode();
     const localProfileId = readLocalProfileId();
     if (mode === "server") {
       // Try to restore the server user
       const user = await fetchMe();
       if (user) {
         enterServerMode(user);
       } else {
         // Session expired or invalid; fall back to local profile
         enterLocalMode();
       }
     } else {
       // Local-only or undetermined
       enterLocalMode();
     }
     setupCrossTabSync();
     persist();
   }
   ```

4. **Remove the synchronous `hydrate()` function** to prevent the flash.

---

## 3. File-by-File Implementation Plan

### Client-Side (UI & State)

| File                                             | Change                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/cockpit-store.ts`                       | Add `accountMode`, `localProfileId` to `State`. Rename guest keys → local profile keys. Add `hydrateAsync()`, `enterServerMode()`, `enterLocalMode()`. Update `persist()` to strip `apiKey` (unchanged). Update `logout()` to return to local profile. Update `authRequest()` to support data migration. |
| `src/lib/vector-store.ts`                        | Add `getLocalProfileStoreKey()`, `saveVectorStoreForUser()`. Update `loadVectorStoreForUser()` to accept `localProfileId`.                                                                                                                                                                               |
| `src/components/cockpit/IdentityChoiceModal.tsx` | **New.** First-launch gate. Three explicit buttons. No skip.                                                                                                                                                                                                                                             |
| `src/components/cockpit/DataMigrationDialog.tsx` | **New.** Shown after registration from local mode. Copy / Move / Keep Separate.                                                                                                                                                                                                                          |
| `src/components/cockpit/OnboardingModal.tsx`     | Update to only show after identity choice is made and `accountMode !== 'undetermined'`.                                                                                                                                                                                                                  |
| `src/components/cockpit/AccountMenu.tsx`         | Update labels: "Guest" → "Local Profile". Add "Switch to Local Profile" / "Sign In" actions.                                                                                                                                                                                                             |
| `src/routes/index.tsx`                           | Add `initializing` gate. Render `IdentityChoiceModal` when `accountMode === 'undetermined'`.                                                                                                                                                                                                             |
| `src/routes/auth.tsx`                            | After successful registration, check if previous mode was `local-only`. If so, show `DataMigrationDialog` before redirecting to `/`.                                                                                                                                                                     |

### Server-Side (API)

| File                              | Change                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/routes/api/auth/register.ts` | Add `claimGuestData?: boolean` to Zod body schema. Only call `claimGuestSession` if `claimGuestData !== false`.                            |
| `src/routes/api/auth/login.ts`    | Add `claimGuestData?: boolean` to Zod body schema. Only call `claimGuestSession` if `claimGuestData !== false`.                            |
| `src/routes/api/auth/logout.ts`   | Keep `guestSessionId` in the cookie (or regenerate it) so the local profile retains session continuity. Do not delete the cookie entirely. |
| `src/routes/api/auth/me.ts`       | Unchanged. Returns 401 when no auth session.                                                                                               |

### Tests

| File                                          | Change                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/api/-auth.test.ts`                | Update register/login tests to pass `claimGuestData: false` where auto-claim is not desired. Add test for `claimGuestData: true` (default). |
| `src/routes/api/-account-separation.test.ts`  | Add E2E-style tests: local profile → sign up → keep separate → logout → local profile returns.                                              |
| `src/components/cockpit/AccountMenu.test.tsx` | Update assertions: "Guest" → "Local Profile".                                                                                               |
| `src/lib/cockpit-store.test.ts` (or add)      | Add tests for `enterServerMode`, `enterLocalMode`, `hydrateAsync`, data migration.                                                          |

---

## 4. E2E Acceptance Flow Mapping

| Step | Requirement                                  | How the Plan Satisfies It                                                                                                                                 |
| ---- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Fresh browser install                        | `accountMode` defaults to `undetermined`. `localProfileId` is generated on first choice.                                                                  |
| 2    | First launch shows identity choice           | `IdentityChoiceModal` blocks all other UI when `accountMode === 'undetermined'`.                                                                          |
| 3    | Choose local-only profile                    | Sets `accountMode = 'local-only'`. Generates `localProfileId`. Onboarding proceeds.                                                                       |
| 4    | Create local chat, settings, provider config | Data is stored in `localStorage` keyed by `localProfileId`. Server is not involved.                                                                       |
| 5    | Sign up as User A                            | User fills register form. Client sends `claimGuestData: false` (because we want to handle migration client-side).                                         |
| 6    | Confirm copy/move/keep-separate              | `DataMigrationDialog` is shown. User chooses. Local data is copied/moved/kept in `localProfileId` bucket.                                                 |
| 7    | Create User A data                           | New threads/settings go into `user-a` `localStorage` bucket and server-side `user_id` scope.                                                              |
| 8    | Log out                                      | `/api/auth/logout` clears auth. `enterLocalMode()` loads `localProfileId` bucket.                                                                         |
| 9    | Local profile data returns                   | `localStorage` for `localProfileId` is untouched (if "keep separate" or "copy" was chosen) or empty (if "move" was chosen). User A's data is not visible. |
| 10   | Sign in as User B                            | `authRequest` loads `user-b` bucket. Server-side queries use `user-b` `user_id`.                                                                          |
| 11   | User B sees none of User A / local data      | `localStorage` for `user-b` is separate. Server-side D1 queries are scoped by `user-b`. `providerKeyStatus` is cleared on switch.                         |
| 12   | Reload page                                  | `hydrateAsync()` blocks UI. `fetchMe()` returns User B. `enterServerMode(userB)` loads `user-b` bucket.                                                   |
| 13   | User B still isolated after hydration        | `hydrateAsync()` only loads the resolved account. No flash of local data.                                                                                 |
| 14   | Log out                                      | Same as step 8. Returns to `localProfileId` bucket.                                                                                                       |
| 15   | Local profile data returns again             | Same as step 9.                                                                                                                                           |
| 16   | Sign back in as User A                       | `authRequest` loads `user-a` bucket.                                                                                                                      |
| 17   | User A data returns; User B/local absent     | `user-a` bucket is isolated. `user-b` and `localProfileId` are not loaded.                                                                                |

---

## 5. Risk Mitigation & Edge Cases

| Risk                                | Mitigation                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cross-user localStorage leakage** | Each server account has a `user.id` bucket. Local profile has a `localProfileId` bucket. No shared keys.                                                                                                                                                                                                                                                      |
| **Memory cache leakage**            | `enterServerMode()` and `enterLocalMode()` clear `providerKeyStatus`, `providerValidationStatus`, and `stats`. Vector store cache is switched via `loadVectorStoreForUser()`.                                                                                                                                                                                 |
| **Guest data auto-claim on login**  | Server handlers now require `claimGuestData: true` to run `claimGuestSession`. Default is `true` for backward compatibility, but the client explicitly passes `false` for local-to-server transitions.                                                                                                                                                        |
| **Local profile ID loss**           | `localProfileId` is stored in `localStorage` and never deleted. Even if the user clears cookies, the local profile data survives. Only a full `localStorage` clear would erase it, which is equivalent to a factory reset.                                                                                                                                    |
| **Offline queue leakage**           | The offline queue (`cockpit.offline-queue.v1`) is global. Add a `clearOfflineQueue()` call in `enterServerMode()` and `enterLocalMode()` to prevent queued prompts from being sent under the wrong account.                                                                                                                                                   |
| **Provider key status leakage**     | `providerKeyStatus` is already cleared on account switch. After login, `refreshProviderKeyStatus()` fetches keys for the new user only.                                                                                                                                                                                                                       |
| **Settings sync confusion**         | `syncSettingsToServer()` only fires when `state.user` is set. In local mode, settings are local-only. Server settings are fetched only on `enterServerMode()`.                                                                                                                                                                                                |
| **First-launch existing users**     | Users who already have data in the old `"guest"` bucket will need a one-time migration. The `hydrateAsync()` function can detect the absence of `localProfileId` and `accountMode` and run a migration: generate `localProfileId`, copy `"guest"` data into the new local profile bucket, set `accountMode = 'local-only'`. This preserves all existing data. |

---

## 6. Implementation Order (Safest Sequence)

1. **Phase 1: Rename & Refactor (No UX change yet)**
   - Add `localProfileId`, `accountMode` to `cockpit-store.ts`.
   - Rename guest keys to local profile keys.
   - Add `hydrateAsync()`, `enterServerMode()`, `enterLocalMode()`.
   - Ensure all existing tests pass.

2. **Phase 2: API Changes**
   - Add `claimGuestData` parameter to `register.ts` and `login.ts`.
   - Update logout to preserve local session continuity.
   - Add/update server tests.

3. **Phase 3: Identity Choice UI**
   - Create `IdentityChoiceModal.tsx`.
   - Gate the main route on `accountMode === 'undetermined'`.
   - Update `OnboardingModal` to only show after identity is chosen.

4. **Phase 4: Migration Dialog**
   - Create `DataMigrationDialog.tsx`.
   - Wire it into the register flow when previous mode was `local-only`.

5. **Phase 5: Account Menu & Switching**
   - Update `AccountMenu.tsx` to show local profile as a real mode.
   - Add explicit switch actions.

6. **Phase 6: E2E Tests & Validation**
   - Write the 17-step E2E test against the actual browser.
   - Fix any leakage found during testing.

---

## 7. No Blockers Found

The following were evaluated and ruled out as blockers:

- **Schema migrations:** Not required. Existing `user_id` / `session_id` isolation is sufficient.
- **Encryption / secure storage:** Not required for this scope. Local-only users already use local providers (no cloud API keys). The existing `apiKey` stripping in `persist()` is unchanged.
- **Native bridge changes:** Not required. `localStorage` is sufficient for the local profile bucket.
- **Cross-tab sync:** The existing `storage` event listener dynamically resolves keys based on `state.user`, so it works correctly after the rename.
- **Cookie model:** The TanStack Start encrypted cookie session can hold both `userId` and `guestSessionId` (or just a stable `id` for local profile CSRF). No structural changes needed.
