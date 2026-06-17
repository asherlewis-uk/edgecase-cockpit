# E2E Edge & Broken-State Audit

> **Scope:** Remaining edges, broken states, risky assumptions, and overlooked implementation/config areas that could block "flawless E2E perfection." This audit reflects the current code, tests, CI, and production state; it does not invent future features.

---

## 1. First launch / onboarding

| Item | Status | Evidence | User impact | Suggested next action | Implementation required? |
| --- | --- | --- | --- | --- | --- |
| Onboarding modal appears on first load | Verified | `OnboardingModal.test.tsx`, `src/components/cockpit/OnboardingModal.tsx` | Good first-run experience. | None. | No |
| Missing provider keys surface a clear warning | Verified | `Greeting.tsx`, `ProviderStatus.tsx` | User knows setup is needed. | None. | No |
| Invalid provider keys validated | Verified (API) | `/api/keys/validate.ts`, `validate-key.server.ts` | Red shield/invalid state shown. | None. | No |
| Provider unavailable (timeout/network) | Partially verified | Unit tests in `use-chat.test.ts`, `validate-key.server.test.ts` | Toast/status bar error. | Add a live-provider E2E test with a deliberately bad base URL. | No (docs/test only) |
| Switching providers mid-thread | Partially verified | `cockpit-store.ts` `setActiveProvider` | Model selector works; existing thread messages keep original provider metadata. | Document expected behavior. | No |
| Empty state behavior | Verified | `Greeting.tsx`, `Drawer.tsx` | Shows "No chats yet." | None. | No |

---

## 2. Authentication / account separation

| Item | Status | Evidence | User impact | Suggested next action | Implementation required? |
| --- | --- | --- | --- | --- | --- |
| User creation backend | Verified | `/api/auth/register.ts`, `auth.server.ts`, `-auth.test.ts` | No user impact today because no UI exposes it. | Add login/register UI or document as future work. | Yes (UI + routing) |
| Session identity | Verified | `session.server.ts` | Guests get stable cookie; auth users get `userId`. | None. | No |
| Ownership scoping in DB | Verified | `db/index.ts` `ownerWhere`, `schema.sql`, `-account-separation.test.ts` | Data isolation is enforced at the API layer. | None. | No |
| Private route guards | Verified | `/api/settings.ts` 401, `/api/keys/set.ts` throws for guests | Guests cannot access authenticated data. | None. | No |
| Cross-user thread/key/usage access | Verified (mocked) | `-account-separation.test.ts` | One user cannot read another's data in unit tests. | Add a real-cookie integration test once auth UI exists. | No (test only) |
| Import/export boundaries | Verified | `cockpit-store.ts` `exportThread`/`importThreads`, `/api/threads.import.ts` | Import merges locally by default; sync mode requires auth. | Document import mode clearly in UI. | No |
| Google/Apple sign-in absence | Broken (missing) | No OAuth routes, no client ID, no OAuth lib | Users cannot use social login. | Document as future work; do not claim it exists. | Yes (future feature) |
| Provider key save for guests | Broken | `/api/keys/set.ts` does not catch `setProviderCreds` guest error | A fresh user who enters an API key in Settings sees a failed save. | Either add auth UI before key save, or temporarily allow guest key storage with explicit warnings. | Yes |
| Auth UI exists | Broken (missing) | No `/auth` route, no login/register components | Users cannot authenticate. | Implement `/auth` route and account menu. | Yes |

---

## 3. Cloudflare production

| Item | Status | Evidence | User impact | Suggested next action | Implementation required? |
| --- | --- | --- | --- | --- | --- |
| Runtime secrets set | Verified | User-provided production facts; `env.server.ts` | Sessions and encryption work. | Rotate secrets on a schedule. | No |
| D1 migrations 0001–0003 applied | Verified | User-provided production facts; `migrations/` | Schema matches code. | None. | No |
| Durable Object migration applied | Verified | `wrangler.jsonc` `new_sqlite_classes`, `exports.cloudflare.ts` | `RATE_LIMITER_DO` binding available. | None unless switching backend. | No |
| `RateLimiterDurableObject` exported | Verified | `exports.cloudflare.ts` | DO backend can be activated. | None. | No |
| D1 binding lookup fixed | Verified | `platform.server.ts` env resolution | Production DB binding works. | None. | No |
| Root route returns 200 | Verified | User-provided smoke tests | App shell loads. | None. | No |
| `/api/keys/status` returns 200 JSON | Verified | User-provided smoke tests | Key status endpoint healthy. | None. | No |
| Manual deploy vs CI deploy | Verified | `.github/workflows/ci.yml` has validate/build/package/release; no deploy job | Production deploy is manual. | Update `docs/lovable-environmental-sync.md` which falsely claims auto-deploy. | No (docs only) |
| Smoke tests after deploy | Partially verified | Manual curl commands listed in production facts | No automated post-deploy smoke test in CI. | Add a manual-qa checklist step or a lightweight CI smoke job that does not auto-deploy. | No (docs/process only) |
| CI creates signed artifacts | Partially verified | `ci.yml` package job attempts signing when secrets present | Unsigned builds verified; signed path depends on repository secrets. | Obtain Apple/Android signing credentials. | Yes (external credentials) |

---

## 4. Data / storage

| Item | Status | Evidence | User impact | Suggested next action | Implementation required? |
| --- | --- | --- | --- | --- | --- |
| `localStorage`/offline queue | Verified | `use-chat.ts` OFFLINE_QUEUE_KEY, queue drain logic | Messages survive temporary offline. | None. | No |
| D1 thread sync | Implemented but unreachable | `threads.is_local`/`sync_enabled`, `/api/threads.ts` | Users cannot opt in because auth UI is missing. | Add auth UI + sync toggle. | Yes |
| Provider key encryption | Verified | `encryption.server.test.ts`, `session.server.test.ts` | Keys are never plaintext in DB or client. | None. | No |
| Usage stats | Verified (local); unreachable (server) | `cockpit-store.ts` local stats, `/api/usage.ts` | Local stats work; server aggregate requires auth. | None until auth UI exists. | No |
| Migration failure modes | Partially verified | `migrations/README.md` | Remote apply is manual; failure would prevent app from starting correctly. | Document rollback plan. | No (docs only) |
| Guest data TTL | Partially verified | `guest_sessions.expires_at` 30 days | Old guest rows may accumulate. | Add a cleanup migration or D1 cron. | Yes (cleanup) |

---

## 5. API behavior

| Item | Status | Evidence | User impact | Suggested next action | Implementation required? |
| --- | --- | --- | --- | --- | --- |
| CSRF on mutating routes | Verified | `csrf.server.test.ts`, all `POST/PUT/DELETE` handlers | Unauthorized cross-origin mutations blocked. | None. | No |
| Unauthenticated responses | Verified | `/api/settings.ts` 401, `/api/auth/me.ts` 401 | Guests get clear auth errors. | None. | No |
| Rate limits | Verified | `rate-limit.server.test.ts`, `proxy-guard.server.test.ts` | Per-session sliding windows enforced. | None. | No |
| Error shape consistency | Partially verified | Most errors return `{ error }` JSON; some handlers return raw upstream responses. | Client must handle both JSON and stream errors. | Document expected error shapes. | No (docs only) |
| API fallback to HTML/app shell | Verified | `server.ts` only adds CSP to HTML; API routes return JSON/stream. | Direct API calls do not get HTML. | None. | No |

---

## 6. Native packaging

| Item | Status | Evidence | User impact | Suggested next action | Implementation required? |
| --- | --- | --- | --- | --- | --- |
| macOS DMG unsigned build | Verified | `bun run native:desktop:package:unsigned` | Users can run unsigned `.app` locally. | Obtain certs for distribution. | Yes (external) |
| macOS signed/notarized DMG | Risk | `electron-builder.yml` configured; `ci.yml` signs when secrets present | Distribution blocked without Apple certs. | Add secrets to repo/CI. | Yes (external credentials) |
| Android APK debug | Verified | `./gradlew assembleDebug` | Local install possible. | Create release keystore. | Yes (external) |
| Android release AAB | Risk | `native:android:assembleRelease` needs keystore | Play Store submission blocked. | Create keystore + Play Console app. | Yes (external) |
| iOS build | Verified | `native:ios:build` with `CODE_SIGNING_ALLOWED=NO` | Local build possible. | Create distribution profile + App Store Connect record. | Yes (external) |
| iOS device E2E | Unverified | No device/simulator E2E harness | Behavior on real hardware unknown. | Add simulator/device E2E if scope allows. | Yes |
| API base URL behavior | Verified | `api-base.ts` | Native apps reach the configured Worker URL. | Verify `VITE_NATIVE_API_URL` is set in release builds. | No |

---

## 7. Tooling / RAG / provider behavior

| Item | Status | Evidence | User impact | Suggested next action | Implementation required? |
| --- | --- | --- | --- | --- | --- |
| Tool calling support by provider | Verified (declared) | `providers.ts` capability flags | Users see tool-capable providers. | None. | No |
| Streaming vs non-streaming tool calls | Verified | `use-chat.ts` switches to non-stream when `streamingTools: false` | Correct behavior per provider. | None. | No |
| Dynamic tool schema discovery | Implemented but disabled | `provider-tool-discovery.server.ts`, `ENABLE_PROVIDER_TOOL_DISCOVERY` | Disabled by default; provider catalogs are empty. | Document how to enable and its limitations. | No |
| Tool permission model | Verified | `user_tool_permissions` table, `/api/tools/execute.ts` | Non-built-in tools require explicit approval. | None. | No |
| Arbitrary code execution blocked | Verified | `tools.ts` `executeBuiltInTool`, `calculator` regex | Only safe built-in tools run. | None. | No |
| Embeddings/vector store | Verified (local) | `vector-store.ts`, `embeddings.ts` | RAG works locally with cosine similarity. | None. | No |
| Server RAG sync | Implemented but disabled | `_serverSyncAvailable = false` in `vector-store.ts` | Vectors never leave the device. | None (intentional privacy boundary). | No |
| Live pricing fetch | Implemented with static fallback | `pricing.server.ts`, `/api/pricing.ts` | Rates may be stale until provider APIs are available. | None. | No |

---

## 8. UX failure states

| Item | Status | Evidence | User impact | Suggested next action | Implementation required? |
| --- | --- | --- | --- | --- | --- |
| Offline | Verified | `use-chat.ts` queue + `StatusBar.tsx` offline state | Clear queue count and reconnect drain. | None. | No |
| Storage full | Partially verified | `storage-limits.server.ts`, `use-chat.ts` localStorage catch | Server limits return 413; client shows toast. | Add a localStorage-full E2E test. | No (test only) |
| Import malformed | Partially verified | `threads.import.ts` zod validation | Bad imports rejected with 400. | Document import format. | No (docs only) |
| Model/provider timeout | Verified | `proxy/chat.ts` 60s abort controller | Request cancelled with 502/error toast. | None. | No |
| Rate limited | Verified | `rate-limit.server.ts`, `proxy-guard.server.ts` | 429 with retry-after. | None. | No |
| D1 unavailable | Partially verified | Cold-start warning; fallback rate limiter | Auth routes fail gracefully; guest routes unaffected. | Add a CI integration test against a Worker without DB binding. | No (test only) |
| Worker misconfigured | Verified | `server.ts` 503 | Clear error message. | None. | No |

---

## 9. Tests

| Area | Coverage | Gap | Suggested next action |
| --- | --- | --- | --- |
| Unit tests | 450+ across auth, sessions, DB isolation, rate limits, tools, vector store, tokens, cockpit store, API routes. | None major. | Keep credential-free. |
| Live provider tests | Opt-in via `RUN_LIVE_PROVIDER_TESTS` and real keys. | Not run in CI by default. | Run manually before releases. |
| Browser E2E | `e2e/smoke.spec.ts` covers root, chat, settings, thread creation. | References non-existent `/auth` route. | Remove or replace the `/auth` test. |
| Auth UI E2E | None | Cannot test login/register without UI. | Add once auth UI is implemented. |
| Native E2E | None | No device/simulator automation. | Out of V1 scope; document as accepted limitation. |
| Production smoke tests | Manual curl only | No automated post-deploy verification. | Add a lightweight checklist or script. |

---

## 10. Documentation risks

| Doc | Risk | Correction needed |
| --- | --- | --- |
| `README.md` | Claims "Real user accounts (register, login, logout) with bcrypt-hashed passwords" — bcrypt is wrong; UI is missing. | Update to PBKDF2 and clarify backend-only. |
| `README.md` | `wrangler.jsonc` snippet shows `main: "src/server.ts"`; actual is `.output/server/index.mjs`. | Fix snippet to match `wrangler.jsonc`. |
| `docs/lovable-environmental-sync.md` | Claims auto-deploy via `.github/workflows/deploy.yml`. | Replace with current `ci.yml` reality and manual deploy instructions. |
| `docs/lovable-environmental-sync.md` | Lists incomplete D1 tables and stale `main` field. | Update table list and `wrangler.jsonc` block. |
| `docs/manual-qa-checklist.md` | Assumes provider API keys can be saved in Settings without mentioning the auth requirement. | Add a note that key save currently requires an authenticated account, which has no UI. |
| `AUTH_AUDIT.md` / `MISMATCH_REPORT.md` | Correctly describe backend auth but do not mention missing frontend. | Add a section noting the UI gap. |
| `e2e/smoke.spec.ts` | Tests `/auth` route which does not exist. | Remove or replace the test. |

---

## Top blockers to "flawless E2E perfection"

1. **No authentication UI.** All server-side user-scoped features (encrypted key storage, server thread sync, settings sync, usage records) are unreachable for real users.
2. **Provider key save fails for guests.** The Settings UI lets a user type a key, but `/api/keys/set` throws because the user is unauthenticated.
3. **Outdated / auto-deploy docs.** `docs/lovable-environmental-sync.md` claims CI auto-deploys to production; it does not.
4. **Broken E2E smoke test.** `e2e/smoke.spec.ts` navigates to `/auth`, which returns 404.
5. **External credentials not present in CI.** Signed macOS/Android/iOS release artifacts cannot be produced without Apple/Android signing secrets.
6. **No production smoke automation.** Post-deploy verification is manual curl only.
7. **No native device E2E.** iOS/Android behavior on real hardware is unverified.

All of the above are either documentation-only fixes or clearly scoped future implementation work; none should be addressed by silent adjacent code changes.
