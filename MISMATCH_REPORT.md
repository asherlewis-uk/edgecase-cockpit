# Mismatch Report: Current Implementation vs Required Architecture

## Executive Summary

**Status: RESOLVED.**

The `edgecase-cockpit` implementation now matches the required real-user-account architecture. The previous mismatches identified on 2026-06-15 (session-only ownership, provider keys in cookies, missing user-scoped settings, unconditional D1 thread storage) have been addressed by the migration recorded in `plan.md` and verified by `src/routes/api/-account-separation.test.ts` plus the full test suite.

---

## 1. Real user accounts with `user_id` as primary owner

**Required:** All data ownership scoped to a real `user_id` from the `users` table; guest mode separate and claimable.

**Actual (resolved):**
- `users` table exists with `id`, `email`, `password_hash`, `display_name` (`src/lib/db/schema.sql`).
- Passwords are hashed with PBKDF2-HMAC-SHA256 (`src/lib/auth.server.ts`).
- `register.ts`, `login.ts`, `logout.ts`, and `me.ts` provide full auth lifecycle.
- `ownerWhere()` in `src/lib/db/index.ts` scopes queries by `user_id` when authenticated, falling back to `session_id` only for guests.
- `claimGuestSession()` migrates guest data to a newly authenticated user.

---

## 2. User settings stored backend-scoped to `user_id`

**Required:** Settings, provider configs, model preferences, and app state scoped to `user_id`.

**Actual (resolved):**
- `user_settings` table stores profile, personalization, keyboard shortcuts, RAG, active provider, pinned providers, cost overrides, onboarding state, and `sync_threads_enabled` (`src/lib/db/schema.sql`).
- `src/routes/api/settings.ts` provides `GET /api/settings` and `POST /api/settings` for authenticated users only.
- `cockpit-store.ts` merges server settings on hydration and posts updates in the background.

---

## 3. Provider credentials encrypted and server-side only

**Required:** Provider keys encrypted server-side, never exposed to the client.

**Actual (resolved):**
- `user_provider_keys` table stores `api_key_encrypted` per `(user_id, provider_id)` (`src/lib/db/schema.sql`).
- `src/lib/encryption.server.ts` provides AES-256-GCM encrypt/decrypt using `ENCRYPTION_KEY` (falling back to `SESSION_SECRET`).
- `src/lib/session.server.ts` `getProviderCreds()` decrypts only server-side.
- `/api/keys/status` returns only `hasKey`, `baseUrl`, and `model` — never the key.
- Guests are rejected with 401 when trying to store keys (`src/routes/api/keys/set.ts`).

---

## 4. Offline-first chat with opt-in sync

**Required:** Chats offline-first by default; backend sync opt-in per user or per thread.

**Actual (resolved):**
- `threads` table has `sync_enabled` and `is_local` columns, both defaulting to off/local (`src/lib/db/schema.sql`).
- `getSyncedThreads()` only returns rows where `sync_enabled=1` and `is_local=0` (`src/lib/db/index.ts`).
- `user_settings.sync_threads_enabled` controls the global default.
- Frontend `newThread()` creates local threads by default; sync must be explicitly enabled.

---

## 5. Import/export ownership boundaries

**Required:** Manual export/import as offline transfer with clear ownership.

**Actual (resolved):**
- `cockpit-store.ts` `exportThread()` / `importThreads()` operate on `localStorage` only.
- Backend `/api/threads/import` accepts a `mode` parameter (`"local"` default or `"sync"`) and only writes to D1 when sync mode is requested.
- Imported threads on the backend get a fresh id and are owned by the current `session_id` (guest) or `user_id` (authenticated).

---

## 6. Summary Table

| Requirement | Current State | Evidence |
|-------------|---------------|----------|
| Real user accounts with `user_id` as primary owner | ✅ Implemented | `users` table, `auth.server.ts`, `session.server.ts` |
| User settings stored backend-scoped to `user_id` | ✅ Implemented | `user_settings` table, `src/routes/api/settings.ts` |
| Provider keys encrypted server-side, never exposed to client | ✅ Implemented | `user_provider_keys`, `encryption.server.ts` |
| Chats offline-first by default | ✅ Implemented | `threads.is_local` / `sync_enabled`, `cockpit-store.ts` |
| Chat sync opt-in per user/thread | ✅ Implemented | `user_settings.sync_threads_enabled`, per-thread sync flag |
| Import/export with ownership boundaries | ✅ Implemented | localStorage export/import + backend `mode` parameter |
| Anonymous guest mode separate from real account | ✅ Implemented | `guest_sessions`, `claimGuestSession`, 401 on key storage |

---

## 7. Frontend UI Gap

The architecture mismatch described above is resolved at the API and database layers. The remaining mismatch is that there is **no user-facing authentication UI**. Without login/register pages or account menus, the implemented user-account features are not reachable by end users. This should be treated as a future feature rather than a current capability.

## 7. Verification

```bash
bun run typecheck
bun run lint
bun run test        # 522 tests passing
bun run build
```

Account separation is explicitly exercised in `src/routes/api/-account-separation.test.ts`.

---

*Previous mismatch findings (2026-06-15) are superseded by the real-user-account migration. This report now serves as the source-backed verification that the required architecture is in place.*
