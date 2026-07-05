# Edgecase Account Separation — Reconstruction Plan

This plan follows `ACCOUNT_SEPARATION_PLAN.md` and is corrected by `SURFACE_AUDIT.md`. It contains concrete file paths, exact function signatures, and a phased implementation order. No implementation code is written here; this is the authoritative reconstruction brief.

## Verified Context from Audit

- `OnboardingModal` is rendered unconditionally inside `src/routes/index.tsx:614`.
- Auth UI is `src/routes/auth.tsx` with search params `mode: "signin" | "register"` and `redirect: string` (default `/settings`).
- `register()` / `login()` in `cockpit-store.ts` are thin wrappers around `authRequest()`.
- `authRequest()` immediately switches state to the user bucket and persists it.
- Offline queue lives in `src/hooks/use-chat.ts` as `cockpit.offline-queue.v1` and is global.
- `clearAll()` resets runtime state and persists the empty state to the current account key; it does not wipe all `localStorage`.
- No `localProfileId` or `accountMode` exists today. Guest data is keyed literally to `"guest"`.
- `vector-store.ts` has `loadVectorStoreForUser`, `searchVectorStoreForUser`, `addVectorDocsForUser`, but lacks `saveVectorStoreForUser` / `getAllVectorDocsForUser`.

## Design Decisions

### Account Mode State

```ts
type AccountMode = "undetermined" | "local-only" | "server";

const ACCOUNT_MODE_KEY = "cockpit.account.mode";
const LOCAL_PROFILE_ID_KEY = "cockpit.local-profile.id";
```

- `undetermined` means the user has never made an explicit identity choice.
- `local-only` means the user chose the local profile and has a stable `localProfileId`.
- `server` means a server account is currently active.
- `localProfileId` is generated once on first explicit local choice and never deleted.

### Storage Key Migration

Guest bucket keys (`:guest`) are migrated to local profile keys (`:<localProfileId>`) lazily on first run after the feature ships. This is a one-time, client-side migration.

### Server `claimGuestData` Parameter

Add `claimGuestData?: boolean` (default `true`) to both:
- `src/routes/api/auth/register.ts`
- `src/routes/api/auth/login.ts`

Semantics:
- `true` (default): server runs `claimGuestSession(guestId, userId)` as today.
- `false`: server does NOT run `claimGuestSession`.

For local-to-server transitions:
- **Copy** → send `claimGuestData: false`. Client copies local data into user bucket.
- **Move** → send `claimGuestData: true`. Server claims any server-side guest data; client also moves local data.
- **Keep Separate** → send `claimGuestData: false`. Client does not touch local data; server account starts empty.

### Async Hydration

Replace the synchronous `hydrate()` with `hydrateAsync()`. The root route (and any route that depends on resolved identity) must block on it. While hydrating, show an `AccountLoadingSkeleton`.

## Phase 0: Additive Primitives (No UX Change)

Goal: introduce the new account-mode primitives without changing any visible behavior. All existing tests must pass.

### 0.1 `src/lib/cockpit-store.ts` — new types and helpers

Add inside the module:

```ts
export type AccountMode = "undetermined" | "local-only" | "server";

const ACCOUNT_MODE_KEY = "cockpit.account.mode";
const LOCAL_PROFILE_ID_KEY = "cockpit.local-profile.id";

function readAccountMode(): AccountMode {
  if (typeof window === "undefined") return "undetermined";
  const raw = localStorage.getItem(ACCOUNT_MODE_KEY);
  if (raw === "local-only" || raw === "server") return raw;
  return "undetermined";
}

function writeAccountMode(mode: AccountMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCOUNT_MODE_KEY, mode);
}

function readLocalProfileId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LOCAL_PROFILE_ID_KEY);
}

function writeLocalProfileId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_PROFILE_ID_KEY, id);
}

function generateLocalProfileId(): string {
  return crypto.randomUUID();
}

function getLocalProfileSettingsKey(id: string): string {
  return `${SETTINGS_KEY_BASE}:${id}`;
}

function getLocalProfileThreadsKey(id: string): string {
  return `${THREADS_KEY_BASE}:${id}`;
}

function getLocalProfileStatsKey(id: string): string {
  return `${STATS_KEY_BASE}:${id}`;
}
```

### 0.2 `src/lib/vector-store.ts` — copy helpers

Add exports:

```ts
export function getAllVectorDocsForUser(userId: string | null): VectorDoc[] {
  const key = userId ? getStoreKeyForUser(userId) : getGuestStoreKey();
  return loadDocsForKey(key);
}

export function saveVectorStoreForUser(userId: string | null, docs: VectorDoc[]): void {
  if (typeof window === "undefined") return;
  const key = userId ? getStoreKeyForUser(userId) : getGuestStoreKey();
  try {
    localStorage.setItem(key, JSON.stringify(docs));
  } catch {
    /* ignore quota errors */
  }
}
```

### 0.3 `src/lib/cockpit-store.ts` — state expansion

Add to `State`:

```ts
type State = {
  // ... existing fields
  accountMode: AccountMode;
  localProfileId: string | null;
};
```

Initialize:

```ts
let state: State = {
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
```

### 0.4 Migration function for legacy `"guest"` buckets

Add:

```ts
function migrateGuestBucketToLocalProfile(localProfileId: string): void {
  const guestSettings = readJson(getGuestSettingsKey());
  const guestThreads = readArr<Thread>(getGuestThreadsKey());
  const guestStats = loadStatsForKey(getGuestStatsKey());
  const guestDocs = loadDocsForKey(getGuestStoreKey());

  if (isRecord(guestSettings)) {
    localStorage.setItem(getLocalProfileSettingsKey(localProfileId), JSON.stringify(guestSettings));
  }
  if (guestThreads.length) {
    localStorage.setItem(getLocalProfileThreadsKey(localProfileId), JSON.stringify(guestThreads));
  }
  if (Object.keys(guestStats).length) {
    localStorage.setItem(getLocalProfileStatsKey(localProfileId), JSON.stringify(guestStats));
  }
  if (guestDocs.length) {
    saveVectorStoreForUser(localProfileId, guestDocs);
  }
}
```

Note: do not delete the old `:guest` keys during migration. Deletion can happen later once the migration is proven stable.

### 0.5 `enterServerMode` / `enterLocalMode` helpers

Add:

```ts
function enterServerMode(user: UserPublic): void {
  const settingsKey = getSettingsKeyForUser(user.id);
  const threadsKey = getThreadsKeyForUser(user.id);
  const statsKey = getStatsKeyForUser(user.id);
  const accountSettings = normalizeSettings(readJson(settingsKey));
  const accountThreads = readArr<Thread>(threadsKey);

  state = {
    ...state,
    user,
    accountMode: "server",
    providerKeyStatus: {},
    providerValidationStatus: {},
    stats: loadStatsForKey(statsKey),
    settings: accountSettings,
    threads: accountThreads,
    activeThreadId: null,
  };
  writeAccountMode("server");
  emit();
  persist();
  loadVectorStoreForUser(user.id);
  clearOfflineQueue();
  void refreshProviderKeyStatus();
  void loadSettingsFromServer();
}

function enterLocalMode(localProfileId: string): void {
  const settingsKey = getLocalProfileSettingsKey(localProfileId);
  const threadsKey = getLocalProfileThreadsKey(localProfileId);
  const statsKey = getLocalProfileStatsKey(localProfileId);
  const accountSettings = normalizeSettings(readJson(settingsKey));
  const accountThreads = readArr<Thread>(threadsKey);

  state = {
    ...state,
    user: null,
    accountMode: "local-only",
    localProfileId,
    providerKeyStatus: {},
    providerValidationStatus: {},
    stats: loadStatsForKey(statsKey),
    settings: accountSettings,
    threads: accountThreads,
    activeThreadId: null,
  };
  writeAccountMode("local-only");
  writeLocalProfileId(localProfileId);
  emit();
  persist();
  loadVectorStoreForUser(localProfileId);
  clearVectorStoreCache();
  clearOfflineQueue();
}
```

`clearOfflineQueue()` is added in 0.7.

### 0.6 `hydrateAsync()` implementation

Add:

```ts
export async function hydrateAsync(): Promise<void> {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;

  const mode = readAccountMode();
  let localProfileId = readLocalProfileId();

  if (mode === "server") {
    const user = await fetchMe();
    if (user) {
      enterServerMode(user);
    } else {
      // Session expired or invalid. Fall back to local profile if available.
      if (!localProfileId) {
        localProfileId = generateLocalProfileId();
        writeLocalProfileId(localProfileId);
      }
      // One-time migration from legacy guest bucket if local profile is empty.
      const hasLocalData = readJson(getLocalProfileSettingsKey(localProfileId)) !== undefined;
      if (!hasLocalData) {
        migrateGuestBucketToLocalProfile(localProfileId);
      }
      enterLocalMode(localProfileId);
    }
  } else if (mode === "local-only") {
    if (!localProfileId) {
      localProfileId = generateLocalProfileId();
      writeLocalProfileId(localProfileId);
    }
    const hasLocalData = readJson(getLocalProfileSettingsKey(localProfileId)) !== undefined;
    if (!hasLocalData) {
      migrateGuestBucketToLocalProfile(localProfileId);
    }
    enterLocalMode(localProfileId);
  } else {
    // undetermined — leave state in initial state, do not load guest bucket.
    state = { ...state, accountMode: "undetermined", localProfileId: null };
    setupCrossTabSync();
    return;
  }

  setupCrossTabSync();
  persist();
}
```

Keep the existing `hydrate()` for compatibility during the transition but have it do nothing except mark `hydrated = true`. All call sites should migrate to `hydrateAsync()`.

### 0.7 `clearOfflineQueue()` helper

Add to `cockpit-store.ts`:

```ts
const OFFLINE_QUEUE_KEY = "cockpit.offline-queue.v1";

function clearOfflineQueue(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {
    /* ignore */
  }
}
```

Also add `clearOfflineQueue()` calls inside `setUser()` and `clearUser()` for safety, even though those helpers will later be replaced by `enterServerMode` / `enterLocalMode`.

### 0.8 `setUser` / `clearUser` / `logout` compatibility

Refactor `setUser(user)` to delegate to `enterServerMode(user)` when `user` is non-null.

Refactor `clearUser()` to:
- if `state.localProfileId` exists, call `enterLocalMode(state.localProfileId)`;
- else generate a new `localProfileId`, migrate guest bucket if needed, and call `enterLocalMode(localProfileId)`.

Refactor `logout()`:
- after the `/api/auth/logout` call, do the same fallback logic as `clearUser()`.

Refactor `fetchMe()`:
- on 401 / no user / network error, do not load guest bucket. Instead, fall back to local profile via `enterLocalMode()` if `state.localProfileId` exists, otherwise remain in `undetermined`.

### 0.9 `authRequest()` supports `claimGuestData`

Change signature:

```ts
async function authRequest(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; user: UserPublic } | { ok: false; error: string }>;
```

 stays, but callers pass `claimGuestData: boolean` in `body`.

After successful response, do NOT immediately switch buckets. Instead return the user and let the caller decide whether to show `DataMigrationDialog`.

Wait — this conflicts with current `authRequest` behavior which switches immediately. To keep the change minimal, introduce a new exported helper:

```ts
export async function authRequestRaw(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; user: UserPublic } | { ok: false; error: string }>;
```

`authRequestRaw` only validates credentials and returns the user. `authRequest` (used by old callers) calls `authRequestRaw` then `enterServerMode(user)`.

Then update `register()` and `login()` in `cockpit-store.ts` to be exported as `registerRaw` / `loginRaw` that call `authRequestRaw`. Keep thin `register()` / `login()` wrappers for backward compatibility.

Actually, simpler: change `register()` and `login()` to accept an optional second object:

```ts
export async function register(
  email: string,
  password: string,
  displayName?: string,
  opts?: { claimGuestData?: boolean; onMigrate?: (user: UserPublic) => void },
): Promise<...>
```

If `opts?.onMigrate` is provided, do not call `enterServerMode` automatically. Instead call `onMigrate(user)`. This lets `auth.tsx` show the migration dialog.

But `login()` should not normally show a migration dialog; login is for existing accounts. Only register from local mode triggers the dialog.

Decision:
- `register()` gains `opts?: { onBeforeEnterServer?: (user: UserPublic) => boolean }`.
  - If `onBeforeEnterServer` returns `true`, proceed to `enterServerMode(user)`.
  - If it returns `false`, stop and return the user without switching state.
- `login()` always calls `enterServerMode(user)` after success.
- Both accept a `claimGuestData` option forwarded to the request body.

### 0.10 Cross-tab sync must use `accountMode`

Update `setupCrossTabSync()` so that storage events for the active account key are ignored when `state.accountMode` is `undetermined`. This prevents a background tab from pushing guest/local/server data before the user has chosen.

## Phase 1: Server-Side API Changes

### 1.1 `src/routes/api/auth/register.ts`

Change body schema:

```ts
const Body = z.object({
  email: z.string().email().min(1).max(256),
  password: z.string().min(8).max(128),
  displayName: z.string().max(128).optional(),
  claimGuestData: z.boolean().optional().default(true),
});
```

After `setAuthSession`, wrap `claimGuestSession` in:

```ts
if (guestId && parsed.data.claimGuestData !== false) {
  await claimGuestSession(guestId, result.user.id);
}
```

### 1.2 `src/routes/api/auth/login.ts`

Same change:

```ts
const Body = z.object({
  email: z.string().email().min(1).max(256),
  password: z.string().min(1).max(128),
  claimGuestData: z.boolean().optional().default(true),
});
```

```ts
if (guestId && parsed.data.claimGuestData !== false) {
  await claimGuestSession(guestId, user.id);
}
```

### 1.3 `src/routes/api/auth/logout.ts`

No change needed. `clearAuthSession` already preserves session `id`. `clearGuestSessionId` causes regeneration on next anonymous request, which is acceptable. Optionally, remove the `clearGuestSessionId()` call entirely so the same `guestSessionId` remains, making local profile continuity even clearer. Either is safe; prefer removing it to match the plan.

## Phase 2: Identity Choice UI

### 2.1 Create `src/components/cockpit/IdentityChoiceModal.tsx`

Render a modal with three equal-weighted choices:

1. **Create Server Account**
   - `writeAccountMode("server")` then `navigate({ to: "/auth", search: { mode: "register", redirect: "/" } })`.
2. **Sign In to Existing Account**
   - `writeAccountMode("server")` then `navigate({ to: "/auth", search: { mode: "signin", redirect: "/" } })`.
3. **Use Local-Only Profile**
   - generate `localProfileId` if missing, write it, migrate legacy guest bucket if needed, `enterLocalMode(localProfileId)`.

No close button, no skip. The modal must remain open until a choice is made.

### 2.2 Gate `src/routes/index.tsx`

At the top of the `Cockpit` component:

```tsx
const [hydrating, setHydrating] = useState(true);

useEffect(() => {
  void hydrateAsync().then(() => setHydrating(false));
}, []);

const accountMode = useStore((s) => s.accountMode);
const onboardingCompleted = useStore((s) => s.settings.onboardingCompleted);

if (hydrating) return <AccountLoadingSkeleton />;
if (accountMode === "undetermined") return <IdentityChoiceModal />;
if (!onboardingCompleted) return <OnboardingModal />;
```

Move the existing `<OnboardingModal />` from line 614 to this conditional block.

Create a minimal `AccountLoadingSkeleton` component inline or in `src/components/cockpit/AccountLoadingSkeleton.tsx`.

### 2.3 Update `OnboardingModal` entrance condition

`OnboardingModal` currently returns `null` when `onboardingCompleted` is true. Keep that. It will only render when the parent explicitly mounts it.

## Phase 3: Data Migration Dialog

### 3.1 Create `src/components/cockpit/DataMigrationDialog.tsx`

Props:

```ts
type Props = {
  user: UserPublic;
  onDone: () => void;
};
```

Three options:

1. **Copy**
   - If `state.localProfileId` exists, copy settings/threads/stats/vector docs into user bucket.
   - Register request sent with `claimGuestData: false`.
   - Local profile data remains intact.
2. **Move**
   - Copy local data into user bucket, then clear local profile bucket.
   - Register request sent with `claimGuestData: true`.
3. **Keep Separate**
   - Do not copy anything.
   - Register request sent with `claimGuestData: false`.
   - Server account starts with default settings.

After the chosen action completes, call `enterServerMode(user)` and then `onDone()`.

### 3.2 Implement `copyLocalToServer(userId: string, localProfileId: string)`

```ts
function copyLocalToServer(userId: string, localProfileId: string) {
  const localSettings = readJson(getLocalProfileSettingsKey(localProfileId));
  const localThreads = readArr<Thread>(getLocalProfileThreadsKey(localProfileId));
  const localStats = loadStatsForKey(getLocalProfileStatsKey(localProfileId));
  const localDocs = getAllVectorDocsForUser(localProfileId);

  if (localSettings !== undefined) {
    localStorage.setItem(getSettingsKeyForUser(userId), JSON.stringify(localSettings));
  }
  if (localThreads.length) {
    localStorage.setItem(getThreadsKeyForUser(userId), JSON.stringify(localThreads));
  }
  if (Object.keys(localStats).length) {
    localStorage.setItem(getStatsKeyForUser(userId), JSON.stringify(localStats));
  }
  if (localDocs.length) {
    saveVectorStoreForUser(userId, localDocs);
  }
}
```

### 3.3 Implement `moveLocalToServer(userId: string, localProfileId: string)`

Same as copy, then remove local profile keys:

```ts
localStorage.removeItem(getLocalProfileSettingsKey(localProfileId));
localStorage.removeItem(getLocalProfileThreadsKey(localProfileId));
localStorage.removeItem(getLocalProfileStatsKey(localProfileId));
saveVectorStoreForUser(localProfileId, []);
```

### 3.4 Wire `DataMigrationDialog` into `src/routes/auth.tsx`

Change `handleRegister`:

```ts
const handleRegister = async (values: RegisterForm) => {
  setGlobalError(null);
  const previousMode = store.getState().accountMode;
  const result = await register(values.email, values.password, values.displayName, {
    claimGuestData: previousMode === "local-only" ? false : true,
    onBeforeEnterServer: (user) => {
      if (previousMode === "local-only") {
        setPendingMigrationUser(user);
        return false; // do not auto-switch; show dialog
      }
      return true;
    },
  });

  if (result.ok && pendingMigrationUser) {
    // wait for dialog
    return;
  }

  if (result.ok) {
    toast.success("Account created");
    navigate({ to: redirect });
    return;
  }
  setGlobalError(result.error);
};
```

Add local state `const [pendingMigrationUser, setPendingMigrationUser] = useState<UserPublic | null>(null);`.

Render:

```tsx
{pendingMigrationUser && (
  <DataMigrationDialog
    user={pendingMigrationUser}
    onDone={() => {
      setPendingMigrationUser(null);
      toast.success("Account created");
      navigate({ to: redirect });
    }}
  />
)}
```

## Phase 4: Account Menu & Switching

### 4.1 Update `src/components/cockpit/AccountMenu.tsx`

- When `user` is null and `accountMode === "local-only"`, show "Local Profile" instead of "Guest".
- Add a "Switch to Local Profile" option when `user` is set.
- Add a "Sign in / Create account" option when in local-only mode.
- Use `store.enterLocalMode()` and `store.enterServerMode()` — these must be exposed from `cockpit-store.ts`.

Expose from store:

```ts
export const store = {
  // ... existing methods
  enterServerMode,
  enterLocalMode,
};
```

But `enterServerMode` and `enterLocalMode` currently take user/profile id. For "Switch to Local Profile", no user is needed. For "Sign in / Create account", navigation to `/auth` is sufficient; the server auth will set the user.

### 4.2 Add `switchToLocalProfile()` / `switchToServerSignIn()` convenience methods

```ts
async switchToLocalProfile() {
  let localProfileId = state.localProfileId;
  if (!localProfileId) {
    localProfileId = generateLocalProfileId();
  }
  enterLocalMode(localProfileId);
},

switchToServerSignIn() {
  navigate({ to: "/auth", search: { mode: "signin", redirect: "/settings" } });
},
```

Actually `navigate` is a hook; the component should call `useNavigate()`. The store method can just write `accountMode = "server"` and let the component navigate. Simpler: AccountMenu does the navigation directly.

## Phase 5: Tests

### 5.1 Update `src/lib/cockpit-store.test.ts`

- Add tests for `enterServerMode` / `enterLocalMode` bucket switching.
- Add test for `hydrateAsync`:
  - when `accountMode` is `undetermined`, state remains undetermined and no bucket is loaded.
  - when `accountMode` is `server` and `/api/auth/me` returns user, user bucket loads.
  - when `accountMode` is `server` and `/api/auth/me` returns 401, falls back to local profile.
- Add migration test: legacy `:guest` data is copied to `:localProfileId` on first run.
- Add `clearOfflineQueue` assertion on account switch.

### 5.2 Update `src/routes/api/-auth.test.ts`

- Add tests for `claimGuestData: false` in register/login.
- Add test that `claimGuestSession` is NOT called when `claimGuestData: false`.
- Keep existing auto-claim tests (default `true`).

### 5.3 Add `src/components/cockpit/IdentityChoiceModal.test.tsx`

- Assert three buttons exist.
- Assert no close/skip path.
- Assert clicking local-only generates `localProfileId`.
- Assert clicking server navigates to `/auth`.

### 5.4 Add `src/components/cockpit/DataMigrationDialog.test.tsx`

- Assert copy/move/keep-separate options.
- Assert copy duplicates local data into user bucket without deleting local.
- Assert move deletes local data after copying.
- Assert keep-separate leaves both untouched.

### 5.5 Update `src/components/cockpit/AccountMenu.test.tsx`

- Update "Guest" assertions to "Local Profile" when in local-only mode.
- Add test for "Switch to Local Profile" when signed in.
- Add test for "Sign in" when in local-only mode.

### 5.6 Update `src/components/cockpit/OnboardingModal.test.tsx`

- Add test that modal does not render when `accountMode === "undetermined"`.
- Add test that modal renders after identity choice when onboarding not completed.

## Phase 6: E2E Acceptance Revalidation

Re-run the 17-step flow from `ACCOUNT_SEPARATION_PLAN.md` against the real browser after all phases. Key checkpoints:

1. Fresh install → `accountMode = "undetermined"`, identity modal blocks UI.
2. Local choice → `localProfileId` generated, onboarding shown.
3. Local data stored under `:localProfileId`.
4. Register → migration dialog shown.
5. Copy/move/keep-separate behaves as specified.
6. Logout → returns to local profile, not guest.
7. Reload → no flash; `hydrateAsync` resolves correct account before render.

## Phase 7: Release / Deployment Gate

Goal: carry the account-separation reconstruction from local implementation through production deployment proof in one pass ladder. Do not deploy until Phases 0-6 have passed and the worktree scope has been reviewed.

### 7.1 Worktree and graph-scope gate

Before release verification:

```bash
git status --short
git diff --check
```

- Confirm the diff is limited to the account-separation implementation, tests, and required docs.
- Confirm no archived, deprecated, review-needed, generated, or prompt-handoff Markdown has become active instruction context again.
- Run GitNexus `detect_changes({ scope: "all" })` and review affected processes before commit/deployment.
- If any edited symbol was HIGH or CRITICAL risk during earlier GitNexus impact analysis, stop and get explicit approval before release.

### 7.2 Local static and unit gates

Run the full normal gate:

```bash
bun run test
bun run typecheck
bun run lint
bun run build
```

Expected result: all pass. Existing accepted lint warnings remain acceptable only if they are the same pre-existing warnings already documented by `README.md`.

### 7.3 Production-like preview gate

Use the Wrangler-backed preview path, not `vite preview`, because the production runtime is Cloudflare/Nitro output with Worker bindings.

Run:

```bash
bun run test:e2e:preview
bun run test:e2e:audit:preview
```

Required preview proof:

- Fresh browser profile starts in `accountMode = "undetermined"` and blocks on identity choice.
- Local-only profile creates a stable `localProfileId` and does not load server-account buckets.
- Register from local-only mode shows `DataMigrationDialog`.
- Copy, move, and keep-separate behavior matches `ACCOUNT_SEPARATION_PLAN.md`.
- Logout returns to the local profile.
- Reload/hard refresh never flashes the wrong account bucket before `hydrateAsync` resolves.
- User A and User B cannot see each other's provider configs, settings, stats, threads, vector docs, or server-owned data.

### 7.4 Cloudflare deployment preflight

Before deploying, check Cloudflare/D1 state without echoing secrets:

```bash
bunx wrangler d1 migrations list edgecase-cockpit --remote
bunx wrangler deploy --dry-run
```

- If this reconstruction added D1 migrations, apply them before deployment:

```bash
bunx wrangler d1 migrations apply edgecase-cockpit --remote
```

- If no migrations were added, record that no D1 apply was needed.
- Confirm required production bindings/secrets by presence only: `DB`, `SESSION_SECRET`, `ENCRYPTION_KEY`, and `RATE_LIMITER_DO` when durable-object rate limiting is enabled.
- Do not print or commit secret values.

### 7.5 Deploy

Deploy the Worker only after 7.1-7.4 pass:

```bash
bunx wrangler deploy
```

The public web target for this repo is:

```text
https://cockpit.asherlewis.online
```

### 7.6 Deployed runtime proof

After deploy, prove the live runtime, not just the build artifact:

```bash
curl -I https://cockpit.asherlewis.online/
curl -i https://cockpit.asherlewis.online/api/auth/me
E2E_RUNTIME=deployed E2E_BASE_URL=https://cockpit.asherlewis.online bun run test:e2e:deployed
E2E_RUNTIME=deployed E2E_BASE_URL=https://cockpit.asherlewis.online bunx playwright test e2e/runtime-audit.spec.ts
```

Required deployed proof:

- `/` returns `200`.
- Anonymous `/api/auth/me` returns the expected unauthenticated response.
- `/auth` loads and can obtain the CSRF cookie.
- Create-account, sign-in, session persistence, `/settings` redirect/access, logout, and post-logout `/api/auth/me` all pass on the deployed domain.
- The 17-step account-separation flow from `ACCOUNT_SEPARATION_PLAN.md` passes against the deployed URL, including reload/hard-refresh checks.
- Runtime-audit artifacts are captured under the deployed Playwright output path and referenced in the release report.

### 7.7 Release report

The final report for the pass must include:

- Commit or diff scope.
- GitNexus `detect_changes` risk summary.
- Local gate results.
- Preview E2E/runtime-audit results.
- D1 migration decision: applied or not needed.
- Wrangler deploy result.
- Live URL.
- Deployed smoke and runtime-audit results.
- Any skipped gate and the concrete reason.

## Implementation Order Summary

| Phase | Focus | Files Touched |
|-------|-------|---------------|
| 0 | Primitives: state, helpers, migration, async hydration | `src/lib/cockpit-store.ts`, `src/lib/vector-store.ts` |
| 1 | Server API `claimGuestData` | `src/routes/api/auth/register.ts`, `src/routes/api/auth/login.ts`, `src/routes/api/auth/logout.ts` |
| 2 | Identity choice UI | `src/routes/index.tsx`, `src/components/cockpit/IdentityChoiceModal.tsx`, `src/components/cockpit/AccountLoadingSkeleton.tsx` |
| 3 | Migration dialog | `src/routes/auth.tsx`, `src/components/cockpit/DataMigrationDialog.tsx` |
| 4 | Account menu switching | `src/components/cockpit/AccountMenu.tsx` |
| 5 | Tests | `src/lib/cockpit-store.test.ts`, `src/routes/api/-auth.test.ts`, `src/components/cockpit/IdentityChoiceModal.test.tsx`, `src/components/cockpit/DataMigrationDialog.test.tsx`, `src/components/cockpit/AccountMenu.test.tsx`, `src/components/cockpit/OnboardingModal.test.tsx` |
| 6 | E2E validation | browser / Playwright |
| 7 | Release / deployment gate | `wrangler.jsonc`, D1 migrations only if added, Cloudflare deployed runtime, release report |

## Open Decision: Local Profile vs Guest Session Continuity

The server `guestSessionId` currently serves two purposes:
1. Anonymous rate-limit identity.
2. Server-side guest data ownership (for `claimGuestSession`).

After this reconstruction, purpose #2 is obsolete for local profiles (they never create server-side guest data). We should decide:

- Option A: Keep `guestSessionId` purely for rate-limit continuity. It is regenerated after logout. Simple.
- Option B: Replace `guestSessionId` semantics with `localProfileId`. This would require the client to send `localProfileId` to the server for rate-limiting, which leaks the local profile id to the server.

Recommended: Option A. Local profile identity stays client-side. Rate-limit identity remains a separate server-side cookie id.

## Dependencies Before Implementation

- Decide on Option A vs B above.
- Confirm whether the root layout (`src/routes/__root.tsx`) also needs `hydrateAsync` or if `index.tsx` gating is sufficient. Inspect `src/routes/__root.tsx` before Phase 2.
- Confirm `apiFetch` behaves correctly when called during `hydrateAsync` before React hydration is complete (CSRF cookie availability).
- Confirm whether the implementation adds any D1 migrations. The default expectation for this reconstruction is no schema change; if that changes, Phase 7 must include migration apply and rollback notes.
- Confirm Cloudflare deployment credentials and secrets by presence only before Phase 7. Never echo secret values.

---

*This document now carries the work from implementation through deployed runtime proof. Create a separate persistence or remediation document only if a Phase dependency exposes a new risk that cannot be resolved inside this pass ladder.*
