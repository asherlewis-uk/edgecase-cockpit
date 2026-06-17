# edgecase-cockpit — Future Enhancements

> This document tracks genuine future enhancements and intentional product boundaries.
> It does not list implemented features as gaps.
> The canonical source of truth for current implementation status is [README.md](../../README.md).

---

## What is already implemented

All items below were once future work and are now implemented. They are preserved here as historical record but should **not** be treated as open gaps.

| Area                                                                                 | Status         | Primary source                                                                                                                         |
| ------------------------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Streaming chat completions                                                           | ✅ Implemented | `src/lib/providers.ts`, `src/hooks/use-chat.ts`                                                                                        |
| Streaming tool-call deltas (OpenAI-compat)                                           | ✅ Implemented | `src/lib/tools.ts` (`StreamToolCallAccumulator`)                                                                                       |
| Streaming tool-call deltas (Anthropic)                                               | ✅ Implemented | `src/lib/tools.ts` (`AnthropicStreamToolCallAccumulator`)                                                                              |
| 4 safe built-in executable tools                                                     | ✅ Implemented | `src/lib/tools.ts` (`BUILT_IN_TOOLS`)                                                                                                  |
| Dynamic tool schema registry (`registerLocalTool`, `registerProviderTools`)          | ✅ Implemented | `src/lib/tools.ts`, `src/routes/api/tools/schemas.ts`                                                                                  |
| Tool name + args safety validation (three-layer guard)                               | ✅ Implemented | `src/lib/tools.ts` (`validateToolName`, `sanitizeToolCallArgs`, `validateToolCall`)                                                    |
| RAG: embedding proxy, local vector store, context injection                          | ✅ Implemented | `src/lib/vector-store.ts`, `src/lib/embeddings.ts`                                                                                     |
| RAG: sentence/paragraph chunking                                                     | ✅ Implemented | `src/lib/vector-store.ts` (`chunkText`)                                                                                                |
| RAG error state surfaced in StatusBar                                                | ✅ Implemented | `src/hooks/use-chat.ts` (`ragError`), `src/components/cockpit/StatusBar.tsx`                                                           |
| Cross-tab sync for settings, threads, provider stats, vector cache                   | ✅ Implemented | `src/lib/cockpit-store.ts`, `src/lib/vector-store.ts`                                                                                  |
| Exact token usage extraction (OpenAI/Anthropic/Gemini)                               | ✅ Implemented | `src/lib/tokens.ts` (`extractProviderUsage`)                                                                                           |
| Configurable cost rate overrides                                                     | ✅ Implemented | `src/lib/tokens.ts` (`setCostOverrides`)                                                                                               |
| D1-backed distributed rate limiter                                                   | ✅ Implemented | `src/lib/rate-limit.server.ts` (`D1RateLimiterBackend`)                                                                                |
| `RATE_LIMIT_BACKEND` env var for backend selection                                   | ✅ Implemented | `src/lib/rate-limit.server.ts` (`configureRateLimiterFromEnv`)                                                                         |
| Device-local privacy defaults (chat/RAG off by default)                              | ✅ Implemented | `src/lib/cockpit-store.ts` (`syncChatsToServer: false`, `syncRagVectorsToServer: false`)                                               |
| CSRF protection on all mutating routes                                               | ✅ Implemented | `src/lib/csrf.server.ts`                                                                                                               |
| Proxy SSRF guard with production wildcard block                                      | ✅ Implemented | `src/lib/proxy-guard.server.ts`                                                                                                        |
| Cold-start env validation (`SESSION_SECRET`)                                         | ✅ Implemented | `src/lib/env.server.ts`, `src/server.ts`                                                                                               |
| CSP + security headers on HTML responses                                             | ✅ Implemented | `src/lib/csp.server.ts`                                                                                                                |
| Storage limits (threads, messages, content, attachments)                             | ✅ Implemented | `src/lib/storage-limits.server.ts`                                                                                                     |
| Voice transcription proxy (Whisper-compatible)                                       | ✅ Implemented | `src/routes/api/proxy/transcribe.ts`                                                                                                   |
| Offline queue with auto-drain on reconnect                                           | ✅ Implemented | `src/hooks/use-chat.ts`                                                                                                                |
| Opt-in live provider tests with `STRICT_LIVE_PROVIDER_TESTS` mode                    | ✅ Implemented | `src/live/providers.live.test.ts`                                                                                                      |
| Error and offline state handling (offline queue, reconnect sync, storage failure)    | ✅ Implemented | `src/hooks/use-chat.ts`, `src/components/cockpit/StatusBar.tsx`                                                                        |
| First launch / onboarding (modal, skip/complete, persistence)                        | ✅ Implemented | `src/components/cockpit/OnboardingModal.tsx`, `src/lib/cockpit-store.ts`                                                               |
| Provider / model setup feedback (status indicators, validation, toast notifications) | ✅ Implemented | `src/lib/cockpit-store.ts` (`providerValidationStatus`), `src/components/cockpit/settings/ProviderCard.tsx`, `src/routes/settings.tsx` |
| Browser-based automated E2E smoke harness                                            | ✅ Implemented | `playwright.config.ts`, `e2e/smoke.spec.ts`; run `bun run test:e2e:install` then `bun run test:e2e`                                       |

---

## Intentional boundaries (not gaps)

These are deliberate product decisions. They are not missing features.

### Device-local chat storage

Chats, messages, and threads are stored in `localStorage` by default. `syncChatsToServer` defaults to `false`. Manual export/import (JSON/Markdown/TXT) is the intended cross-device portability path. Automatic multi-device chat sync is not planned — it conflicts with the device-local privacy model.

Source: `src/lib/cockpit-store.ts` (`defaultSettings`, `normalizeSettings`).

### Device-local RAG vector storage

RAG vectors and text chunks stay in `localStorage` by default. `syncRagVectorsToServer` defaults to `false`. Auto-loading server RAG docs on session startup is not planned.

Source: `src/lib/vector-store.ts` (`_serverSyncAvailable = false`).

### Arbitrary tool execution is blocked

`executeBuiltInTool` handles exactly 4 built-in tools. Non-built-in schemas (registered via `registerLocalTool` or `registerProviderTools`) are serializable to providers and can execute server-side once a user explicitly grants permission via `user_tool_permissions`. Non-approved tools still produce `[Tool "{name}" is not implemented]`. Arbitrary shell/code/network execution remains blocked.

Source: `src/lib/tools.ts` (`executeBuiltInTool`, `isBuiltInTool`), `src/lib/tool-execution.server.ts`, `src/routes/api/tools/permissions.ts`.

### Custom provider wildcard hosts blocked in production

The `custom` provider's `allowedHosts: ["*"]` is blocked in production unless `PROXY_ALLOW_CUSTOM_WILDCARD=true` is explicitly set. This prevents the deployment from acting as an open proxy relay.

Source: `src/lib/proxy-guard.server.ts` (`isWildcardHostAllowed`).

### D1 is not automatic chat storage

D1 is used for rate limiting, encrypted sessions, and usage/stats aggregation. Chat threads and RAG vectors are only written to D1 when the user explicitly opts in via settings. This is a privacy boundary, not a missing capability.

Source: `src/lib/db/schema.sql`, `src/lib/cockpit-store.ts`.

---

## True future enhancements

These capabilities are implemented locally; the remaining work is external credentials, store submission, or provider API availability.

---

## V1 release steps — native targets

> [!IMPORTANT]
> The local build/config paths below are complete. The only remaining actions are external credential/submission steps.

### V1 release step 1: macOS native packaging (Electron)

**Local path (verified):**
- `bun run native:desktop:package:unsigned` produces `electron/release/mac-arm64/Edgecase Cockpit.app`.
- `electron-builder.yml` is configured for signed releases.
- `docs/native-release.md` lists the exact local and CI commands.

**External remaining action:**
- Add Apple Developer ID Application `.p12` + password and notarization credentials to CI, then run `bun run native:desktop:package:signed`.

---

### V1 release step 2: iOS native packaging (Capacitor)

**Local path (verified):**
- `bun run native:ios:sync && bun run native:ios:build` succeeds with `CODE_SIGNING_ALLOWED=NO`.
- `bun run native:ios:archive` creates an archive ready for distribution.
- `docs/native-release.md` lists the exact provisioning and submission steps.

**External remaining action:**
- Create a distribution provisioning profile in Apple Developer Portal and submit the archived `.ipa` via Xcode Organizer or App Store Connect.

---

### V1 release step 3: Android native packaging (Capacitor)

**Local path (verified):**
- `bun run native:android:sync && cd android && ./gradlew assembleDebug` produces a debug APK.
- `bun run native:android:assembleRelease` is wired (requires keystore to sign).
- `docs/native-release.md` documents keystore configuration and Play Console submission.

**External remaining action:**
- Create a release keystore and upload the signed `.aab` to Google Play Console.

---

### Framework selection note

**Capacitor + Electron are already selected and installed.**

| Framework | Targets      | Status       | Notes                                                 |
| --------- | ------------ | ------------ | ----------------------------------------------------- |
| Capacitor | iOS, Android | ✅ Installed | Xcode + Gradle projects present; wraps `dist/client/` |
| Electron  | Desktop      | ✅ Installed | macOS `.app` builds; unsigned only                    |

No additional framework decision is required. Do not add Tauri or another framework without an explicit project decision.

---

### 1. Provider API tool schema auto-discovery

**Status: implemented, gated by consent/env.**

- `src/lib/provider-tool-discovery.server.ts` provides a discovery abstraction for every provider.
- `GET /api/tools/discover` and `POST /api/tools/discover` expose on-demand discovery.
- Disabled by default; enable with `ENABLE_PROVIDER_TOOL_DISCOVERY=true`.

**External remaining action:** Major providers (OpenAI, Anthropic, Gemini) do not currently expose stable, unauthenticated tool-catalog endpoints. As providers add them, add fetchers to `provider-tool-discovery.server.ts` and discovery will populate tools automatically.

---

### 2. User-defined tool execution permission model

**Status: implemented.**

- `user_tool_permissions` table stores per-user grants (`migrations/0003_pricing_and_tool_permissions.sql`).
- `src/lib/tool-execution.server.ts` enforces built-in-only execution unless the user has granted permission.
- `POST /api/tools/execute` executes tool calls server-side with permission checks.
- `GET/POST /api/tools/permissions` manage approvals.
- Settings UI shows an "Approved tools" section with per-tool toggles.
- Non-built-in tools still return a safe placeholder result; arbitrary code execution remains blocked pending a future sandboxed executor.

**External remaining action:** None for the permission model. A sandboxed execution engine for arbitrary user-defined logic is a separate future enhancement outside V1.

---

### 3. Live pricing fetch from provider APIs

**Status: implemented with static fallback.**

- `src/lib/pricing.server.ts` provides a pricing provider abstraction with static fallback.
- `GET /api/pricing` returns cached rates; `POST /api/pricing` refreshes them.
- Rates are cached in D1 `pricing_cache` table (`migrations/0003_pricing_and_tool_permissions.sql`).

**External remaining action:** Provider pricing APIs are not consistently available. When a provider publishes a stable endpoint, add a fetcher in `pricing.server.ts` and the refresh route will use live data.

---

### 4. Lightweight tokenizer for exact local token counts

**Status: ✅ Implemented.**

`estimateTokensAsync` lazy-loads `gpt-tokenizer` (`cl100k_base` encoding) and returns BPE token counts for providers that do not include usage metadata. `estimateTokens` retains a synchronous character/word heuristic as a fallback for the first estimate and for environments where the tokenizer chunk cannot load. Source: `src/lib/tokens.ts`.

---

### 5. Multi-node rate limit consistency

**Status: implemented as an opt-in Durable Object backend.**

- `src/lib/rate-limit-do.server.ts` implements `DurableObjectRateLimiterBackend`.
- `wrangler.jsonc` has a `RATE_LIMITER_DO` Durable Object binding and migration.
- Set `RATE_LIMIT_BACKEND=durable_object` for strongly-consistent cross-Worker enforcement.
- Default remains D1 (`auto`) for deployments without Durable Objects.

**External remaining action:** Apply the Durable Object migration (`bunx wrangler deploy` after adding the DO binding) to activate strong consistency.

---

## Accepted stale limitations (no action planned)

| Limitation                                                                               | Reason not actioned                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tool name safety: unsafe provider names silently dropped (no user notification)          | Silent dropping is intentional to prevent injection. Surfacing as a notification would require UX work; not prioritized.                                                       |
| Provider capability flags are declarations, not end-to-end verified for all combinations | Live verification requires real credentials per provider. Covered for OpenAI/Anthropic/Gemini via opt-in live tests. Other providers verified manually at integration time.    |
| Streaming is disabled when tools are active for providers without `streamingTools: true` | Architectural: non-streaming is required to parse complete tool call JSON. Providers must declare streaming tool support explicitly.                                           |
| Native mobile E2E coverage                                                               | Not included in V1 scope; browser E2E covers auth/settings/provider-key/threads/route smoke. Mobile E2E would require device labs/simulator orchestration.                                              |

---

## Device-local data boundary — not a roadmap item

The device-local default is the product's privacy model. The following are intentional and correct:

- Chat threads are `localStorage`-only by default. `syncChatsToServer: false`.
- RAG vectors are `localStorage`-only by default. `syncRagVectorsToServer: false`.
- API keys are server-session-only — never in `localStorage`.
- D1 stores sessions, rate limit state, and usage/stats — no message content by default.
- Cross-device portability is via manual export/import only.

These are not gaps. Do not treat them as missing features in any future planning document.
