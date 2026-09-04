# V1 Product Contract

What V1 promises, what is built today, and how the V1 loop is proven. Moved verbatim from the root `README.md`.

## V1 product contract

V1 is not an all-provider AI chat console. V1 proves one concrete local/BYOC runtime path for edgecase-cockpit: a user-configured generic local OpenAI-compatible endpoint.

The V1 loop is: **detect local capability → explain available/unavailable state → show required configuration/permission → perform one safe controlled model-list action → show result/system state → recover cleanly from failure.**

Product decision: the canonical V1 proof target is a **generic local OpenAI-compatible endpoint** configured by the user. This is a declared product decision made now, not recovered from prior named-provider evidence.

Hermes Agent, OpenClaw, Ollama, LM Studio, vLLM, llama.cpp, and other named providers are not the V1 proof set. Existing provider entries are implementation candidates, compatibility surfaces, or future named presets; they are not V1 commitments.

V1 must prove:

1. Local runtime discovery or explicit endpoint configuration.
2. Reachable, unreachable, and misconfigured state classification.
3. Required configuration explanation.
4. One safe bounded capability check, preferably a model-list probe.
5. Visible result/system state.
6. Clean recovery from failure.
7. No dependency on OpenAI, cloud API keys, OAuth/social login, marketplace scope, signed native builds, live provider accounts, or unrelated agent infrastructure.

The canonical endpoint contract is: configurable base URL, model-list endpoint, chat-completions-compatible endpoint, no required cloud API key, browser-detectable reachable/unreachable state, deterministic mocked E2E support, safe bounded model-list action, and visible recovery from bad URL, timeout, empty models, malformed response, and hosted HTTPS/local HTTP blocking.

Cloud providers, cloud provider keys, OAuth/social login, marketplace-style discovery, live provider accounts, and signed native release artifacts are not part of the V1 promise. They may exist as supported infrastructure or future/post-V1 paths, but V1 must pass without requiring them.

---

## Platform and release status

Platform packaging is useful infrastructure, not the V1 product proof. V1 is proven by browser E2E coverage for the generic local OpenAI-compatible endpoint path.

| Target                     | V1 product proof required | Status                            | Notes                                                                                        |
| -------------------------- | ------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| Browser/web runtime        | **Yes**                   | ✅ Builds                         | Used for V1 E2E proof; no cloud keys or live provider accounts required                      |
| Cloudflare Workers backend | Supporting infrastructure | ✅ Configured                     | `wrangler.jsonc` + D1 configured; deployment is separate from V1 proof                       |
| macOS native (Electron)    | No                        | ✅ Unsigned .app package verified | Useful for local provider transport; signed `.dmg`/notarization is post-V1 distribution work |
| iOS native (Capacitor)     | No                        | ✅ Build verified                 | Build scaffolding exists; distribution profile/device E2E are post-V1                        |
| Android native (Capacitor) | No                        | ✅ Build verified                 | Debug build exists; release keystore/store submission are post-V1                            |

Native packaging tooling is present (Capacitor for iOS/Android, Electron for desktop). Those paths are documented for distribution readiness, but V1 acceptance does not depend on signed native artifacts.

---

## 2. Current implementation status

**Implemented and source-backed:**

- Full chat cockpit: streaming responses, message editing/deletion, regeneration from any point
- Provider infrastructure definitions (8 cloud + 7 local) with proxy/direct routing; these are implementation candidates and compatibility surfaces, while the V1 commitment is the generic local OpenAI-compatible endpoint path
- **Real user accounts** (register, login, logout, `/api/auth/me`) with PBKDF2-HMAC-SHA256 password hashing and a `/auth` route UI for email/password signup and sign-in
- **Local-only profile** (no account required) selected via an explicit first-launch identity choice, with a user-initiated copy / move / keep-separate data migration choice when registering or signing in
- **AES-256-GCM encrypted provider keys** stored in D1 per user (`user_provider_keys`)
- CSRF double-submit cookie protection on all mutating routes
- D1-backed distributed rate limiter (activates at startup when DB binding is available; falls back to in-memory)
- Storage limits enforced server-side (threads, messages, content length, attachments)
- CSP + security headers on HTML responses
- Thread CRUD, import/export (JSON/Markdown/TXT), fork, pin, archive, color
- **Offline-first chat model** with opt-in sync to D1 for authenticated users
- Offline queue with `localStorage` persistence and auto-drain on reconnect
- Error and offline state handling (offline queue, reconnect sync, storage failure)
- First launch / onboarding (modal, skip/complete, persistence)
- Provider / model setup feedback (status indicators, validation, toast notifications)
- Keyboard shortcuts (Cmd/Ctrl+K palette, +N new thread, +Enter send, +/ help, Escape stop/close)
- Command palette with thread/provider/action search and navigation
- Markdown rendering via `react-markdown` with `remark-gfm`, `rehype-highlight`, tables, inline code
- Model picker fetching live models from `/api/proxy/models`
- Settings UI: profile, personalization, keyboard shortcuts, provider cards, RAG config, usage stats
- Exact token usage extracted from provider responses (OpenAI/Anthropic/Gemini formats); heuristic fallback for others
- Cost estimation with per-provider default rates; configurable overrides via `setCostOverrides()`
- 4 safe built-in executable tools (`get_current_time`, `echo`, `word_count`, `calculator`) with UI approval flow
- Dynamic tool schema registry (`registerLocalTool`, `registerProviderTools`, `/api/tools/schemas`)
- Streaming tool-call delta parsing for OpenAI-compatible and Anthropic body styles
- RAG: embedding proxy, local in-memory + `localStorage` vector store, cosine similarity retrieval, context injection, error state surfaced in StatusBar
- Voice input via `MediaRecorder` + Whisper-compatible transcription proxy
- Screenshot capture via `getDisplayMedia`
- Image/video attachment support
- Cross-tab sync for settings, threads, provider stats, and vector store cache invalidation
- Provider tool auto-discovery abstraction with on-demand `GET/POST /api/tools/discover`
- User-defined tool permission model (`user_tool_permissions`) with server-side execution gate
- Live pricing provider abstraction with D1 cache and static fallback
- Multi-node strong consistency rate-limit option via Durable Objects
- **540+ tests across 35+ test files** (as of this writing; verified by `bun run test`)

Sources: all files in `src/`, `src/live/providers.live.test.ts`, `src/lib/*.test.ts`, `src/routes/api/*.test.ts`.

---

## 2a. V1 E2E promise map

The focused V1 browser E2E now proves the loop below for a user-configured generic local OpenAI-compatible endpoint through deterministic Playwright mocks, without OpenAI, cloud provider keys, OAuth, marketplace scope, signed native builds, live provider accounts, unrelated agent infrastructure, or a real local daemon in CI:

1. A fresh guest can start the local-first path without signing in.
2. The UI foregrounds a configurable local OpenAI-compatible endpoint rather than a named provider preset.
3. The endpoint contract includes a configurable base URL, model-list endpoint, and chat-completions-compatible endpoint.
4. The target shows a local capability state: checking, reachable, unreachable, misconfigured, no-models, hosted-HTTPS-blocked, mobile-localhost-mismatch, ready, or failed.
5. The state explains what was detected, what is missing, and the next required configuration or recovery action.
6. The safe model-list action can run against deterministic mocked/local test responses.
7. Success shows model-list result and system state.
8. Empty models, malformed responses, unreachable endpoints, bad base URLs, timeout/abort, and hosted HTTPS local HTTP blocking show recoverable failure states.
9. Fixing configuration and retrying can move the target from failure to ready.
10. The V1 path never requires a cloud API key, OAuth/social login, marketplace install, signed native build, live provider account, unrelated agent infrastructure, or real local daemon in CI.
