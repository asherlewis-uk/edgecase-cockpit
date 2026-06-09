# GAPS.md

> **Note:** The canonical "Known limitations and future work" section has been moved to the main [`README.md`](../../README.md#known-limitations-and-future-work). This file retains the historical record and may contain additional context not yet fully migrated.

## Status

This document was rebased after PR #1 merged into `main`. It only tracks unresolved or partially verified work remaining after the merged PR.

## Confirmed completed by PR #1

### Security/data-loss hardening

- **CSRF protection** — `src/lib/csrf.server.ts` implements double-submit cookie validation. Applied to thread routes (`/api/threads`, `/api/threads/$id`, `/api/threads/import`, `/api/threads/$id/fork`, `/api/threads/$id/pin`), session (`/api/session`), and stats (`/api/stats`).
- **Rate limiting** — `src/lib/rate-limit.server.ts` with presets for keys, usage, health, threads, session, and stats. Applied to all mutating non-proxy API routes.
- **Proxy guard rate limiting** — `src/lib/proxy-guard.server.ts` with per-session sliding-window buckets for `/api/proxy/chat`, `/api/proxy/detect`, `/api/proxy/models`, `/api/proxy/transcribe`.
- **Storage limits** — `src/lib/storage-limits.server.ts` validates max threads, messages, content length, title length, attachment count, and import bounds.
- **CSP/security headers** — `src/lib/csp.server.ts` builds CSP, `X-Content-Type-Options`, and `Referrer-Policy`; applied to HTML responses in `server.ts`.
- **API key validation** — `src/lib/validate-key.server.ts` pings providers. Endpoints: `POST /api/keys/validate` and `POST /api/keys/validate/$providerId`.
- **Proxy URL allowlisting** — `proxy-guard.server.ts` restricts proxy targets to provider-declared `allowedHosts`.

### API/thread management

- **Thread CRUD** — `GET/POST/DELETE /api/threads`, `GET/PATCH/DELETE /api/threads/$id`.
- **Thread import/export** — `POST /api/threads/import`, `GET /api/threads/$id/export` (json, markdown, txt).
- **Thread fork/pin** — `POST /api/threads/$id/fork`, `POST /api/threads/$id/pin`.
- **Session bootstrap** — `POST /api/session`.
- **Stats tracking** — `GET/POST/DELETE /api/stats` with D1-backed persistence.
- **Usage scaffolding** — `GET /api/usage`, `GET /api/usage/$threadId` (returns message counts and per-provider call/error totals).
- **API key management** — `POST /api/keys/set`, `POST /api/keys/clear`, `GET /api/keys/status`, validation routes.
- **Proxy routes** — `POST /api/proxy/chat`, `POST /api/proxy/detect`, `GET /api/proxy/models`, `POST /api/proxy/transcribe`.

### UI/keyboard/settings

- **Markdown rendering** — `src/components/cockpit/MarkdownContent.tsx` with `react-markdown`, `remark-gfm`, `rehype-highlight`, syntax highlighting, tables, and inline code.
- **Model picker** — `src/components/cockpit/ModelPicker.tsx` fetches live models from `/api/proxy/models`.
- **Keyboard shortcuts** — `src/hooks/use-keyboard-shortcuts.ts` implements Cmd/Ctrl+K (command palette), +N (new thread), +Enter (send), +/ (help), Escape (stop/close drawer).
- **Shortcut help overlay** — `src/components/cockpit/ShortcutHelp.tsx`.
- **Command palette** — `src/components/cockpit/CommandPalette.tsx` with thread search, provider search, and actions.
- **Settings UI** — `src/routes/settings.tsx` with Profile, Personalization, Keyboard Shortcuts, Provider cards, and Usage sections. Extracted components in `src/components/cockpit/settings/`.
- **Error boundary** — `src/components/cockpit/CockpitErrorBoundary.tsx` mounted in `src/routes/index.tsx` around the chat area.
- **Message editing/deletion UI** — `src/components/cockpit/MessageRow.tsx` provides inline edit (with save/resend), delete buttons, and relative timestamps.
- **Offline queue persistence** — `src/hooks/use-chat.ts` persists queued messages to `localStorage` and auto-drains on reconnect.
- **Regenerate from any message** — `useChat` hook exposes `regenerateFrom(messageId)`.

### Tests/build infrastructure

- **Vitest setup** — `vitest.config.ts`, `src/test/setup.ts`, jsdom environment.
- **Route-adjacent tests** — `-keys.test.ts` (21 tests), `-threads.test.ts` (2 tests), `-proxy.test.ts` (13 tests), `-usage.test.ts` (3 tests), `-stats.test.ts` (2 tests), `-embeddings.test.ts` (4 tests).
- **Library tests** — `csrf.server.test.ts`, `csp.server.test.ts`, `rate-limit.server.test.ts`, `storage-limits.server.test.ts`, `proxy-guard.server.test.ts`, `providers.test.ts`, `cockpit-store.test.ts`, `tokens.test.ts`, `tools.test.ts`, `vector-store.test.ts`.
- **Hook/component tests** — `use-chat.test.ts`, `use-keyboard-shortcuts.test.ts`, `ChatInput.test.tsx`, `Greeting.test.tsx`.
- **Current count** — 288 tests passing across 20 test files.

## Completed after PR #1 follow-up

### 1. Add CSRF validation to key mutation routes

- **Status:** Complete
- **Routes covered:** `POST /api/keys/set`, `POST /api/keys/clear`, `POST /api/keys/validate`, `POST /api/keys/validate/$providerId`
- **Implementation:** Added `validateCsrfToken(request)` at the top of each POST handler before body parsing or state changes.
- **Tests:** Added missing-CSRF (403) and invalid-CSRF (403) tests to `-keys.test.ts`. All 21 key route tests pass.

### 2. Decide and implement CSRF policy for proxy routes

- **Status:** Complete
- **Policy decision:** All browser-originated proxy routes require CSRF validation. `GET /api/proxy/models` explicitly calls `validateCsrfToken`, which returns `true` for safe methods per RFC 9110; this documents the policy decision in code.
- **Routes covered:** `POST /api/proxy/chat`, `POST /api/proxy/detect`, `GET /api/proxy/models`, `POST /api/proxy/transcribe`
- **Implementation:** Added `validateCsrfToken` to all four proxy route handlers. Updated client-side callers (`callProviderChatViaProxy`, `detectProvider`, `transcribeAudioViaProxy`, `fetchModels`) to include CSRF headers.
- **Tests:** Added `-proxy.test.ts` (13 tests) covering missing/invalid CSRF (403), rate limit exhaustion (429), unknown provider (400), disallowed base URL (400), and explicit GET-safe behavior for models.

### 3. Token counting integration

- **Status:** Complete
- **Schema changes:** Added `input_tokens` and `output_tokens` to `provider_stats`. Added new `usage_records` table with `id`, `session_id`, `provider_id`, `model`, `thread_id`, `input_tokens`, `output_tokens`, `estimated_cost`, `created_at`.
- **Chat/proxy integration:** After a successful assistant response, `use-chat.ts` estimates input tokens from history and output tokens from the assistant text, then calls `recordTokenUsage` (localStorage) and `syncTokenUsageToServer` (POST `/api/stats`).
- **Usage route changes:** `GET /api/usage` now returns `totalInputTokens`, `totalOutputTokens`, `totalEstimatedCost`, and per-provider token data. `GET /api/usage/$threadId` returns `inputTokens`, `outputTokens`, `totalTokens`, and `estimatedCost`, with fallback estimation from message content when no usage records exist.
- **UI changes:** `UsageSection` continues to read from localStorage; it now receives real token data because `recordTokenUsage` populates the stats store.
- **Tests:** `tokens.test.ts` (13 tests), `cockpit-store.test.ts` token usage tests, `-usage.test.ts` (3 tests), `-stats.test.ts` (2 tests).
- **Exact vs estimated behavior:** Exact provider usage is not extracted from upstream responses (streaming makes this difficult). Token counts are estimated using the `estimateTokens` heuristic. Estimated costs are computed from `estimateCost`.

### 4. Message editing/deletion UX

- **Status:** Complete
- **API integration:** `editMessage` in `use-chat.ts` now calls `syncThreadToServer(threadId)` after updating local state. `deleteMessage` in `ChatMessages.tsx` is now handled by a parent callback that calls `store.deleteMessage` followed by `syncThreadToServer`.
- **Local/offline behavior:** Local-first semantics are preserved. Server sync is fire-and-forget; network errors are swallowed.
- **Failure handling:** If the PATCH fails, local state remains unchanged and the user sees no error (local is source of truth).
- **Tests:** `syncThreadToServer` tests in `cockpit-store.test.ts` verify PATCH request body, temporary-thread skip, and graceful error swallowing.

### 5. Tools/function-calling

- **Status:** Implemented — foundation complete with safe mock execution
- **Schema/validation:** Added `src/lib/tools.ts` with `ToolDef`, `ToolCall`, `ToolResult` types, `validateToolDef`, `toOpenAITools`, `toAnthropicTools`, `parseOpenAIToolCalls`, `parseAnthropicToolCalls`, and `executeBuiltInTool`.
- **Provider support:** Request serialization added for OpenAI-compatible and Anthropic body styles in both `src/lib/providers.ts` and `src/routes/api/proxy/chat.ts`. When `tools` are present, streaming is disabled so tool calls can be parsed from the JSON response.
- **Serialization/parsing:** OpenAI `tool_calls` and Anthropic `tool_use` blocks are parsed into the app message model.
- **UI rendering:** `MessageRow.tsx` renders tool calls as cards with tool name, arguments (collapsible), and Execute/Show-args buttons. `role: "tool"` messages render as tool result bubbles.
- **Execution/approval behavior:** Only built-in safe tools (`echo`, `get_current_time`) can be executed. The user must click "Execute" to run the tool. The result is injected as a `tool` role message and the assistant is re-run with the result in context.
- **Tests:** `tools.test.ts` (16 tests) covering validation, serialization, parsing, and execution.
- **Current state:** Streaming with tools is supported for OpenAI-compatible and Anthropic body styles. Dynamic schema registry (`registerLocalTool`, `registerProviderTools`) implemented. Tool execution is limited to the 4 built-in safe tools; a permission model for user-defined execution is a product decision. Auto-fetching from provider APIs is not yet implemented.

### 6. Embeddings/RAG

- **Status:** Implemented — foundation complete with local vector store
- **Provider support:** Added `POST /api/proxy/embeddings` route that forwards to any provider with `embeddingsPath`. Client-side `embedTexts` helper calls the proxy.
- **Ingestion path:** When RAG is enabled, every user message is embedded and stored in the local vector store (`src/lib/vector-store.ts`) via `addVectorDocs`.
- **Vector/index storage:** `src/lib/vector-store.ts` implements an in-memory + localStorage vector store with cosine similarity search. No external vector database required.
- **Retrieval flow:** Before building the chat history, `runAssistant` embeds the current prompt and calls `searchVectorStore(queryEmbedding, 3)`. Top results are injected into the system message as context.
- **Chat context injection:** Retrieved context is prepended to the personalization system message. If no system message exists, a standalone system message is added.
- **UI/settings:** Settings page has a "Retrieval (RAG)" section with an enable/disable toggle, embedding provider selector, and optional model override. A clear warning states that retrieval sends message text to the selected embedding provider.
- **Tests:** `vector-store.test.ts` (6 tests) covering add, remove, search, and clear. `-embeddings.test.ts` (4 tests) covering CSRF, unsupported provider, empty input, and URL allowlisting.
- **Limitations:** Sentence/paragraph-level chunking implemented. Server-side D1 sync available with local-first fallback. Embedding failures surfaced via `ragError` state.

## Remaining gaps / limitations

### Tools/function-calling

- **Streaming + tools:** Streaming tool-call delta parsing implemented for all supported body styles. OpenAI-compatible providers (bodyStyle: "openai") use `StreamToolCallAccumulator`. Anthropic providers (bodyStyle: "anthropic") use `AnthropicStreamToolCallAccumulator` with `extractAnthropicToolCallDelta`. Gemini uses the OpenAI-compatible path. Providers without `streamingTools: true` safely fall back to non-streaming.
- **Dynamic tool schemas:** Dynamic schema registry implemented — `registerLocalTool`, `registerProviderTools`, `getAllToolSchemas`, `getSerializableToolDefs`, `/api/tools/schemas` (GET + POST, CSRF + rate-limited). Registered schemas are visible and serializable to providers. Automatic fetching from provider APIs (e.g., OpenAI's tool discovery) is not yet implemented. Registered non-built-in tools correctly cannot execute without explicit safe-registry addition.
- **Dangerous tool guard:** Three-layer guard chain in `executeTool`: `validateToolCall` (shape), `sanitizeToolCallArgs` (JSON ≤16KB), then `executeBuiltInTool` (only built-in names run). Registered non-built-in tools produce a safe `[Tool "{name}" is not implemented]` result. A permission model for user-defined tool execution remains a product decision.
- **Tool name safety:** `validateToolName` restricts parsed tool names to `[a-zA-Z0-9][a-zA-Z0-9_.-]*` (≤128 chars). Unsafe names in provider responses are silently dropped during parsing (`parseOpenAIToolCalls`, `parseAnthropicToolCalls`, `StreamToolCallAccumulator.complete`).
- **Tool argument safety:** `sanitizeToolCallArgs` validates JSON arguments as objects ≤16KB. `validateToolCall` enforces the full shape (id, name, args).
- **Tool safety tests:** `tools.test.ts` expanded from 25 to 53 tests covering name validation (12 cases), args sanitization (7 cases), call validation (4 cases), and integrated parser safety (5 cases) across OpenAI, Anthropic, and streaming paths.

### Embeddings/RAG

- **Chunking:** Sentence/paragraph-level chunking implemented via `chunkText` in `src/lib/vector-store.ts`. Splits on sentence boundaries (.!?) and paragraph breaks, merging short sentences.
- **Cross-device sync:** Server-side sync implemented via D1 `vector_docs` table and `/api/vector-docs` endpoint. localStorage remains source of truth with local-first fallback.
- **Embedding failure handling:** Failures are now surfaced via `ragError` state returned from `useChat` and displayed in the `StatusBar` component alongside offline/queue status.
- **RAG/proxy integration tests:** `rag-proxy-integration.test.ts` (12 tests) covers embedding proxy request shape, API key confidentiality in client requests, RAG context injection, ragError propagation (embedding failure, retrieval failure, RAG-disabled), and proxy-guard host allowlisting across providers.

### Remaining caveats

- **No live-provider RAG/tool tests:** All RAG and tool-call integration tests are synthetic — they verify request shapes, error propagation, and safety guards without hitting real provider endpoints. End-to-end tests against live providers would require API keys.
- **Streaming tool deltas:** Implemented for OpenAI-compatible (via `StreamToolCallAccumulator`) and Anthropic (via `AnthropicStreamToolCallAccumulator` + `extractAnthropicToolCallDelta`). Gemini uses the OpenAI-compatible path. Providers without `streamingTools: true` safely fall back to non-streaming. Live end-to-end streaming tool tests are opt-in (`RUN_LIVE_PROVIDER_TESTS=true`).
- **Dynamic provider tool schemas:** Tool schemas from provider APIs (e.g., OpenAI's `tools` endpoint) are not fetched automatically. Local and provider schemas are registerable via `registerLocalTool` / `registerProviderTools` and the `/api/tools/schemas` API. The built-in safe execution registry still has exactly 4 tools; auto-fetching provider APIs is the remaining gap.
- **Tool call validation fully wired:** `validateToolCall` and `sanitizeToolCallArgs` are both called in `executeTool` (`use-chat.ts`) before `executeBuiltInTool`. Invalid shape and oversized/malformed args produce safe rejection messages without crashing.

### Non-goals for the next PR

- Do not rewrite completed rate limiting/storage/CSP work.
- Do not combine unrelated redesign work.
- Do not implement multi-device settings sync unless product requires it.

## Device-local data boundary

### Enforced privacy defaults

- **Status:** Enforced — implemented in `src/lib/cockpit-store.ts`
- **Chat/message/thread storage:** Device-local (`localStorage`) by default. `syncChatsToServer` defaults to `false`. No automatic D1 writes for chat data.
- **RAG vector/text storage:** Device-local by default. `syncRagVectorsToServer` defaults to `false`. Server sync functions in `vector-store.ts` are dormant — not called by any production code path.
- **Cross-device portability:** Manual export/import (JSON/Markdown/TXT) is the only supported cross-device chat transfer mechanism. This is intentional.
- **Legacy migration:** `normalizeSettings()` migrates any stored settings that predate these fields — missing values are treated as `false`, not `true`.
- **D1 allowed scope:** Distributed rate limiting, encrypted sessions, usage/stats (no full message content), and runtime operational data only.
- **Tests:** `cockpit-store.test.ts` covers: default `false` for both sync flags, legacy migration to `false`, `syncThreadToServer` no-fetch when disabled, fetch when enabled, temporary thread skip.

### Not a roadmap goal

- Auto-loading server RAG docs on session startup is not planned — it conflicts with the device-local default.
- Cross-device automatic chat sync is not planned — manual export/import is the product's intended portability path.
- D1 should not be used for automatic chat/message storage without explicit user opt-in and privacy review.

### D1 setup prerequisite

D1 is configured with a real database ID (`f89b278d-301f-4a98-a018-b92eeb279449`, binding `DB`) in `wrangler.jsonc`. The device-local privacy boundary is enforced in code — `syncChatsToServer` and `syncRagVectorsToServer` default to `false`. D1 is used exclusively for rate limiting, encrypted sessions, and usage/stats aggregation. No automatic chat or vector sync occurs.
