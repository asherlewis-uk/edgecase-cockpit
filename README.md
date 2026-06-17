# edgecase-cockpit

> A provider-native AI chat console — hybrid cloud/local, self-hosted, multi-provider.

## Release targets

> [!IMPORTANT]
> V1 targets **macOS native, iOS native, and Android native**. Scaffolding exists for all three. The hybrid architecture (local providers direct-fetch, cloud providers via proxy) is now implemented and verified.

| Target                     | V1 required        | Status                    | Notes                                                              |
| -------------------------- | ------------------ | ------------------------- | ------------------------------------------------------------------ |
| macOS native (Electron)    | **Yes**            | ⚠️ Build pipeline verified, packaging hangs in headless env | `bun run native:desktop:dev` builds + compiles; prior DMG exists; signing/notarization requires certs |
| iOS native (Capacitor)     | **Yes**            | ✅ Build verified         | `bun run native:ios:sync` + `xcodebuild` (arm64) succeed with `CODE_SIGNING_ALLOWED=NO` |
| Android native (Capacitor) | **Yes**            | ✅ Build verified         | `bun run native:android:sync` + `./gradlew assembleDebug` succeed                       |
| Web build (Vite)           | Supporting surface | ✅ Builds                 | `bun run build` passes — client + SSR artifacts in `dist/`         |
| Cloudflare Workers backend | Supporting surface | ✅ Configured             | `wrangler.jsonc` + D1 configured; deployment is a separate step    |

**V1 is not achieved by scaffolding alone.** A passing web/Cloudflare build is a prerequisite, and native projects exist, but V1 requires verified, signed, installable native applications for macOS, iOS, and Android with automated user-flow coverage.

Native packaging tooling is present (Capacitor for iOS/Android, Electron for desktop). The iOS Xcode project and Android Gradle project now compile successfully in this environment (`CODE_SIGNING_ALLOWED=NO` for iOS, debug signing for Android). Electron compile and native-shell generation are verified, but Electron packaging via `electron-builder` stalls in this headless environment (prior DMGs exist). Release-ready artifacts still require signing/notarization credentials for macOS, a provisioning profile for iOS, and a keystore for Android. See [`docs/roadmap/FUTURE_ENHANCEMENTS.md`](docs/roadmap/FUTURE_ENHANCEMENTS.md) for the remaining V1 native blockers.

## 1. What is edgecase-cockpit?

`edgecase-cockpit` is a unified chat interface for both cloud LLM APIs and local/self-hosted inference endpoints. It is a **TanStack Start + React + Cloudflare Workers** application with SSR.

**Offline-first privacy model:** Chats, threads, and messages are stored in `localStorage` by default (device-local). When a user is authenticated and opts in to sync (globally via settings or per-thread), threads are stored in D1 with encrypted provider keys. RAG vector/text data remains device-local. D1 stores: user accounts, encrypted provider keys, user settings, usage statistics, and synced threads when explicitly enabled. Guest users work entirely locally and cannot sync to D1.

**API key security:** Provider keys are stored in D1 (`user_provider_keys`) with AES-256-GCM encryption per user. The browser never sees plaintext keys after migration. `cockpit-store.ts` strips `apiKey` before persisting settings to `localStorage`. Guests cannot store provider keys server-side.

Sources: `src/lib/cockpit-store.ts` (`defaultSettings`, `persist`), `src/lib/db/schema.sql`, `wrangler.jsonc`.

---

## 2. Current implementation status

**Implemented and source-backed:**

- Full chat cockpit: streaming responses, message editing/deletion, regeneration from any point
- 15 provider definitions (8 cloud + 7 local) with proxy-based routing
- **Real user accounts** (register, login, logout) with bcrypt-hashed passwords
- **Guest mode** (no account required) with data claim into a new account on registration
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
- **500+ tests across 30 test files** (as of this writing; verified by `npm run test`)

Sources: all files in `src/`, `src/live/providers.live.test.ts`, `src/lib/*.test.ts`, `src/routes/api/*.test.ts`.

---

## 3. Privacy and data model

| Data                                                | Storage                                  | Notes                                                        |
| --------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Chat threads and messages                           | `localStorage` (device-local) by default | Synced to D1 only when authenticated user enables sync. Guests are local-only. Export/import via JSON/Markdown/TXT always available. |
| Settings (profile, personalization, shortcuts, RAG)   | `localStorage` by default                | User settings also stored in D1 when authenticated. Guests are local-only. |
| Provider API keys                                   | D1 `user_provider_keys` (encrypted)      | AES-256-GCM encrypted. Guests cannot store keys server-side. |
| RAG vectors and text chunks                         | `localStorage` + in-memory               | Device-local only.                                           |
| Provider stats (counts, tokens, cost)               | `localStorage`                           | Device-local only.                                           |
| Usage records (per-call model/token/cost)           | D1 `usage_records` (when authenticated) | Per-user when logged in.                                     |
| Rate limit state                                    | In-memory (fallback) or D1 `rate_limits` | Server-side for cloud providers.                             |
| Session/security data                               | D1 `sessions` + encrypted cookie         | Server-side only.                                            |

**Defaults proven by source:**

- Chat data defaults to device-local (`is_local=1, sync_enabled=0`) — `src/lib/cockpit-store.ts` (`newThread`), `src/lib/db/schema.sql`
- Guest users cannot store provider keys in D1 — `src/lib/session.server.ts` (`setProviderCreds` throws for guests)
- Authenticated users can sync threads to D1 via `sync_enabled` flag — `src/lib/db/schema.sql`, `src/routes/api/threads.ts`
- Provider API keys stored in D1 with AES-256-GCM encryption — `src/lib/db/schema.sql`, `src/lib/encryption.server.ts`
- `_serverSyncAvailable = false` — `src/lib/vector-store.ts`; server RAG sync functions are dormant
- Provider API keys stripped from `localStorage` in `persist()` before every write
- `normalizeSettings()` migrates legacy settings so missing fields default to safe values

**What D1 stores (server-side):**

- `users`: registered user accounts (email, password hash)
- `user_provider_keys`: encrypted provider API keys per user (AES-256-GCM)
- `user_settings`: per-user settings (profile, personalization, sync preferences)
- `threads`: chat threads when `sync_enabled=1` (otherwise device-local)
- `sessions`: encrypted session data (no message content)
- `rate_limits`: rate limiter window state
- `guest_sessions`: ephemeral anonymous sessions (30-day TTL)

**What D1 does NOT store by default:**

- Chat threads for guests or users with `sync_enabled=0` — all device-local in `localStorage`
- RAG vectors, text chunks, or embeddings — all device-local in `localStorage`
- Provider stats (calls, tokens, cost) — all device-local in `localStorage`

Sources: `src/lib/cockpit-store.ts`, `src/lib/vector-store.ts`, `src/lib/db/schema.sql`, `src/lib/cockpit-store.test.ts`.

---

## 4. Manual chat portability

> **Manual export/import is always available as a cross-device chat portability path.** For authenticated users, opt-in sync to D1 is also available (per-thread or globally). JSON/Markdown/TXT export and import via `cockpit-store.ts` `exportThread()` / `importThreads()` works regardless of sync state.

- **Export formats:** JSON (full thread with all messages), Markdown, plain text
- **Import:** `store.importThreads(threads)` accepts a thread JSON array and merges into local state
- **Fork:** `store.forkThread(id)` creates a local copy of an existing thread
- **Pin/archive:** local state, persisted in `localStorage`

Sources: `src/lib/cockpit-store.ts` (`exportThread`, `importThreads`, `forkThread`).

---

## 5. Architecture

```
src/
├── routes/                    # TanStack file-based routes
│   ├── index.tsx              # Main chat cockpit
│   ├── settings.tsx           # Settings page
│   ├── library.tsx            # Thread library
│   ├── images.tsx             # Image gallery
│   ├── videos.tsx             # Video gallery
│   ├── thread.$id.tsx         # Deep-link to saved thread
│   └── api/                   # API routes (server-side handlers)
│       ├── health.ts
│       ├── session.ts
│       ├── stats.ts
│       ├── settings.ts        # User settings (GET/POST, auth required)
│       ├── auth/
│       │   ├── register.ts      # User registration
│       │   ├── login.ts         # User login
│       │   ├── logout.ts        # User logout
│       │   └── me.ts            # Current user profile
│       ├── threads.ts
│       ├── threads.$id.ts
│       ├── threads.import.ts
│       ├── threads.$id.export.ts
│       ├── threads.$id.fork.ts
│       ├── threads.$id.pin.ts
│       ├── usage.ts
│       ├── usage.$threadId.ts
│       ├── vector-docs.ts
│       ├── keys/set.ts
│       ├── keys/clear.ts
│       ├── keys/status.ts
│       ├── keys/validate.ts
│       ├── keys/validate.$providerId.ts
│       ├── tools/schemas.ts
│       └── proxy/
│           ├── chat.ts
│           ├── detect.ts
│           ├── embeddings.ts
│           ├── models.ts
│           └── transcribe.ts
├── components/cockpit/        # Cockpit UI components
│   ├── ChatInput.tsx          # Input bar with attachments/voice/screenshot
│   ├── ChatMessages.tsx       # Scrollable message list container
│   ├── MessageRow.tsx         # Individual message bubble + tool cards
│   ├── MarkdownContent.tsx    # react-markdown wrapper
│   ├── ModelPicker.tsx        # Live model dropdown
│   ├── CommandPalette.tsx     # Cmd+K search/nav palette
│   ├── ShortcutHelp.tsx       # Keyboard shortcut overlay
│   ├── StatusBar.tsx          # Offline/queue/ragError banner
│   ├── ThreadOverflowMenu.tsx # Rename, export, archive, delete
│   ├── CockpitErrorBoundary.tsx
│   ├── Drawer.tsx             # Left slide-out nav + recent threads
│   ├── Greeting.tsx           # Empty-state greeting
│   ├── ProviderStatus.tsx     # Active provider readiness pill
│   └── settings/              # Settings sub-components
│       ├── ProfileSection.tsx
│       ├── PersonalizationSection.tsx
│       ├── ProviderCard.tsx
│       ├── UsageSection.tsx
│       └── SharedFields.tsx
├── hooks/
│   ├── use-chat.ts            # Core chat logic (streaming, RAG, tools, queue, retry, hybrid routing)
│   ├── use-keyboard-shortcuts.ts
│   └── use-mobile.tsx
├── lib/                       # Shared libraries
│   ├── cockpit-store.ts       # Central client state (Zustand-like, useSyncExternalStore)
│   ├── providers.ts           # Provider catalog + chat call helpers (direct + proxy)
│   ├── chat-payloads.ts       # Client-safe request body builders (extracted from proxy)
│   ├── api-base.ts            # Native-safe fetch wrapper + directFetch for local providers
│   ├── tools.ts               # Tool schema, validation, serialization, parsing, execution
│   ├── tokens.ts              # Token estimation + exact usage extraction + cost
│   ├── embeddings.ts          # Client helper for embedding proxy
│   ├── vector-store.ts        # In-memory + localStorage cosine-similarity vector store
│   ├── sanitize.ts            # Message sanitization before storage
│   ├── retry.ts               # Exponential backoff with jitter
│   ├── utils.ts               # cn() helper
│   ├── db/
│   │   ├── index.ts           # D1 database layer
│   │   └── schema.sql         # D1 schema
│   └── *.server.ts            # Server-only modules
│       ├── csrf.server.ts
│       ├── csp.server.ts
│       ├── rate-limit.server.ts
│       ├── proxy-guard.server.ts
│       ├── storage-limits.server.ts
│       ├── session.server.ts
│       ├── validate-key.server.ts
│       ├── platform.server.ts
│       ├── logger.server.ts
│       └── env.server.ts
├── live/
│   └── providers.live.test.ts # Opt-in live provider tests (requires real keys)
├── test/
│   └── setup.ts               # Vitest setup (jest-dom)
├── server.ts                  # Custom SSR entry + startup guards
├── router.tsx                 # TanStack router creation
└── routeTree.gen.ts           # Auto-generated route tree
```

### Data flows

**Chat request (hybrid routing):**

1. User sends a message in `ChatInput.tsx`
2. `sendMessage` in `use-chat.ts` adds the user message to the active thread in `cockpit-store.ts`
3. If RAG is enabled, the message text is embedded via `embedTexts` (`embeddings.ts` → `POST /api/proxy/embeddings` for cloud providers, or direct fetch for local providers) and stored in `vector-store.ts`
4. `runAssistant` builds the chat history including personalization system message and optional RAG context
5. **Routing decision:** `provider.type === "local"` → `callProviderChat` (direct fetch to daemon); `provider.type === "cloud"` → `callProviderChatViaProxy` (POST `/api/proxy/chat` with CSRF headers)
6. For **cloud** providers: `src/routes/api/proxy/chat.ts` validates CSRF, rate limit, URL allowlist, fetches API key from encrypted session, and proxies to the provider
7. For **local** providers: `callProviderChat` builds the request body via `src/lib/chat-payloads.ts` and makes a direct `fetch` to the daemon URL. Zero network calls to the app's infrastructure.
8. For streaming: SSE deltas are parsed and patched into the placeholder message via `store.patchMessage`
9. On success: token usage is extracted from provider response (exact if available, heuristic otherwise) and recorded locally
10. On error: error is deduplicated, rate-limit cooldown may be set (cloud only), offline messages are queued, local provider failures show a clean timeout message

**Thread persistence:**

1. Threads live in `localStorage` via `cockpit-store.ts` — server sync is **not available**
2. Cross-tab sync via `storage` events propagates settings, threads, provider stats, and vector store cache invalidation
3. Manual export/import (JSON/Markdown/TXT) is the cross-device transfer mechanism

**Tools/function-calling:**

1. If tools are defined and the provider has `streamingTools: true`, streaming tool-call deltas are parsed in real time
2. If `streamingTools` is `false`, tools disable streaming (non-streaming response is parsed for complete tool calls)
3. `MessageRow.tsx` renders tool calls as cards; user must click "Execute"
4. Only `isBuiltInTool`-gated tools execute; non-built-in names return `[Tool "{name}" is not implemented]`
5. The assistant is re-run with the tool result injected as a `tool` role message

Sources: `src/hooks/use-chat.ts`, `src/lib/cockpit-store.ts`, `src/lib/providers.ts`, `src/lib/tools.ts`.

---

## 6. Provider support and capability matrix

| Provider                   | Chat | Models | Tools | Streaming Tools | Embeddings | Vision | Transcription | Type  | Body style |
| -------------------------- | ---- | ------ | ----- | --------------- | ---------- | ------ | ------------- | ----- | ---------- |
| OpenAI                     | ✅   | ✅     | ✅    | ✅              | ✅         | ✅     | ✅            | Cloud | openai     |
| Anthropic                  | ✅   | ✅     | ✅    | ✅              | ❌         | ✅     | ❌            | Cloud | anthropic  |
| Google Gemini              | ✅   | ✅     | ✅    | ✅              | ✅         | ✅     | ❌            | Cloud | openai     |
| Moonshot / KimiCoding      | ✅   | ✅     | ✅    | ❌              | ❌         | ❌     | ❌            | Cloud | openai     |
| OpenRouter                 | ✅   | ✅     | ✅    | ❌              | ❌         | ✅     | ❌            | Cloud | openai     |
| Ollama Cloud               | ✅   | ✅     | ❌    | ❌              | ✅         | ❌     | ❌            | Cloud | openai     |
| NVIDIA NIM                 | ✅   | ✅     | ✅    | ❌              | ✅         | ✅     | ❌            | Cloud | openai     |
| Vercel AI Gateway          | ✅   | ✅     | ✅    | ❌              | ✅         | ✅     | ❌            | Cloud | openai     |
| Ollama (local)             | ✅   | ✅     | ✅    | ❌              | ✅         | ✅     | ❌            | Local | openai     |
| LM Studio                  | ✅   | ✅     | ❌    | ❌              | ✅         | ✅     | ❌            | Local | openai     |
| Hermes                     | ✅   | ✅     | ✅    | ❌              | ✅         | ❌     | ❌            | Local | openai     |
| OpenClaw                   | ✅   | ✅     | ✅    | ❌              | ❌         | ❌     | ❌            | Local | openai     |
| vLLM                       | ✅   | ✅     | ✅    | ❌              | ✅         | ✅     | ❌            | Local | openai     |
| llama.cpp server           | ✅   | ✅     | ❌    | ❌              | ✅         | ✅     | ❌            | Local | openai     |
| Custom (OpenAI-compatible) | ✅   | ✅     | ✅    | ❌              | ✅         | ✅     | ✅            | Local | openai     |

**Streaming tools** is implemented client-side via `StreamToolCallAccumulator` (OpenAI body style) and `AnthropicStreamToolCallAccumulator` + `extractAnthropicToolCallDelta` (Anthropic body style). Gemini uses the OpenAI-compatible path. Providers without `streamingTools: true` in their capability flags fall back to non-streaming when tools are present.

Source: `src/lib/providers.ts` (capability declarations), `src/hooks/use-chat.ts` (`supportsOpenAIStreamingTools`, `supportsAnthropicStreamingTools`), `src/lib/tools.ts` (accumulator implementations).

**Capability flags are declarations in `providers.ts`.** Not all combinations have been end-to-end verified against real provider APIs. Live verification requires `RUN_LIVE_PROVIDER_TESTS=true` with real credentials (see Section 14).

**Custom provider wildcard policy:** The `custom` provider has `allowedHosts: ["*"]`. In production, wildcard host matching is **blocked** unless `PROXY_ALLOW_CUSTOM_WILDCARD=true` is explicitly set. In development, wildcards are unrestricted for local exploration. Source: `src/lib/proxy-guard.server.ts`.

---

## 7. Tools and tool execution model

### Built-in executable tools

Four tools are registered in `BUILT_IN_TOOLS` and can be executed by the user after provider delivery:

| Tool name          | Description                                                                        |
| ------------------ | ---------------------------------------------------------------------------------- |
| `get_current_time` | Returns current ISO date/time                                                      |
| `echo`             | Echoes provided text unchanged                                                     |
| `word_count`       | Returns word count of provided text                                                |
| `calculator`       | Evaluates safe arithmetic expressions (`+`, `-`, `*`, `/`, `%`, `**`, parentheses) |

Source: `src/lib/tools.ts` (`BUILT_IN_TOOLS`, `executeBuiltInTool`).

### Dynamic schema registry

Additional tool schemas can be registered at runtime without modifying the source:

- **`registerLocalTool(tool)`** — register a locally-configured schema; validated for safe name pattern, deduplicated, capped at 256 non-built-in tools
- **`registerProviderTools(providerId, tools[])`** — register schemas sourced from a provider; replaces existing entries for that provider on update; built-in names cannot be overwritten
- **`GET /api/tools/schemas`** — list all registered schemas (CSRF + rate-limited)
- **`POST /api/tools/schemas`** — register a new schema via API (CSRF + rate-limited)
- **`getSerializableToolDefs()`** — returns schemas safe to serialize in provider request bodies

**Registered non-built-in schemas are serializable to providers but are not executable.** Only tools in `BUILT_IN_TOOLS` can reach `executeBuiltInTool`. A registered local or provider schema produces `[Tool "{name}" is not implemented]` if the user attempts to execute it.

Source: `src/lib/tools.ts`, `src/routes/api/tools/schemas.ts`.

### Safety guards

Three-layer validation in `executeTool` (`use-chat.ts`):

1. **`validateToolCall(call)`** — enforces id/name/args shape
2. **`sanitizeToolCallArgs(call.arguments)`** — validates JSON arguments as a plain object, ≤16 KB
3. **`isBuiltInTool(name)`** gate before `executeBuiltInTool`

At parse time, `validateToolName(name)` restricts tool names to `[a-zA-Z0-9][a-zA-Z0-9_.-]*` (≤128 chars). Unsafe names from provider responses are silently dropped in `parseOpenAIToolCalls`, `parseAnthropicToolCalls`, and `StreamToolCallAccumulator.complete()`.

**Arbitrary shell/code/network execution is not implemented.** The `calculator` tool evaluates only arithmetic expressions matching `[0-9+\-*/(). %\s]+` via a sandboxed `Function` call; non-arithmetic patterns are rejected before evaluation.

Source: `src/lib/tools.ts` (`validateToolName`, `sanitizeToolCallArgs`, `validateToolCall`), `src/hooks/use-chat.ts` (`executeTool`).

---

## 8. RAG / embeddings

### How it works

1. **Embedding proxy:** `POST /api/proxy/embeddings` forwards to any provider with `embeddingsPath` defined. CSRF headers are required. API key is fetched server-side from the encrypted session.
2. **Client helper:** `embedTexts` in `src/lib/embeddings.ts` calls the proxy with CSRF headers from `csrfHeaders()`.
3. **Ingestion:** When RAG is enabled, every user message is embedded via `embedTexts` and stored in `vector-store.ts` via `addVectorDocs`. Deduplication prevents re-embedding identical message IDs.
4. **Chunking:** `chunkText` in `src/lib/vector-store.ts` splits text on paragraph breaks (`\n\n+`) and sentence punctuation (`.!?`). Short sentences within the same paragraph are merged up to `minLength` (default 80 chars).
5. **Retrieval:** Before building chat history, `runAssistant` embeds the current prompt and calls `searchVectorStore(queryEmbedding, 3)` for top-3 cosine-similarity results.
6. **Context injection:** Retrieved context is prepended to the personalization system message or added as a standalone system message if none exists.
7. **Error state:** Embedding or retrieval failures set `ragError` state, which `StatusBar.tsx` renders alongside offline/queue status. Failures do not block chat.
8. **Cross-tab sync:** `ensureVectorStoreCrossTabSync()` registers a `storage` event listener that invalidates the in-memory vector cache when another tab writes to the store key.

### Privacy note

The Settings RAG section explicitly warns that enabling retrieval sends message text to the selected embedding provider's API (via the server proxy).

### Server sync (opt-in, off by default)

- `_serverSyncAvailable` in `vector-store.ts` defaults to `false`; `syncVectorDocToServer` and `loadVectorDocsFromServer` are no-ops unless explicitly enabled
- When enabled via `syncRagVectorsToServer: true`, text chunks and embedding vectors are stored in the D1 `vector_docs` table — this is privacy-sensitive
- `localStorage` remains the source of truth with server sync as supplemental storage

Source: `src/lib/vector-store.ts`, `src/lib/embeddings.ts`, `src/routes/api/proxy/embeddings.ts`, `src/routes/api/vector-docs.ts`, `src/hooks/use-chat.ts`.

---

## 9. Rate limiting

### Architecture

- **Backend selection:** `configureRateLimiterFromEnv()` runs at cold start. `RATE_LIMIT_BACKEND=auto` (default) tries D1, falls back to in-memory silently. `RATE_LIMIT_BACKEND=d1` requires D1. `RATE_LIMIT_BACKEND=memory` forces in-memory (dev/single-node).
- **D1 backend (`D1RateLimiterBackend`):** Maintains in-memory buckets (synchronous, accurate within a single Worker request) and persists counts to D1 asynchronously (fire-and-forget). Cross-Worker count sharing is eventually consistent. At very high concurrency across multiple Workers, a small number of over-limit requests may slip through before D1 counts propagate. This is acceptable for Cloudflare's stateless-Worker model.
- **In-memory backend (default/fallback):** Accurate within a single process. Does not share state across Worker instances. Suitable for local dev and acknowledged single-node deployments.
- **Production guard:** In `production` mode without a custom backend or `ALLOW_IN_MEMORY_RATE_LIMIT=true`, `warnInMemoryRateLimitInProduction()` emits a prominent `console.error`. Set `ALLOW_IN_MEMORY_RATE_LIMIT=true` to acknowledge single-node usage.
- **Pluggable:** `IRateLimiterBackend` interface; swap via `setRateLimiterBackend()`.

### Non-proxy route limits (per session, per minute)

| Route category                                 | Limit   |
| ---------------------------------------------- | ------- |
| Keys (set/clear/validate)                      | 20/min  |
| Threads (create/update/delete/import/fork/pin) | 60/min  |
| Usage (read)                                   | 60/min  |
| Stats (read/write/reset)                       | 60/min  |
| Session bootstrap                              | 30/min  |
| Health check                                   | 120/min |

### Proxy route limits

Per-session sliding window: **120 requests/min** via `proxy-guard.server.ts`.

Source: `src/lib/rate-limit.server.ts`, `src/lib/proxy-guard.server.ts`.

---

## 10. Security model

### Environment validation

- `validateEnv()` in `src/lib/env.server.ts` checks `SESSION_SECRET` (≥32 chars) at module initialization in `server.ts`
- If validation fails, all requests return HTTP 503 with a non-secret diagnostic message
- Optional vars (`NODE_ENV`, `LOG_LEVEL`) emit warnings if missing

### CSRF double-submit cookie

- `csrf.server.ts` generates a 32-byte hex token set as a readable `SameSite=Lax`, `Secure` cookie
- Client reads the cookie and sends it back as `X-CSRF-Token`
- Server validates with constant-time comparison
- Safe methods (GET, HEAD, OPTIONS) are exempt
- All mutating API routes enforce CSRF validation

### CSP headers

- `csp.server.ts` builds a strict CSP attached to HTML responses only
- Development: `script-src 'self' 'unsafe-inline' 'unsafe-eval'`; Production: `script-src 'self' 'unsafe-inline'`
- Additional headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- API routes manage their own headers; static assets served by Cloudflare are not modified

### Proxy guard / SSRF prevention

- `proxy-guard.server.ts` restricts proxy targets to each provider's declared `allowedHosts`
- Local providers use `["localhost", "127.0.0.1", "*.local"]`
- Cloud providers use their specific hostnames (e.g., `["api.openai.com"]`)
- Custom provider has `allowedHosts: ["*"]` — blocked in production unless `PROXY_ALLOW_CUSTOM_WILDCARD=true`
- `urlAllowedForProvider` validates every proxy request before forwarding

### Storage limits (HTTP 413 on violation)

| Limit                           | Value         |
| ------------------------------- | ------------- |
| Max threads per session         | 2,000         |
| Max messages per thread         | 2,000         |
| Max message content length      | 100,000 chars |
| Max thread title length         | 512 chars     |
| Max attachment URLs per message | 50            |
| Max imported threads            | 100           |

### API key handling

- Keys stored in D1 (`user_provider_keys`) with AES-256-GCM encryption per user (`session.server.ts` + `encryption.server.ts`)
- Session cookie only stores session ID, user ID, and guest session ID — no provider keys
- Browser never sees plaintext keys after migration
- `cockpit-store.ts` strips `apiKey` before persisting settings to `localStorage`
- Legacy keys in `localStorage` are auto-migrated to the server on first hydration
- Guests cannot store provider keys server-side (401 on proxy routes that need keys)

### Message sanitization

- `sanitize.ts` strips HTML tags, control characters, and normalizes whitespace before DB storage
- `sanitizeMessage` walks nested content including tool-call payloads

Source: `src/lib/env.server.ts`, `src/lib/csrf.server.ts`, `src/lib/csp.server.ts`, `src/lib/proxy-guard.server.ts`, `src/lib/storage-limits.server.ts`, `src/lib/session.server.ts`, `src/lib/sanitize.ts`.

---

## 11. Deployment / Cloudflare / D1 setup

### wrangler.jsonc

```jsonc
{
  "name": "tanstack-start-app",
  "compatibility_date": "2025-09-24",
  "compatibility_flags": ["nodejs_compat"],
  "main": "src/server.ts",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "edgecase-cockpit",
      "database_id": "f89b278d-301f-4a98-a018-b92eeb279449",
    },
  ],
}
```

D1 is configured with a real database ID and `DB` binding. The device-local default is enforced in code — chat data is `localStorage` by default and only synced to D1 when an authenticated user explicitly enables it.

### D1 schema setup

```bash
bunx wrangler d1 migrations list edgecase-cockpit --remote
bunx wrangler d1 migrations apply edgecase-cockpit --remote
```

Tables: `users`, `user_provider_keys`, `user_settings`, `guest_sessions`, `sessions`, `threads`, `provider_stats`, `usage_records`, `vector_docs`, `rate_limits`.

### Startup guards (cold start)

`server.ts` runs at module init:

1. **`validateEnv()`** — validates `SESSION_SECRET` ≥32 chars, and validates production/D1 `ENCRYPTION_KEY` ≥32 chars; returns 503 for all requests if invalid
2. **D1 binding check** — warns if the `DB` platform binding is not available
3. **`configureRateLimiterFromEnv()`** — selects D1 or in-memory backend based on `RATE_LIMIT_BACKEND` env var
4. **`warnInMemoryRateLimitInProduction()`** — emits `console.error` if in-memory is used in production without acknowledgement
5. **`logCustomProviderPolicy()`** — logs whether custom-provider wildcard hosts are allowed or blocked

### Environment variables

| Name                          | Required                 | Purpose                                                            |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------ |
| `SESSION_SECRET`              | **Yes**                  | Encryption key for cookie sessions (≥32 chars)                     |
| `ENCRYPTION_KEY`              | **Yes in production/D1** | Dedicated AES-256-GCM key for provider key encryption (≥32 chars)  |
| `NODE_ENV`                    | No                       | Runtime environment (`development` / `production`)                 |
| `LOG_LEVEL`                   | No                       | Structured logger level                                            |
| `DB`                          | Yes (platform binding)   | Cloudflare D1 binding (configured in `wrangler.jsonc`)             |
| `RATE_LIMIT_BACKEND`          | No                       | `auto` (default), `d1`, or `memory`                                |
| `ALLOW_IN_MEMORY_RATE_LIMIT`  | Production opt-in        | Set `true` to acknowledge in-memory rate limiting in production    |
| `PROXY_ALLOW_CUSTOM_WILDCARD` | Production opt-in        | Set `true` to allow wildcard host matching for the custom provider |

### Production deployment checklist

- [ ] Set `SESSION_SECRET` to a random 32+ character string
- [ ] Set `ENCRYPTION_KEY` to a different random 32+ character string for provider key encryption
- [x] D1 database ID and `DB` binding configured in `wrangler.jsonc`
- [ ] Run `bunx wrangler d1 migrations apply edgecase-cockpit --remote` to apply one-time D1 migrations
- [ ] Either set `RATE_LIMIT_BACKEND=d1` (recommended for multi-node) or set `ALLOW_IN_MEMORY_RATE_LIMIT=true` (single-node only)
- [ ] Confirm D1 schema includes `users`, `user_provider_keys`, `user_settings`, `threads` (with `sync_enabled`/`is_local` columns), `guest_sessions`, `sessions`, `rate_limits`, `usage_records`, `provider_stats`, `vector_docs`
- [ ] **Do not enable thread sync without reviewing privacy implications** — this writes full message content to D1 for authenticated users who opt in
- [ ] If the custom provider needs to reach arbitrary hosts, set `PROXY_ALLOW_CUSTOM_WILDCARD=true`; otherwise leave blocked
- [ ] Run `bun run test && bun run typecheck && bun run lint && bun run build` before deploying

---

## 12. Settings and personalization

Settings are persisted in `localStorage` under `cockpit.settings.v2`. API keys are never persisted there.

| Setting area       | Persisted fields                                                                                                                            | Source                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Profile            | displayName, handle, avatarDataUrl, initials, pronouns, roleLabel                                                                           | `cockpit-store.ts` (`UserProfile`)       |
| Personalization    | assistantName, preferredTone, visualMode, ambientIntensity, reduceMotion, showProviderInGreeting, showModelInGreeting, rememberLastProvider | `cockpit-store.ts` (`Personalization`)   |
| Keyboard shortcuts | per-action enabled flags, forceCtrl                                                                                                         | `cockpit-store.ts` (`KeyboardShortcuts`) |
| RAG                | enabled, providerId, model override                                                                                                         | `cockpit-store.ts` (`RagSettings`)       |
| Active provider    | activeProviderId                                                                                                                            | `cockpit-store.ts`                       |
| Pinned providers   | pinnedProviderIds[]                                                                                                                         | `cockpit-store.ts`                       |
| Cost overrides     | per-provider { input, output } USD/1K tokens                                                                                                | `cockpit-store.ts` (`costOverrides`)     |
| Account            | email, password (server-side)                                                                                                               | `src/lib/auth.server.ts`                 |

The Settings UI (`src/routes/settings.tsx`) exposes all of these with immediate persistence. Cost override changes are applied instantly to future cost estimates via `setCostOverrides()`.

---

## 13. Usage and cost tracking

### Token usage

- **Exact extraction:** `extractProviderUsage` in `src/lib/tokens.ts` extracts from provider response data:
  - OpenAI / OpenAI-compatible: `usage.prompt_tokens`, `usage.completion_tokens`
  - Anthropic: `usage.input_tokens`, `usage.output_tokens`
  - Gemini: `usageMetadata.promptTokenCount`, `usageMetadata.candidatesTokenCount`
- **Heuristic fallback:** `estimateTokens` averages `text.length / 4` (chars-per-token) and `wordCount × 1.3` (words-per-token). Used when provider response contains no usage metadata. No WASM dependency (Cloudflare Workers-safe).
- **`exactUsage: true/false`** flag is recorded in usage records and displayed in the usage UI

### Cost estimation

- **Default rates:** Defined in `_COST_DEFAULTS` in `src/lib/tokens.ts` (per 1,000 tokens, USD, as of mid-2025)
- **Overridable:** Per-provider rates can be overridden via `setCostOverrides()` from `costOverrides` in settings; overrides take effect immediately
- **Fallback:** Unknown providers fall back to OpenAI rates

| Provider   | Default input rate ($/1K) | Default output rate ($/1K) |
| ---------- | ------------------------- | -------------------------- |
| openai     | $0.00015                  | $0.0006                    |
| anthropic  | $0.003                    | $0.015                     |
| gemini     | $0.000075                 | $0.0003                    |
| openrouter | $0.00015                  | $0.0006                    |
| moonshot   | $0.001                    | $0.004                     |
| nvidia-nim | $0.00035                  | $0.0011                    |
| vercel-ai  | $0.00015                  | $0.0006                    |

### Storage and display

- **Local:** `cockpit.provider-stats.v1` in `localStorage` — calls, errors, inputTokens, outputTokens per provider
- **D1:** `provider_stats` table (aggregated) and `usage_records` table (per-call with model, thread, tokens, cost)
- **UI:** `UsageSection.tsx` reads local stats; displays calls, errors, input/output tokens, estimated cost per provider
- **API:** `GET /api/usage` (aggregate) and `GET /api/usage/$threadId` (per-thread) return D1 totals; `GET /api/stats` returns provider stats

Source: `src/lib/tokens.ts`, `src/lib/cockpit-store.ts`, `src/routes/api/stats.ts`, `src/routes/api/usage.ts`, `src/components/cockpit/settings/UsageSection.tsx`.

---

## 14. Testing and release gates

### Normal test suite

```bash
bun run test          # Run all 450+ tests (25 files)
bun run typecheck     # tsc --noEmit
bun run lint          # eslint .
bun run build         # vite build
```

- **Framework:** Vitest with jsdom environment, globals enabled
- **Setup:** `src/test/setup.ts` — imports `@testing-library/jest-dom`
- **Current count:** 450+ tests, 25 test files _(as of 2026-06-15)_
- **Credential-free:** All normal tests run without any provider API keys
- **Coverage areas:** CSRF, CSP, rate limiting (D1 backend + in-memory + preset limiters), storage limits, proxy guard, providers, tools (schema registry, name validation, arg sanitization, streaming accumulators), vector store (chunking, add/remove/search/clear, cross-tab sync), tokens (exact extraction, heuristic, cost estimation), cockpit store (defaults, normalization, sync flags, migration, onboarding), chat hook (offline queue, error handling, provider status), keyboard shortcuts, chat input, greeting, RAG/proxy integration, API routes

### Live provider tests (opt-in)

Live tests call real provider APIs and require real credentials:

```bash
# Run all live provider tests
Create `.env.local`:

RUN_LIVE_PROVIDER_TESTS=true
STRICT_LIVE_PROVIDER_TESTS=false

GEMINI_API_KEY=AIza...
MISTRAL_API_KEY=...
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-v1-...

Then run:

bun run test:live

# Strict mode: fail loudly if any expected key is absent
Create `.env.local`:

RUN_LIVE_PROVIDER_TESTS=true
STRICT_LIVE_PROVIDER_TESTS=true

GEMINI_API_KEY=AIza...
MISTRAL_API_KEY=...
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-v1-...

Then run:

bun run test:live
```

Live test coverage (all in `src/live/providers.live.test.ts`):

- OpenAI: chat completion, streaming, streaming-with-tools, embeddings
- Anthropic: chat completion, streaming-with-tools (content_block events)
- Gemini: chat completion, streaming (OpenAI-compat path), streaming-with-tools
- Mistral: chat completion (free-tier compatible)
- Groq: chat completion (free-tier compatible)
- OpenRouter: chat completion (free-tier compatible)

Strict mode (`STRICT_LIVE_PROVIDER_TESTS=true`) throws an error when a required key is absent rather than silently skipping. Verified by a synthetic test in `providers.live.test.ts`.

### Combined release gate

```bash
bun run test:release
# Equivalent to: npm run test && (OPENAI_API_KEY present → run test:live || skip with message)
```

### Known accepted lint warnings

7 pre-existing `react-refresh/only-export-components` warnings in shadcn/ui component files. These are accepted and do not block releases.

---

## 15. Source-backed limitations and intentional boundaries

The following limitations and boundaries are proven by source code and tests. Each is accurate as of the current implementation.

### Provider API tool schema auto-discovery is not implemented

Provider APIs (e.g., OpenAI's tools endpoint) are not fetched automatically. Tool schemas must be registered manually via `registerLocalTool`, `registerProviderTools`, or `POST /api/tools/schemas`. Source: `src/lib/tools.ts` (no auto-fetch code path).

### Arbitrary shell/code/network execution is intentionally unsupported

`executeBuiltInTool` handles exactly 4 tools. Non-built-in tool names return `[Tool "{name}" is not implemented]`. The `calculator` tool evaluates only arithmetic expressions matching `[0-9+\-*/(). %\s]+`; any other input is rejected. Source: `src/lib/tools.ts` (`executeBuiltInTool`, `isBuiltInTool`).

### User-defined tool execution requires an explicit safe-registry addition

Schemas registered via `registerLocalTool` or `registerProviderTools` are visible and serializable to providers but cannot execute without being explicitly added to `BUILT_IN_TOOLS`. The built-in safe execution registry is hardcoded at 4 tools. Source: `src/lib/tools.ts`.

### Live provider verification requires real credentials and opt-in env flags

Default `bun run test` runs without credentials. Live provider behavior (streaming, tools, embeddings against real APIs) is only tested via `RUN_LIVE_PROVIDER_TESTS=true`. Source: `src/live/providers.live.test.ts`.

> **Privacy model:** Chat data defaults to device-local (`localStorage`). Sync to D1 is opt-in for authenticated users (per-thread or globally). Guests work entirely locally. RAG vectors and provider stats are always device-local. D1 stores user accounts, encrypted provider keys, user settings, synced threads (when enabled), sessions, rate limits, and usage records. Source: `src/lib/cockpit-store.ts`, `src/lib/db/schema.sql`, `src/lib/session.server.ts`.

### D1 rate-limit counting is eventually consistent across multiple Workers

The D1 backend maintains in-memory buckets per Worker (synchronous) and persists counts to D1 asynchronously (fire-and-forget). At high concurrency across multiple Workers, a small number of over-limit requests may slip through before counts propagate. In-memory rate limiting resets on every cold start and is not shared across Workers. Source: `src/lib/rate-limit.server.ts` (`D1RateLimiterBackend.persistAsync`).

### Cost rates are not fetched live from provider pricing APIs

Default rates in `_COST_DEFAULTS` are static and may become stale as provider pricing changes. Per-provider overrides are supported via `setCostOverrides()` in settings. Source: `src/lib/tokens.ts`.

### Token estimation uses an OpenAI-compatible BPE tokenizer with heuristic fallback

When a provider response contains no usage metadata, `estimateTokens` lazy-loads `gpt-tokenizer` (`cl100k_base` encoding) to produce BPE token counts. A lightweight character/word heuristic is retained as a synchronous fallback for the first estimate and for constrained environments where the tokenizer chunk cannot load. Exact counts are still extracted when providers include usage metadata (OpenAI, Anthropic, Gemini). Source: `src/lib/tokens.ts` (`extractProviderUsage`, `estimateTokens`, `estimateTokensAsync`).

### Custom provider wildcard host matching is blocked in production by default

The `custom` provider's `allowedHosts: ["*"]` is blocked in production without `PROXY_ALLOW_CUSTOM_WILDCARD=true`. This is an intentional security boundary, not a missing feature. Source: `src/lib/proxy-guard.server.ts` (`isWildcardHostAllowed`).

### Tool name safety: unsafe provider-returned names are silently dropped

Unsafe tool names from provider responses are dropped rather than surfaced as errors during parsing. This is intentional to prevent injection, but it means the user sees no notification when a provider returns an unsafe tool name. Source: `src/lib/tools.ts` (`parseOpenAIToolCalls`, `parseAnthropicToolCalls`, `StreamToolCallAccumulator.complete`).

### Manual export/import is the only cross-device chat portability path

There is no automatic cross-device chat sync. JSON/Markdown/TXT export and import via `POST /api/threads/import` is the intended mechanism. This is intentional — the device-local default is the product's privacy model. Source: `src/lib/cockpit-store.ts`, `src/routes/api/threads.import.ts`.

---

## 16. Safe change workflow

1. **Before any edit:** run impact analysis on the symbol you plan to modify (see `AGENTS.md`)
2. **Verify baseline:**
   ```bash
   bun run test && bun run typecheck && bun run lint && bun run build
   ```
3. **Make changes** — keep normal tests credential-free; keep live tests opt-in
4. **Verify again** after changes:
   ```bash
   bun run test && bun run typecheck && bun run lint && bun run build
   ```
5. **Update this README and `docs/roadmap/FUTURE_ENHANCEMENTS.md`** when changing capabilities — only document what source code proves
6. Do not advertise provider support unless it is wired and verified end-to-end
7. Do not rename symbols with find-and-replace; use graph-aware refactoring tools
8. Do not push without passing all gates

### Package manager

This project uses **Bun** (`bun.lock`, `bunfig.toml`). Use `bun install`, `bun run dev`, `bun run test`, etc.

### Scripts

| Script         | Command                                                |
| -------------- | ------------------------------------------------------ |
| `dev`          | `vite dev`                                             |
| `build`        | `vite build`                                           |
| `build:dev`    | `vite build --mode development`                        |
| `preview`      | `vite preview`                                         |
| `lint`         | `eslint .`                                             |
| `format`       | `prettier --write .`                                   |
| `typecheck`    | `tsc --noEmit`                                         |
| `test`         | `vitest run`                                           |
| `test:live`    | `vitest run --config vitest.live.config.ts`            |
| `test:release` | `npm run test && (OPENAI_API_KEY present → test:live)` |

---

## 17. V1 native release status

**Native build scaffolding is verified for iOS and Android; Electron compile and native-shell are verified; full packaging/signing requires external certificates and a GUI/CI environment.**

The following native packaging tooling is present in this repository:

| Item                                              | Status                    | Verified by source                                                               |
| ------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| Native packaging framework (Capacitor + Electron) | ✅ Present                | `capacitor.config.ts`, `@capacitor/*` deps, `electron` + `electron-builder` deps |
| macOS build command (Electron)                    | ✅ Verified (compile + native-shell) | `bun run native:desktop:dev` builds and compiles; `npx electron-builder build` stalls in headless env but prior DMGs exist |
| macOS install/run command (Electron dev)          | ✅ Exists                 | `bun run native:desktop:dev`                                                     |
| macOS app bundle                                  | ⚠️ Unsigned `.app` exists | `electron/release/mac-arm64/Edgecase Cockpit.app` (unsigned); prior `electron-builder` runs produced DMGs |
| macOS signing / notarization config               | ⚠️ Configured, needs secrets | `electron-builder.yml` ready; requires `CSC_LINK`, `APPLE_ID`, etc. in CI/secrets |
| iOS Xcode project (Capacitor)                     | ✅ Build verified         | `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination generic/platform=iOS CODE_SIGNING_ALLOWED=NO build` succeeds |
| iOS bundle ID                                     | ✅ Configured             | `uk.asherlewis.edgecase.cockpit` in `capacitor.config.ts`                        |
| iOS app icon / permissions                        | ✅ Configured             | `ios/App/App/Assets.xcassets/AppIcon.appiconset/`                                |
| Android Gradle project (Capacitor)                | ✅ Build verified         | `./gradlew assembleDebug` succeeds after `bun run native:android:sync`            |
| Android application ID                            | ✅ Configured             | `uk.asherlewis.edgecase.cockpit` in `capacitor.config.ts`                        |
| Android app icon / permissions                    | ✅ Configured             | `android/app/src/main/res/mipmap-*/`                                             |
| PWA manifest / service worker                     | ⚠️ Not present            | PWA manifest not a V1 native target; add only if web-install is required         |
| Native release scripts / CI jobs                  | ✅ Scripts exist; CI not added | `bun run native:desktop:build`, `native:ios:sync`, `native:android:sync` exist; CI job blocked until signing certs are available |
| Automated user-flow E2E (browser or native)       | ⚠️ Not implemented        | No Playwright/Cypress/mobile harness; accepted limitation per `docs/roadmap/FUTURE_ENHANCEMENTS.md` |

### What exists (native scaffolding)

```bash
# Web build + native shell generation (produces dist/client/ for Capacitor/Electron)
bun run native:build

# Capacitor iOS
bun run native:ios:sync    # Sync web assets to iOS project
bun run native:ios:open    # Open Xcode project

# Capacitor Android
bun run native:android:sync  # Sync web assets to Android project
bun run native:android:open  # Open Android Studio

# Electron desktop (macOS)
bun run native:desktop:dev   # Dev build + compile + run Electron
bun run native:desktop:build # Build + compile + package unsigned .app
```

iOS and Android native builds are verified with `CODE_SIGNING_ALLOWED=NO` / debug signing. Electron compile and native-shell generation are verified; Electron packaging (`electron-builder`) stalls in this headless environment but previously produced unsigned DMGs. Release-ready artifacts require signing certificates, provisioning profiles / keystores, and either a GUI environment or CI runner with the correct secrets.

### Verified native build commands

Commands that passed in this environment (no device launch required):

```bash
# iOS: sync assets, then build the Xcode project for arm64 without signing
bun run native:ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS' -derivedDataPath /tmp/edgecase-ios-derived CODE_SIGNING_ALLOWED=NO build

# Android: sync assets, then assemble a debug APK
bun run native:android:sync
cd android && ./gradlew assembleDebug

# Electron: build the client shell and compile the main process
bun run native:desktop:dev   # builds + compiles; GUI launch requires display
```

### Native transport configuration for local providers

The hybrid architecture requires each native platform to allow direct HTTP requests to local model daemons (localhost, 127.0.0.1, \*.local). The following configurations are in place:

| Platform                | Configuration                    | File                                       | What it does                                                                                                                       |
| ----------------------- | -------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **macOS (Electron)**    | `webRequest.onHeadersReceived`   | `electron/main.ts`                         | Injects CORS headers (`Access-Control-Allow-Origin: *`) into responses from localhost providers so `file://` origin can fetch them |
| **iOS (Capacitor)**     | `NSLocalNetworkUsageDescription` | `ios/App/App/Info.plist`                   | Explains to the user why the app needs local network access; required for LAN/loopback connections                                 |
| **iOS (Capacitor)**     | `CapacitorHttp` plugin           | `capacitor.config.ts`                      | Intercepts all `fetch` / `XMLHttpRequest` in the WebView and routes through native networking, bypassing CORS                      |
| **Android (Capacitor)** | `usesCleartextTraffic="true"`    | `android/app/src/main/AndroidManifest.xml` | Allows unencrypted HTTP traffic to localhost and local network IPs                                                                 |
| **Android (Capacitor)** | `CapacitorHttp` plugin           | `capacitor.config.ts`                      | Same as iOS — native networking bypass for WebView requests                                                                        |

**Note:** Browser/web builds cannot use local providers directly due to CORS and mixed-content restrictions. Browser users must use the proxy path for local providers, or serve the app from a secure origin with a CORS proxy.

### Native packaging framework decision

**Capacitor + Electron are already selected and installed.** Capacitor covers iOS and Android. Electron covers desktop (macOS). No additional framework selection is required.

| Framework     | Target       | Status       | Notes                              |
| ------------- | ------------ | ------------ | ---------------------------------- |
| **Capacitor** | iOS, Android | ✅ Installed | Xcode + Gradle projects present    |
| **Electron**  | Desktop      | ✅ Installed | macOS `.app` builds; unsigned only |

---

## First Launch and Onboarding

### Onboarding Flow

Edgecase Cockpit includes a guided onboarding experience for new users:

1. **Welcome Screen**: Explains what Edgecase Cockpit is and its purpose
2. **Provider Selection**: Choose from cloud providers (OpenAI, Anthropic, etc.) or local providers (Ollama, LM Studio, etc.)
3. **Provider Setup**: Get clear instructions on how to configure your chosen provider

Onboarding can be completed or skipped at any time (via the **Skip for Now** button or the close control).

### Onboarding State

- Onboarding completion is stored in `localStorage` under `cockpit.settings.v2.onboardingCompleted`
- Once completed, onboarding will not reappear unless explicitly reset
- Users can skip onboarding and access it later through settings if needed

### Resetting Onboarding

To reset onboarding for testing or if a user wants to see it again:

```javascript
import { store } from "@/lib/cockpit-store";
store.resetOnboarding();
```

### Provider Configuration

The onboarding flow guides users to:

1. **Set up API keys** for cloud providers in Settings
2. **Configure base URLs** for local providers if needed
3. **Select models** and other provider-specific options
4. **Test connections** where supported

All provider configuration is done through the standard Settings interface.

## Troubleshooting

### Error and Offline States

#### 1. Missing API Key

**Message:** "No API key set for [Provider]. Add one in Settings."

**What happened:** You tried to use a provider without setting up an API key.

**What to do:**

1. Click the "Settings" button or navigate to `/settings`
2. Find the provider card (e.g., OpenAI, Anthropic)
3. Enter your API key
4. Click "Save"

#### 2. Invalid API Key

**Message:** "Your API key for [Provider] is invalid. Update it in Settings."

**What happened:** The API key you provided is incorrect, revoked, or expired.

**What to do:**

1. Click the "Settings" button or navigate to `/settings`
2. Find the provider card
3. Verify your API key is correct
4. Update it if needed
5. Click "Save"

#### 3. Provider Unavailable

**Message:** "[Provider] is unavailable. Check your connection or try again."

**What happened:** The provider's server is unreachable (connection refused, timeout, or offline).

**What to do:**

1. Check your internet connection
2. If using a local provider (e.g., Ollama, LM Studio), verify the daemon is running
3. Click "Retry" to attempt the request again
4. If the issue persists, check the provider's status page

#### 4. Rate Limited

**Message:** "You've been rate limited by [Provider]. Try again in X seconds."

**What happened:** You've sent too many requests in a short time and the provider is throttling you.

**What to do:**

1. Wait for the countdown to complete (X seconds)
2. Click **Retry** to resend the request once the cooldown expires
3. If you need to cancel, click "Cancel"
4. Consider upgrading your plan if you frequently hit rate limits

#### 5. Offline Mode

**Message:** "You're offline. Messages will send when you reconnect."

**What happened:** Your device is offline, but your message has been queued.

**What to do:**

1. Check your internet connection
2. Once reconnected, your queued messages will automatically send
3. You'll see a success message when they're sent

**Status bar:** Shows "You're offline — X messages queued" with the queue count.

#### 6. Offline Message Synced

**Message:** "Your queued messages have been sent."

**What happened:** Your device reconnected and queued messages were successfully sent.

**What to do:** No action needed. Your messages are now delivered.

#### 7. Storage Failure

**Message:** "Message could not be saved. Free up space or try again."

**What happened:** Your browser's localStorage is full or unavailable.

**What to do:**

1. Clear some browser data (cache, cookies, or localStorage)
2. Try again
3. If using private/incognito mode, switch to a regular browser session
4. Check your browser's storage settings

---

## 12. Provider Setup and Validation

### Overview

Edgecase Cockpit now provides clear, user-friendly feedback for provider setup and API key validation. This helps you understand which providers are ready to use and troubleshoot any configuration issues.

### Provider Status Indicators

In the Settings page, each provider card shows one of these statuses:

- **✅ Ready to chat** (green) - Provider is fully configured and validated
- **⚠️ Needs validation** (amber) - API key is set but not yet validated
- **🔑 Needs API key** (amber) - No API key configured
- **🔧 Configure base URL** (amber) - Local provider needs URL setup

### Validation Status

After entering an API key, you can validate it:

1. **Click "Validate" button** (shield icon) in the provider card
2. Status changes to "Validating..." (blue) while checking
3. Results show as:
   - **✅ Valid** (green shield) - Key is working
   - **❌ Invalid key** (red shield) - Authentication failed
   - **⚠️ Validation error** (amber shield) - Network or other issue

### Validation Messages

- **"API key is valid"** - Your key works and can be used for chat
- **"Invalid API key"** - The key was rejected by the provider
- **"Failed to validate key"** - The validation request returned an error
- **"Network error during validation"** - Cannot connect to the validation endpoint
- **"No API key set to validate"** - Enter a key first

### Toast Notifications

When validation completes, you'll see toast notifications:

- ✅ **"✅ OpenAI API key is valid!"** - Success
- ❌ **"❌ OpenAI: Invalid API key"** - Failure with reason

### Model Selection Feedback

The model picker shows:

- **"Loading models..."** - Fetching available models
- **"✅ X models available"** - Models loaded successfully
- **"⚠️ Failed to fetch models (using default)"** - Fallback to default model

### Troubleshooting

**"Invalid API key" errors:**

1. Double-check your API key
2. Ensure it hasn't expired
3. Verify you have sufficient credits/quota
4. Check the provider's status page

**"Network error" or "Timeout":**

1. Check your internet connection
2. Verify the provider is not down
3. For local providers, ensure your daemon is running
4. Try again later

**"No models available":**

1. The provider may not support model listing
2. Using the default model is fine
3. Chat functionality still works

### Provider Status in Chat

The status bar shows:

- **✅ Provider (model) Ready** - Validated and working
- **⚠️ Provider needs setup** - Missing key or configuration
- **❌ Provider invalid key** - Validation failed

Click the status bar to go directly to Settings and fix any issues.
