# Architecture

The app's shape: source layout, data flows, the store and its buckets, tools, RAG, rate limiting, the security model, and the intentional boundaries of the system. Moved verbatim from the root `README.md`.

## 1. What is edgecase-cockpit?

`edgecase-cockpit` is a local-first/BYOC AI control surface. Its first release proves that a user can inspect a user-configured generic local OpenAI-compatible endpoint, understand what is available or missing, perform one safe local model-list action, see the result/system state, and recover from failure. It is a **TanStack Start + React + Cloudflare Workers** application with SSR.

**Offline-first privacy model:** Chats, threads, and messages are stored in `localStorage` by default (device-local). When a user is authenticated and opts in to sync (globally via settings or per-thread), threads are stored in D1 with encrypted provider keys. RAG vector/text data remains device-local. D1 stores: user accounts, encrypted provider keys, user settings, usage statistics, and synced threads when explicitly enabled. A local-only profile works entirely on-device and cannot sync to D1.

> **Auth:** Email/password signup and sign-in are available through the `/auth` route and Account menu. A local-only profile can explore the app entirely on-device; signing in (or migrating a local-only profile into an account) enables server-side encrypted provider key storage, settings sync, and usage records. Google/Apple/OAuth is not implemented.

**API key security:** Provider keys are stored in D1 (`user_provider_keys`) with AES-256-GCM encryption per user. The browser never sees plaintext keys after migration. `cockpit-store.ts` strips `apiKey` before persisting settings to `localStorage`. Local-only profiles cannot store provider keys server-side.

Sources: `src/lib/cockpit-store.ts` (`defaultSettings`, `persist`), `src/lib/db/schema.sql`, `wrangler.jsonc`.

---

## 3. Privacy and data model

| Data                                                | Storage                                  | Notes                                                                                                                                               |
| --------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat threads and messages                           | `localStorage` (device-local) by default | Synced to D1 only when authenticated user enables sync. Local-only profiles are device-local. Export/import via JSON/Markdown/TXT always available. |
| Settings (profile, personalization, shortcuts, RAG) | `localStorage` by default                | User settings also stored in D1 when authenticated. Local-only profiles are device-local.                                                           |
| Provider API keys                                   | D1 `user_provider_keys` (encrypted)      | AES-256-GCM encrypted. Local-only profiles cannot store keys server-side.                                                                           |
| RAG vectors and text chunks                         | `localStorage` + in-memory               | Device-local only.                                                                                                                                  |
| Provider stats (counts, tokens, cost)               | `localStorage`                           | Device-local only.                                                                                                                                  |
| Usage records (per-call model/token/cost)           | D1 `usage_records` (when authenticated)  | Per-user when logged in.                                                                                                                            |
| Rate limit state                                    | In-memory (fallback) or D1 `rate_limits` | Server-side for cloud providers.                                                                                                                    |
| Session/security data                               | D1 `sessions` + encrypted cookie         | Server-side only.                                                                                                                                   |

**Defaults proven by source:**

- Chat data defaults to device-local (`is_local=1, sync_enabled=0`) — `src/lib/cockpit-store.ts` (`newThread`), `src/lib/db/schema.sql`
- Local-only profiles cannot store provider keys in D1 — `src/lib/session.server.ts` (`setProviderCreds` throws for local-only profiles)
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

- Chat threads for local-only profiles or users with `sync_enabled=0` — all device-local in `localStorage`
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

**Registered non-built-in schemas are serializable to providers and can execute server-side if the user has granted permission.** `POST /api/tools/execute` checks `user_tool_permissions`; approved tools run through `src/lib/tool-execution.server.ts`, while non-approved names still return a safe placeholder result. Built-in tools (`BUILT_IN_TOOLS`) execute locally without extra approval. Arbitrary shell/code/network execution remains blocked.

Source: `src/lib/tools.ts`, `src/lib/tool-execution.server.ts`, `src/routes/api/tools/schemas.ts`, `src/routes/api/tools/permissions.ts`, `migrations/0003_pricing_and_tool_permissions.sql`.

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
- Local-only profiles cannot store provider keys server-side (401 on proxy routes that need keys)

### Message sanitization

- `sanitize.ts` strips HTML tags, control characters, and normalizes whitespace before DB storage
- `sanitizeMessage` walks nested content including tool-call payloads

Source: `src/lib/env.server.ts`, `src/lib/csrf.server.ts`, `src/lib/csp.server.ts`, `src/lib/proxy-guard.server.ts`, `src/lib/storage-limits.server.ts`, `src/lib/session.server.ts`, `src/lib/sanitize.ts`.

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

## 15. Source-backed limitations and intentional boundaries

The following limitations and boundaries are proven by source code and tests. Each is accurate as of the current implementation.

### Provider API tool schema auto-discovery is implemented and consent-gated

A provider discovery abstraction (`src/lib/provider-tool-discovery.server.ts`) and `GET/POST /api/tools/discover` routes expose on-demand tool schema discovery. It is disabled by default and must be enabled with `ENABLE_PROVIDER_TOOL_DISCOVERY=true`. OpenAI, Anthropic, and Gemini currently return empty catalogs because they do not expose stable, unauthenticated tool-catalog endpoints; the abstraction will populate automatically once providers add them. Local tool registration via `registerLocalTool`, `registerProviderTools`, or `POST /api/tools/schemas` remains available.

### Arbitrary shell/code/network execution is intentionally unsupported

`executeBuiltInTool` handles exactly 4 tools. Non-built-in tool names return `[Tool "{name}" is not implemented]`. The `calculator` tool evaluates only arithmetic expressions matching `[0-9+\-*/(). %\s]+`; any other input is rejected. Source: `src/lib/tools.ts` (`executeBuiltInTool`, `isBuiltInTool`).

### User-defined tool execution requires explicit per-user permission

Schemas registered via `registerLocalTool` or `registerProviderTools` are visible and serializable to providers. Execution is governed by `src/lib/tool-execution.server.ts` and the `user_tool_permissions` table: a user must explicitly approve a non-built-in tool before it can run server-side. `POST /api/tools/execute` enforces this gate; non-approved tools still return a safe placeholder result, and arbitrary code execution remains blocked. Source: `src/lib/tools.ts`, `src/lib/tool-execution.server.ts`, `src/routes/api/tools/permissions.ts`, `migrations/0003_pricing_and_tool_permissions.sql`.

### Live provider verification requires real credentials and opt-in env flags

Default `bun run test` runs without credentials. Live provider behavior (streaming, tools, embeddings against real APIs) is only tested via `RUN_LIVE_PROVIDER_TESTS=true`. Source: `src/live/providers.live.test.ts`.

> **Privacy model:** Chat data defaults to device-local (`localStorage`). Sync to D1 is opt-in for authenticated users (per-thread or globally). Local-only profiles work entirely on-device. RAG vectors and provider stats are always device-local. D1 stores user accounts, encrypted provider keys, user settings, synced threads (when enabled), sessions, rate limits, and usage records. Source: `src/lib/cockpit-store.ts`, `src/lib/db/schema.sql`, `src/lib/session.server.ts`.

### Rate-limit backend is selectable: D1 (eventual) or Durable Object (strong)

The default D1 backend maintains in-memory buckets per Worker and persists counts to D1 asynchronously, so a small number of over-limit requests may slip through under high cross-Worker concurrency. For strong consistency across multiple Workers, set `RATE_LIMIT_BACKEND=durable_object` and deploy the `RATE_LIMITER_DO` Durable Object binding declared in `wrangler.jsonc`. In-memory rate limiting resets on every cold start and is not shared across Workers. Source: `src/lib/rate-limit.server.ts`, `src/lib/rate-limit-do.server.ts`.

### Cost rates use a pricing provider abstraction with static fallback

`src/lib/pricing.server.ts` provides a provider-agnostic pricing layer. `GET /api/pricing` returns cached rates from the D1 `pricing_cache` table; `POST /api/pricing` attempts to refresh them from provider pricing endpoints and falls back to static `_COST_DEFAULTS` when no live endpoint is available or configured. Per-provider overrides via `setCostOverrides()` in settings still take precedence. Source: `src/lib/tokens.ts`, `src/lib/pricing.server.ts`, `src/routes/api/pricing.ts`.

### Token estimation uses an OpenAI-compatible BPE tokenizer with heuristic fallback

When a provider response contains no usage metadata, `estimateTokens` lazy-loads `gpt-tokenizer` (`cl100k_base` encoding) to produce BPE token counts. A lightweight character/word heuristic is retained as a synchronous fallback for the first estimate and for constrained environments where the tokenizer chunk cannot load. Exact counts are still extracted when providers include usage metadata (OpenAI, Anthropic, Gemini). Source: `src/lib/tokens.ts` (`extractProviderUsage`, `estimateTokens`, `estimateTokensAsync`).

### Custom provider wildcard host matching is blocked in production by default

The `custom` provider's `allowedHosts: ["*"]` is blocked in production without `PROXY_ALLOW_CUSTOM_WILDCARD=true`. This is an intentional security boundary, not a missing feature. Source: `src/lib/proxy-guard.server.ts` (`isWildcardHostAllowed`).

### Tool name safety: unsafe provider-returned names are silently dropped

Unsafe tool names from provider responses are dropped rather than surfaced as errors during parsing. This is intentional to prevent injection, but it means the user sees no notification when a provider returns an unsafe tool name. Source: `src/lib/tools.ts` (`parseOpenAIToolCalls`, `parseAnthropicToolCalls`, `StreamToolCallAccumulator.complete`).

### Manual export/import is the only cross-device chat portability path

There is no automatic cross-device chat sync. JSON/Markdown/TXT export and import via `POST /api/threads/import` is the intended mechanism. This is intentional — the device-local default is the product's privacy model. Source: `src/lib/cockpit-store.ts`, `src/routes/api/threads.import.ts`.
