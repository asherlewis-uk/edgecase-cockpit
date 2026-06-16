# Implementation Plan: Real User Accounts Architecture

## Objective

Migrate `edgecase-cockpit` from an anonymous encrypted-cookie-session architecture to a real user-account architecture with:
- User-scoped backend storage for settings, provider keys, model configs, and preferences
- Encrypted provider keys stored server-side only (never exposed to client)
- Offline-first chat by default with opt-in sync per user or per thread
- Anonymous guest mode that can be claimed by a newly created account
- Account separation enforced by tests

## Execution Strategy

Passes are **sequential** (each builds on the previous). Within a pass, independent subtasks may be delegated to sub-agents. The main agent integrates all changes, runs validation, and updates the todo list before proceeding to the next pass.

## Pass 1: Schema and Auth Model

### 1.1 Database Schema Changes

New tables to create in `src/lib/db/schema.sql` and a new migration file:

```sql
-- User-scoped provider keys (encrypted at application level before storage)
CREATE TABLE IF NOT EXISTS user_provider_keys (
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL, -- AES-256-GCM encrypted, never plaintext
  base_url TEXT,
  model TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User settings / preferences
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL DEFAULT '{}', -- normalized UserProfile JSON
  personalization_json TEXT NOT NULL DEFAULT '{}', -- normalized Personalization JSON
  keyboard_shortcuts_json TEXT NOT NULL DEFAULT '{}',
  rag_json TEXT NOT NULL DEFAULT '{}',
  active_provider_id TEXT,
  pinned_provider_ids_json TEXT NOT NULL DEFAULT '[]',
  cost_overrides_json TEXT,
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  sync_threads_enabled INTEGER NOT NULL DEFAULT 0, -- global user-level opt-in
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Guest sessions (anonymous mode, clearly separate from users)
CREATE TABLE IF NOT EXISTS guest_sessions (
  id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL DEFAULT '{}', -- ephemeral guest data
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Alter threads table: add sync_enabled column
ALTER TABLE threads ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 0;
-- Add is_local flag to distinguish local-only threads from synced ones
ALTER TABLE threads ADD COLUMN is_local INTEGER NOT NULL DEFAULT 1;
```

### 1.2 Auth Model Updates

- `src/lib/auth.server.ts`: Keep existing `User` type and password hashing. Add functions:
  - `claimGuestSession(guestSessionId: string, userId: string)` — migrates guest session data to user account
  - `deleteGuestSession(guestSessionId: string)` — cleanup after claim or expiry

- `src/lib/session.server.ts`:
  - Remove `providers` from `SessionData` (keys no longer in session cookie)
  - Add `guestSessionId?: string` for anonymous guest mode
  - `getCockpitSession()` should still create a session ID, but if no user is logged in, it should create a `guest_sessions` row instead of pretending to be a real user
  - Update `getAuthUserId` to return `undefined` for guest sessions (not conflated with real users)

### 1.3 New DB Layer Functions

In `src/lib/db/index.ts`, add:
- `getUserProviderKey(userId, providerId)` — returns encrypted key + metadata
- `setUserProviderKey(userId, providerId, encryptedKey, baseUrl?, model?)`
- `clearUserProviderKey(userId, providerId?)`
- `getUserSettings(userId)` — returns parsed settings
- `setUserSettings(userId, settings)` — persists settings
- `createGuestSession(id, data)` — creates guest session row
- `getGuestSession(id)` — returns guest data
- `deleteGuestSession(id)` — cleanup
- `claimGuestSession(guestId, userId)` — migrates threads/stats/usage/vector-docs from guest to user
- `getThreadSyncEnabled(sessionId, userId, threadId)` — checks if thread should sync
- `setThreadSyncEnabled(...)` — toggle per-thread sync

### 1.4 Validation
- Run `bun run typecheck` after all schema and type changes
- Ensure new tables have proper indexes

## Pass 2: User-Scoped Settings/Config/Provider Credential Storage

### 2.1 Backend: Encrypted Provider Key Storage

- Create `src/lib/encryption.server.ts` — AES-256-GCM encryption using `SESSION_SECRET` or a dedicated `ENCRYPTION_KEY` env var
  - `encrypt(plaintext: string): string` — returns `iv:ciphertext:authTag` hex string
  - `decrypt(ciphertext: string): string`

- Update `src/routes/api/keys/set.ts`:
  - If authenticated: encrypt the key and store in `user_provider_keys` table
  - If guest: reject with 401 (guests cannot store provider keys; this forces account creation or keeps keys local-only)

- Update `src/routes/api/keys/clear.ts`:
  - Clear from `user_provider_keys` table for authenticated users

- Update `src/routes/api/keys/status.ts`:
  - For authenticated users: query `user_provider_keys` table
  - Return `{ hasKey: boolean, baseUrl?: string, model?: string }` — **never return `apiKey` plaintext**
  - For guests: return empty map (guests have no server-stored keys)

- Update `src/routes/api/keys/validate.ts` and `validate.$providerId.ts`:
  - Fetch encrypted key from `user_provider_keys`, decrypt server-side, then validate
  - Never return the decrypted key to the client

- Update `src/routes/api/proxy/chat.ts`:
  - Fetch encrypted key from `user_provider_keys` for authenticated users
  - Decrypt server-side before proxying
  - For guests: return 401 (guests cannot use cloud providers via proxy; they must use local providers or create an account)

### 2.2 Backend: User-Scoped Settings API

- New route: `src/routes/api/settings.ts`
  - `GET /api/settings` — returns user settings from `user_settings` table (never includes provider keys)
  - `POST /api/settings` — updates user settings in `user_settings` table
  - Returns 401 for guests

- Update `src/routes/api/stats.ts` and `src/routes/api/usage.ts`:
  - Ensure all reads/writes use `user_id` when authenticated, and reject guest sessions (no stats tracking for guests)

- Update `src/routes/api/vector-docs.ts`:
  - For authenticated users: read/write `user_id` scoped
  - For guests: return 401 (no server-side vector docs for guests)

### 2.3 Frontend: Settings Sync

- Update `src/lib/cockpit-store.ts`:
  - On hydration, if user is authenticated (`/api/auth/me` returns 200), fetch `/api/settings` and merge with localStorage defaults
  - Settings from server take precedence for authenticated users
  - Keep localStorage as fallback for guests and offline mode
  - When settings change, POST to `/api/settings` (fire-and-forget; localStorage is still primary for UI responsiveness)

- Update `src/lib/cockpit-store.ts` provider key handling:
  - `refreshProviderKeyStatus()` should call `/api/keys/status` — if user is authenticated, it shows server-stored keys; if guest, shows empty
  - Remove `migrateLocalKeysToServer` — this legacy migration is no longer needed because keys are now stored properly

### 2.4 Validation
- `bun run test` — fix all key-related tests
- `bun run typecheck`
- Verify that `/api/keys/status` never returns `apiKey` in any circumstance

## Pass 3: Offline-First Chat Ownership and Opt-In Sync Model

### 3.1 Schema: Thread Sync Flag

- Ensure `threads` table has:
  - `sync_enabled INTEGER NOT NULL DEFAULT 0`
  - `is_local INTEGER NOT NULL DEFAULT 1`
  - Remove `session_id` foreign key (or keep it only for guest sessions, not for authenticated users)
  - For authenticated users: `user_id` is required, `session_id` is nullable

### 3.2 Backend: Conditional Thread Persistence

- Update `src/routes/api/threads.ts`:
  - `POST /api/threads`: If `sync_enabled` is false (default), return 200 with `{ ok: true, thread, localOnly: true }` but do NOT write to D1
  - If `sync_enabled` is true, write to D1 and set `is_local = 0`
  - `GET /api/threads`: Only return threads where `sync_enabled = 1` AND `is_local = 0` (i.e., actually synced threads)
  - `DELETE /api/threads`: Only delete synced threads

- Update `src/routes/api/threads.$id.ts`:
  - `GET /api/threads/$id`: If thread is local-only (`is_local = 1`), return 404 from backend (frontend should read from localStorage)
  - `PATCH /api/threads/$id`: Only allow updates on synced threads
  - `DELETE /api/threads/$id`: Only allow deletion on synced threads

- Update `src/routes/api/threads.import.ts`:
  - Add a `mode` parameter: `"local"` (default) or `"sync"`
  - `"local"`: do not write to D1; return the threads so the frontend can store them in localStorage
  - `"sync"`: write to D1 with `sync_enabled = 1, is_local = 0`

- Update `src/routes/api/threads.$id.export.ts`:
  - For synced threads: read from D1
  - For local threads: return 404 (frontend exports from localStorage)
  - Add a note that export is an offline-transfer mechanism; the frontend localStorage export is the primary path

- Update `src/routes/api/threads.$id.fork.ts` and `threads.$id.pin.ts`:
  - Only operate on synced threads

### 3.3 Frontend: Offline-First by Default

- Update `src/lib/cockpit-store.ts`:
  - Add `syncThreadsEnabled?: boolean` to `Settings` type (default `false`)
  - `newThread()`: Create threads as `is_local = true` by default; only set `sync_enabled = true` if user has explicitly enabled global sync or per-thread sync
  - Add `setThreadSyncEnabled(threadId: string, enabled: boolean)` method
  - Add `enableGlobalSync()` / `disableGlobalSync()` methods that update settings and POST to backend

- Update `src/hooks/use-chat.ts`:
  - After a message is sent, if the thread is synced, trigger an async background sync to `/api/threads/$id` (PATCH)
  - If offline, queue the sync for later

### 3.4 Validation
- `bun run test` — thread tests must reflect the new sync model
- `bun run typecheck`
- Verify that `GET /api/threads` returns empty array for a user who has never enabled sync

## Pass 4: Migration from Anonymous Session to User Account

### 4.1 Guest Session Lifecycle

- Update `src/lib/session.server.ts`:
  - When no user is authenticated, generate a `guestSessionId` (UUID) instead of a generic `session.id`
  - Store this in `guest_sessions` table with a TTL (e.g., 30 days)
  - The guest session should have a clear `expires_at` field

- Update `src/routes/api/auth/register.ts`:
  - After creating the user and setting auth session, call `claimGuestSession(guestSessionId, userId)`
  - This migrates any threads, stats, usage records, and vector docs from the guest session to the new user account
  - Delete the guest session row after successful claim

- Update `src/routes/api/auth/login.ts`:
  - After successful login, call `claimGuestSession(guestSessionId, userId)` to migrate any current guest data
  - Delete the guest session row after successful claim

### 4.2 DB Layer: Claim Logic

In `src/lib/db/index.ts`, implement `claimGuestSession(guestId, userId)`:
- Update all `threads` rows where `session_id = guestId` → set `user_id = userId`, `session_id = null`
- Update all `provider_stats` rows where `session_id = guestId` → set `user_id = userId`, `session_id = null`
- Update all `usage_records` rows where `session_id = guestId` → set `user_id = userId`, `session_id = null`
- Update all `vector_docs` rows where `session_id = guestId` → set `user_id = userId`, `session_id = null`
- Delete the `guest_sessions` row

### 4.3 Frontend: Account Creation Flow

- Update onboarding / auth UI (if any) to clearly distinguish guest mode from authenticated mode
- When a user creates an account, the frontend should preserve localStorage data and expect it to be migrated server-side after login/registration

### 4.4 Validation
- `bun run test`
- `bun run typecheck`

## Pass 5: Account Separation Tests

### 5.1 New Test Suite: `src/routes/api/-account-separation.test.ts`

Write comprehensive tests that prove:

1. **User A cannot read User B settings:**
   - Register User A, set settings via `/api/settings`
   - Register User B, `GET /api/settings` — must NOT return User A's data
   - Verify `userId` scoping in `user_settings` table

2. **User A cannot read User B provider keys:**
   - User A sets a key for OpenAI via `/api/keys/set`
   - User B calls `/api/keys/status` — must not see User A's key metadata
   - User B calls `/api/keys/validate` — must not validate User A's keys
   - Verify `user_provider_keys` table has `user_id` in primary key

3. **User A cannot read User B configs:**
   - User A sets `activeProviderId` and `personalization` in settings
   - User B fetches settings — must see only defaults/empty

4. **User A cannot read User B usage/stats:**
   - User A generates usage via `/api/stats` and `/api/usage`
   - User B fetches `/api/usage` and `/api/stats` — must see zero/empty data

5. **User A cannot read User B synced threads:**
   - User A creates a synced thread
   - User B calls `GET /api/threads` — must not see User A's thread
   - User B calls `GET /api/threads/$id` with User A's thread ID — must get 404

6. **User A cannot read User B vector docs:**
   - User A syncs vector docs
   - User B calls `GET /api/vector-docs` — must see empty array

7. **Provider keys never returned plaintext:**
   - Test `/api/keys/status` — verify response never contains `apiKey` field
   - Test `/api/keys/validate` — verify the validation happens server-side but the response never contains `apiKey`
   - Test `/api/settings` — verify response never contains provider keys
   - Test `/api/proxy/chat` — verify it returns upstream response, not the key

8. **New chats remain local/offline unless sync enabled:**
   - Authenticated user creates a new thread without enabling sync
   - `GET /api/threads` must return empty array
   - `GET /api/threads/$id` must return 404
   - After enabling global sync, new threads should be synced
   - After disabling sync, new threads should be local again

9. **Import/export works for offline transfer:**
   - Export a local thread from frontend store (`store.exportThread`)
   - Import it into another browser/session via `store.importThreads`
   - Verify the imported thread is local-only (`is_local = true`) and not synced to D1
   - Verify backend `/api/threads/import` with mode `"local"` does not write to D1

10. **Anonymous session data can be claimed by new account:**
    - Create a guest session, add some localStorage threads and stats
    - Register a new user from that session
    - Verify the guest session data is migrated to the new user account
    - Verify `GET /api/threads` for the new user shows the migrated threads (if they were synced) or the localStorage still has them (if local)
    - Verify the guest session row is deleted

### 5.2 Update Existing Tests

- `src/routes/api/-keys.test.ts`: Update mocks to use `user_provider_keys` table instead of session `providers`
- `src/routes/api/-threads.test.ts`: Add tests for `sync_enabled` / `is_local` behavior
- `src/routes/api/-auth.test.ts`: Add claim tests
- `src/routes/api/-usage.test.ts`: Add user isolation tests
- `src/routes/api/-stats.test.ts`: Add user isolation tests
- `src/lib/auth.server.test.ts`: Add `claimGuestSession` tests
- `src/lib/cockpit-store.test.ts`: Add settings sync and offline-first tests

### 5.3 Validation
- `bun run test` — all tests must pass
- `bun run typecheck`
- `bun run lint`
- `bun run build`

## Pass 6: README Architecture Correction

### 6.1 Correct False Claims

Update `README.md` to remove or correct the following false statements:

1. **Remove:** "Chat data is device-local only. They never reach the server."
   - **Correct:** "Chat data is offline-first by default. Threads live in `localStorage` unless the user explicitly enables sync per-thread or globally. Synced threads are stored in D1 `threads` table scoped to `user_id`."

2. **Remove:** "D1 is not automatic chat storage"
   - **Correct:** "D1 stores synced threads only when the user has opted in. Local threads are never stored in D1."

3. **Remove:** `syncChatsToServer` from the Settings table (it does not exist in the code)
   - **Correct:** Add `syncThreadsEnabled` to the Settings table with default `false`.

4. **Remove:** "Provider API keys stripped from localStorage before persisting settings"
   - **Correct:** "Provider API keys are encrypted server-side in the `user_provider_keys` table and never stored in `localStorage`. Guests cannot store provider keys server-side."

5. **Remove:** "Legacy keys in localStorage are auto-migrated to the server on first hydration"
   - **Correct:** "Legacy localStorage keys are no longer migrated. Users must create an account to store keys server-side."

6. **Update:** Privacy and data model table to reflect:
   - `user_settings` table (server-side, user-scoped)
   - `user_provider_keys` table (server-side, encrypted, user-scoped)
   - `threads` table (server-side, only for `sync_enabled = 1` threads)
   - Guest sessions (ephemeral, expires after 30 days, claimable)

7. **Update:** Architecture section to show the new auth flow:
   - Guest mode → `guest_sessions` table
   - Register/Login → `claimGuestSession()` migration
   - Authenticated → `user_settings`, `user_provider_keys`, `threads` (synced only)

### 6.2 Add New Sections

- **Account Model:** Explain the difference between guest sessions and authenticated users
- **Sync Model:** Explain offline-first default, global sync toggle, per-thread sync toggle
- **Encryption:** Explain AES-256-GCM encryption for provider keys using `ENCRYPTION_KEY` or `SESSION_SECRET`
- **Migration Path:** Explain how anonymous session data is claimed upon account creation

### 6.3 Validation
- `bun run test && bun run typecheck && bun run lint && bun run build`
- Read the README to verify all corrections are accurate and source-backed

---

## Rollback Strategy

If any pass fails validation (tests fail, typecheck fails, build fails), the pass is **not complete**. Do not proceed to the next pass. Fix the issues in the current pass before moving forward.

If a pass requires reverting, use `git checkout -- <files>` or `git reset` to the baseline of that pass.

---

## Environment Requirements

- `SESSION_SECRET` (≥32 chars) — still required for cookie session encryption
- `ENCRYPTION_KEY` (≥32 chars) — new, for AES-256-GCM provider key encryption (falls back to `SESSION_SECRET` if not set, but warn in logs)
- D1 database binding `DB` — already configured

## Files to Modify (Summary)

### Schema / DB
- `src/lib/db/schema.sql`
- `src/lib/db/migration_auth.sql` (or new migration file)
- `src/lib/db/index.ts`

### Backend Auth / Session
- `src/lib/session.server.ts`
- `src/lib/auth.server.ts`
- `src/lib/encryption.server.ts` (new)
- `src/routes/api/auth/register.ts`
- `src/routes/api/auth/login.ts`
- `src/routes/api/auth/me.ts`
- `src/routes/api/auth/logout.ts`

### Backend API Routes
- `src/routes/api/settings.ts` (new)
- `src/routes/api/keys/set.ts`
- `src/routes/api/keys/clear.ts`
- `src/routes/api/keys/status.ts`
- `src/routes/api/keys/validate.ts`
- `src/routes/api/keys/validate.$providerId.ts`
- `src/routes/api/threads.ts`
- `src/routes/api/threads.$id.ts`
- `src/routes/api/threads.import.ts`
- `src/routes/api/threads.$id.export.ts`
- `src/routes/api/threads.$id.fork.ts`
- `src/routes/api/threads.$id.pin.ts`
- `src/routes/api/stats.ts`
- `src/routes/api/usage.ts`
- `src/routes/api/usage.$threadId.ts`
- `src/routes/api/vector-docs.ts`
- `src/routes/api/proxy/chat.ts`
- `src/routes/api/proxy/embeddings.ts`
- `src/routes/api/session.ts`

### Frontend
- `src/lib/cockpit-store.ts`
- `src/lib/api-base.ts` (if needed for new endpoints)
- `src/hooks/use-chat.ts` (if sync integration needed)

### Tests
- `src/routes/api/-account-separation.test.ts` (new)
- `src/routes/api/-keys.test.ts`
- `src/routes/api/-threads.test.ts`
- `src/routes/api/-auth.test.ts`
- `src/routes/api/-usage.test.ts`
- `src/routes/api/-stats.test.ts`
- `src/lib/auth.server.test.ts`
- `src/lib/cockpit-store.test.ts`
- `src/lib/cockpit-store.test.tsx`
- `src/lib/session.server.test.ts` (new)
- `src/lib/encryption.server.test.ts` (new)

### Documentation
- `README.md`
- `MISMATCH_REPORT.md` (already written)
- `AGENTS.md` (if needed for skill updates)
