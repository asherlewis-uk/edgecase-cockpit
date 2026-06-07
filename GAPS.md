# GAPS.md

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
- **Route-adjacent tests** — `-keys.test.ts` (10 tests), `-threads.test.ts` (2 tests).
- **Library tests** — `csrf.server.test.ts`, `csp.server.test.ts`, `rate-limit.server.test.ts`, `storage-limits.server.test.ts`, `proxy-guard.server.test.ts`, `providers.test.ts`, `cockpit-store.test.ts`.
- **Hook/component tests** — `use-chat.test.ts`, `use-keyboard-shortcuts.test.ts`, `ChatInput.test.tsx`, `Greeting.test.tsx`.
- **Current count** — 214 tests passing across 13 test files.

## Remaining critical security follow-up

### 1. Add CSRF validation to key mutation routes
Status: Open

Routes:
- `POST /api/keys/set`
- `POST /api/keys/clear`
- `POST /api/keys/validate`
- `POST /api/keys/validate/$providerId`

Evidence:
- None of the above routes import or call `validateCsrfToken`.
- `src/routes/api/-keys.test.ts` already sends valid CSRF headers in tests, but the handlers do not enforce them.

Expected:
- Apply `validateCsrfToken(request)` consistently before processing body.
- Add valid-token and missing/invalid-token tests.
- Preserve existing rate-limit behavior.
- Do not change API key validation semantics.

Acceptance criteria:
- Key mutation routes reject missing/invalid CSRF with 403.
- Existing valid requests still pass with a valid CSRF token.
- Tests cover both paths.
- `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build` pass.

### 2. Decide and implement CSRF policy for proxy routes
Status: Open / needs decision

Routes:
- `POST /api/proxy/chat`
- `POST /api/proxy/detect`
- `GET /api/proxy/models`
- `POST /api/proxy/transcribe`

Evidence:
- No CSRF validation in any proxy route handler.

Expected:
- Decide whether proxy routes require CSRF based on authentication and cross-origin trigger risk.
- If yes, apply CSRF before body parsing/provider work where practical.
- If no, document why rate limiting, URL allowlisting, and existing auth/session constraints are sufficient.

Acceptance criteria:
- Decision documented in code comments or security notes.
- Tests cover the selected policy.
- Existing proxy guard rate limiting remains unchanged.

## Remaining product/architecture follow-ups

### 3. Token counting integration
Status: Open

Current known state:
- `src/lib/tokens.ts` contains estimation helpers (`estimateTokens`, `estimateCost`, `formatCost`, `formatTokens`).
- `ProviderStat` type declares `inputTokens?` and `outputTokens?` fields (`src/lib/cockpit-store.ts:95-96`).
- `bumpProviderStat` only increments `calls` and `errors`; token fields are never populated.
- DB schema `provider_stats` table has only `calls` and `errors` columns — no token storage.
- `GET /api/usage` and `GET /api/usage/$threadId` return `totalMessages` (message count), not token counts.
- `UsageSection` reads token fields from stats but they are always undefined/0, so the UI shows "—" for tokens and "$0" for cost.

Expected:
- Add schema/storage for token usage if missing.
- Integrate token estimation or provider-returned usage into chat/proxy response flow.
- Persist per-thread and aggregate usage.
- Surface usage through `/api/usage`, `/api/usage/$threadId`, and stats/UI where appropriate.

Acceptance criteria:
- Token counts are calculated or captured during chat requests.
- Usage is persisted.
- Per-thread usage endpoint returns meaningful token/cost data.
- Tests cover counting, persistence, and route output.

### 4. Message editing/deletion UX
Status: Partially implemented / gap in server sync

Current known state:
- UI affordances exist: `src/components/cockpit/MessageRow.tsx` has inline edit (textarea, save/resend, cancel) and delete buttons with confirmation-free immediate action.
- Frontend store supports `editMessage` and `deleteMessage` locally (`src/lib/cockpit-store.ts`).
- Backend supports whole-thread updates via `PATCH /api/threads/$id`, but there is no dedicated message-level endpoint.
- Frontend store persists threads only to `localStorage`; it does **not** sync thread mutations (including edits/deletes) to the server API.

Expected:
- Ensure individual message edits and deletions are persisted server-side, not just in localStorage.
- Add UI confirmation for destructive delete actions, or ensure undo-safe behavior.
- Preserve thread consistency after edits (re-send assistant response after user message edit).

Acceptance criteria:
- User can edit a message from the cockpit UI and the edit persists across reloads (server or localStorage with clear durability guarantee).
- User can delete a message with confirmation or undo-safe behavior.
- Updated/deleted messages persist correctly.
- Tests cover core behavior.

### 5. Tools/function-calling
Status: Open

Current known state:
- `Capability` type includes `"tools"` (`src/lib/providers.ts`).
- 10 providers declare `supports.tools: true`.
- Zero implementation: no tool schema model, no request/response handling, no user confirmation UI.

Expected:
- Define provider-agnostic tool schema model.
- Add provider-specific serialization/parsing.
- Add UI for tool call display, confirmation, and results.
- Keep dangerous tool execution out of scope unless explicitly designed.

Acceptance criteria:
- Tool calls can be represented safely.
- Provider payloads are validated.
- UI renders requested/completed tool calls.
- Tests cover serialization and rendering.

### 6. Embeddings/RAG
Status: Open

Current known state:
- `Capability` type includes `"embeddings"` (`src/lib/providers.ts`).
- 11 providers declare `supports.embeddings: true` and have `embeddingsPath`.
- Zero implementation: no embedding client, no vector storage, no ingestion/retrieval flow.

Expected:
- Decide embedding provider/storage.
- Add ingestion and retrieval flow.
- Add vector storage or local index.
- Integrate retrieval context into chat flow.
- Add UI affordances only after backend behavior is stable.

Acceptance criteria:
- Documents/messages can be embedded.
- Retrieval returns relevant context.
- Chat flow can include retrieved context.
- Tests cover indexing and retrieval.

## Partials to verify before closing

### Offline queue persistence
- **Status:** Complete
- **Files inspected:** `src/hooks/use-chat.ts`
- **Evidence:** `OFFLINE_QUEUE_KEY` localStorage persistence, `loadOfflineQueue`/`saveOfflineQueue`, auto-drain on `online` event.
- **Next action:** None. Keep as verified.

### Error boundary wiring
- **Status:** Complete
- **Files inspected:** `src/components/cockpit/CockpitErrorBoundary.tsx`, `src/routes/index.tsx`
- **Evidence:** `CockpitErrorBoundary` is imported and mounted around the main chat area (lines 405 and 607 in `index.tsx`).
- **Next action:** None. Keep as verified.

### Settings/profile/personalization persistence
- **Status:** Complete for local-first scope
- **Files inspected:** `src/routes/settings.tsx`, `src/components/cockpit/settings/*`, `src/lib/cockpit-store.ts`
- **Evidence:** Settings UI mutates `cockpit-store` actions (`updateProfile`, `updatePersonalization`, `updateKeyboardShortcuts`), which persist to `localStorage` via `persist()`. Not synced to server, which is acceptable for client-side preferences unless multi-device sync is required.
- **Next action:** None unless product decides to sync settings to server/D1.

### Usage/cost display in UI
- **Status:** Partial — UI exists but data is hollow
- **Files inspected:** `src/components/cockpit/settings/UsageSection.tsx`, `src/lib/cockpit-store.ts`, `src/lib/tokens.ts`, `src/routes/api/usage.ts`
- **Evidence:** `UsageSection` renders per-provider calls, errors, tokens, and cost. Token/cost values come from `inputTokens`/`outputTokens` on provider stats, but `bumpProviderStat` never writes these fields and the DB has no token columns. Backend usage routes return message counts only.
- **Next action:** Resolve via "Token counting integration" gap above.

## Non-goals for the next PR
- Do not redo PR #1.
- Do not rewrite completed rate limiting/storage/CSP work.
- Do not combine CSRF hardening with token counting/tools/embeddings.
- Do not implement unrelated redesign work.

## Suggested next PR order

1. **CSRF hardening for key/proxy routes** — smallest blast radius, highest security value.
2. **Token counting persistence and usage UI** — closes the hollow-data issue in UsageSection.
3. **Message editing/deletion UX** — wire server persistence for an already-built UI.
4. **Tools/function-calling**
5. **Embeddings/RAG**
