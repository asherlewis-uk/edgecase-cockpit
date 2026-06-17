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

`executeBuiltInTool` handles exactly 4 tools. Non-built-in schemas (registered via `registerLocalTool` or `registerProviderTools`) are serializable to providers but produce `[Tool "{name}" is not implemented]` if a user attempts to execute them. This is intentional — extending the executable set requires an explicit permission model review.

Source: `src/lib/tools.ts` (`executeBuiltInTool`, `isBuiltInTool`).

### Custom provider wildcard hosts blocked in production

The `custom` provider's `allowedHosts: ["*"]` is blocked in production unless `PROXY_ALLOW_CUSTOM_WILDCARD=true` is explicitly set. This prevents the deployment from acting as an open proxy relay.

Source: `src/lib/proxy-guard.server.ts` (`isWildcardHostAllowed`).

### D1 is not automatic chat storage

D1 is used for rate limiting, encrypted sessions, and usage/stats aggregation. Chat threads and RAG vectors are only written to D1 when the user explicitly opts in via settings. This is a privacy boundary, not a missing capability.

Source: `src/lib/db/schema.sql`, `src/lib/cockpit-store.ts`.

---

## True future enhancements

These are enhancements that are **not yet implemented** and would require new work. Each is proven as a genuine gap by source inspection.

---

## V1 RELEASE BLOCKERS — native targets

> [!IMPORTANT]
> The following are **V1 blockers**, not optional future enhancements. V1 is not achieved until all three are resolved.

### V1-BLOCKER-1: macOS native packaging (Electron)

**What is present:** Electron desktop scaffolding exists. `electron/main.ts`, `electron/preload.ts`, `electron-builder.yml`, and `electron/tsconfig.json` are all present. The `bun run native:desktop:dev` script builds and compiles the Electron main process successfully. A prior `npx electron-builder build` run produced an unsigned `.app` bundle and `.dmg` in `electron/release/`.

**What is still missing for V1:**

- Signed/notarized `.app` or `.dmg` (current artifacts are unsigned)
- macOS signing certificate and notarization credentials configured in CI or env
- Verified user-flow smoke test on the built `.app` (no automated E2E exists; runtime launch requires a GUI environment)
- README updated with real macOS install/download instructions (completed below)
- `npx electron-builder build` stalls in the current headless environment; it succeeds in a GUI/CI environment with the correct secrets

**Status:** Build pipeline verified; release packaging blocked by external signing credentials and GUI/CI environment.

---

### V1-BLOCKER-2: iOS native packaging (Capacitor)

**What is present:** Capacitor iOS project exists in `ios/App/`. `bun run native:ios:sync` succeeds and `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build` produces a successful build.

**What is still missing for V1:**

- `.ipa` packaging with a valid provisioning profile
- App Store signing, provisioning profiles, and submission pipeline
- Required permissions (microphone, camera, storage) reviewed and declared in `Info.plist` if applicable
- Verified user-flow smoke test on a real iOS device or simulator (no automated E2E exists)
- README updated with real iOS install/test instructions (completed)

**Status:** Native build verified; release packaging blocked by external App Store signing/provisioning.

---

### V1-BLOCKER-3: Android native packaging (Capacitor)

**What is present:** Capacitor Android project exists in `android/`. `bun run native:android:sync` succeeds and `./gradlew assembleDebug` produces a successful debug `.apk`.

**What is still missing for V1:**

- Release `.apk` / `.aab` with a valid keystore
- Play Store signing keystore and submission pipeline
- Required permissions reviewed and declared in `AndroidManifest.xml` if applicable
- Verified user-flow smoke test on a real Android device or emulator (no automated E2E exists)
- README updated with real Android install/test instructions (completed)

**Status:** Native build verified; release packaging blocked by external Play Store keystore.

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

**What is missing:** Provider APIs (e.g., OpenAI's tools/functions discovery endpoint, Anthropic's tool catalog) are not fetched automatically. Tool schemas must be registered manually via `registerLocalTool`, `registerProviderTools`, or `POST /api/tools/schemas`.

**Source proof of absence:** `src/lib/tools.ts` — no auto-fetch code path exists. `src/routes/api/tools/schemas.ts` — only GET (list) and POST (register) are implemented; no provider-polling is wired.

**What would be needed:** A background job or on-demand fetch from each provider's schema discovery API, plus deduplication against the existing registry.

**Privacy note:** Auto-fetching would require an active API key for each provider. Do not implement without explicit user consent per provider.

---

### 2. User-defined tool execution permission model

**What is missing:** A mechanism for users to grant execution permission to non-built-in tool schemas registered via `registerLocalTool`. Currently, all registered non-built-in schemas are visible and serializable but cannot execute.

**Source proof of absence:** `src/lib/tools.ts` (`executeBuiltInTool`) — only checks `BUILT_IN_TOOLS`. `src/hooks/use-chat.ts` (`executeTool`) — calls `isBuiltInTool` as the final gate; no permission registry exists.

**What would be needed:** A persistent permission registry, a UI approval flow for granting per-tool execution rights, and sandboxed execution for user-defined logic (likely server-side).

**Security note:** Any extension of the executable tool set must be treated as a security boundary. Do not ship without a complete threat model and explicit user-approval UI.

---

### 3. Live pricing fetch from provider APIs

**What is missing:** Cost rates in `_COST_DEFAULTS` (`src/lib/tokens.ts`) are static values recorded at a point in time (mid-2025). There is no code to fetch current pricing from provider APIs.

**Source proof:** `src/lib/tokens.ts` — `_COST_DEFAULTS` is a hardcoded object literal. No network fetch for pricing exists anywhere in the codebase.

**What would be needed:** A server-side route or background job that fetches pricing from provider pricing APIs (where available) and caches them, with fallback to the static defaults.

**Scope note:** Not all providers expose machine-readable pricing APIs. This may be partially achievable for OpenAI and Anthropic only.

---

### 4. Lightweight tokenizer for exact local token counts

**Status: ✅ Implemented.**

`estimateTokensAsync` lazy-loads `gpt-tokenizer` (`cl100k_base` encoding) and returns BPE token counts for providers that do not include usage metadata. `estimateTokens` retains a synchronous character/word heuristic as a fallback for the first estimate and for environments where the tokenizer chunk cannot load. Source: `src/lib/tokens.ts`.

---

### 5. Multi-node rate limit consistency

**What is missing:** The D1-backed rate limiter persists counts asynchronously (fire-and-forget). At very high concurrency across multiple Workers, a small number of over-limit requests may slip through before D1 counts propagate to all Worker instances.

**Source proof:** `src/lib/rate-limit.server.ts` (`D1RateLimiterBackend.persistAsync`) — `db.prepare(...).run()` is called in a try/catch but not awaited in the request path. The in-memory bucket is the authoritative source within a single Worker.

**What would be needed:** A Cloudflare Durable Object or KV-based rate limiter for strongly-consistent cross-Worker enforcement. This requires Durable Object configuration in `wrangler.jsonc` and a new backend implementing `IRateLimiterBackend`.

---

## Accepted stale limitations (no action planned)

| Limitation                                                                               | Reason not actioned                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tool name safety: unsafe provider names silently dropped (no user notification)          | Silent dropping is intentional to prevent injection. Surfacing as a notification would require UX work; not prioritized.                                                       |
| Provider capability flags are declarations, not end-to-end verified for all combinations | Live verification requires real credentials per provider. Covered for OpenAI/Anthropic/Gemini via opt-in live tests. Other providers verified manually at integration time.    |
| Streaming is disabled when tools are active for providers without `streamingTools: true` | Architectural: non-streaming is required to parse complete tool call JSON. Providers must declare streaming tool support explicitly.                                           |
| No automated user-flow E2E coverage (browser or native)                                  | No Playwright, Cypress, or mobile UI test harness exists. Unit + API-level tests (450+) are the current release gate. Adding E2E would require framework selection + CI setup. |

---

## Device-local data boundary — not a roadmap item

The device-local default is the product's privacy model. The following are intentional and correct:

- Chat threads are `localStorage`-only by default. `syncChatsToServer: false`.
- RAG vectors are `localStorage`-only by default. `syncRagVectorsToServer: false`.
- API keys are server-session-only — never in `localStorage`.
- D1 stores sessions, rate limit state, and usage/stats — no message content by default.
- Cross-device portability is via manual export/import only.

These are not gaps. Do not treat them as missing features in any future planning document.
