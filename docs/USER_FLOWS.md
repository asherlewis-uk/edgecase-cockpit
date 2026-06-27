# Edgecase Cockpit — Current User Flows, Account Reality, and V1 Local Loop

> **Scope:** A brutally literal description of the current user/account model and end-to-end product behavior. This document reflects the code and production state as of the latest audit; it does not speculate about planned features.

> **V1 product contract:** V1 is a local-first/BYOC AI control surface that proves one concrete local/BYOC runtime path for edgecase-cockpit: a user-configured generic local OpenAI-compatible endpoint. This is a declared product decision made now, not recovered from prior named-provider evidence. Cloud providers, cloud API keys, OAuth/social login, marketplace scope, signed native releases, live provider accounts, named provider presets, and unrelated agent infrastructure are supported infrastructure or non-V1 future work, not the V1 promise.

---

## Part A — Current signup, login, identity, and account model

### 1. Signup / login

| Question | Current reality | Evidence |
| --- | --- | --- |
| Is there actual user signup today? | **Yes.** Email/password signup and sign-in are exposed through the `/auth` route. | `src/routes/auth.tsx`, `src/components/cockpit/AccountMenu.tsx`, `src/routes/api/auth/register.ts`, `src/routes/api/auth/login.ts`. |
| Is there email/password signup? | **Yes.** The `/auth` route provides sign-in and create-account tabs backed by `POST /api/auth/register` and `POST /api/auth/login`. | `src/routes/auth.tsx`, `src/routes/api/auth/register.ts`, `src/routes/api/auth/login.ts` |
| Is there Google Sign-In? | **No.** | No OAuth callback route, no Google client ID, no OAuth library. |
| Is there Apple Sign-In? | **No.** | No Sign in with Apple configuration, no OAuth callback route. |
| Is there OAuth at all? | **No.** | Search of `src/` finds no OAuth provider integration. |
| Is the current session anonymous, account-backed, or hybrid? | **Hybrid.** Every visitor starts as a guest with an encrypted cookie (`session.id` + `guestSessionId`). The `/auth` route and Account menu let them attach a `userId` to the same cookie. | `src/routes/auth.tsx`, `src/components/cockpit/AccountMenu.tsx`, `src/lib/session.server.ts` (`getCockpitSession`, `setAuthSession`). |
| What creates the user/session identity? | **For guests:** TanStack Start's encrypted cookie session plus a generated `guestSessionId`. **For authenticated users:** the same cookie after `setAuthSession(userId, email)` is called by login/register handlers. | `src/lib/session.server.ts` |
| What database tables/columns represent user/account identity? | `users(id, email, password_hash, display_name, created_at, updated_at)` and `sessions(id, data, created_at, updated_at)` for the cookie ID. `guest_sessions(id, data_json, expires_at)` for anonymous sessions. | `src/lib/db/schema.sql` |

**Password hashing:** PBKDF2-HMAC-SHA256, 600,000 iterations, 128-bit salt (`src/lib/auth.server.ts`). This is **not** bcrypt, despite what earlier docs said.

**What this means for a normal user today:**
- A person opening the production URL lands as a guest and can explore the app immediately.
- The V1 local proof path must work as a guest: configure or detect a generic local OpenAI-compatible endpoint; explain state/config; run one safe model-list action; show result; recover from failure.
- To save provider API keys, sync settings, or own server-side data, they create an account (or sign in) through the `/auth` route or the Account menu.
- On registration or login, any existing D1-resident guest data is claimed into the new authenticated account via `claimGuestSession`.

---

### 2. Visibility and access

| Data | Scoped to | Current evidence | Caveat |
| --- | --- | --- | --- |
| Provider API keys | Authenticated `user_id` in D1, encrypted | `user_provider_keys` PK is `(user_id, provider_id)`. `setProviderCreds` rejects guests with 401. `/api/keys/status` only lists keys for the current `userId`. Cross-user tests exist. | Reachable after signing in through `/auth`; `ProviderCard` shows an inline auth prompt for guests. |
| Threads (D1 sync path) | Authenticated `user_id` or guest `session_id` | `ownerWhere()` in `src/lib/db/index.ts` builds `user_id = ?` or `session_id = ? AND user_id IS NULL`. `threads.user_id` FK. | Sync is opt-in and UI does not currently enable it; most threads are `localStorage`-only. |
| Settings | Authenticated `user_id` | `GET/POST /api/settings` return 401 for guests; `user_settings` table is `user_id` PK. | Reachable after signing in through `/auth`. |
| Usage records | Authenticated `user_id` or guest `session_id` | `usage_records.user_id` / `usage_records.session_id`; aggregate queries use `ownerWhere`. | Only created when server-side usage tracking is triggered. |
| Provider stats | Authenticated `user_id` or guest `session_id` | `provider_stats` has partial indexes on `user_id` and `session_id`. | Local stats remain in `localStorage` by default. |
| Vector docs (server) | Authenticated `user_id` or guest `session_id` | `vector_docs` has `user_id` / `session_id` columns. | Server RAG sync is disabled (`_serverSyncAvailable = false`). |
| `localStorage` threads/settings/RAG | Single device/browser profile only | `cockpit-store.ts` persists to `cockpit.settings.v2`, `cockpit.threads.v1`, etc. No account gating. | Cross-tab sync works via `storage` events; cross-device sync does not exist. |

**Route handlers that enforce ownership:**
- `/api/settings` — 401 if `userId` missing.
- `/api/keys/set` — returns `401 { error: "Authentication required" }` for guests. The `ProviderCard` UI gates the Save button and shows an inline auth prompt.
- `/api/keys/status` — returns empty for guests.
- `/api/keys/validate` — returns empty for guests.
- `/api/threads` (GET/POST/DELETE), `/api/threads.$id` — use `ownerWhere(session.data.id, session.data.userId)`.
- `/api/usage`, `/api/usage/$threadId` — scoped by `session.id` or `userId`.
- `/api/stats` — scoped by `session.id` or `userId`.
- `/api/vector-docs` — scoped by `session.id` or `userId`.

**Tests proving isolation:**
- `src/routes/api/-account-separation.test.ts` — mocks prove `setProviderCreds` rejects guests, settings returns 401 for guests, keys/settings are user-scoped.
- `src/routes/api/-auth.test.ts` — register/login/logout/me lifecycle and guest claim.
- `src/lib/session.server.test.ts` — session helpers and provider credential storage.

**Areas not yet proven by an end-to-end user flow:**
- Cross-user data denial with real cookies (unit tests mock sessions; no browser E2E for isolation yet).
- Guest-to-user data claim in production D1.
- Google/Apple/OAuth identity flows are not implemented and are not V1.

**V1 local loop proof:** The canonical generic local OpenAI-compatible endpoint loop is documented, implemented, and covered by focused browser E2E with deterministic mocked endpoint responses.

---

### 3. Configuration/provider access

| Question | Current reality | Evidence |
| --- | --- | --- |
| Where are provider API keys stored? | Encrypted in D1 `user_provider_keys` when an authenticated user saves them. The client `ProviderConfig.apiKey` field is only used as a transient draft in the UI; it is stripped before `localStorage` persistence. | `src/lib/session.server.ts` `setProviderCreds`, `src/lib/cockpit-store.ts` `persist()` strips `apiKey`. |
| Are keys encrypted? | Yes, AES-256-GCM with `ENCRYPTION_KEY` (production) or `SESSION_SECRET` fallback. | `src/lib/encryption.server.ts` |
| Are settings stored locally, remotely, or both? | Both paths are reachable. `cockpit-store.ts` writes to `localStorage` for everyone; `/api/settings` writes to D1 for authenticated users. | `src/lib/cockpit-store.ts`, `src/routes/api/settings.ts`, `src/routes/auth.tsx` |
| Are provider/tool permissions scoped by user/session/workspace? | User. `user_tool_permissions` table has `user_id`. | `migrations/0003_pricing_and_tool_permissions.sql`, `src/routes/api/tools/permissions.ts` |
| Are configs shared globally or isolated? | Isolated per user/session. Server-side queries always include `ownerWhere`. | `src/lib/db/index.ts` |
| What happens on a new browser/device? | A new guest cookie/session is created; `localStorage` threads/settings do not transfer. If the user signs in, server-side keys, settings, and synced threads become available. | `src/lib/session.server.ts` `getGuestSessionId`, `src/lib/cockpit-store.ts` defaults, `src/routes/auth.tsx`. |

**V1 local-provider configuration boundary:**
- V1 must prove one concrete local/BYOC runtime path: a user-configured generic local OpenAI-compatible endpoint, not an open-ended provider list.
- This target is a declared product decision made now, not recovered from prior named-provider evidence.
- Hermes Agent (`hermes`), OpenClaw (`openclaw`), local Ollama (`ollama`), LM Studio, vLLM, llama.cpp, and other named providers are implementation candidates or future named presets only; they are not the V1 proof set.
- The canonical endpoint contract includes a configurable base URL, model-list endpoint, chat-completions-compatible endpoint, no required cloud API key, browser-detectable reachable/unreachable state, deterministic mocked E2E support, safe bounded model-list action, and visible recovery from bad URL, timeout, empty models, malformed response, and hosted HTTPS/local HTTP blocking.
- V1 safe action is a model-list probe, not a broad provider chat or cloud-key validation flow.
- V1 must not require OpenAI, any cloud provider key, OAuth, a marketplace install, signed native builds, live provider accounts, unrelated agent infrastructure, or real local daemons in CI.
- Guests must be able to see local capability state and required base URL/model configuration before any account prompt.

---

### 4. Google/Apple sign-in feasibility

**Can Google Sign-In be added?** Yes. The backend has a `users` table and encrypted session cookie system that can absorb an OAuth identity.

**Can Apple Sign-In be added?** Yes, same reasoning.

**What would need to change?**
1. **Dependency:** Add an OAuth client library compatible with Cloudflare Workers (e.g., `arctic` for PKCE/OAuth 2.0, or provider-specific SDKs). Avoid heavy Node-only libraries.
2. **Routes:** Add `/api/auth/google` (initiate), `/api/auth/google/callback`, and equivalents for Apple. Store the provider's `sub`/`email` in a new `user_identities` or `oauth_accounts` table linked to `users.id`.
3. **DB schema:** Add `oauth_accounts(provider, provider_account_id, user_id)` or extend `users` with `google_id`/`apple_id`. A separate table is safer for multiple identity providers.
4. **UI:** Add "Sign in with Google/Apple" buttons, account menu, logout, and profile linking.
5. **Secrets:** Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` to Cloudflare secrets.
6. **Migration path:** Current guest users have no `user_id`. To migrate from anonymous/session users to real accounts, the app must:
   - On first OAuth login, create a `users` row and call `claimGuestSession(guestId, newUserId)` to move any D1-resident guest data.
   - Merge or preserve `localStorage` data on the device (currently manual via export/import).

**Risks around existing encrypted keys, thread ownership, and session continuity:**
- **Encrypted keys:** Keys are bound to `user_id`. A user created via OAuth would need a fresh `user_id`; existing keys are zero because the UI cannot save them while unauthenticated. Once OAuth is added, keys saved before account linking would be lost unless claim logic runs first.
- **Thread ownership:** Server-synced threads are rare today (`sync_enabled` defaults to off). Any guest `threads` rows would be claimed via `claimGuestSession`. `localStorage` threads remain device-local.
- **Session continuity:** The encrypted cookie already carries `session.id`. `setAuthSession` adds `userId`/`userEmail` without rotating the cookie ID, so CSRF/rate-limit continuity is preserved.
- **OAuth email collisions:** If a user later adds password login, the system must link to the same `users` row by email or de-duplicate accounts.

---

## Part B — Complete current user flow and V1 E2E promise map

### V1 local loop that future E2E must prove

This is the exact V1 browser E2E promise. It must be proven for the user-configured generic local OpenAI-compatible endpoint with deterministic mocked/local test responses, not live provider accounts, unrelated agent infrastructure, or real local daemons in CI.

1. Fresh guest launch enters a local-first path without signing in.
2. The UI foregrounds a configurable local OpenAI-compatible endpoint rather than a named provider preset.
3. The endpoint contract includes a configurable base URL, model-list endpoint, and chat-completions-compatible endpoint.
4. The target shows a capability state: checking, reachable, unreachable, misconfigured, no-models, hosted-HTTPS-blocked, mobile-localhost-mismatch, ready, or failed.
5. The state explains what was detected, what is unavailable, and the required configuration/recovery action.
6. The user can run one safe controlled model-list action for the target.
7. Success shows returned models and system state.
8. Empty models, malformed responses, unreachable endpoint, bad base URL, timeout/abort, and hosted HTTPS local HTTP block all produce visible recoverable failure states.
9. Updating configuration and retrying can move the target from failed/unavailable to ready.
10. The loop fails the test if it depends on OpenAI, cloud API keys, OAuth/social login, marketplace scope, signed native builds, live provider accounts, unrelated agent infrastructure, or real local daemons in CI.

The sections below describe the broader current app behavior. They include non-V1 cloud/auth surfaces because those exist in the repository, not because they are V1 requirements.

### 1. User lands on the production URL

- **User-visible:** Dark, calm chat shell. If `localStorage` is empty, the onboarding modal appears with "Welcome to Edgecase Cockpit", "Get Started", "Skip for Now".
- **Backend:** Worker cold start runs `validateEnv()`, D1 binding check, rate-limiter config, CSP/CSRF cookie attachment on HTML responses.
- **Evidence:** `src/components/cockpit/OnboardingModal.tsx`, `src/server.ts`.
- **Gap:** No forced account prompt; guests can explore. Account controls are reachable from the Drawer footer and Settings.

### 2. App boots and validates runtime env

- **User-visible:** If `SESSION_SECRET` is missing/short, every request returns HTTP 503 JSON `{ error: "Server misconfigured" }`.
- **Backend:** `server.ts` calls `validateEnv()`; missing `ENCRYPTION_KEY` is also fatal in production/D1 mode.
- **Evidence:** `src/server.ts`, `src/lib/env.server.ts`.
- **Verification:** Production smoke tests confirm `/` and `/api/keys/status` return 200.

### 3. Session/csrf cookies are created

- **User-visible:** No visible action.
- **Backend:** TanStack Start encrypted cookie `cockpit-session` is set (`httpOnly`, `Secure`, `SameSite=Lax`). A separate `csrf-token` cookie is attached to HTML responses; the client reads it and sends `X-CSRF-Token` on mutating requests.
- **Evidence:** `src/lib/session.server.ts`, `src/lib/csrf.server.ts`.

### 4. First-launch/onboarding appears or does not appear

- **User-visible:** Onboarding modal on first load; "Skip for Now" closes it and sets `onboardingCompleted: true` in `localStorage`; "Get Started" moves to provider selection, then links to Settings.
- **Backend:** Onboarding state is purely local today (`localStorage`). Server-side `user_settings.onboarding_completed` is reachable after signing in, but the UI currently persists onboarding completion locally.
- **Evidence:** `src/components/cockpit/OnboardingModal.tsx`, `src/lib/cockpit-store.ts`.

### 5. User configures provider/model/API key

- **User-visible:** Settings → provider card expands → API key input (masked) → Save. The app then tries `POST /api/keys/set`.
- **Backend:** `/api/keys/set` validates CSRF, rate limit, provider ID, then calls `setProviderCreds` which requires `userId`.
- **Current edge:** Guests see an inline auth prompt in `ProviderCard`; the Save button does not call `/api/keys/set` while unauthenticated. Authenticated users can save keys successfully.
- **V1 boundary:** This API-key path is for cloud/provider infrastructure. The V1 local/BYOC model-list loop must not require an API key or authenticated account.
- **Evidence:** `src/components/cockpit/settings/ProviderCard.tsx`, `src/routes/api/keys/set.ts`.

### 6. Provider key is saved/encrypted

- **User-visible:** Save succeeds for authenticated users; guests see the auth prompt.
- **Backend:** Key is AES-256-GCM encrypted and inserted into `user_provider_keys(user_id, provider_id, api_key_encrypted, base_url, model)`.
- **V1 boundary:** Provider-key persistence is not part of the V1 local proof path.
- **Evidence:** `src/lib/encryption.server.ts`, `src/lib/db/index.ts` `setUserProviderKey`.

### 7. User starts a thread

- **User-visible:** Cmd/Ctrl+N or "New chat" creates an empty thread; title is blank or first user message.
- **Backend:** Thread lives in `localStorage` by default (`isLocal: true`, `syncEnabled: false`). `POST /api/threads` is not called unless sync is enabled.
- **Evidence:** `src/lib/cockpit-store.ts` `newThread`, `src/routes/api/threads.ts`.

### 8. User sends a prompt

- **User-visible:** Message appears in the thread; if provider ready, assistant response streams in.
- **Backend:** `sendMessage` in `use-chat.ts` adds the user message, optionally embeds for RAG, then `runAssistant` builds history and routes to provider.
- **Evidence:** `src/hooks/use-chat.ts`.

### 9. App chooses provider/model

- **User-visible:** Status bar shows active provider and model; ProviderStatus pill reflects ready/missing-key state.
- **Backend:** `resolveProvider(settings)` returns active provider + model from `localStorage` settings. Cloud providers go through `/api/proxy/chat`; local providers use `directFetch`.
- **V1 boundary:** V1 uses the generic local OpenAI-compatible endpoint as the canonical local/BYOC runtime path for the first loop. Existing provider choices are implementation candidates, compatibility surfaces, or future named presets, not V1 commitments.
- **Evidence:** `src/lib/cockpit-store.ts`, `src/lib/providers.ts`.

### 10. Request passes CSRF/rate-limit/storage checks

- **Backend:** `/api/proxy/chat` validates CSRF, per-session rate limit (120/min), body size (1 MB), URL allowlist, then fetches the encrypted key server-side.
- **Evidence:** `src/routes/api/proxy/chat.ts`, `src/lib/proxy-guard.server.ts`.

### 11. Provider call is made

- **Cloud providers:** Worker proxies to provider API using server-side decrypted key. Response is streamed back.
- **Local providers:** Browser directly fetches daemon URL (bypasses Worker).
- **Evidence:** `src/routes/api/proxy/chat.ts`, `src/lib/providers.ts` `callProviderChat`/`callProviderChatViaProxy`.

### 12. Streaming/non-streaming response behavior

- **Streaming:** SSE deltas are parsed and patched into the placeholder message. Used when `stream: true` and no tools (or provider has `streamingTools: true`).
- **Non-streaming:** Full response parsed into one message; used when tools are active for providers without `streamingTools`.
- **Evidence:** `src/hooks/use-chat.ts`, `src/lib/tools.ts` stream accumulators.

### 13. Tool calling behavior where supported

- **Built-in tools:** `get_current_time`, `echo`, `word_count`, `calculator`. User clicks "Execute" in the UI; tool runs client-side.
- **User-defined/provider tools:** Schemas can be registered. Server-side execution requires entry in `user_tool_permissions`. Non-approved tools return a safe placeholder.
- **Evidence:** `src/lib/tools.ts`, `src/lib/tool-execution.server.ts`, `src/routes/api/tools/execute.ts`.

### 14. Thread/message persistence

- **Default:** Threads and messages persist in `localStorage` only.
- **Opt-in server sync:** If an authenticated user enables sync, `POST /api/threads` writes to D1. The path exists and is reachable once signed in; sync toggle availability depends on the current UI build.
- **Evidence:** `src/lib/cockpit-store.ts`, `src/routes/api/threads.ts`.

### 15. Usage tracking

- **Local:** Provider stats (calls, errors, tokens, cost) accumulate in `cockpit.provider-stats.v1`.
- **Server:** `usage_records` and `provider_stats` are written for authenticated users. Reachable after signing in.
- **Evidence:** `src/lib/cockpit-store.ts`, `src/lib/db/index.ts`, `src/routes/api/usage.ts`.

### 16. Offline behavior / local queue

- **User-visible:** "You're offline" toast; status bar shows queue count. Queued messages are stored in `localStorage` under `cockpit.offline-queue.v1`.
- **Backend:** No server interaction while offline. On reconnect, the queue drains and sends messages in order.
- **Evidence:** `src/hooks/use-chat.ts`, `src/components/cockpit/StatusBar.tsx`.

### 17. Returning user behavior

- **User-visible:** Onboarding does not reappear; previous threads/settings are loaded from `localStorage`. Signed-in users can also access server-side data.
- **Backend:** Same encrypted cookie is recognized if still valid (30-day maxAge). `hydrate()` calls `/api/auth/me` to restore authenticated state.
- **Evidence:** `src/lib/session.server.ts`, `src/lib/cockpit-store.ts`.

### 18. New browser/device behavior

- **User-visible:** Fresh guest session; no threads, no settings, no keys until the user signs in.
- **Backend:** New cookie issued; D1 has no rows for this unauthenticated session. Server-side data appears after signing in.
- **Evidence:** `src/lib/session.server.ts`.

### 19. Import/export behavior

- **User-visible:** Thread overflow menu → Export (JSON/Markdown/TXT); Settings or library import accepts a JSON array.
- **Backend:** `exportThread` reads `localStorage`. `importThreads` merges into `localStorage`. `/api/threads/import` accepts `"local"` (default) or `"sync"` mode; sync mode requires auth.
- **Evidence:** `src/lib/cockpit-store.ts`, `src/routes/api/threads.import.ts`.

### 20. Error states

| State | Current behavior | Evidence |
| --- | --- | --- |
| No key | Greeting shows "No API key set for {provider}" button linking to Settings. ProviderStatus shows "set API key". | `src/components/cockpit/Greeting.tsx`, `src/components/cockpit/ProviderStatus.tsx` |
| Invalid key | `/api/keys/validate` returns `invalid` with `reason: auth_failed`. UI shows red shield/"invalid key". | `src/routes/api/keys/validate.ts`, `src/lib/validate-key.server.ts` |
| Provider unavailable | `callProviderChatViaProxy` returns 502 with provider message; `use-chat.ts` surfaces error toast. | `src/routes/api/proxy/chat.ts`, `src/hooks/use-chat.ts` |
| Rate limited | 429 JSON with `retry-after` from rate-limiter or proxy-guard. | `src/lib/rate-limit.server.ts`, `src/lib/proxy-guard.server.ts` |
| Storage full | `localStorage` write fails; `use-chat.ts` catches and shows toast. Server storage limits return HTTP 413. | `src/lib/storage-limits.server.ts`, `src/hooks/use-chat.ts` |
| D1 unavailable | Worker logs warning at cold start; rate limiter falls back to in-memory; D1-backed routes fail for authenticated users (mostly unreachable). | `src/server.ts`, `src/lib/rate-limit.server.ts` |
| Worker misconfigured | 503 JSON `{ error: "Server misconfigured" }`. | `src/server.ts` |
| Malformed import | `/api/threads/import` validates body with zod; client `importThreads` tries to normalize input but may drop invalid threads. | `src/routes/api/threads.import.ts`, `src/lib/cockpit-store.ts` |
| Model/tool unsupported | Provider capability flags determine available features; unknown models fall back to declared defaults. | `src/lib/providers.ts` |

For V1, error-state coverage must specifically include local model-list success, no-models, malformed response, unreachable endpoint, bad base URL, timeout/abort, hosted HTTPS local HTTP block, and recovery after configuration change for the canonical local/BYOC runtime path.

### 21. Native shell behavior

| Target | Status | API base URL behavior | Caveat |
| --- | --- | --- | --- |
| macOS DMG (Electron) | Unsigned `.app` builds verified. Signed `.dmg` requires Apple certs. | Native context detected via `file://` or `app://` protocol; `apiFetch` prepends `VITE_NATIVE_API_URL` (defaults to production Worker). | Electron packaging verified unsigned; signed CI path configured but needs secrets. |
| Android APK (Capacitor) | Debug build verified; release requires keystore. | `Capacitor.isNativePlatform()` returns true; same `VITE_NATIVE_API_URL` routing. | No mobile-specific E2E coverage. |
| iOS (Capacitor) | Build verified with `CODE_SIGNING_ALLOWED=NO`; distribution needs provisioning profile. | Same native routing. | Not submitted to App Store; no device E2E. |

**Evidence:** `src/lib/api-base.ts`, `docs/native-release.md`, `.github/workflows/ci.yml`.

---

## Summary of the honesty boundary

- **Implemented and reachable:** Guest chat, `localStorage` threads/settings, offline queue, onboarding, provider selection, built-in tool execution, streaming responses, export/import, email/password signup and sign-in, encrypted provider key storage for authenticated users.
- **Implemented and reachable after authentication:** Server-side settings, usage records, server-synced threads (when sync is enabled), cross-device data tied to the signed-in account.
- **V1 proof target:** A user-configured generic local OpenAI-compatible endpoint that proves local runtime discovery or explicit endpoint configuration, state classification, required configuration explanation, safe bounded model-list capability check, visible result/system state, and clean recovery.
- **Named provider boundary:** Hermes Agent, OpenClaw, Ollama, LM Studio, vLLM, llama.cpp, and other named providers are catalog candidates or future named presets only; they are not the V1 proof set.
- **Not V1:** Google Sign-In, Apple Sign-In, any OAuth, password reset, email verification, marketplace scope, signed native release perfection, cloud provider live accounts.
- **V1 local loop proof:** The generic local OpenAI-compatible endpoint path is documented, implemented, and covered by focused browser E2E. Cross-user isolation is proven by unit tests but not yet covered by browser E2E.
