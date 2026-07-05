# V1 Local Loop E2E Edge & Broken-State Audit

> **Scope:** Remaining edges, broken states, risky assumptions, and overlooked implementation/config areas that could block the frozen V1 contract. V1 is a local-first/BYOC control loop for one concrete edgecase-cockpit runtime path.

Non-V1 surfaces such as cloud provider live accounts, OpenAI keys, OAuth/social login, marketplace scope, signed native releases, native device E2E, and unrelated agent infrastructure may remain documented as supported infrastructure or future work, but they must not be required for V1 acceptance.

Product decision: the V1 runtime target is a user-configured generic local OpenAI-compatible endpoint. This is a declared decision made now, not recovered from prior named-provider evidence. Hermes Agent, OpenClaw, Ollama, LM Studio, vLLM, llama.cpp, and other named providers remain catalog candidates or future named presets only; they are not V1 commitments.

---

## 0. Exact V1 E2E promise map

Focused browser E2E must prove the following for the user-configured generic local OpenAI-compatible endpoint without OpenAI, cloud API keys, OAuth, marketplace scope, signed native builds, live provider accounts, unrelated agent infrastructure, or a real local daemon in CI:

| Step | V1 promise | Proof requirement |
| --- | --- | --- |
| 1 | Fresh guest can start local-first | No account prompt, cloud key, or OAuth gate blocks the first loop |
| 2 | V1 proof target is explicit | UI names a configurable local OpenAI-compatible endpoint rather than a named provider preset |
| 3 | Endpoint contract is explicit | Base URL, model-list endpoint, and chat-completions-compatible endpoint are represented without a required cloud API key |
| 4 | Local capability is detected | The target enters a visible state: checking, reachable, unreachable, misconfigured, no-models, hosted-HTTPS-blocked, mobile-localhost-mismatch, ready, or failed |
| 5 | State is explained | The UI says what was detected, what is unavailable, and what config/recovery action is required |
| 6 | Safe action is controlled | User can run a model-list probe with timeout/abort behavior |
| 7 | Result/system state is visible | Success shows returned models and ready/system state |
| 8 | Failure recovers cleanly | Empty models, malformed response, unreachable endpoint, bad base URL, timeout/abort, and hosted HTTPS local HTTP block produce visible recoverable states |
| 9 | Config retry works | Updating base URL/config and retrying can move a target from failure to ready |

---

## 1. First launch / onboarding

| Item | Status | Evidence | User impact | Suggested next action | Implementation required? |
| --- | --- | --- | --- | --- | --- |
| Onboarding modal appears on first load | Verified | `OnboardingModal.test.tsx`, `src/components/cockpit/OnboardingModal.tsx` | Good first-run experience. | None. | No |
| V1 proof target named | Decided | Canonical V1 target is a user-configured generic local OpenAI-compatible endpoint; this is a declared product decision, not recovered historical intent | User sees one concrete local/BYOC path instead of generic all-provider chat or unrelated agent infrastructure | Keep named providers as catalog candidates/future presets only. | No |
| Missing provider keys surface a clear warning | Verified, non-V1 for local loop | `Greeting.tsx`, `ProviderStatus.tsx` | Useful for cloud/provider infrastructure. | Keep secondary; do not make cloud keys part of V1. | No |
| Invalid provider keys validated | Verified (API) | `/api/keys/validate.ts`, `validate-key.server.ts` | Red shield/invalid state shown. | None. | No |
| Local capability unavailable (timeout/network/bad base URL) | Partially verified | Unit tests in `use-chat.test.ts`, `validate-key.server.test.ts` | Toast/status bar error exists, but V1 needs model-list state. | Add deterministic V1 E2E with mocked/local gateway responses. | Yes |
| Switching providers mid-thread | Partially verified | `cockpit-store.ts` `setActiveProvider` | Model selector works; existing thread messages keep original provider metadata. | Document expected behavior. | No |
| Empty state behavior | Verified | `Greeting.tsx`, `Drawer.tsx` | Shows "No chats yet." | None. | No |

---

## 2. Authentication / account separation

| Item | Status | Evidence | User impact | Suggested next action | Implementation required? |
| --- | --- | --- | --- | --- | --- |
| User creation backend | Verified | `/api/auth/register.ts`, `auth.server.ts`, `-auth.test.ts`, `src/routes/auth.tsx` | Exposed via `/auth` route; guests can create accounts. | Add full browser E2E for register → save key flow. | No (test only) |
| Session identity | Verified | `session.server.ts` | Guests get stable cookie; auth users get `userId`. | None. | No |
| Ownership scoping in DB | Verified | `db/index.ts` `ownerWhere`, `schema.sql`, `-account-separation.test.ts` | Data isolation is enforced at the API layer. | None. | No |
| Private route guards | Verified | `/api/settings.ts` 401, `/api/keys/set.ts` returns 401 JSON for guests | Guests cannot access authenticated data. | None. | No |
| Cross-user thread/key/usage access | Verified (mocked) | `-account-separation.test.ts` | One user cannot read another's data in unit tests. | Add a real-cookie integration test once auth UI exists. | No (test only) |
| Import/export boundaries | Verified | `cockpit-store.ts` `exportThread`/`importThreads`, `/api/threads.import.ts` | Import merges locally by default; sync mode requires auth. | Document import mode clearly in UI. | No |
| Google/Apple sign-in absence | Non-V1 | No OAuth routes, no client ID, no OAuth lib | Users cannot use social login, but V1 must not require this. | Keep as future work only. | No for V1 |
| Provider key save for guests | Verified | `ProviderCard.tsx` gates Save; `/api/keys/set.ts` returns 401 JSON | Guests see a clear sign-in prompt instead of a generic failure. | None. | No |
| Auth UI exists | Verified | `src/routes/auth.tsx`, `AccountMenu.tsx`, `Drawer.tsx` settings integration | Users can sign in, create accounts, and log out. | Add full browser E2E login/register flow. | No (test only) |

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
| D1 thread sync | Implemented but UI toggle still missing | `threads.is_local`/`sync_enabled`, `/api/threads.ts` | Reachable after sign-in, but the sync opt-in UI is not exposed. | Add sync toggle once auth UI is stable. | Yes |
| Provider key encryption | Verified | `encryption.server.test.ts`, `session.server.test.ts` | Keys are never plaintext in DB or client. | None. | No |
| Usage stats | Verified (local); reachable after auth (server) | `cockpit-store.ts` local stats, `/api/usage.ts` | Local stats work; server aggregate requires sign-in. | Add usage UI for authenticated users. | No (UI-only if desired) |
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

## 6. Native packaging (non-V1 hardening)

Native packaging status is useful for distribution and local transport, but signed artifacts, store submission, and device E2E are not V1 acceptance gates.

| Item | Status | Evidence | User impact | Suggested next action | Implementation required? |
| --- | --- | --- | --- | --- | --- |
| macOS DMG unsigned build | Verified | `bun run native:desktop:package:unsigned` | Users can run unsigned `.app` locally. | Obtain certs for distribution. | Yes (external) |
| macOS signed/notarized DMG | Risk | `electron-builder.yml` configured; `ci.yml` signs when secrets present | Distribution blocked without Apple certs. | Add secrets to repo/CI. | Yes (external credentials) |
| Android APK debug | Verified | `./gradlew assembleDebug` | Local install possible. | Create release keystore. | Yes (external) |
| Android release AAB | Risk | `native:android:assembleRelease` needs keystore | Play Store submission blocked. | Create keystore + Play Console app. | Yes (external) |
| iOS build | Verified | `native:ios:build` with `CODE_SIGNING_ALLOWED=NO` | Local build possible. | Create distribution profile + App Store Connect record. | Yes (external) |
| iOS device E2E | Unverified, non-V1 | No device/simulator E2E harness | Behavior on real hardware unknown. | Add simulator/device E2E after V1 browser proof if scope allows. | No for V1 |
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
| Unit tests | 587 across auth, sessions, DB isolation, rate limits, tools, vector store, tokens, cockpit store, API routes, auth UI. | None major. | Keep credential-free. |
| Live provider tests | Opt-in via `RUN_LIVE_PROVIDER_TESTS` and real keys. | Not run in CI by default. | Run manually before releases. |
| Browser E2E | `e2e/smoke.spec.ts` covers root, chat, settings, thread creation, and `/auth` page load. `e2e/v1-local-loop.spec.ts` provides the focused V1 local loop proof with deterministic mocked responses for the generic local OpenAI-compatible endpoint. | None for V1 local loop. | Keep deterministic and credential-free. |
| Auth UI E2E | Partially verified, non-V1 | `e2e/smoke.spec.ts` loads `/auth` and checks tabs. | Full login/register submission requires a running backend or stub. | Keep separate from V1 local loop proof. |
| Native E2E | None | No device/simulator automation. | Out of V1 scope; document as accepted limitation. |
| Production smoke tests | Manual curl only | No automated post-deploy verification. | Add a lightweight checklist or script. |

---

## 10. Documentation risks

| Doc | Risk | Correction needed |
| --- | --- | --- |
| `README.md` | Historically framed V1 as broad provider chat/native release, then incorrectly hardcoded an unrelated Hermes/OpenClaw/Ollama proof set. | Keep V1 language constrained to the generic local OpenAI-compatible endpoint selected by product decision. |
| `README.md` | Provider support matrix can be misread as V1 promise. | Keep cloud providers and other local endpoints labeled as supported infrastructure/non-V1. |
| `docs/lovable-environmental-sync.md` | Claims auto-deploy via `.github/workflows/deploy.yml`. | Replace with current `ci.yml` reality and manual deploy instructions. |
| `docs/lovable-environmental-sync.md` | Lists incomplete D1 tables and stale `main` field. | Update table list and `wrangler.jsonc` block. |
| `docs/manual-qa-checklist.md` | Should note that provider API keys require an authenticated account to save. | Add a note that key save requires signing in. |
| `AUTH_AUDIT.md` / `MISMATCH_REPORT.md` | Backend auth is resolved; frontend auth UI is now implemented. | Update to reflect `/auth` route, Account menu, and ProviderCard gating. |
| `e2e/smoke.spec.ts` | `/auth` page load test now passes. | None. |

---

## Top V1 blockers

No V1 blockers remain from this audit. The executable state contract, V1 endpoint UI, safe model-list action, and focused browser E2E are implemented for the generic local OpenAI-compatible endpoint.

Remaining items below are accepted non-V1 limitations or separate validation work; they must not block the V1 local loop.

## Accepted non-V1 limitations

- Google/Apple/OAuth is not implemented and is not required for V1.
- Marketplace or provider-store scope does not exist and is not required for V1.
- Signed macOS/Android/iOS release artifacts require external credentials and are not required for V1.
- Native device/simulator E2E is not required for V1.
- Cloud provider live tests remain opt-in infrastructure and must not gate the V1 local loop.
- Hermes Agent, OpenClaw, Ollama, LM Studio, vLLM, llama.cpp, and other named providers remain catalog candidates or future named presets only; they are not the V1 proof set.
