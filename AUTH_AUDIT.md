# Edgecase Cockpit — Backend Auth & User Separation Audit

> Audit date: 2026-06-15
> Auditor: Orchestrator agent
> Scope: Full backend auth/session/user/account infrastructure, frontend wiring, data ownership

---

## 1. Executive Summary

**Classification: NO BACKEND AUTH — Anonymous session tracking only.**

The backend has **no user accounts, no login, no signup, no password system, and no `users` table**.
What exists is an anonymous encrypted cookie session that stores a random UUID (`session.data.id`) and provider API keys. All data is scoped to this ephemeral session cookie, not to a user.

The frontend stores **all threads, settings, profile, and usage stats in `localStorage`** and does not use the backend thread API endpoints. The backend thread endpoints exist but are orphaned — not wired into the frontend.

**Real account separation is impossible without backend work.**

---

## 2. Backend Auth / Session Inventory

### 2.1 Session system (`src/lib/session.server.ts`)
- Uses `@tanstack/react-start/server`'s `useSession` with an encrypted cookie
- Session data shape:
  ```ts
  type SessionData = {
    id?: string;        // ← random UUID generated if missing
    providers?: Record<string, { apiKey: string; baseUrl?: string; model?: string }>;
  };
  ```
- Cookie config: `httpOnly`, `secure`, `sameSite: "lax"`, `maxAge: 60 * 60 * 24 * 30` (30 days)
- **No user ID, no email, no password, no auth tokens**
- `getCockpitSession()` generates `crypto.randomUUID()` if no `id` exists

### 2.2 Database schema (`src/lib/db/schema.sql`)
Tables present:
| Table | Has `session_id` | Has `user_id` | Notes |
|-------|-----------------|---------------|-------|
| `sessions` | ✅ (PK) | ❌ | Stores anonymous session row |
| `threads` | ✅ (FK) | ❌ | **Not used by frontend** |
| `provider_stats` | ✅ (PK part) | ❌ | **Not used by frontend** |
| `usage_records` | ✅ | ❌ | **Not used by frontend** |
| `vector_docs` | ✅ (FK) | ❌ | Used only if `serverSyncAvailable` flag is set |
| `rate_limits` | ❌ | ❌ | Global rate limit buckets |

**No `users` table. No `accounts` table. No `passwords` or `credentials` table.**

### 2.3 API endpoints — auth-related
| Endpoint | Auth method | What it does |
|----------|------------|--------------|
| `POST /api/session` | CSRF + cookie | Creates a random session cookie and inserts into D1 |
| `GET /api/health` | None | Health check |

### 2.4 API endpoints — data-scoped (all session-scoped, NOT user-scoped)
| Endpoint | Session check? | User check? | Wired in frontend? |
|----------|---------------|-------------|-------------------|
| `GET /api/threads` | ✅ `session.data.id` | ❌ | ❌ Not used |
| `POST /api/threads` | ✅ + CSRF | ❌ | ❌ Not used |
| `DELETE /api/threads` | ✅ + CSRF | ❌ | ❌ Not used |
| `GET/PATCH/DELETE /api/threads/$id` | ✅ + CSRF | ❌ | ❌ Not used |
| `POST /api/threads/$id/pin` | ✅ + CSRF | ❌ | ❌ Not used |
| `POST /api/threads/$id/fork` | ✅ + CSRF | ❌ | ❌ Not used |
| `GET /api/threads/$id/export` | ✅ | ❌ | ❌ Not used |
| `POST /api/threads/import` | ✅ + CSRF | ❌ | ❌ Not used |
| `POST /api/keys/set` | ✅ + CSRF | ❌ | ✅ Used by settings |
| `GET /api/keys/status` | ✅ | ❌ | ✅ Used by settings |
| `POST /api/keys/clear` | ✅ + CSRF | ❌ | ✅ Used by settings |
| `POST /api/keys/validate` | ✅ + CSRF | ❌ | ✅ Used by settings |
| `POST /api/keys/validate/$id` | ✅ + CSRF | ❌ | ✅ Used by settings |
| `GET /api/usage` | ✅ | ❌ | ❌ Not used (frontend has local stats) |
| `GET /api/usage/$threadId` | ✅ | ❌ | ❌ Not used |
| `GET/POST/DELETE /api/stats` | ✅ + CSRF | ❌ | ⚠️ Partially used (frontend keeps its own stats) |
| `GET/POST/DELETE /api/vector-docs` | ✅ + CSRF | ❌ | ⚠️ Only if `serverSyncAvailable` flag set |
| `POST /api/proxy/chat` | ✅ + CSRF | ❌ | ✅ Used for every chat |
| `POST /api/proxy/transcribe` | ✅ + CSRF | ❌ | ✅ Used for voice |
| `POST /api/proxy/embeddings` | ✅ + CSRF | ❌ | ✅ Used for RAG |
| `GET /api/proxy/models` | ✅ + CSRF | ❌ | ✅ Used by ModelPicker |
| `POST /api/proxy/detect` | ✅ + CSRF | ❌ | ✅ Used by provider detection |

### 2.5 What is NOT present
- ❌ No `users` table or user schema
- ❌ No signup / register / create-account endpoint
- ❌ No login / sign-in endpoint
- ❌ No logout / sign-out endpoint
- ❌ No password hashing (bcrypt, argon2, etc.)
- ❌ No email verification
- ❌ No JWT or access token system
- ❌ No OAuth / social login
- ❌ No account recovery / password reset
- ❌ No multi-device session management
- ❌ No user profile server-side storage
- ❌ No `user_id` foreign key on any table

---

## 3. Frontend State / Auth Wiring Inventory

### 3.1 `localStorage` keys used by the app
| Key | Content | Scoped to user? |
|-----|---------|-----------------|
| `cockpit.settings.v2` | Settings, profile, personalization, provider configs, cost overrides, onboarding state | ❌ Shared across all users of this browser profile |
| `cockpit.threads.v1` | All threads and messages | ❌ Shared across all users of this browser profile |
| `cockpit.provider-stats.v1` | Provider call/error counts + token usage | ❌ Shared across all users of this browser profile |
| `cockpit.vector-store.v1` | RAG embeddings and docs | ❌ Shared across all users of this browser profile |
| `cockpit.offline-queue.v1` | Queued messages when offline | ❌ Shared across all users of this browser profile |

### 3.2 Frontend API calls that DO reach the backend
- `apiFetch("/api/keys/set")` — saves provider API key to server session
- `apiFetch("/api/keys/clear")` — clears provider key from server session
- `apiFetch("/api/keys/status")` — checks which providers have keys stored server-side
- `apiFetch("/api/keys/validate")` — validates provider keys
- `apiFetch("/api/proxy/chat")` — proxies chat to provider
- `apiFetch("/api/proxy/transcribe")` — proxies transcription
- `apiFetch("/api/proxy/embeddings")` — proxies embeddings
- `apiFetch("/api/proxy/models")` — fetches model list
- `apiFetch("/api/proxy/detect")` — detects local provider
- `apiFetch("/api/vector-docs")` — only if `_serverSyncAvailable` is true (default false)
- `apiFetch("/api/stats")` — not explicitly called by frontend; frontend keeps its own stats
- `apiFetch("/api/usage")` — not explicitly called by frontend; frontend estimates tokens locally
- `apiFetch("/api/session")` — **NEVER called from the frontend**

### 3.3 No auth UI exists
- ❌ No login screen
- ❌ No signup / create account screen
- ❌ No logout button
- ❌ No account indicator / avatar dropdown with user info
- ❌ No "Switch account" UI
- The "profile" in the drawer is just a `displayName` string from localStorage settings, not a real account

### 3.4 Native app (Electron) session handling
- Electron uses `partition: "persist:cockpit"` for persistent cookies
- The session cookie survives app restarts
- But the session is still anonymous — no login required
- Native app loads `app://-/` protocol and uses `apiFetch` with `X-Native-App: 1` header
- CORS bypass is configured for localhost providers and the deployed Worker URL

---

## 4. Data Ownership & Leakage Assessment

### 4.1 What leaks/shares across users on the same device
| Data | Storage | Leaks across users? |
|------|---------|---------------------|
| Threads & messages | `localStorage` | ✅ Yes — any user of this browser profile sees all threads |
| Settings & profile | `localStorage` | ✅ Yes — shared |
| Provider API keys | Server session cookie | ⚠️ Only if same browser profile (same cookie jar) |
| Provider base URLs / models | `localStorage` | ✅ Yes — shared |
| Usage stats | `localStorage` | ✅ Yes — shared |
| RAG vector docs | `localStorage` (primary) | ✅ Yes — shared |
| Offline queue | `localStorage` | ✅ Yes — shared |
| Cost overrides | `localStorage` | ✅ Yes — shared |
| Pinned providers | `localStorage` | ✅ Yes — shared |

### 4.2 Backend-side data
The backend D1 tables (`threads`, `provider_stats`, `usage_records`, `vector_docs`) are technically scoped to the anonymous `session_id`, but since the frontend never uses these endpoints for threads/stats, the backend data is effectively orphaned. The only backend data that matters is:
- Provider keys stored in the encrypted session cookie
- Vector docs (if server sync enabled)

### 4.3 Session lifecycle
- Session cookie is created automatically on first request by `getCockpitSession()`
- The `POST /api/session` endpoint exists but is never called by the frontend
- Session ID is a random UUID, regenerated if the cookie is cleared
- No login → no session invalidation → no logout possible

---

## 5. Classification

### State classification: **NO BACKEND AUTH**

The backend has:
- ✅ Anonymous encrypted cookie sessions
- ✅ Session-scoped data tables (threads, stats, usage, vector docs)
- ✅ CSRF protection
- ✅ Rate limiting per session
- ✅ Secure cookie attributes (httpOnly, secure, sameSite lax)

But critically missing:
- ❌ No `users` table or user concept
- ❌ No login / signup / logout endpoints
- ❌ No password / credential system
- ❌ No user authentication whatsoever
- ❌ No user-scoped data (everything is session-scoped or localStorage)
- ❌ No multi-device account sync
- ❌ No account recovery

The frontend has:
- ❌ No auth UI
- ❌ No login flow
- ❌ No account creation flow
- ❌ All data stored in localStorage (single-user, device-local)
- ❌ No session token / auth header sent with requests

### What this means
**Real account separation is not possible today.** The app is a single-user, local-first experience where all data lives in `localStorage` and the backend only acts as a proxy for provider API calls with anonymous session cookies.

---

## 6. What Would Be Required for Real Account Separation

To implement the requested user-facing workflows, the following backend work would be needed:

### 6.1 Database schema additions
```sql
-- New tables required
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Migrate existing tables to add user_id
-- (or create new user-scoped tables and keep session-scoped ones for backwards compat)
ALTER TABLE threads ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE provider_stats ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE usage_records ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE vector_docs ADD COLUMN user_id TEXT REFERENCES users(id);
```

### 6.2 Backend API endpoints needed
| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/register` | Create account with email + password |
| `POST /api/auth/login` | Authenticate, create session |
| `POST /api/auth/logout` | Invalidate session |
| `GET /api/auth/me` | Get current user profile |
| `POST /api/auth/password` | Change password |

### 6.3 Frontend changes needed
| Change | Description |
|--------|-------------|
| Auth context / hook | Store authenticated user state |
| Login screen | Email + password form |
| Signup screen | Account creation form |
| Logout button | Clear local state + call logout API |
| Account indicator | Show current user in drawer/settings |
| Session restore | Check `/api/auth/me` on app load |
| Auth-gated data | Sync threads/settings to user-scoped backend |
| Migration prompt | Ask existing localStorage users to create account |

### 6.4 Data migration complexity
- **Threads**: Currently in `localStorage` (`cockpit.threads.v1`). Would need to sync to backend `threads` table with `user_id`.
- **Settings**: Currently in `localStorage` (`cockpit.settings.v2`). Would need a `user_settings` backend table or keep local with account overlay.
- **Provider keys**: Already in server session. Would need to migrate from session cookie to user-scoped storage.
- **Stats**: Frontend keeps local stats (`cockpit.provider-stats.v1`). Backend has `provider_stats` table but frontend doesn't use it. Would need to unify.
- **Vector docs**: LocalStorage primary. Backend `vector_docs` table exists but is only used when `_serverSyncAvailable` is set.

---

## 7. Security Observations

### 7.1 What is already secure
- ✅ Provider API keys are NOT stored in `localStorage` — they are sent to server session via `apiFetch("/api/keys/set")` and stored in encrypted cookie
- ✅ Session cookie is `httpOnly`, `secure`, `sameSite: lax`
- ✅ CSRF tokens are validated on state-changing endpoints
- ✅ Rate limiting is per-session
- ✅ Proxy endpoints prevent browser from talking directly to third-party APIs

### 7.2 What is NOT secure for multi-user
- ❌ All threads, settings, stats, vector docs are in `localStorage` — shared across browser users
- ❌ No auth barrier — anyone who opens the app sees all data
- ❌ No session expiration / forced re-auth
- ❌ `clearAll()` in store calls `apiFetch("/api/keys/clear")` but also wipes localStorage — destructive and irreversible
- ❌ Cross-tab sync via `storage` event syncs all data across tabs without any user check

---

## 8. Recommended Next Steps

Per the task rules: **"If backend auth does not exist, stop and report that full account separation requires backend work. Do not fake it silently."**

**Therefore, implementation is NOT proceeding.**

The recommended path forward is:
1. **Add a `users` table and authentication system to the backend** (password + bcrypt, or OAuth, or both)
2. **Add login/signup/logout API endpoints**
3. **Add `user_id` to all data tables** or create user-scoped views
4. **Wire frontend to use backend for thread CRUD** instead of localStorage
5. **Implement auth UI** (login, signup, logout, account indicator)
6. **Add migration flow** for existing localStorage data → user account
7. **Add tests** for auth, session isolation, and multi-user data separation

A fake local-only "account" system would violate the explicit rule: **"Do not implement fake local profiles as the primary solution unless audit proves backend auth is missing."** The audit has proven backend auth is missing, but the rule says to stop and report, not to fake it.

---

## 9. Files Audited

| File | Purpose |
|------|---------|
| `src/lib/session.server.ts` | Encrypted cookie session — anonymous UUID only |
| `src/lib/db/schema.sql` | D1 schema — no users table |
| `src/lib/db/index.ts` | DB operations — all session-scoped |
| `src/routes/api/session.ts` | Creates anonymous session |
| `src/routes/api/threads.ts` | Backend thread CRUD — not used by frontend |
| `src/routes/api/threads.$id.ts` | Backend thread detail — not used by frontend |
| `src/routes/api/keys/set.ts` | Stores provider key in session cookie |
| `src/routes/api/keys/status.ts` | Reads provider key status from session |
| `src/routes/api/keys/clear.ts` | Clears provider key from session |
| `src/routes/api/usage.ts` | Usage aggregation — not used by frontend |
| `src/routes/api/stats.ts` | Provider stats — partially used |
| `src/routes/api/vector-docs.ts` | Vector docs — conditionally used |
| `src/routes/api/proxy/*.ts` | Proxy endpoints — actively used |
| `src/lib/api-base.ts` | API base URL + fetch wrapper |
| `src/lib/cockpit-store.ts` | ALL frontend state — localStorage only |
| `src/hooks/use-chat.ts` | Chat logic — uses localStorage threads |
| `src/routes/index.tsx` | Main UI — no auth |
| `src/routes/settings.tsx` | Settings UI — no auth |
| `src/routes/__root.tsx` | Root layout — no auth context |
| `src/components/cockpit/OnboardingModal.tsx` | Onboarding — no account step |
| `src/components/cockpit/Drawer.tsx` | Drawer — profile is display name only |
| `electron/main.ts` | Electron main — persistent cookie partition |
| `package.json` | Build scripts |
| `wrangler.jsonc` | Worker config |

---

*End of audit. No code changes were made.*
