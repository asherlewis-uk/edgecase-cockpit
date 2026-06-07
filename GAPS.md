# EdgeCase Cockpit — End-to-End Gap Analysis

> Generated 2026-06-07 · 15 providers (8 cloud + 7 local) · TanStack Start + React 19 + Cloudflare Workers

---

## 1. Security

### 1.1 CSRF Protection
- **Gap**: No CSRF token validation on any mutation endpoint (POST `/api/threads`, POST `/api/keys/set`, PATCH `/api/threads/$id`, DELETE `/api/threads/$id`, POST `/api/stats`, POST `/api/session`).
- **Existing**: `sameSite: "lax"` on the session cookie provides partial same-origin protection (`src/lib/session.server.ts:27`).
- **Missing**: CSRF token header requirement, double-submit cookie pattern, or `Origin`/`Referer` header validation.

### 1.2 Rate Limiting Coverage
- **Gap**: Rate limiting only covers proxy routes (`/api/proxy/chat`, `/api/proxy/detect`, `/api/proxy/transcribe`) via `src/lib/proxy-guard.server.ts:9-21`. Thread, stats, and keys endpoints have **no rate limits**.
- **Existing**: In-memory sliding window — 120 req/min per session per proxy endpoint.
- **Missing**: Rate limiting on `POST /api/threads`, `POST /api/keys/set`, `POST /api/keys/clear`, `POST /api/stats`, `PATCH /api/threads/$id`, `DELETE /api/threads/$id`.
- **Missing**: Per-provider rate limiting (one provider can consume the entire 120 req/min quota).

### 1.3 Storage Limits
- **Gap**: No max thread count. No max messages per thread. No max message length on the client side. D1 can be exhausted.
- **Existing**: 1MB aggregate proxy body limit (`src/routes/api/proxy/chat.ts:88`), 20MB transcription limit (`src/routes/api/proxy/transcribe.ts:9`), API key max 8192 chars, thread title max 512 chars.
- **Missing**: Client-side message length limit, max threads per session, max messages per thread, attachment count limit, D1 storage monitoring/cleanup.

### 1.4 API Key Validation
- **Gap**: Keys are stored but never validated. No test-ping to confirm a key works.
- **Existing**: Keys encrypted in server-side session cookie (`src/lib/session.server.ts`).
- **Missing**: `POST /api/keys/validate` endpoint that pings the provider and returns key validity.

### 1.5 Content Security Policy
- **Gap**: No `Content-Security-Policy` header set anywhere.
- **Missing**: CSP headers in `server.ts` or route-level responses.

### 1.6 Additional Security Gaps
- **No input sanitization** on user messages before storage (relies on React JSX escaping).
- **No encryption at rest** for D1 — threads/messages stored as plain JSON.
- **No session invalidation** — no logout/expire mechanism.
- **No audit logging** — no record of thread access, key changes, or provider usage per user.
- **No request ID propagation** to the client — server logs have `requestId` but never surfaced for debugging.

---

## 2. API Surface

### 2.1 Missing Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/threads/:id` | Fetch a single thread (only list-all exists) |
| `POST /api/threads/:id/fork` | Duplicate a thread |
| `POST /api/threads/:id/pin` | Pin/unpin a thread |
| `DELETE /api/threads` | Bulk delete threads |
| `GET /api/threads/:id/export?format=json\|markdown\|txt` | Export a thread as a file |
| `POST /api/threads/import` | Import threads from JSON file |
| `GET /api/proxy/models` | List available models for a provider |
| `GET /api/proxy/models/:providerId` | List models for a specific provider |
| `POST /api/keys/validate` | Test if a stored API key is valid |
| `POST /api/keys/validate/:providerId` | Test a specific provider's key |
| `GET /api/usage` | Token usage / cost summary |
| `GET /api/usage/:threadId` | Per-thread token usage |

### 2.2 Missing API Route Tests
- **Existing**: Only `src/routes/api/keys.test.ts` (10 tests).
- **Missing**: Tests for `/api/threads`, `/api/threads.$id`, `/api/session`, `/api/stats`, `/api/proxy/chat`, `/api/proxy/detect`, `/api/proxy/transcribe`, `/api/health`.

---

## 3. Store (`src/lib/cockpit-store.ts`)

### 3.1 Missing Actions

| Action | Purpose |
|---|---|
| `duplicateThread(id)` | Clone a thread and all its messages |
| `archiveThread(id)` | Soft-delete (archive) instead of hard delete |
| `pinThread(id)` / `unpinThread(id)` | Thread pinning (provider pinning exists at line 603) |
| `deleteMessage(threadId, msgId)` | Remove a single message from a thread |
| `clearThreadMessages(threadId)` | Wipe all messages from a thread |
| `exportThread(id, format)` | Export thread as JSON/Markdown/text |
| `importThreads(data)` | Bulk import from JSON |
| `mergeThreads(sourceId, targetId)` | Combine two threads |
| `searchThreads(query)` | Full-text search across all messages |
| `reorderThreads(fromIndex, toIndex)` | Manual thread reorder |
| `setThreadColor(id, color)` | Visual differentiation for threads |
| `getTotalTokens()` | Token usage tracking |
| `getThreadCount()` / `getMessageCount()` | Computed counts |

### 3.2 Missing State
- No `archivedThreads` or `pinnedThreadIds` in state (line 349–355).
- No `searchIndex` or `searchQuery` in state.
- No `theme` preference beyond `visualMode` (no font size, code theme).
- No `maxThreads` limit enforcement.

---

## 4. Provider Capabilities (`src/lib/providers.ts`)

### 4.1 Declared but Not Implemented

| Capability | Declared (providers) | Status |
|---|---|---|
| **chat** | All 15 | Fully implemented with streaming, body adapters, proxy |
| **tools** (function calling) | 10 providers | **Zero code.** `supports.tools: true` declared, never used |
| **embeddings** | 11 providers | **Zero code.** `embeddingsPath` declared, never called |
| **models listing** | All 15 | **Zero code.** `modelsPath` declared, no model picker UI or API |
| **transcription** | 2 providers (OpenAI, Custom) | Partial — only OpenAI wired up |
| **vision** | 11 providers | Partial — image URLs sent via `normalizeMessages()` but no real vision analysis flow |
| **media capabilities** | OpenAI (image), Gemini (image+video) | Declared but codebase reads `supports.vision` instead of `mediaCapabilities` |

### 4.2 Provider Count
- 15 providers total (8 cloud + 7 local), not 13 as originally described. The `custom` provider is the 15th.

### 4.3 Body Adapters (Implemented)
- **OpenAI-style**: Default — direct JSON with `normalizeMessages()`.
- **Anthropic**: System messages extracted separately, `x-api-key` auth, `anthropic-version` header.
- **Gemini**: Uses OpenAI-compatible endpoint.
- **SSE parsing**: `pickOpenAIDelta()`, `pickAnthropicDelta()`, `pickFinal()`.

---

## 5. Error Handling

### 5.1 Existing
| Pattern | Location |
|---|---|
| `ProviderError` class with `status` + `retryAfter` | `src/lib/providers.ts:364-373` |
| 401/403 → `onAuthError` callback | `src/hooks/use-chat.ts:199-202` |
| 429 → exponential backoff (max 60s), cooldown timer | `src/hooks/use-chat.ts:203-207` |
| Offline queuing with auto-drain on reconnect | `src/hooks/use-chat.ts:88-108, 209-214` |
| `AbortError` → "Stopped" instead of error | `src/hooks/use-chat.ts:187-196` |
| SSR crash recovery with branded error page | `src/server.ts:58-72` |
| Unhandled error/rejection capture | `src/lib/error-capture.ts:1-27` |
| Structured JSON server logging | `src/lib/logger.server.ts:1-53` |
| 404 + error boundary per route | `src/routes/__root.tsx:13-68` |
| `try/catch` on `request.json()` | All POST routes |

### 5.2 Missing
- **No client-side error boundary** within `Cockpit` — a streaming/render error crashes the whole page.
- **No retry for transient 5xx errors** — only 429 gets backoff; 502/503 show "error" with no auto-retry.
- **No offline persistence** — queued messages live only in `queueRef` (in-memory); lost on refresh.
- **No error reporting service** — console-only; no Sentry, Datadog, or LogRocket integration.
- **No error deduplication** — rapid identical errors spam the UI.
- **No graceful degradation for missing D1** — all API calls fail with generic errors if D1 is down.

---

## 6. Chat UX

### 6.1 Existing
| Feature | Location |
|---|---|
| Streaming SSE responses | `src/hooks/use-chat.ts:159-175` |
| Copy message button | `src/components/cockpit/MessageRow.tsx:119-127` |
| Regenerate last response | `src/hooks/use-chat.ts:270-289` |
| Retry on error | `src/hooks/use-chat.ts:291-297` |
| Stop generation (AbortController) | `src/hooks/use-chat.ts:266-268` |
| Thread search/filter (client-side) | `src/components/cockpit/Drawer.tsx:40-168` |
| Thread rename (window.prompt) | `src/components/cockpit/ThreadOverflowMenu.tsx:28-31` |
| Thread delete with confirmation | `src/components/cockpit/ThreadOverflowMenu.tsx:33-38` |
| Save temporary thread | `src/components/cockpit/ThreadOverflowMenu.tsx:39-43` |
| Copy thread link | `src/components/cockpit/ThreadOverflowMenu.tsx:44-57` |
| Copy full transcript | `src/components/cockpit/ThreadOverflowMenu.tsx:58-69` |
| Message expand/collapse (>10 lines) | `src/components/cockpit/MessageRow.tsx:64-115` |
| Image/video attachments (paste, drag, picker) | `src/components/cockpit/ChatInput.tsx:94-127` |
| Screenshot capture | `src/routes/index.tsx:243-282` |
| Voice recording + transcription | `src/routes/index.tsx:284-339` |
| Offline indicator + queue count | `src/components/cockpit/StatusBar.tsx` |
| Cooldown countdown timer | `src/components/cockpit/ChatInput.tsx:178-181` |
| Enter to send, Shift+Enter for newline | `src/components/cockpit/ChatInput.tsx:162-166` |
| Provider pinning in drawer | `src/components/cockpit/Drawer.tsx:114-143` |
| Thread library, image gallery, video gallery pages | `src/routes/library.tsx`, `images.tsx`, `videos.tsx` |

### 6.2 Missing

**Message Features**
- **Markdown rendering** — Messages are `whitespace-pre-wrap` plain text. No bold, italic, lists, tables, or headings. No `react-markdown` dependency.
- **Code block syntax highlighting** — Follows from no markdown rendering.
- **Message editing** — Cannot edit a sent user message and re-send.
- **Delete individual message** — `patchMessage` exists but no `deleteMessage`.
- **Message timestamps** — `ts` field exists on `Message` type but never rendered in UI.
- **Regenerate from any message** — Only regenerates the last assistant response.

**Thread Features**
- **Thread pinning** — Provider pinning exists, threads don't.
- **Thread archiving** — Only hard delete; no soft-delete/archive.
- **Thread sorting** — Always `updatedAt` DESC; no manual reorder, sort by title, date, message count.
- **Thread categorization** — No tags, folders, or labels.
- **Thread preview** — Thread list shows only title; no last-message snippet.
- **Thread export (file download)** — Copy transcript exists but no download as `.txt`, `.md`, `.json`.
- **Thread import** — No way to import threads from a file.
- **Bulk operations** — No multi-select for bulk delete/export.

**Keyboard Shortcuts**
- Only Enter to send exists. Missing:
  - `Cmd/Ctrl+K` — command palette / quick search
  - `Cmd/Ctrl+N` — new thread
  - `Cmd/Ctrl+Enter` — send message
  - `Escape` — stop generation / close drawer
  - `Cmd/Ctrl+/` — keyboard shortcut help overlay

**Visual & Polish**
- **No light theme** — Three visual modes (dark, glass, solid) but all dark.
- **No font size controls** — No text scaling.
- **No empty state illustrations** — Mostly just text.
- **No loading skeletons** — No skeleton UI during data fetch.
- **No confirmation before leaving** — Navigating away during streaming loses the response.
- **Resizable panels** — `react-resizable-panels` is in `package.json` but unused.
- **Infinite scroll / virtualization** — Thread list uses `max-h-[40vh]` with native scroll.
- **"Lovable App" placeholder** — `__root.tsx` still has "Lovable App" title and "Lovable Generated Project" meta description.

---

## 7. Accessibility

### 7.1 Existing
- `aria-label` on ~10 elements (buttons, inputs).
- `lang="en"` on `<html>` (`__root.tsx:99`).
- Partial semantic HTML: `<nav>`, `<header>`, `<h1>`, `<button>`, `<ul>/<li>` in some places.
- `alt=""` on some images (decorative).

### 7.2 Missing
- **No `aria-live` regions** — Streaming content (new tokens) is not announced to screen readers.
- **No `aria-expanded`** on expandable sections (message expand/collapse, drawer).
- **No `aria-busy`** during loading/streaming.
- **No `aria-describedby`** for error messages.
- **No `aria-current="page"`** on active navigation items.
- **No `role="status"` or `role="alert"`** on status messages.
- **No keyboard navigation** — No tab order management, no focus trapping in drawer, no focus restoration after close, no arrow key navigation in thread list.
- **No skip-to-content link**.
- **No `focus-visible` styles** — Buttons rely on `hover:` only.
- **No reduced motion** applied to animations (the `reduceMotion` setting exists but is only used for one pulse animation).
- **Color contrast** — `text-white/40`, `text-white/45`, `text-white/70` may not meet WCAG AA.
- **No `<label>` elements** on form inputs.
- **No landmark roles** — `<main>`, `<aside>`, `<footer>` not used.

---

## 8. Observability & Analytics

### 8.1 Existing
| Feature | Location |
|---|---|
| Structured JSON server logging | `src/lib/logger.server.ts:1-53` |
| Per-request logging (method, path, status, duration) | `src/server.ts:88-92` |
| Provider call/error stats (local + D1) | `src/lib/cockpit-store.ts:83-143` |
| D1-backed stats persistence | `src/lib/db/index.ts:145-179` |
| Server error capture (before h3 swallows) | `src/lib/error-capture.ts:1-27` |
| Health check endpoint | `src/routes/api/health.ts:1-19` |

### 8.2 Missing
- **No client-side analytics** — No page views, user interactions, or RUM (Real User Monitoring).
- **No error tracking service** — No Sentry, Datadog RUM, LogRocket.
- **No Web Vitals** — No LCP, FID, CLS tracking.
- **No usage analytics** — No tracking of messages sent, threads created, providers used, feature adoption.
- **No LLM-specific metrics** — Missing:
  - Token usage per request (no token counting at all).
  - Latency per provider (TTFT, total response time).
  - Cost estimation per provider.
  - Stream completion rates.
- **No stats dashboard** — `UsageSection` shows only call/error counts per provider.
- **No log aggregation** — Logs are `console.log` only; Cloudflare Logpush not configured.
- **No alerting** — No threshold alerting for error rates or latency.
- **No distributed tracing** — No trace IDs across proxy → upstream calls.

---

## 9. Configuration & Limits

### 9.1 Existing
| Limit | Location | Value |
|---|---|---|
| Proxy rate limit | `src/lib/proxy-guard.server.ts:7` | 120 req/min per session |
| Rate limit window | `src/lib/proxy-guard.server.ts:6` | 60,000ms sliding window |
| Chat proxy body max | `src/routes/api/proxy/chat.ts:88` | 1 MB |
| Transcription file max | `src/routes/api/proxy/transcribe.ts:9` | 20 MB |
| Upstream timeout | Multiple proxy routes | 60,000ms |
| Detection timeout | `src/routes/api/proxy/detect.ts:39` | 2,000ms |
| Session max age | `src/lib/session.server.ts:24` | 30 days |
| SESSION_SECRET min length | `src/lib/session.server.ts:18` | 32 chars |
| API key max length (Zod) | `src/routes/api/keys/set.ts:12` | 8,192 chars |
| Thread title max (Zod) | `src/routes/api/threads.ts:13` | 512 chars |
| ProviderId validation | `src/routes/api/keys/set.ts:10` | 64 chars, `/^[a-z0-9-]+$/` |

### 9.2 Missing
- **No token counting** — No `tiktoken` or similar library.
- **No max threads per session** — Unlimited thread creation.
- **No max messages per thread** — Threads grow unbounded.
- **No max message length (client-side)** — Only the 1MB proxy body aggregate limit.
- **No file upload size limit on client** — Images/videos attached via chat input have no limit before hitting the 1MB proxy cap.
- **No attachment count limit**.
- **No concurrent request limit on server** — Only blocked on client by `status === "streaming"` check.
- **No daily/monthly usage quota**.
- **No D1 storage cleanup** — No TTL on old threads, no automatic cleanup of temporary threads.
- **No configurable limits** — All values are hardcoded; no environment variable overrides.

---

## 10. Internationalization (i18n)

- **No i18n library** — No `react-intl`, `react-i18next`, or `lingui`.
- **No translation files** — All UI text is hardcoded English string literals.
- **No locale detection** — No `Accept-Language` header parsing.
- **No RTL support** — No right-to-left layout considerations.
- **No date/number formatting** — `date-fns` is in dependencies but unused.
- **No language picker UI**.

---

## 11. Testing Coverage

### 11.1 Existing
| Test file | Tests | Type |
|---|---|---|
| `src/lib/cockpit-store.test.ts` | 50 | Unit |
| `src/lib/providers.test.ts` | 17 | Unit |
| `src/hooks/use-chat.test.ts` | 17 | Integration |
| `src/routes/api/keys.test.ts` | 10 | API integration |
| `src/components/cockpit/Greeting.test.tsx` | 7 | Component |
| `src/components/cockpit/ChatInput.test.tsx` | 20 | Component |
| **Total** | **121** | |

### 11.2 Missing
- **No E2E tests** — No Playwright or Cypress tests.
- **No API route tests** for threads, proxy, stats, session, health endpoints.
- **No component tests** for `MessageRow`, `StatusBar`, `Drawer`, `ThreadOverflowMenu`, settings components.
- **No snapshot tests**.
- **No visual regression tests**.
- **No performance/load tests**.

---

## 12. DevOps / Infrastructure

### 12.1 Existing
| Feature | Location |
|---|---|
| GitHub Actions CI (lint → typecheck → test → build) | `.github/workflows/ci.yml` |
| Environment validation (fails fast on missing SESSION_SECRET) | `src/lib/env.server.ts` |
| Dependabot (weekly npm updates) | `.github/dependabot.yml` |
| Node.js pinned to v22 | `.node-version` |
| `typecheck` script | `package.json` |

### 12.2 Missing
- **No CD pipeline** — CI builds but no deploy step.
- **No staging environment** — No preview deployments.
- **No database migrations** — D1 schema is a raw `.sql` file with no migration tooling.
- **No database seeding** — No seed data for development.
- **No feature flags** — All features are always-on.
- **No Dockerfile or container setup**.
- **No pre-commit hooks** — No Husky or lint-staged.
- **No changelog or versioning automation**.

---

## Summary by Priority

### Critical (Security & Data Loss)
1. CSRF protection on mutation endpoints
2. Rate limiting on non-proxy API routes
3. Max threads / max messages limits
4. API key validation endpoint
5. CSP headers

### High (Core UX Missing)
6. Markdown rendering + code highlighting
7. Message editing and deletion
8. Thread export/import (file download/upload)
9. Tools/function-calling implementation
10. Embeddings implementation
11. Model picker (list + select)
12. Keyboard shortcuts
13. Token counting + cost tracking

### Medium (Polish)
14. Thread pinning
15. Thread archiving (soft delete)
16. Thread previews (last message snippet)
17. Message timestamps in UI
18. Client-side error boundary within Cockpit
19. Offline message persistence (not just in-memory)
20. Error reporting service integration

### Lower (Growth)
21. i18n support
22. Accessibility (aria-live, focus management, screen reader)
23. Analytics/RUM telemetry
24. E2E tests (Playwright)
25. CD pipeline + staging environment
26. Database migrations tooling
27. "Lovable App" meta replacement
