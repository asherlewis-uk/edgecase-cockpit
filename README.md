# edgecase-cockpit

> A provider-native AI chat console — local-first, self-hosted, multi-provider.

## Overview

`edgecase-cockpit` is a unified chat interface for both cloud LLM APIs and local/self-hosted inference endpoints. It is built as a **TanStack Start + React + Cloudflare Workers** application with SSR. The app stores API keys server-side in encrypted cookie sessions, proxies all provider traffic through same-origin `/api/proxy/*` routes, and keeps threads and settings in `localStorage` with optional server-side persistence via Cloudflare D1.

**Data privacy model:** Chats, messages, and threads are **device-local by default** — stored in `localStorage` only. Server-side chat sync to D1 is explicit opt-in (`syncChatsToServer`, default `false`). Manual export/import (JSON/Markdown/TXT) is the intended cross-device portability path. RAG vector/text data is also device-local by default (`syncRagVectorsToServer`, default `false`). D1 is used for distributed rate limiting, session/security data, and usage statistics — not automatic chat storage.

The current implementation supports streaming chat, multi-modal attachments (images, video notes, screenshots, voice transcription), message editing/deletion, thread CRUD with import/export/fork/pin, keyboard shortcuts, a command palette, markdown rendering with syntax highlighting, offline message queuing, token/cost usage tracking, safe built-in tool calling, and local RAG (retrieval-augmented generation) via an in-memory cosine-similarity vector store.

## Current status

**What is implemented:**

- Full chat cockpit with streaming responses, message editing/deletion, and regeneration from any point
- 14 provider definitions (8 cloud + 6 local) with proxy-based routing
- Server-side encrypted session storage for API keys (browser never sees plaintext keys)
- CSRF double-submit cookie protection on all mutating routes
- In-memory rate limiting for both proxy and non-proxy routes
- Storage limits enforced server-side (threads, messages, content length, attachments)
- CSP + security headers on HTML responses
- Thread CRUD, import/export (JSON/Markdown/TXT), fork, pin, archive
- Offline queue with `localStorage` persistence and auto-drain on reconnect
- Keyboard shortcuts (Cmd/Ctrl+K palette, +N new thread, +Enter send, +/ help, Escape stop/close)
- Command palette with thread/provider search and navigation
- Markdown rendering via `react-markdown` with `remark-gfm`, `rehype-highlight`, tables, inline code
- Model picker fetching live models from `/api/proxy/models`
- Settings UI: profile, personalization, keyboard shortcuts, provider cards, RAG config, usage stats
- Token and cost estimation with per-provider rates
- Built-in tool registry (`get_current_time`, `echo`) with UI approval flow
- RAG: embedding proxy, local vector store, context injection, settings controls
- Voice input via `MediaRecorder` + Whisper-compatible transcription proxy
- Screenshot capture via `getDisplayMedia`
- Image/video attachment support
- 359 tests across 21 test files

**What remains limited or future work:**

- Streaming with tools is now supported for OpenAI-compatible providers (OpenAI, Vercel AI Gateway, NVIDIA NIM, vLLM, Custom); other providers fall back to non-streaming
- Dynamic tool schema registry implemented (`registerLocalTool`, `registerProviderTools`, `/api/tools/schemas`); 4 built-in executable tools; auto-fetching from provider APIs not yet implemented
- Vector store server-side sync (`syncRagVectorsToServer`) is implemented but **off by default** — RAG text/vectors stay device-local unless explicitly enabled; enabling it is privacy-sensitive
- Embedding failures are surfaced via `ragError` state but the UI display is minimal
- Chunking is sentence/paragraph-level with configurable minimum length
- Exact token usage extracted from upstream provider responses when available (OpenAI/Anthropic/Gemini); falls back to heuristic estimation
- Cost rates are now configurable via `setCostOverrides()` and per-provider defaults
- D1-backed distributed rate limiter activates at startup when DB binding is available; in-memory is local-dev/fallback only
- Provider capability flags distinguish `tools` from `streamingTools`; `streamingTools: true` for both OpenAI-compatible and Anthropic body-style providers with tested delta parsing

This is a **local-first, self-hosted** application. Provider keys are **user-configured** per session and stored server-side only.

## Feature map

| Feature                       | Status      | Source files                                                                                                                                          | Notes                                                                                  |
| ----------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Chat cockpit                  | Implemented | `src/routes/index.tsx`, `src/hooks/use-chat.ts`                                                                                                       | Streaming, attachments, screenshots, voice                                             |
| Model picker                  | Implemented | `src/components/cockpit/ModelPicker.tsx`                                                                                                              | Fetches live models from `/api/proxy/models`                                           |
| Keyboard shortcuts            | Implemented | `src/hooks/use-keyboard-shortcuts.ts`, `src/components/cockpit/ShortcutHelp.tsx`                                                                      | Configurable per-action                                                                |
| Command palette               | Implemented | `src/components/cockpit/CommandPalette.tsx`                                                                                                           | Thread search, provider search, nav actions                                            |
| Markdown rendering            | Implemented | `src/components/cockpit/MarkdownContent.tsx`                                                                                                          | `react-markdown`, `remark-gfm`, `rehype-highlight`                                     |
| Message edit/delete           | Implemented | `src/components/cockpit/MessageRow.tsx`, `src/hooks/use-chat.ts`                                                                                      | Edit triggers re-run; delete syncs to server                                           |
| Offline queue                 | Implemented | `src/hooks/use-chat.ts`                                                                                                                               | `localStorage`-backed, auto-drains on reconnect                                        |
| Thread CRUD                   | Implemented | `src/lib/cockpit-store.ts`, `src/routes/api/threads.ts`, `src/routes/api/threads.$id.ts`                                                              | Local-first with server sync                                                           |
| Thread import/export/fork/pin | Implemented | `src/routes/api/threads.import.ts`, `src/routes/api/threads.$id.export.ts`, `src/routes/api/threads.$id.fork.ts`, `src/routes/api/threads.$id.pin.ts` | JSON, Markdown, TXT formats                                                            |
| Settings UI                   | Implemented | `src/routes/settings.tsx`, `src/components/cockpit/settings/*`                                                                                        | Profile, personalization, providers, RAG, usage                                        |
| Provider key validation       | Implemented | `src/lib/validate-key.server.ts`, `src/routes/api/keys/validate.ts`                                                                                   | Lightweight ping to models endpoint                                                    |
| Proxy chat                    | Implemented | `src/routes/api/proxy/chat.ts`, `src/lib/providers.ts`                                                                                                | SSE streaming, OpenAI/Anthropic/Gemini body styles                                     |
| Model detection               | Implemented | `src/routes/api/proxy/detect.ts`, `src/lib/providers.ts`                                                                                              | Server-side probe for local providers                                                  |
| Transcription                 | Implemented | `src/routes/api/proxy/transcribe.ts`, `src/lib/providers.ts`                                                                                          | Whisper-compatible proxy                                                               |
| Embeddings/RAG                | Implemented | `src/routes/api/proxy/embeddings.ts`, `src/lib/embeddings.ts`, `src/lib/vector-store.ts`, `src/routes/api/vector-docs.ts`                             | Sentence/paragraph chunking; server-side sync via D1; error state surfaced             |
| Tools/function-calling        | Implemented | `src/lib/tools.ts`, `src/hooks/use-chat.ts`, `src/components/cockpit/MessageRow.tsx`                                                                  | 4 safe built-ins; streaming tool-call deltas for OpenAI-compatible providers           |
| Token/cost usage              | Implemented | `src/lib/tokens.ts`, `src/routes/api/stats.ts`, `src/routes/api/usage.ts`                                                                             | Exact usage from provider responses when available; falls back to heuristic estimation |
| Stats                         | Implemented | `src/routes/api/stats.ts`, `src/components/cockpit/settings/UsageSection.tsx`                                                                         | Per-provider calls, errors, tokens, cost                                               |
| CSP/security headers          | Implemented | `src/lib/csp.server.ts`, `src/server.ts`                                                                                                              | Attached to HTML responses only                                                        |
| CSRF                          | Implemented | `src/lib/csrf.server.ts`                                                                                                                              | Double-submit cookie; all mutating routes                                              |
| Rate limiting                 | Implemented | `src/lib/rate-limit.server.ts`, `src/lib/proxy-guard.server.ts`                                                                                       | In-memory; presets for keys, usage, health, threads, session, stats, proxy             |
| Storage limits                | Implemented | `src/lib/storage-limits.server.ts`                                                                                                                    | Max threads, messages, content length, title, attachments                              |

## Architecture

```
src/
├── routes/                    # TanStack file-based routes
│   ├── index.tsx              # Main chat cockpit (~950 lines)
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
│       ├── keys/set.ts
│       ├── keys/clear.ts
│       ├── keys/status.ts
│       ├── keys/validate.ts
│       ├── keys/validate.$providerId.ts
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
│   ├── MarkdownContent.tsx    # react-markdown wrapper with dark theme
│   ├── ModelPicker.tsx        # Live model dropdown
│   ├── CommandPalette.tsx     # Cmd+K search/nav palette
│   ├── ShortcutHelp.tsx       # Keyboard shortcut overlay
│   ├── StatusBar.tsx          # Offline/queue banner
│   ├── ThreadOverflowMenu.tsx # Rename, export, archive, delete
│   ├── CockpitErrorBoundary.tsx # Chat-area error boundary
│   ├── Drawer.tsx             # Left slide-out nav + recent threads
│   ├── Greeting.tsx           # Empty-state greeting
│   ├── ProviderStatus.tsx     # Active provider readiness pill
│   └── settings/              # Settings sub-components
│       ├── ProfileSection.tsx
│       ├── PersonalizationSection.tsx
│       ├── ProviderCard.tsx
│       ├── UsageSection.tsx
│       └── SharedFields.tsx
├── hooks/                     # React hooks
│   ├── use-chat.ts            # Core chat logic (~536 lines)
│   ├── use-keyboard-shortcuts.ts
│   └── use-mobile.tsx
├── lib/                       # Shared libraries
│   ├── cockpit-store.ts       # Central client state (~989 lines)
│   ├── providers.ts           # Provider catalog + chat call helpers (~688 lines)
│   ├── tools.ts               # Tool schema, serialization, parsing, execution
│   ├── tokens.ts              # Token estimation + cost estimation
│   ├── embeddings.ts          # Client helper for embedding proxy
│   ├── vector-store.ts        # In-memory cosine-similarity vector store
│   ├── sanitize.ts            # Message sanitization before storage
│   ├── retry.ts               # Exponential backoff with jitter
│   ├── utils.ts               # cn() helper
│   ├── db/
│   │   ├── index.ts           # D1 database layer (~390 lines)
│   │   └── schema.sql         # D1 schema (sessions, threads, provider_stats, usage_records)
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
├── test/
│   └── setup.ts               # Vitest setup (jest-dom)
├── server.ts                  # Custom SSR entry (~101 lines)
├── router.tsx                 # TanStack router creation
└── routeTree.gen.ts           # Auto-generated route tree
```

### Frontend / routes

TanStack Start with file-based routing. Page routes render the cockpit, settings, library, and media galleries. API routes use `createFileRoute` with `server.handlers` for server-side request handling.

### Cockpit components

The main chat UI is composed of `ChatInput`, `ChatMessages` (which renders `MessageRow` for each message), `Drawer`, `CommandPalette`, and `ShortcutHelp`. `MessageRow` handles user messages (edit/delete/attachments), assistant messages (streaming dot, copy, regenerate, tool call cards), and tool result bubbles.

### Hooks / state

`use-chat.ts` is the core chat hook. It manages streaming, offline queue, RAG retrieval, tool execution, message history, token usage tracking, retry with backoff, error deduplication, rate-limit cooldown, and personalization system prompt injection.

### localStorage store

`cockpit-store.ts` implements a Zustand-like store using `useSyncExternalStore`. It manages settings (profile, personalization, shortcuts, RAG, providers), threads (CRUD, search, merge, import/export), provider stats, active thread selection, and cross-tab sync via `storage` events. API keys are **never** persisted to `localStorage`; they are migrated server-side on hydration.

### Server API routes

All API routes are under `src/routes/api/`. They handle health checks, session bootstrap, thread CRUD, usage stats, key management, and provider proxying. Each mutating route enforces CSRF validation.

### Provider proxy layer

Every provider request (chat, embeddings, models, transcription, detection) is proxied through the server. This avoids CORS, mixed-content issues, and keeps keys secure. Each proxy route has URL allowlist validation (`proxy-guard.server.ts`) to prevent SSRF.

### DB / persistence

Cloudflare D1 persists threads, provider stats, and detailed usage records per session. Schema: `sessions`, `threads`, `provider_stats`, `usage_records`. Client-side `localStorage` is the source of truth for threads and settings; server sync is fire-and-forget.

### Security layer

- CSRF double-submit cookie (`csrf.server.ts`)
- CSP + security headers (`csp.server.ts`, `server.ts`)
- Rate limiting (`rate-limit.server.ts`, `proxy-guard.server.ts`)
- Storage limits (`storage-limits.server.ts`)
- Message sanitization (`sanitize.ts`)
- Proxy URL allowlisting (`proxy-guard.server.ts`)

### Testing layer

Vitest with jsdom, globals, `@testing-library/react`, and `jest-dom`. Tests are route-adjacent with `-` prefix (e.g., `-keys.test.ts`) or co-located with library files (e.g., `tools.test.ts`).

## Data flow

### Chat request flow

1. User sends a message in `ChatInput.tsx`
2. `sendMessage` in `use-chat.ts` adds the user message to the active thread in `cockpit-store.ts`
3. If RAG is enabled, the message text is embedded via `embedTexts` (`embeddings.ts` → `POST /api/proxy/embeddings`) and stored in `vector-store.ts`
4. `runAssistant` builds the chat history including personalization system message and optional RAG context
5. `callProviderChatViaProxy` (`providers.ts`) sends `POST /api/proxy/chat` with CSRF headers
6. `src/routes/api/proxy/chat.ts` validates CSRF, rate limit, URL allowlist, fetches API key from encrypted session, and proxies to the provider
7. For streaming: SSE deltas are parsed client-side and patched into the placeholder message via `store.patchMessage`
8. For non-streaming (tools present): the full response is parsed for tool calls
9. On success: token usage is estimated and recorded locally + synced to server (`POST /api/stats`)
10. On error: error is deduplicated, rate-limit cooldown may be set, offline messages are queued

### Thread persistence flow

1. Threads live in `localStorage` via `cockpit-store.ts`
2. Server-side thread sync to D1 is **off by default** — gated behind `settings.syncChatsToServer` (explicit opt-in, default `false`)
3. When enabled, non-temporary threads sync to D1 via `syncThreadToServer` (`PATCH /api/threads/$id`)
4. Server-side: `src/routes/api/threads.$id.ts` validates CSRF, rate limit, storage limits, and sanitizes messages before DB update
5. Temporary threads are never synced to the server
6. Cross-tab sync: `storage` events update state in other tabs
7. **Manual import/export (JSON/Markdown/TXT)** is the intended cross-device chat portability mechanism

### Message edit/delete sync flow

1. Edit: `editMessage` in `use-chat.ts` updates local state, calls `syncThreadToServer` (no-op unless `syncChatsToServer` is enabled), then re-runs the assistant
2. Delete: `deleteMessage` in `ChatMessages.tsx` calls `store.deleteMessage` then `syncThreadToServer` (no-op unless enabled)
3. Local state is source of truth regardless of sync setting

### Token usage flow

1. After a successful assistant response, `use-chat.ts` estimates input tokens from history and output tokens from assistant text
2. `recordTokenUsage` updates `localStorage` stats
3. `syncTokenUsageToServer` sends `POST /api/stats` with token data
4. `src/routes/api/stats.ts` updates `provider_stats` and inserts into `usage_records`
5. `UsageSection.tsx` reads local stats and displays calls, errors, tokens, and estimated cost

### Tools/function-calling flow

1. When tools are present, streaming is disabled (`useStream = !toolDefs || toolDefs.length === 0`)
2. Tools are serialized into the request body in OpenAI or Anthropic format
3. The non-streaming response is parsed for tool calls (`parseOpenAIToolCalls` / `parseAnthropicToolCalls`)
4. `MessageRow.tsx` renders tool calls as cards with tool name, arguments, and Execute/Show-args buttons
5. Only `isBuiltInTool` gates execution; user must click "Execute"
6. `executeBuiltInTool` runs the tool and injects the result as a `role: "tool"` message
7. The assistant is re-run with the tool result in context

### Embeddings/RAG flow

1. User enables RAG in settings with a provider and optional model override
2. On each user message: `sendMessage` embeds the message text and stores it in `vector-store.ts`
3. On assistant run: `runAssistant` embeds the current prompt and searches `vector-store.ts` (top 3)
4. Retrieved context is prepended to the personalization system message
5. If no system message exists, a standalone system message is added

### API key validation flow

1. User enters an API key in a provider card in Settings
2. `POST /api/keys/set` stores the key in the encrypted server session
3. `POST /api/keys/validate` or `POST /api/keys/validate/$providerId` pings the provider's models endpoint
4. `validate-key.server.ts` performs a lightweight GET with 5s timeout; 401/403 = invalid, anything else = valid
5. Local providers (`authStyle: "none"`) always return valid

## API routes

| Route                            | Method | Purpose                     | Security / rate limit                         | Source                                        |
| -------------------------------- | ------ | --------------------------- | --------------------------------------------- | --------------------------------------------- |
| `/api/health`                    | GET    | Health check                | `healthRateLimit`                             | `src/routes/api/health.ts`                    |
| `/api/session`                   | POST   | Bootstrap encrypted session | `sessionRateLimit`, CSRF                      | `src/routes/api/session.ts`                   |
| `/api/threads`                   | GET    | List threads                | `threadsRateLimit`, CSRF                      | `src/routes/api/threads.ts`                   |
| `/api/threads`                   | POST   | Create thread               | `threadsRateLimit`, CSRF, storage limits      | `src/routes/api/threads.ts`                   |
| `/api/threads`                   | DELETE | Delete all threads          | `threadsRateLimit`, CSRF                      | `src/routes/api/threads.ts`                   |
| `/api/threads/$id`               | GET    | Get single thread           | `threadsRateLimit`, CSRF                      | `src/routes/api/threads.$id.ts`               |
| `/api/threads/$id`               | PATCH  | Update thread               | `threadsRateLimit`, CSRF, storage limits      | `src/routes/api/threads.$id.ts`               |
| `/api/threads/$id`               | DELETE | Delete thread               | `threadsRateLimit`, CSRF                      | `src/routes/api/threads.$id.ts`               |
| `/api/threads/import`            | POST   | Bulk import threads         | `threadsRateLimit`, CSRF, storage limits      | `src/routes/api/threads.import.ts`            |
| `/api/threads/$id/export`        | GET    | Export thread (json/md/txt) | `threadsRateLimit`, CSRF                      | `src/routes/api/threads.$id.export.ts`        |
| `/api/threads/$id/fork`          | POST   | Fork thread                 | `threadsRateLimit`, CSRF                      | `src/routes/api/threads.$id.fork.ts`          |
| `/api/threads/$id/pin`           | POST   | Toggle pin                  | `threadsRateLimit`, CSRF                      | `src/routes/api/threads.$id.pin.ts`           |
| `/api/usage`                     | GET    | Aggregate usage             | `usageRateLimit`, CSRF                        | `src/routes/api/usage.ts`                     |
| `/api/usage/$threadId`           | GET    | Per-thread usage            | `usageRateLimit`, CSRF                        | `src/routes/api/usage.$threadId.ts`           |
| `/api/stats`                     | GET    | Provider stats              | `statsRateLimit`, CSRF                        | `src/routes/api/stats.ts`                     |
| `/api/stats`                     | POST   | Record usage                | `statsRateLimit`, CSRF                        | `src/routes/api/stats.ts`                     |
| `/api/stats`                     | DELETE | Reset stats                 | `statsRateLimit`, CSRF                        | `src/routes/api/stats.ts`                     |
| `/api/keys/set`                  | POST   | Store provider key          | `keysRateLimit`, CSRF                         | `src/routes/api/keys/set.ts`                  |
| `/api/keys/clear`                | POST   | Clear provider keys         | `keysRateLimit`, CSRF                         | `src/routes/api/keys/clear.ts`                |
| `/api/keys/status`               | GET    | Key status per provider     | `keysRateLimit`, CSRF                         | `src/routes/api/keys/status.ts`               |
| `/api/keys/validate`             | POST   | Validate all keys           | `keysRateLimit`, CSRF                         | `src/routes/api/keys/validate.ts`             |
| `/api/keys/validate/$providerId` | POST   | Validate single key         | `keysRateLimit`, CSRF                         | `src/routes/api/keys/validate.$providerId.ts` |
| `/api/proxy/chat`                | POST   | Chat completions proxy      | `proxy-guard` rate limit, CSRF, URL allowlist | `src/routes/api/proxy/chat.ts`                |
| `/api/proxy/detect`              | POST   | Provider reachability probe | `proxy-guard` rate limit, CSRF                | `src/routes/api/proxy/detect.ts`              |
| `/api/proxy/embeddings`          | POST   | Embeddings proxy            | `proxy-guard` rate limit, CSRF, URL allowlist | `src/routes/api/proxy/embeddings.ts`          |
| `/api/proxy/models`              | GET    | Fetch available models      | `proxy-guard` rate limit, CSRF                | `src/routes/api/proxy/models.ts`              |
| `/api/proxy/transcribe`          | POST   | Audio transcription proxy   | `proxy-guard` rate limit, CSRF                | `src/routes/api/proxy/transcribe.ts`          |

## Security model

### Environment validation

- `validateEnv()` in `src/lib/env.server.ts` checks `SESSION_SECRET` (≥32 chars) at startup
- Called from `server.ts` before any request is handled
- Missing/invalid `SESSION_SECRET` returns 503 with a non-secret diagnostic message
- Optional vars (`NODE_ENV`, `LOG_LEVEL`) are warned if missing

### CSRF double-submit cookie

- `csrf.server.ts` generates a 32-byte hex token and sets it as a readable (`SameSite=Lax`, `Secure`) cookie
- The client reads the cookie and sends it back as `X-CSRF-Token`
- The server validates with constant-time comparison
- Safe methods (GET, HEAD, OPTIONS) are skipped
- All mutating API routes enforce CSRF validation

### Rate limiting

- Non-proxy routes: `rate-limit.server.ts` with in-memory buckets
  - Keys: 20/min
  - Threads: 60/min
  - Usage: 60/min
  - Stats: 60/min
  - Session: 30/min
  - Health: 120/min
- Proxy routes: `proxy-guard.server.ts` with per-session sliding-window buckets (120/min)
- **Production guard:** In `production` mode without a custom backend, the server logs a prominent warning. Set `ALLOW_IN_MEMORY_RATE_LIMIT=true` to acknowledge single-node usage, or swap in a distributed adapter via `setRateLimiterBackend()`.
- **Pluggable backend:** `IRateLimiterBackend` interface allows swapping in shared-storage adapters (KV, Durable Objects, Redis) for multi-node deployments.

### Proxy guard / URL allowlisting

- `proxy-guard.server.ts` restricts proxy targets to provider-declared `allowedHosts`
- The `custom` provider has `allowedHosts: ["*"]` — full wildcard
- **Production hardening:** In production, wildcard (`*`) host matching is **blocked** unless `PROXY_ALLOW_CUSTOM_WILDCARD=true` is explicitly set. In development, wildcards remain unrestricted for local exploration.
- `urlAllowedForProvider` matches hosts against exact, wildcard subdomain (`*.host.com`), and `*` (opt-in in production) patterns

### CSP headers

- `csp.server.ts` builds a strict CSP with mode-aware `script-src`/`style-src`
- Development: `'self' 'unsafe-inline' 'unsafe-eval'`
- Production: `'self' 'unsafe-inline'`
- Additional headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- Only attached to HTML responses in `server.ts`

### Storage limits

- Max threads per session: 2,000
- Max messages per thread: 2,000
- Max message content length: 100,000 chars
- Max thread title length: 512 chars
- Max attachment URLs per message: 50
- Max imported threads: 100
- Returns HTTP 413 on violation

### API key handling

- API keys are stored in encrypted cookie sessions server-side only (`session.server.ts`)
- Browser never sees plaintext keys after migration
- `cockpit-store.ts` strips `apiKey` before persisting settings to `localStorage`
- Legacy keys in `localStorage` are auto-migrated to the server on hydration

### Sanitization

- `sanitize.ts` strips HTML tags, control characters, and normalizes whitespace before DB storage
- `sanitizeMessage` walks nested content for tool-call payloads

## Provider support

| Provider / model family    | Chat | Models | Tools | Streaming Tools | Embeddings | Vision | Transcription | Notes                                 |
| -------------------------- | ---- | ------ | ----- | --------------- | ---------- | ------ | ------------- | ------------------------------------- |
| OpenAI                     | ✅   | ✅     | ✅    | ✅              | ✅         | ✅     | ✅            | GPT-4o, GPT-5, embeddings, Whisper    |
| Anthropic                  | ✅   | ✅     | ✅    | ❌              | ❌         | ✅     | ❌            | Claude Sonnet/Opus; native body style |
| Google Gemini              | ✅   | ✅     | ✅    | ❌              | ✅         | ✅     | ❌            | OpenAI-compatible endpoint            |
| Moonshot / KimiCoding      | ✅   | ✅     | ✅    | ❌              | ❌         | ❌     | ❌            | OpenAI-compatible                     |
| OpenRouter                 | ✅   | ✅     | ✅    | ❌              | ❌         | ✅     | ❌            | Unified gateway                       |
| Ollama Cloud               | ✅   | ✅     | ❌    | ❌              | ✅         | ❌     | ❌            | Managed Ollama                        |
| NVIDIA NIM                 | ✅   | ✅     | ✅    | ✅              | ✅         | ✅     | ❌            | Hosted inference microservices        |
| Vercel AI Gateway          | ✅   | ✅     | ✅    | ✅              | ✅         | ✅     | ❌            | Multi-provider gateway                |
| Ollama (local)             | ✅   | ✅     | ❌    | ❌              | ✅         | ✅     | ❌            | Local daemon; base URL editable       |
| LM Studio                  | ✅   | ✅     | ❌    | ❌              | ✅         | ✅     | ❌            | Local server                          |
| Hermes                     | ✅   | ✅     | ✅    | ❌              | ✅         | ❌     | ❌            | Local gateway                         |
| OpenClaw                   | ✅   | ✅     | ✅    | ❌              | ❌         | ❌     | ❌            | Local agent gateway                   |
| vLLM                       | ✅   | ✅     | ✅    | ✅              | ✅         | ✅     | ❌            | OpenAI-compatible server              |
| llama.cpp server           | ✅   | ✅     | ❌    | ❌              | ✅         | ✅     | ❌            | Local OpenAI-compatible server        |
| Custom (OpenAI-compatible) | ✅   | ✅     | ✅    | ✅              | ✅         | ✅     | ✅            | Any endpoint; `allowedHosts: ["*"]`   |

**Note:** Capability flags in `src/lib/providers.ts` declare support, but not all combinations have been end-to-end tested. The `custom` provider's wildcard (`*`) host matching is **blocked in production** unless `PROXY_ALLOW_CUSTOM_WILDCARD=true` is set. See the deployment checklist for production hardening details.

## Tools / function-calling

- **Typed tool definitions:** `ToolDef`, `ToolCall`, `ToolResult` types in `src/lib/tools.ts`
- **Validation:** `validateToolDef` checks name/description presence
- **Safety guards:** `validateToolName` restricts tool names to safe `[a-zA-Z0-9][a-zA-Z0-9_.-]*` patterns (≤128 chars). `sanitizeToolCallArgs` validates JSON arguments as objects (≤16KB). `validateToolCall` validates complete tool call structures.
- **Serialization:** `toOpenAITools` and `toAnthropicTools` adapt to provider body styles
- **Parsing:** `parseOpenAIToolCalls` and `parseAnthropicToolCalls` extract tool calls from non-streaming responses — **now with `validateToolName` gating on each extracted call** (unsafe names are silently dropped)
- **Stream accumulator:** `StreamToolCallAccumulator` applies `validateToolName` on `complete()`
- **Built-in registry:** `BUILT_IN_TOOLS` contains `get_current_time`, `echo`, `word_count`, `calculator`
- **Approval UI:** `MessageRow.tsx` renders tool calls as cards; user must click "Execute"
- **Execution:** `executeBuiltInTool` runs only `isBuiltInTool`-gated tools; non-built-in tools return `[Tool "{name}" is not implemented]`
- **Re-run:** After tool execution, the result is injected as a `tool` role message and the assistant is re-run with the result in context

### Current limitations

- Streaming with tools supported for OpenAI-compatible providers (bodyStyle: "openai" + streamingTools flag); other providers fall back to non-streaming
- 4 built-in executable tools (get_current_time, echo, word_count, calculator); additional schemas registerable via `registerLocalTool` / `registerProviderTools` but non-built-in tools cannot execute without explicit safe-registry addition
- Tool name safety is enforced at parse time — malicious provider responses with unsafe tool names are silently dropped rather than surfaced as errors

## Embeddings / RAG

- **Embedding proxy:** `POST /api/proxy/embeddings` forwards to any provider with `embeddingsPath`
- **Client helper:** `embedTexts` in `src/lib/embeddings.ts` calls the proxy
- **Vector store:** `src/lib/vector-store.ts` implements in-memory + `localStorage` persistence with cosine similarity search
- **Ingestion:** When RAG is enabled, every user message is embedded and stored
- **Retrieval:** Before building chat history, the current prompt is embedded and top-3 results are retrieved
- **Context injection:** Retrieved context is prepended to the personalization system message
- **Settings controls:** Settings page has a RAG section with enable/disable toggle, embedding provider selector, and optional model override
- **Warning:** Settings UI explicitly warns that retrieval sends message text to the selected embedding provider

### Current limitations

- Sentence/paragraph-level chunking implemented; embedding failures surfaced via error state
- Vector store has server-side DB sync (`vector_docs` table in D1) with local-first fallback
- Embedding failures are now surfaced via `ragError` state (not silently swallowed)
- Deduplication via stable IDs prevents re-embedding identical messages

## Token and cost tracking

- **Estimation:** `estimateTokens` uses a heuristic (~4 chars/token + words × 1.3, averaged). No WASM tokenizer dependency (Cloudflare Workers-safe).
- **Exact usage:** Not extracted from upstream responses. Streaming makes exact extraction difficult.
- **DB tables:** `provider_stats` (aggregated per session/provider) and `usage_records` (per-call rows with model, thread, tokens, cost)
- **Usage records:** `POST /api/stats` records detailed usage after each successful assistant response
- **Aggregate routes:** `GET /api/usage` and `GET /api/usage/$threadId` return totals and per-provider breakdowns
- **UI display:** `UsageSection.tsx` shows calls, errors, input/output tokens, and estimated cost per provider
- **Cost rates:** Hardcoded in `COST_PER_1K_TOKENS` (`src/lib/tokens.ts`). May become stale as provider pricing changes.
- **Formatting:** `formatCost` shows ≥$0.01 with 2 decimals; sub-cent costs show up to 6 decimals. `formatTokens` uses locale grouping.

## Local development

This project uses **Bun** as the package manager (evidenced by `bun.lock` and `bunfig.toml`).

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Build for production
bun run build

# Run tests
bun run test

# Type check
bun run typecheck

# Lint
bun run lint

# Format
bun run format

# Preview production build
bun run preview
```

Scripts (from `package.json`):

| Script      | Command                         |
| ----------- | ------------------------------- |
| `dev`       | `vite dev`                      |
| `build`     | `vite build`                    |
| `build:dev` | `vite build --mode development` |
| `preview`   | `vite preview`                  |
| `lint`      | `eslint .`                      |
| `format`    | `prettier --write .`            |
| `typecheck` | `tsc --noEmit`                  |
| `test`      | `vitest run`                    |

## Environment and configuration

| Name                          | Required       | Purpose                                                                               | Source file                                          |
| ----------------------------- | -------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `SESSION_SECRET`              | **Yes**        | Encryption password for cookie sessions (≥32 chars)                                   | `src/lib/session.server.ts`, `src/lib/env.server.ts` |
| `NODE_ENV`                    | No             | Runtime environment (development / production)                                        | `src/routes/api/health.ts`, `src/server.ts`          |
| `LOG_LEVEL`                   | No             | Structured JSON logger level                                                          | `src/lib/logger.server.ts`                           |
| `DB`                          | Yes (platform) | Cloudflare D1 database binding                                                        | `src/lib/platform.server.ts`, `wrangler.jsonc`       |
| `ALLOW_IN_MEMORY_RATE_LIMIT`  | Production     | Set to `true` to acknowledge in-memory rate limiting in production (single-node only) | `src/lib/rate-limit.server.ts`                       |
| `PROXY_ALLOW_CUSTOM_WILDCARD` | Production     | Set to `true` to opt in to wildcard (`*`) host matching for the custom provider       | `src/lib/proxy-guard.server.ts`                      |

**D1 is configured:** `wrangler.jsonc` has a real D1 database ID (`f89b278d-301f-4a98-a018-b92eeb279449`) and binding name `DB`. The device-local privacy boundary (`syncChatsToServer: false`, `syncRagVectorsToServer: false`) is enforced in code — D1 is used for rate limiting, sessions, and usage stats only; no automatic chat/vector sync occurs.

### Startup guards (cold-start)

`server.ts` now runs three startup guards at module init:

1. **`validateEnv()`**: Validates `SESSION_SECRET` is present and ≥32 chars at cold start. If it fails, a 503 error is returned for all requests with a non-secret diagnostic.
2. **D1 binding check**: Warns if the `DB` platform binding is not available (missing `d1_databases` entry in `wrangler.jsonc`).
3. **Rate-limit production guard**: In `production` mode without a custom backend or `ALLOW_IN_MEMORY_RATE_LIMIT=true`, emits a prominent `console.error` telling the operator in-memory rate limiting is not suitable for multi-node deployments.
4. **Custom-provider wildcard policy**: In `production` mode, the custom provider's `allowedHosts: ["*"]` is **blocked** unless `PROXY_ALLOW_CUSTOM_WILDCARD=true` is set. The effective policy is logged at startup.

### Deployment checklist

Before deploying to production:

- [ ] Set `SESSION_SECRET` to a random 32+ character string
- [x] D1 database ID (`f89b278d-301f-4a98-a018-b92eeb279449`) and `DB` binding are already configured in `wrangler.jsonc`
- [ ] Either swap in a distributed rate-limit backend via `setRateLimiterBackend()`, or set `ALLOW_IN_MEMORY_RATE_LIMIT=true` (single-node only)
- [ ] Confirm `syncChatsToServer` (default `false`) and `syncRagVectorsToServer` (default `false`) settings match your data residency intent — **D1 is not automatic chat storage; chat sync is explicit opt-in only**
- [ ] **Do not enable server chat/RAG sync until you have reviewed the privacy implications** — these settings store full message content and text chunks server-side
- [ ] If you need the custom provider to reach arbitrary hosts, set `PROXY_ALLOW_CUSTOM_WILDCARD=true` — otherwise configure explicit `allowedHosts` on the custom provider
- [ ] Run `npm run test && npm run typecheck && npm run lint && npm run build`

## Testing

- **Framework:** Vitest with jsdom environment
- **Setup:** `src/test/setup.ts` imports `@testing-library/jest-dom`
- **Config:** `vitest.config.ts` — globals enabled, CSS disabled, `@/` alias resolved
- **Naming:** Route-adjacent tests use `-` prefix (e.g., `-keys.test.ts`, `-proxy.test.ts`). Library and component tests are co-located.
- **Run all:** `bun run test` (or `vitest run`)
- **Run targeted:** `npx vitest run src/lib/tools.test.ts`
- **Current focus:** 359 tests across 21 files covering CSRF, CSP, rate limiting, storage limits, proxy guard, providers, tools, vector store, tokens, cockpit store, chat hook, keyboard shortcuts, chat input, greeting, RAG/proxy integration, and API routes

## Known limitations and future work

### Streaming + tools

- **Status:** Complete — OpenAI-compatible (openai body style: OpenAI, Gemini) and Anthropic body style both implemented
- **Source evidence:** `src/hooks/use-chat.ts` (`supportsOpenAIStreamingTools` / `supportsAnthropicStreamingTools` flags); `src/lib/tools.ts` (`StreamToolCallAccumulator`, `AnthropicStreamToolCallAccumulator`, `extractAnthropicToolCallDelta`); `src/lib/providers.ts` (Anthropic has `streamingTools: true`)
- **Why it matters:** All three tier-1 providers (OpenAI, Anthropic, Gemini) stream tool-call deltas in real time; other providers without `streamingTools: true` safely fall back to non-streaming
- **Remaining caveat:** Live-provider streaming tool coverage is opt-in only (`RUN_LIVE_PROVIDER_TESTS=true`); synthetic unit tests cover delta parsing and accumulation for all body styles

### Dynamic tool schemas / provider tool discovery

- **Status:** Registry and API implemented; automatic provider API fetching pending
- **Source evidence:** `src/lib/tools.ts` (`registerLocalTool`, `registerProviderTools`, `getAllToolSchemas`, `getSerializableToolDefs`, `getToolSchemaCounts`); `src/routes/api/tools/schemas.ts` (GET + POST REST endpoint, CSRF + rate-limited)
- **What works:** Local tool schemas are registerable via POST `/api/tools/schemas`, listable via GET, validated for safe names and well-formed JSON. Provider-declared schemas are registerable per-provider and replace-on-update. Registered non-built-in tools are visible in the schema list and serializable to providers but correctly cannot execute without being in the built-in safe registry.
- **Remaining gap:** Automatic fetching of tool schemas from provider APIs (e.g., OpenAI's tool discovery endpoint) is not implemented. The built-in safe execution registry still has exactly 4 tools.
- **Release prerequisite:** Any extension of the executable tool set requires a permission model and explicit user approval before new tools can run.

### Sentence/paragraph-level chunking

- **Status:** Complete
- **Source evidence:** `src/lib/vector-store.ts:98-120` (`chunkText` splits on sentence punctuation and paragraph breaks)
- **Why it matters:** Smaller chunks improve retrieval relevance for long messages
- **Implementation:** Configurable minLength (default 80 chars); merges short sentences within paragraphs

### RAG vector store — device-local by default

- **Status:** Enforced — `syncRagVectorsToServer` defaults to `false`; RAG text and vectors stay in `localStorage` only
- **Source evidence:** `src/lib/vector-store.ts:124-148` (server sync functions dormant); `src/routes/api/vector-docs.ts` (API endpoint exists but not called by default); `src/lib/db/schema.sql:56-66` (schema present for opt-in use)
- **Privacy model:** Enabling `syncRagVectorsToServer` is explicit opt-in only. It stores ingested text chunks and embedding vectors server-side. Do not enable without understanding the privacy implications.
- **Not a roadmap goal:** Auto-loading server RAG docs on session startup is not a planned feature — it would conflict with the device-local default.

### Embedding failure UI

- **Status:** Implemented — `ragError` surfaced in StatusBar
- **Source evidence:** `src/hooks/use-chat.ts:139` (`ragError` state); `src/components/cockpit/StatusBar.tsx` (renders `ragError` alongside offline/queue status)
- **Why it matters:** Users see a visible indicator when RAG retrieval or embedding fails, without blocking chat

### D1-backed distributed rate limiter

- **Status:** Implemented — D1 backend activates at startup when DB binding is available
- **Source evidence:** `src/lib/rate-limit.server.ts` (`D1RateLimiterBackend`, `tryActivateD1RateLimiter`); `src/server.ts` (`tryActivateD1RateLimiter()` called at cold start before any request)
- **Architecture:** Each Worker maintains an in-memory bucket cache (synchronous, single-request-cycle accurate) and persists counts to D1 asynchronously (fire-and-forget). On startup `tryActivateD1RateLimiter()` verifies the `rate_limits` table exists and activates the D1 backend; it logs `[rate-limit] Using D1-backed distributed rate limiter.` on success or falls back to in-memory with a warning.
- **Caveat:** Cross-Worker count sharing is eventually consistent (async D1 writes). At very high concurrency across multiple Workers, a small number of over-limit requests may slip through before D1 counts propagate. This is an acceptable tradeoff for Cloudflare's stateless-Worker model. Local dev always uses in-memory.

### Hardcoded cost rates

- **Status:** Improved — now configurable via `setCostOverrides()`
- **Source evidence:** `src/lib/tokens.ts:49-72` (`_COST_DEFAULTS`, `setCostOverrides`, `getCostRates`)
- **Why it matters:** Operators can override stale rates through settings or server config
- **Suggested next step:** Expose cost override UI in settings, or fetch rates from provider APIs

### Token estimation is heuristic

- **Status:** Improved — exact usage extracted from upstream responses when available
- **Source evidence:** `src/lib/tokens.ts:132-176` (`extractProviderUsage` for OpenAI, Anthropic, Gemini formats)
- **Why it matters:** Token counts are now exact when providers include usage metadata; falls back to heuristics
- **Suggested next step:** Integrate a lightweight tokenizer (e.g., `gpt-tokenizer`) for unsupported models

### No provider-level tool testing

- **Status:** Complete — proxy-level tool serialization tests added
- **Source evidence:** `src/routes/api/-proxy.test.ts` (tests verifying OpenAI-format and Anthropic-format tool payloads reach upstream, and that the proxy correctly adapts `tools` array by body style); `src/lib/tools.test.ts` (76 tests covering tool parsing, delta accumulation, validation, and the dynamic schema registry)
- **Remaining caveat:** Tests are synthetic — they verify request body shape against a mocked upstream. End-to-end live tool execution against real provider APIs requires `RUN_LIVE_PROVIDER_TESTS=true`.

### Cross-tab sync gaps

- **Status:** Improved — provider stats and vector store local cache now sync across tabs
- **Source evidence:** `src/lib/cockpit-store.ts` (`setupCrossTabSync` handles `SETTINGS_KEY`, `THREADS_KEY`, and `STATS_KEY`); `src/lib/vector-store.ts` (`ensureVectorStoreCrossTabSync` invalidates the in-memory cache on `STORE_KEY` storage events)
- **What syncs:** Settings, threads, provider stats, and vector store cache invalidation all propagate to other same-origin tabs via the `storage` event.
- **Remaining caveat:** Provider API keys are deliberately excluded from localStorage and never placed in storage events. Stats and vector docs remain device-local (no automatic D1 sync); this is intentional and matches the privacy defaults.

### Dangerous tool guard

- **Status:** Hardened — three-layer validation chain in `executeTool`
- **Source evidence:** `src/hooks/use-chat.ts` (`executeTool`): (1) `validateToolCall(call)` — enforces id/name/args shape; (2) `sanitizeToolCallArgs(call.arguments)` — validates JSON object ≤16KB; (3) `executeBuiltInTool` — only `isBuiltInTool`-gated names run
- **What is enforced:** Invalid call shape → safe rejection message. Oversized/malformed args → safe rejection. Unknown tool names → `[Tool "{name}" is not implemented]` result. No registered non-built-in tool can reach execution without explicit addition to the built-in safe registry.
- **Remaining caveat:** The built-in safe registry is hardcoded (4 tools). User-defined tool execution requires a product decision on the permission model. Registered schemas (via `registerLocalTool`) are correctly visible but not executable.

## Contributing / safe change workflow

1. Run tests, typecheck, lint, and build before opening a PR:
   ```bash
   bun run test && bun run typecheck && bun run lint && bun run build
   ```
2. Avoid broad feature claims without corresponding tests
3. Update this README and `docs/roadmap/FUTURE_ENHANCEMENTS.md` when changing capabilities
4. Do not advertise provider support unless it is wired and tested end-to-end
5. Run impact analysis on affected symbols before editing
6. Do not rename symbols with find-and-replace; use graph-aware refactoring
