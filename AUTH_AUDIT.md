# Edgecase Cockpit — Backend Auth & User Separation Resolution

> Audit date: 2026-06-16
> Auditor: Documentation-driven E2E completion agent
> Scope: Verify that the backend auth/session/user/account infrastructure matches the real-user-account architecture required by the product.
> Status: **RESOLVED** — real user accounts are implemented and enforced by tests.

---

## 1. Executive Summary

**Classification: REAL BACKEND AUTH — User accounts with password hashing, encrypted D1 storage, and account separation are implemented.**

The backend now has:

- A `users` table with `id`, `email`, `password_hash`, `display_name`, `created_at`, `updated_at`.
- PBKDF2-HMAC-SHA256 password hashing (600,000 iterations, OWASP 2023 aligned).
- Register, login, logout, and `/api/auth/me` endpoints.
- Authenticated sessions stored in encrypted cookies with `userId` and `userEmail`.
- Guest mode via `guest_sessions` with a 30-day TTL.
- Guest-to-user migration on both registration and login (`claimGuestSession`).
- User-scoped D1 storage for threads, provider stats, usage records, vector docs, and settings.
- Encrypted provider API keys stored in `user_provider_keys` (AES-256-GCM) — never in `localStorage`, never returned to the client.
- CSRF double-submit cookie protection and per-session rate limiting on all mutating routes.

Source files:
- `src/lib/auth.server.ts` — password hashing, user CRUD, `requireAuth`.
- `src/lib/session.server.ts` — encrypted cookie session, auth helpers, provider-credential DB wrapper.
- `src/lib/db/index.ts` — user-scoped data layer, guest session claim, provider key / settings storage.
- `src/lib/encryption.server.ts` — AES-256-GCM encrypt/decrypt.
- `src/lib/db/schema.sql` — user-account schema.
- `src/routes/api/auth/register.ts`, `login.ts`, `logout.ts`, `me.ts`.
- `src/routes/api/-auth.test.ts`, `src/lib/auth.server.test.ts`, `src/lib/session.server.test.ts`, `src/routes/api/-account-separation.test.ts`.

---

## 2. Data Ownership Model

| Data | Storage | Scoped to user? |
|------|---------|-----------------|
| User credentials | `users.password_hash` | ✅ Yes, per `users.id` |
| Provider API keys | `user_provider_keys.api_key_encrypted` | ✅ Yes, per `user_id` |
| Provider base URL / model | `user_provider_keys.base_url`, `model` | ✅ Yes, per `user_id` |
| User settings/profile | `user_settings` JSON columns | ✅ Yes, per `user_id` |
| Synced threads | `threads` (only when `sync_enabled=1` and `is_local=0`) | ✅ Yes, per `user_id` |
| Provider stats | `provider_stats` | ✅ Yes, per `user_id` |
| Usage records | `usage_records` | ✅ Yes, per `user_id` |
| Server-side vector docs | `vector_docs` | ✅ Yes, per `user_id` |
| Guest session data | `guest_sessions` | ⚠️ Ephemeral, claimed on account creation |
| Local threads/settings/RAG/stats | `localStorage` | ❌ Single-user, device-local by design |

---

## 3. Authentication Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/register` | POST | Create account, hash password, log in, claim guest data |
| `/api/auth/login` | POST | Verify password, set auth session, claim guest data |
| `/api/auth/logout` | POST | Clear auth and guest session state |
| `/api/auth/me` | GET | Return current public user profile |

---

## 4. Security Controls

- Provider keys are encrypted with AES-256-GCM before storage.
- The browser never receives a plaintext key.
- `getProviderCreds` decrypts server-side only when proxying a request.
- Cookie is `httpOnly`, `secure`, `sameSite: "lax"`, 30-day `maxAge`.
- CSRF tokens required on all state-changing routes.
- Rate limiting is per cookie session id.

---

## 5. Guest Mode

- Anonymous users get a `guestSessionId` persisted in the encrypted cookie.
- A `guest_sessions` row is created with a 30-day `expires_at` TTL.
- Guests cannot store provider keys in D1 (server returns 401).
- When a guest registers or logs in, `claimGuestSession(guestId, userId)` migrates any D1-resident threads, stats, usage records, and vector docs to the new user.

---

## 6. Frontend Authentication Gap

> **Important distinction:** This audit verifies the *backend* auth/session/user/account infrastructure. The API endpoints (`/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`) and database schema are implemented and tested.
>
> However, there is **no login, register, or account UI** in the application. `src/routes/` does not contain an `/auth` route or any sign-in/sign-up components. As a result, real users cannot authenticate, and server-side authenticated features (encrypted provider key storage, D1 thread sync, server-side settings, usage records) are unreachable through normal use.

## 6. Remaining Intentional Boundaries

These are not auth gaps:

- **Device-local data**: Threads, RAG vectors, and provider stats default to `localStorage`. Sync to D1 is opt-in for authenticated users only. This is the product's privacy model.
- **No automated cross-device sync**: Manual export/import is the cross-device portability path.
- **No OAuth/social login**: Not a V1 requirement.
- **No password reset / email verification**: Not a V1 requirement; requires external email/SMTP infrastructure.

---

## 7. Tests

Auth and account separation are covered by:

- `src/routes/api/-auth.test.ts` — register, login, logout, me, guest claim.
- `src/lib/auth.server.test.ts` — password hashing, user lookup.
- `src/lib/session.server.test.ts` — session helpers, provider credential storage.
- `src/routes/api/-account-separation.test.ts` — user isolation for settings, keys, threads, stats, usage, vector docs.

Run with:

```bash
bun run test
```

---

*Previous audit findings (2026-06-15) identified missing backend auth. Those issues have been resolved by the real-user-account migration recorded in `plan.md` and verified by the tests above.*
