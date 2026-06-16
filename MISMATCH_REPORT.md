# Mismatch Report: Current Implementation vs Required Architecture

## Executive Summary

The current `edgecase-cockpit` implementation claims to support real user accounts but is fundamentally an **anonymous encrypted-cookie-session architecture** with a thin `users` table overlay. Provider keys, settings, and thread data are either stored in the session cookie or `localStorage`, not in backend/cloud storage scoped to an authenticated `user_id`. The backend thread persistence API exists and contradicts the README's "device-local only" claims. There is no chat sync opt-in mechanism, no user-scoped settings/config tables, and no import/export ownership boundary.

---

## 1. Session-only ownership

### Evidence

**File:** `src/lib/session.server.ts` (lines 1–83)

```ts
export type SessionData = {
  id?: string;
  userId?: string;
  userEmail?: string;
  providers?: Record<string, SessionProviderCreds>;
};

export async function getCockpitSession() {
  const s = await startSession<SessionData>(config());
  if (!s.data.id) {
    await s.update({ ...s.data, id: crypto.randomUUID() });
  }
  return s;
}
```

- **Every visitor** gets an anonymous `session.id` auto-generated via `crypto.randomUUID()` if missing. This `id` is the primary ownership key for ALL data.
- `userId` and `userEmail` are **optional** fields on the session — they are not the primary identity.

**File:** `src/lib/db/index.ts` (lines 76–85)

```ts
function ownerWhere(
  userId: string | undefined,
  sessionId: string,
  prefix = "",
): { sql: string; params: unknown[] } {
  if (userId) {
    return { sql: `${prefix}user_id = ?1`, params: [userId] };
  }
  return { sql: `${prefix}session_id = ?1`, params: [sessionId] };
}
```

- The database queries fall back to `session_id` when `user_id` is undefined. This means anonymous session data is treated as legitimate ownership.
- **Consequence:** If a user clears cookies, switches browsers, or uses incognito mode, they lose access to their data because ownership is tied to the session cookie, not the user account.

**File:** `src/routes/api/session.ts` (lines 7–28)

```ts
POST: async ({ request }) => {
  const session = await getCockpitSession();
  if (!session.data.id) {
    return Response.json({ error: "Could not create session" }, { status: 500 });
  }
  await createSession(session.data.id);
  return Response.json({ sessionId: session.data.id });
}
```

- The `/api/session` endpoint explicitly creates a DB session row keyed by the cookie session ID. This cements session-based ownership in the database layer.

### Mismatch

**Required:** All data ownership must be scoped to a real `user_id` from the `users` table. Anonymous sessions may exist as a **guest mode** but must be clearly separate from authenticated user data and must be **claimable** upon account creation.

**Actual:** Ownership is scoped to `session_id` with `user_id` as a nullable overlay. Guest mode and authenticated mode are indistinguishable in the data layer.

---

## 2. Missing users/account model

### Evidence

**File:** `src/lib/db/schema.sql` (lines 5–12)

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- The `users` table has only **6 columns**: `id`, `email`, `password_hash`, `display_name`, `created_at`, `updated_at`.
- There are **no columns or tables** for:
  - User settings/preferences
  - User profile fields (handle, avatar, pronouns, role label, etc.)
  - User provider configurations
  - User model preferences
  - User base URL overrides
  - User app preferences (theme, shortcuts, RAG, etc.)
  - User onboarding state
  - User sync preferences

**File:** `src/lib/auth.server.ts` (lines 11–18)

```ts
export type User = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: number;
  updated_at: number;
};
```

- The `User` type in the auth module only contains auth-related fields. No account metadata, no settings, no preferences.

### Mismatch

**Required:** A real user account model with backend storage for user settings, provider keys, model configs, provider base URLs, and app preferences — all scoped to `user_id`.

**Actual:** The `users` table is a minimal auth credential store. All user data (settings, keys, configs) lives elsewhere (session cookie or `localStorage`).

---

## 3. Provider credentials stored in session data

### Evidence

**File:** `src/lib/session.server.ts` (lines 5–16, 44–53)

```ts
export type SessionProviderCreds = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
};

export type SessionData = {
  id?: string;
  userId?: string;
  userEmail?: string;
  providers?: Record<string, SessionProviderCreds>;
};

export async function setProviderCreds(providerId: string, creds: SessionProviderCreds) {
  const s = await getCockpitSession();
  const next = { ...(s.data.providers ?? {}), [providerId]: creds };
  await s.update({ ...s.data, providers: next });
}
```

- `apiKey`, `baseUrl`, and `model` are stored **directly in the encrypted cookie session** (`providers` field on `SessionData`).
- They are NOT stored in a database table scoped to `user_id`.
- The cookie session has a `maxAge: 60 * 60 * 24 * 30` (30 days). If the user clears cookies, all provider keys are lost.

**File:** `src/routes/api/keys/status.ts` (lines 15–23)

```ts
const providers: Record<string, { hasKey: boolean; baseUrl?: string; model?: string }> = {};
for (const [id, cfg] of Object.entries(s.data.providers ?? {})) {
  providers[id] = {
    hasKey: !!cfg.apiKey,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
  };
}
return Response.json({ providers });
```

- The `/api/keys/status` endpoint reads provider metadata **from the session cookie** and returns `baseUrl` and `model` back to the client.
- The `apiKey` itself is not returned (only `hasKey: boolean`), but the **metadata is exposed** from session storage, not from a user-scoped database table.

**File:** `src/routes/api/keys/set.ts` (lines 46–50)

```ts
await setProviderCreds(parsed.data.providerId, {
  apiKey: parsed.data.apiKey,
  baseUrl: parsed.data.baseUrl,
  model: parsed.data.model,
});
```

- The `apiKey` is written to the session cookie, not to a database row keyed by `user_id`.

### Mismatch

**Required:** Provider keys must be encrypted server-side and stored in backend/cloud storage scoped to `authenticated user_id`. They must never be exposed back to the client in any form (not even metadata like `baseUrl` or `model` unless explicitly user-configured and stored in a settings table).

**Actual:** Provider keys are stored in the encrypted cookie session (`session.server.ts`). There is no database table for provider credentials. The `baseUrl` and `model` metadata are returned from session data to the client via `/api/keys/status`.

---

## 4. Backend thread persistence

### Evidence

**File:** `src/lib/db/schema.sql` (lines 23–41)

```sql
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT,
  title TEXT NOT NULL,
  messages TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL,
  temporary INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

- The `threads` table exists in D1 with full message storage (`messages TEXT NOT NULL DEFAULT '[]'`).
- This is a **backend persistence layer** for chat threads, directly contradicting the README claim that "Chat data is device-local only" and "D1 is not automatic chat storage."

**File:** `src/routes/api/threads.ts` (lines 53–166)

Full CRUD handlers for `GET /api/threads`, `POST /api/threads`, `DELETE /api/threads` that persist threads to D1 via `dbCreateThread`, `dbGetThreads`, `dbDeleteThreads`.

**File:** `src/routes/api/threads.$id.ts` (lines 41–151)

Full CRUD handlers for `GET /api/threads/$id`, `PATCH /api/threads/$id`, `DELETE /api/threads/$id`.

**File:** `src/routes/api/threads.$id.fork.ts` (lines 13–69)

Backend thread fork endpoint that copies a thread in D1.

**File:** `src/routes/api/threads.$id.pin.ts` (lines 7–40)

Backend thread pin toggle endpoint that updates D1.

**File:** `src/routes/api/threads.import.ts` (lines 41–109)

Backend thread import endpoint that writes imported threads directly to D1.

**File:** `src/routes/api/threads.$id.export.ts` (lines 5–71)

Backend thread export endpoint that reads from D1 and returns the full thread.

**File:** `src/lib/cockpit-store.ts` (lines 104–106)

```ts
const SETTINGS_KEY = "cockpit.settings.v2";
const THREADS_KEY = "cockpit.threads.v1";
const STATS_KEY = "cockpit.provider-stats.v1";
```

- The frontend store **also** persists threads to `localStorage` under `cockpit.threads.v1`.
- But the backend API is fully functional and ready to accept thread data. The frontend does not appear to call the backend thread endpoints during normal operation, but the endpoints are **exposed and unguarded** against direct use.

### Mismatch

**Required:** Chats/threads are **offline-first by default**. Chat backend sync must be **opt-in** per user or per thread. There must be a clear `sync_enabled` flag.

**Actual:**
1. The backend has a fully functional thread persistence API with no opt-in gate.
2. The schema stores threads in D1 unconditionally (no `sync_enabled` column).
3. The README falsely claims "D1 is not automatic chat storage" and "chat data is never stored in D1" when the schema and API routes prove the opposite.
4. The frontend stores threads in `localStorage`, but the backend will persist any thread sent to it — there is no offline-first enforcement.

---

## 5. Missing user-scoped settings/config tables

### Evidence

**File:** `src/lib/db/schema.sql` (full file, lines 1–110)

No tables exist for any of the following:
- `user_settings` or `user_preferences`
- `user_provider_configs` or `user_provider_keys`
- `user_models` or `user_model_preferences`
- `user_profiles` (beyond the minimal `display_name` in `users`)
- `user_app_state` or `user_onboarding_state`

**File:** `src/lib/cockpit-store.ts` (lines 51–65)

```ts
export type Settings = {
  userName: string;
  profile: UserProfile;
  personalization: Personalization;
  keyboardShortcuts: KeyboardShortcuts;
  rag: RagSettings;
  activeProviderId: string;
  providers: Record<string, ProviderConfig>;
  pinnedProviderIds: string[];
  costOverrides?: Record<string, { input?: number; output?: number }>;
  onboardingCompleted?: boolean;
};
```

- All of these settings are **client-side only** and persisted to `localStorage` (`cockpit.settings.v2`).
- There is no server-side settings persistence scoped to `user_id`.
- If a user logs in on a different device, none of their settings transfer.

**File:** `src/lib/cockpit-store.ts` (lines 493–496)

```ts
const safeProviders: Record<string, ProviderConfig> = {};
for (const [id, cfg] of Object.entries(state.settings.providers)) {
  safeProviders[id] = { ...cfg, apiKey: "" };
}
```

- Even the client-side `localStorage` strips `apiKey` before persisting, but there is **no backend storage** for the provider configs (`baseUrl`, `model`, etc.) at all.

### Mismatch

**Required:** User settings, provider keys, model configs, provider base URLs, and app preferences must be stored in backend/cloud storage scoped to `authenticated user_id`.

**Actual:** There are zero database tables for user-scoped settings or configs. All settings live in `localStorage`. Provider keys live in the session cookie. Nothing is user-scoped in the backend.

---

## 6. Missing chat sync opt-in

### Evidence

**File:** `src/lib/cockpit-store.ts` (lines 51–65) — `Settings` type

```ts
export type Settings = {
  userName: string;
  profile: UserProfile;
  personalization: Personalization;
  keyboardShortcuts: KeyboardShortcuts;
  rag: RagSettings;
  activeProviderId: string;
  providers: Record<string, ProviderConfig>;
  pinnedProviderIds: string[];
  costOverrides?: Record<string, { input?: number; output?: number }>;
  onboardingCompleted?: boolean;
};
```

- There is **no `syncChatsToServer`** field in the `Settings` type.

**File:** `README.md` (line 514)

```markdown
| Chat sync (opt-in) | syncChatsToServer (default false) | cockpit-store.ts |
```

- The README claims this field exists, but it does **not** exist in the source code. This is a **documentation lie**.

**File:** `src/lib/vector-store.ts` (lines 157–165)

```ts
let _serverSyncAvailable = false;

export function setServerSyncAvailable(available: boolean) {
  _serverSyncAvailable = available;
}

export function isServerSyncAvailable(): boolean {
  return _serverSyncAvailable;
}
```

- The only "sync opt-in" that exists is for **RAG vector docs** (`syncVectorDocToServer` / `loadVectorDocsFromServer`), and it defaults to `false`.
- There is **no equivalent** for chat threads.

**File:** `src/lib/db/schema.sql` (lines 23–41) — `threads` table

```sql
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT,
  title TEXT NOT NULL,
  messages TEXT NOT NULL DEFAULT '[]',
  ...
);
```

- No `sync_enabled` column. No `is_local` column. No `offline_only` column. Every thread row is treated as a backend-persisted entity.

### Mismatch

**Required:** Chat backend sync must be opt-in per user or per thread. New chats must remain local/offline unless sync is explicitly enabled.

**Actual:**
1. There is no `syncChatsToServer` setting (the README lies about its existence).
2. There is no `sync_enabled` column on the `threads` table.
3. The backend thread API accepts and persists threads unconditionally.
4. New chats are created in `localStorage` only by the frontend, but the backend is ready to accept them with no opt-in check.

---

## 7. Missing import/export ownership boundaries

### Evidence

**File:** `src/routes/api/threads.import.ts` (lines 92–103)

```ts
for (const t of parsed.data.threads.slice(0, allowedToImport)) {
  const thread: Thread = {
    id: crypto.randomUUID(),
    title: t.title,
    messages: t.messages,
    updatedAt: t.updatedAt ?? now,
    pinned: false,
    archived: false,
  };
  await createThread(session.data.id, thread, session.data.userId);
  imported++;
}
```

- The backend import endpoint creates **new thread IDs** (`crypto.randomUUID()`) for every imported thread. It does not preserve the original thread ID.
- It writes imported threads directly to the **backend D1 database** (`createThread`). There is no concept of "offline import" that stays local-only.
- The import is bounded by `session.data.id` and `session.data.userId`, but since anonymous sessions are auto-generated, this does not establish real ownership.

**File:** `src/lib/cockpit-store.ts` (lines 846–858)

```ts
importThreads(threads: Thread[]) {
  const now = Date.now();
  const next = threads.map((t) => ({
    ...t,
    id: t.id || crypto.randomUUID(),
    updatedAt: t.updatedAt || now,
    pinned: !!t.pinned,
    archived: !!t.archived,
  }));
  state = { ...state, threads: [...next, ...state.threads] };
  persist();
  emit();
}
```

- The frontend `importThreads` only writes to `localStorage`. This is the "offline transfer" path.
- But there is **no connection** between the frontend offline import and the backend import endpoint. They are two separate, uncoordinated mechanisms.
- The backend import endpoint (`/api/threads/import`) is not called by the frontend store.

**File:** `src/routes/api/threads.$id.export.ts` (lines 5–71)

```ts
GET: async ({ params, request }) => {
  const session = await getCockpitSession();
  const thread = await getThread(session.data.id, id, session.data.userId);
  // ... returns thread from D1
}
```

- The backend export endpoint reads from **D1** and returns the thread. It does not export from `localStorage`.
- The frontend `exportThread` (in `cockpit-store.ts`, line 833) exports from `localStorage` only.
- There are **two separate export mechanisms** (backend D1-based and frontend localStorage-based) with no ownership boundary between them.

### Mismatch

**Required:** Offline transfer must be supported through import/export. Import/export must have clear ownership boundaries (i.e., importing threads should assign them to the current authenticated user, and export should only include threads the user owns).

**Actual:**
1. The backend import endpoint writes to D1 but does not preserve original thread IDs, does not verify ownership of the source data, and does not support an "offline-only" import mode.
2. The frontend import is localStorage-only but is not connected to any backend sync opt-in.
3. The backend export reads from D1; the frontend export reads from localStorage. They are uncoordinated.
4. Anonymous session data can be "imported" into D1, but there is no mechanism to **claim** anonymous session data when creating a real user account.

---

## Summary Table

| Requirement | Current State | Evidence |
|-------------|---------------|----------|
| Real user accounts with `user_id` as primary owner | ❌ Session `id` is primary owner; `user_id` is optional overlay | `session.server.ts:36–42`, `db/index.ts:76–85` |
| User settings stored backend-scoped to `user_id` | ❌ No settings tables exist; all settings in `localStorage` | `schema.sql` (no settings table), `cockpit-store.ts:104` |
| Provider keys encrypted server-side, never exposed to client | ❌ Stored in session cookie; metadata returned to client | `session.server.ts:15–16`, `keys/status.ts:15–23` |
| Chats offline-first by default | ❌ Backend thread API exists with no opt-in gate | `schema.sql:23–41`, `threads.ts:53–166` |
| Chat sync opt-in per user/thread | ❌ No `sync_enabled` flag; no `syncChatsToServer` setting | `cockpit-store.ts:51–65` (no sync field), `README.md:514` (false claim) |
| Import/export with ownership boundaries | ❌ Two uncoordinated mechanisms; no claim/transfer logic | `threads.import.ts:92–103`, `cockpit-store.ts:846–858` |
| Anonymous guest mode separate from real account | ❌ Indistinguishable in data layer | `session.server.ts:36–42`, `db/index.ts:76–85` |

---

## Files Requiring Change

### Schema
- `src/lib/db/schema.sql`
- `src/lib/db/migration_auth.sql` (or a new migration file)

### Backend Auth & Session
- `src/lib/session.server.ts`
- `src/lib/auth.server.ts`
- `src/routes/api/auth/register.ts`
- `src/routes/api/auth/login.ts`
- `src/routes/api/auth/me.ts`
- `src/routes/api/auth/logout.ts`

### Backend Data Layer
- `src/lib/db/index.ts`

### Backend API Routes
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
- `src/routes/api/session.ts`

### Frontend Store
- `src/lib/cockpit-store.ts`

### Frontend Chat Hook
- `src/hooks/use-chat.ts` (if sync integration is needed)

### Tests
- `src/routes/api/-auth.test.ts`
- `src/routes/api/-keys.test.ts`
- `src/routes/api/-threads.test.ts`
- `src/routes/api/-usage.test.ts`
- `src/routes/api/-stats.test.ts`
- `src/lib/auth.server.test.ts`
- `src/lib/cockpit-store.test.ts`
- `src/lib/cockpit-store.test.tsx`

### Documentation
- `README.md` (multiple sections contain false claims about device-local-only storage and `syncChatsToServer`)
