# edgecase-cockpit

> A provider-native AI chat console — local-first, self-hosted, multi-provider.

## Release targets

> [!IMPORTANT]
> V1 is **NOT READY**. V1 requires macOS native, iOS native, and Android native. None of these exist yet.

| Target | V1 required | Status | Notes |
|---|---|---|---|
| macOS native | **Yes** | ❌ Not implemented | No Electron wrapper configured |
| iOS native | **Yes** | ❌ Not implemented | No Xcode project, Capacitor, or Tauri mobile target |
| Android native | **Yes** | ❌ Not implemented | No Gradle project, Capacitor, or Tauri mobile target |
| Web build (Vite) | Supporting surface | ✅ Builds | `bun run build` passes — client + SSR artifacts in `dist/` |
| Cloudflare Workers backend | Supporting surface | ✅ Configured | `wrangler.jsonc` + D1 configured; deployment is a separate step |

**V1 is not achieved by a passing web build.** A passing web/Cloudflare build is a prerequisite for the backend surface only. V1 requires packaged, installable native applications for macOS, iOS, and Android.

Native packaging tooling (Tauri, Capacitor, or equivalent) has not been selected or added. See [`docs/roadmap/FUTURE_ENHANCEMENTS.md`](docs/roadmap/FUTURE_ENHANCEMENTS.md) for the V1 native blocker tracking.

## 1. What is edgecase-cockpit?

`edgecase-cockpit` is a unified chat interface for both cloud LLM APIs and local/self-hosted inference endpoints. It is a **TanStack Start + React + Cloudflare Workers** application with SSR.

**Device-local privacy model (default):** Chats, threads, and messages are stored in `localStorage` only. No chat data reaches the server unless you explicitly opt in. Manual export/import (JSON/Markdown/TXT) is the intended cross-device portability path. RAG vector/text data is also device-local by default. D1 is used for distributed rate limiting, encrypted session data, and usage statistics — not for automatic chat or vector storage.

**API key security:** Keys are stored server-side in encrypted cookie sessions. The browser never sees plaintext keys after migration. `cockpit-store.ts` strips `apiKey` before persisting settings to `localStorage`.

Sources: `src/lib/cockpit-store.ts` (`defaultSettings`, `persist`, `syncChatsToServer: false`, `syncRagVectorsToServer: false`), `src/lib/db/schema.sql`, `wrangler.jsonc`.

---

## 2. Current implementation status

**Implemented and source-backed:**

- Full chat cockpit: streaming responses, message editing/deletion, regeneration from any point
- 15 provider definitions (8 cloud + 7 local) with proxy-based routing
- Server-side encrypted session storage for API keys (browser never holds plaintext keys)
- CSRF double-submit cookie protection on all mutating routes
- D1-backed distributed rate limiter (activates at startup when DB binding is available; falls back to in-memory)
- Storage limits enforced server-side (threads, messages, content length, attachments)
- CSP + security headers on HTML responses
- Thread CRUD, import/export (JSON/Markdown/TXT), fork, pin, archive, color
- Offline queue with `localStorage` persistence and auto-drain on reconnect
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
- **450 tests across 23 test files** (as of this writing; verified by `bun run test`)

Sources: all files in `src/`, `src/live/providers.live.test.ts`, `src/lib/*.test.ts`, `src/routes/api/*.test.ts`.

---

## 3. Privacy and data model

| Data | Default storage | Opt-in alternative |
|---|---|---|
| Chat threads and messages | `localStorage` (device-local) | D1 via `syncChatsToServer: true` |
| Settings (profile, personalization, shortcuts, RAG) | `localStorage` | — (no server sync) |
| Provider API keys | Encrypted server session cookie | — |
| RAG vectors and text chunks | `localStorage` + in-memory | D1 via `syncRagVectorsToServer: true` |
| Provider stats (counts, tokens, cost) | `localStorage` | Always synced to D1 `provider_stats` (no message content) |
| Usage records (per-call model/token/cost) | D1 `usage_records` | — |
| Rate limit state | In-memory (fallback) or D1 `rate_limits` | — |
| Session/security data | D1 `sessions` | — |

**Defaults proven by source:**
- `syncChatsToServer: false` — `src/lib/cockpit-store.ts` (`defaultSettings`)
- `syncRagVectorsToServer: false` — same
- `_serverSyncAvailable = false` — `src/lib/vector-store.ts`; server sync functions are dormant unless explicitly enabled
- `normalizeSettings()` migrates legacy settings so missing fields default to `false`, not `true`
- Provider API keys stripped from `localStorage` in `persist()` before every write

**What D1 stores by default (without opt-in):**
- `sessions`: encrypted session data (no message content)
- `provider_stats`: aggregate call counts, token counts, and estimated cost per provider (no message content)
- `usage_records`: per-call rows with model, token counts, and cost (no message content)
- `rate_limits`: rate limiter window state

**What D1 stores only with explicit opt-in:**
- `threads`: full message content including all conversation history — requires `syncChatsToServer: true`
- `vector_docs`: RAG text chunks and embedding vectors — requires `syncRagVectorsToServer: true`

> **Privacy warning:** Enabling either server sync flag causes full message/text content to be stored on the Cloudflare D1 backend. Review your data residency requirements before enabling.

Sources: `src/lib/cockpit-store.ts`, `src/lib/vector-store.ts`, `src/lib/db/schema.sql`, `src/lib/cockpit-store.test.ts`.

---

## 4. Manual chat portability

Chat data is **not automatically shared across devices**. The supported cross-device transfer mechanism is manual export/import:

- **Export formats:** JSON (full thread with all messages), Markdown, plain text
- **Import:** `POST /api/threads/import` accepts a thread JSON payload (CSRF + rate-limit guarded, storage-limits enforced)
- **Fork:** `/api/threads/$id/fork` creates a local copy of an existing thread
- **Pin/archive:** local state, persisted in `localStorage`

Sources: `src/routes/api/threads.import.ts`, `src/routes/api/threads.$id.export.ts`, `src/routes/api/threads.$id.fork.ts`.

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
│   ├── use-chat.ts            # Core chat logic (streaming, RAG, tools, queue, retry)
│   ├── use-keyboard-shortcuts.ts
│   └── use-mobile.tsx
├── lib/                       # Shared libraries
│   ├── cockpit-store.ts       # Central client state (Zustand-like, useSyncExternalStore)
│   ├── providers.ts           # Provider catalog + chat call helpers
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

**Chat request:**
1. User sends a message in `ChatInput.tsx`
2. `sendMessage` in `use-chat.ts` adds the user message to the active thread in `cockpit-store.ts`
3. If RAG is enabled, the message text is embedded via `embedTexts` (`embeddings.ts` → `POST /api/proxy/embeddings`) and stored in `vector-store.ts`
4. `runAssistant` builds the chat history including personalization system message and optional RAG context
5. `callProviderChatViaProxy` sends `POST /api/proxy/chat` with CSRF headers
6. `src/routes/api/proxy/chat.ts` validates CSRF, rate limit, URL allowlist, fetches API key from encrypted session, and proxies to the provider
7. For streaming: SSE deltas are parsed and patched into the placeholder message via `store.patchMessage`
8. On success: token usage is extracted from provider response (exact if available, heuristic otherwise) and recorded locally + synced to D1 `provider_stats`/`usage_records`
9. On error: error is deduplicated, rate-limit cooldown may be set, offline messages are queued

**Thread persistence:**
1. Threads live in `localStorage` via `cockpit-store.ts`
2. Server sync to D1 is **off by default** — gated behind `settings.syncChatsToServer` (default `false`)
3. When enabled, non-temporary threads sync via `syncThreadToServer` (`PATCH /api/threads/$id`)
4. Temporary threads are never synced to the server
5. Cross-tab sync via `storage` events propagates settings, threads, provider stats, and vector store cache invalidation

**Tools/function-calling:**
1. If tools are defined and the provider has `streamingTools: true`, streaming tool-call deltas are parsed in real time
2. If `streamingTools` is `false`, tools disable streaming (non-streaming response is parsed for complete tool calls)
3. `MessageRow.tsx` renders tool calls as cards; user must click "Execute"
4. Only `isBuiltInTool`-gated tools execute; non-built-in names return `[Tool "{name}" is not implemented]`
5. The assistant is re-run with the tool result injected as a `tool` role message

Sources: `src/hooks/use-chat.ts`, `src/lib/cockpit-store.ts`, `src/lib/providers.ts`, `src/lib/tools.ts`.

---

## 6. Provider support and capability matrix

| Provider | Chat | Models | Tools | Streaming Tools | Embeddings | Vision | Transcription | Type | Body style |
|---|---|---|---|---|---|---|---|---|---|
| OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Cloud | openai |
| Anthropic | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | Cloud | anthropic |
| Google Gemini | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | Cloud | openai |
| Moonshot / KimiCoding | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | Cloud | openai |
| OpenRouter | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | Cloud | openai |
| Ollama Cloud | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | Cloud | openai |
| NVIDIA NIM | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | Cloud | openai |
| Vercel AI Gateway | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | Cloud | openai |
| Ollama (local) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | Local | openai |
| LM Studio | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | Local | openai |
| Hermes | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | Local | openai |
| OpenClaw | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | Local | openai |
| vLLM | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | Local | openai |
| llama.cpp server | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | Local | openai |
| Custom (OpenAI-compatible) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | Local | openai |

**Streaming tools** is implemented client-side via `StreamToolCallAccumulator` (OpenAI body style) and `AnthropicStreamToolCallAccumulator` + `extractAnthropicToolCallDelta` (Anthropic body style). Gemini uses the OpenAI-compatible path. Providers without `streamingTools: true` in their capability flags fall back to non-streaming when tools are present.

Source: `src/lib/providers.ts` (capability declarations), `src/hooks/use-chat.ts` (`supportsOpenAIStreamingTools`, `supportsAnthropicStreamingTools`), `src/lib/tools.ts` (accumulator implementations).

**Capability flags are declarations in `providers.ts`.** Not all combinations have been end-to-end verified against real provider APIs. Live verification requires `RUN_LIVE_PROVIDER_TESTS=true` with real credentials (see Section 14).

**Custom provider wildcard policy:** The `custom` provider has `allowedHosts: ["*"]`. In production, wildcard host matching is **blocked** unless `PROXY_ALLOW_CUSTOM_WILDCARD=true` is explicitly set. In development, wildcards are unrestricted for local exploration. Source: `src/lib/proxy-guard.server.ts`.

---

## 7. Tools and tool execution model

### Built-in executable tools

Four tools are registered in `BUILT_IN_TOOLS` and can be executed by the user after provider delivery:

| Tool name | Description |
|---|---|
| `get_current_time` | Returns current ISO date/time |
| `echo` | Echoes provided text unchanged |
| `word_count` | Returns word count of provided text |
| `calculator` | Evaluates safe arithmetic expressions (`+`, `-`, `*`, `/`, `%`, `**`, parentheses) |

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

| Route category | Limit |
|---|---|
| Keys (set/clear/validate) | 20/min |
| Threads (create/update/delete/import/fork/pin) | 60/min |
| Usage (read) | 60/min |
| Stats (read/write/reset) | 60/min |
| Session bootstrap | 30/min |
| Health check | 120/min |

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

| Limit | Value |
|---|---|
| Max threads per session | 2,000 |
| Max messages per thread | 2,000 |
| Max message content length | 100,000 chars |
| Max thread title length | 512 chars |
| Max attachment URLs per message | 50 |
| Max imported threads | 100 |

### API key handling

- Keys stored in encrypted cookie sessions server-side only (`session.server.ts`)
- Browser never sees plaintext keys after migration
- `cockpit-store.ts` strips `apiKey` before persisting settings to `localStorage`
- Legacy keys in `localStorage` are auto-migrated to the server on first hydration

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
      "database_id": "f89b278d-301f-4a98-a018-b92eeb279449"
    }
  ]
}
```

D1 is configured with a real database ID and `DB` binding. The device-local privacy boundary is enforced in code — D1 is used for rate limiting, encrypted sessions, and usage/stats only.

### D1 schema setup

```bash
wrangler d1 execute edgecase-cockpit --file=src/lib/db/schema.sql
```

Tables: `sessions`, `threads`, `provider_stats`, `usage_records`, `vector_docs`, `rate_limits`.

### Startup guards (cold start)

`server.ts` runs at module init:

1. **`validateEnv()`** — validates `SESSION_SECRET` ≥32 chars; returns 503 for all requests if invalid
2. **D1 binding check** — warns if the `DB` platform binding is not available
3. **`configureRateLimiterFromEnv()`** — selects D1 or in-memory backend based on `RATE_LIMIT_BACKEND` env var
4. **`warnInMemoryRateLimitInProduction()`** — emits `console.error` if in-memory is used in production without acknowledgement
5. **`logCustomProviderPolicy()`** — logs whether custom-provider wildcard hosts are allowed or blocked

### Environment variables

| Name | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | **Yes** | Encryption key for cookie sessions (≥32 chars) |
| `NODE_ENV` | No | Runtime environment (`development` / `production`) |
| `LOG_LEVEL` | No | Structured logger level |
| `DB` | Yes (platform binding) | Cloudflare D1 binding (configured in `wrangler.jsonc`) |
| `RATE_LIMIT_BACKEND` | No | `auto` (default), `d1`, or `memory` |
| `ALLOW_IN_MEMORY_RATE_LIMIT` | Production opt-in | Set `true` to acknowledge in-memory rate limiting in production |
| `PROXY_ALLOW_CUSTOM_WILDCARD` | Production opt-in | Set `true` to allow wildcard host matching for the custom provider |

### Production deployment checklist

- [ ] Set `SESSION_SECRET` to a random 32+ character string
- [x] D1 database ID and `DB` binding configured in `wrangler.jsonc`
- [ ] Run `wrangler d1 execute edgecase-cockpit --file=src/lib/db/schema.sql` to create tables
- [ ] Either set `RATE_LIMIT_BACKEND=d1` (recommended for multi-node) or set `ALLOW_IN_MEMORY_RATE_LIMIT=true` (single-node only)
- [ ] Confirm `syncChatsToServer` (default `false`) and `syncRagVectorsToServer` (default `false`) match your data residency intent — **D1 is not automatic chat storage**
- [ ] **Do not enable server chat/RAG sync without reviewing privacy implications** — these settings write full message content and text chunks to D1
- [ ] If the custom provider needs to reach arbitrary hosts, set `PROXY_ALLOW_CUSTOM_WILDCARD=true`; otherwise leave blocked
- [ ] Run `bun run test && bun run typecheck && bun run lint && bun run build` before deploying

---

## 12. Settings and personalization

Settings are persisted in `localStorage` under `cockpit.settings.v2`. API keys are never persisted there.

| Setting area | Persisted fields | Source |
|---|---|---|
| Profile | displayName, handle, avatarDataUrl, initials, pronouns, roleLabel | `cockpit-store.ts` (`UserProfile`) |
| Personalization | assistantName, preferredTone, visualMode, ambientIntensity, reduceMotion, showProviderInGreeting, showModelInGreeting, rememberLastProvider | `cockpit-store.ts` (`Personalization`) |
| Keyboard shortcuts | per-action enabled flags, forceCtrl | `cockpit-store.ts` (`KeyboardShortcuts`) |
| RAG | enabled, providerId, model override | `cockpit-store.ts` (`RagSettings`) |
| Active provider | activeProviderId | `cockpit-store.ts` |
| Pinned providers | pinnedProviderIds[] | `cockpit-store.ts` |
| Cost overrides | per-provider { input, output } USD/1K tokens | `cockpit-store.ts` (`costOverrides`) |
| Chat sync (opt-in) | syncChatsToServer (default false) | `cockpit-store.ts` |
| RAG sync (opt-in) | syncRagVectorsToServer (default false) | `cockpit-store.ts` |

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

| Provider | Default input rate ($/1K) | Default output rate ($/1K) |
|---|---|---|
| openai | $0.00015 | $0.0006 |
| anthropic | $0.003 | $0.015 |
| gemini | $0.000075 | $0.0003 |
| openrouter | $0.00015 | $0.0006 |
| moonshot | $0.001 | $0.004 |
| nvidia-nim | $0.00035 | $0.0011 |
| vercel-ai | $0.00015 | $0.0006 |

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
bun run test          # Run all 450 tests (23 files)
bun run typecheck     # tsc --noEmit
bun run lint          # eslint .
bun run build         # vite build
```

- **Framework:** Vitest with jsdom environment, globals enabled
- **Setup:** `src/test/setup.ts` — imports `@testing-library/jest-dom`
- **Current count:** 450 tests, 23 test files *(verified by `bun run test`)*
- **Credential-free:** All normal tests run without any provider API keys
- **Coverage areas:** CSRF, CSP, rate limiting (D1 backend + in-memory + preset limiters), storage limits, proxy guard, providers, tools (schema registry, name validation, arg sanitization, streaming accumulators), vector store (chunking, add/remove/search/clear, cross-tab sync), tokens (exact extraction, heuristic, cost estimation), cockpit store (defaults, normalization, sync flags, migration), chat hook, keyboard shortcuts, chat input, greeting, RAG/proxy integration, API routes

### Live provider tests (opt-in)

Live tests call real provider APIs and require real credentials:

```bash
# Run all live provider tests
RUN_LIVE_PROVIDER_TESTS=true \
  OPENAI_API_KEY=sk-... \
  ANTHROPIC_API_KEY=sk-ant-... \
  GEMINI_API_KEY=AIza... \
  bun run test:live

# Strict mode: fail loudly if any expected key is absent
STRICT_LIVE_PROVIDER_TESTS=true \
  RUN_LIVE_PROVIDER_TESTS=true \
  OPENAI_API_KEY=sk-... \
  ANTHROPIC_API_KEY=sk-ant-... \
  GEMINI_API_KEY=AIza... \
  bun run test:live
```

Live test coverage (all in `src/live/providers.live.test.ts`):
- OpenAI: chat completion, streaming, streaming-with-tools, embeddings
- Anthropic: chat completion, streaming-with-tools (content_block events)
- Gemini: chat completion, streaming (OpenAI-compat path), streaming-with-tools

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

### Server-side chat sync is off by default and privacy-sensitive

`syncChatsToServer` defaults to `false`. When enabled, full thread message history is written to D1 `threads` table. Source: `src/lib/cockpit-store.ts` (`defaultSettings`), `src/routes/api/threads.$id.ts`.

### Server-side RAG vector sync is off by default and privacy-sensitive

`syncRagVectorsToServer` defaults to `false`. When enabled, text chunks and embedding vectors are written to D1 `vector_docs` table. Source: `src/lib/vector-store.ts` (`_serverSyncAvailable = false`), `src/routes/api/vector-docs.ts`.

### D1 rate-limit counting is eventually consistent across multiple Workers

The D1 backend maintains in-memory buckets per Worker (synchronous) and persists counts to D1 asynchronously (fire-and-forget). At high concurrency across multiple Workers, a small number of over-limit requests may slip through before counts propagate. In-memory rate limiting resets on every cold start and is not shared across Workers. Source: `src/lib/rate-limit.server.ts` (`D1RateLimiterBackend.persistAsync`).

### Cost rates are not fetched live from provider pricing APIs

Default rates in `_COST_DEFAULTS` are static and may become stale as provider pricing changes. Per-provider overrides are supported via `setCostOverrides()` in settings. Source: `src/lib/tokens.ts`.

### Token estimation is heuristic when provider response contains no usage metadata

`estimateTokens` uses `text.length / 4` and `wordCount × 1.3` averaged. Exact counts are extracted when providers include usage metadata (OpenAI, Anthropic, Gemini). Local providers and providers that omit usage in their responses use heuristic estimation. Source: `src/lib/tokens.ts` (`extractProviderUsage`, `estimateTokens`).

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

| Script | Command |
|---|---|
| `dev` | `vite dev` |
| `build` | `vite build` |
| `build:dev` | `vite build --mode development` |
| `preview` | `vite preview` |
| `lint` | `eslint .` |
| `format` | `prettier --write .` |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run` |
| `test:live` | `vitest run --config vitest.live.config.ts` |
| `test:release` | `npm run test && (OPENAI_API_KEY present → test:live)` |

---

## 17. V1 native release status

**V1 requires macOS native, iOS native, and Android native. None are implemented.**

The following native packaging tooling does not exist in this repository:

| Item | Status |
|---|---|
| Native packaging framework (Tauri / Electron / Capacitor) | ❌ Not present |
| macOS build command | ❌ Does not exist |
| macOS install/run command | ❌ Does not exist |
| macOS app bundle / signing / notarization config | ❌ Does not exist |
| iOS Xcode project or Capacitor/Tauri iOS target | ❌ Does not exist |
| iOS bundle ID | ❌ Not configured |
| iOS app icon / permissions | ❌ Not configured |
| Android Gradle project or Capacitor/Tauri Android target | ❌ Does not exist |
| Android application ID | ❌ Not configured |
| Android app icon / permissions | ❌ Not configured |
| PWA manifest / service worker | ❌ Not present |
| Native release scripts / CI jobs | ❌ Do not exist |

### What exists (web/backend surface only)

```bash
# Install dependencies
bun install

# Dev server (web)
bun run dev

# Production build (web + SSR — not a native build)
bun run build

# Typecheck
bun run typecheck

# Lint
bun run lint

# Tests
bun run test
```

These commands build and test the **web application only**. They do not produce macOS, iOS, or Android artifacts.

### Native packaging decision required

Before any native tooling can be added, a framework must be selected. Options relative to this stack (Vite + React + TanStack Start):

| Option | Desktop | iOS | Android | Notes |
|---|---|---|---|---|
| **Capacitor** | ✅ (via Electron plugin) | ✅ | ✅ | Wraps existing `dist/` web build; lowest migration cost |
| **Tauri v2** | ✅ | ✅ | ✅ | Rust runtime; smaller binaries; more complex setup |
| **Electron** | ✅ (macOS) | ❌ | ❌ | V1 desktop scope is macOS only |

No framework has been selected. Do not add native tooling without an explicit decision. See `docs/roadmap/FUTURE_ENHANCEMENTS.md`.
