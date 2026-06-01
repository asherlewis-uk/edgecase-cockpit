# Plan: Wire Dead UI + Harden Backend

No removals, no relabels. Every surface gets a real implementation.

## 1. Wire the dead UI

### Composer Mic button → real voice-to-text
- Use the browser `MediaRecorder` API to capture audio on press-and-hold (or toggle).
- On stop, POST the blob to a new server route `src/routes/api/proxy/transcribe.ts` which forwards to the active provider's transcription endpoint (OpenAI `/v1/audio/transcriptions` by default; configurable per provider via a new `transcribePath` field in `providers.ts`).
- Insert the returned text into the composer input.
- Visual states: idle → recording (red pulse) → transcribing (spinner) → done.

### Composer Live (AudioLines) button → live voice session
- Open a streaming mic capture using `MediaRecorder` with 250ms timeslices.
- Pipe each chunk through the same `/api/proxy/transcribe` route in incremental mode, appending partial transcripts into the composer in real time.
- Click again to stop; final transcript is committed and auto-sent (matches "live" intent).
- Falls back to a clear error toast if the active provider has no `transcribePath`.

### Temporary-chat toggle → works on any thread
- Today: only acts when no active thread exists.
- Fix: toggling on creates a new temporary thread (even if one is active) and switches to it; toggling off creates a fresh persistent thread. Add `store.setThreadTemporary(id, bool)` for in-place conversion of an empty thread.
- Persist the toggle preference per session so the next "new chat" inherits it until cleared.

### Provider stats → render in Settings
- Add a "Usage" section to each provider card on `/settings` reading `getProviderStats()`.
- Show calls / errors / error-rate, plus a "Reset stats" button calling `resetProviderStats()`.
- Subscribe via `subscribeProviderStats` so it updates live during streaming.

### Videos page → real ingestion + generation path
- Add `mediaCapabilities.video: 'generate' | 'none'` to `providers.ts`. Mark providers that actually expose video generation (none today by default, but the field exists so future providers light up automatically).
- Add a video attachment flow mirroring images: paste/drop `.mp4/.webm/.mov` into the composer → stored on message → surfaced on `/videos`.
- Empty state changes from "Choose a provider…" to a real two-CTA panel: "Attach a video to a chat" (drop zone) and "Generate" (disabled with tooltip until a video-capable provider exists).
- Result: Videos page is populated by any chat that has a video attachment — no longer a dead page.

### Images page copy → made truthful by surfacing assistant images
- Today only user uploads appear. Extend the message renderer to detect assistant-returned image URLs (markdown `![](...)` and `data:image/*` in content) and store them as `assistantImages` on the message.
- Images page aggregates both `attachments` (user) and `assistantImages` (assistant) — copy "all images shared across your chats" becomes accurate.

## 2. Fix OllamaCloud default base URL

`src/lib/providers.ts`: change `https://ollama.com` → `https://ollama.com/api` (OpenAI-compat path documented by Ollama Cloud). Keep override capability in Settings.

## 3. Lock down the proxy routes

Both `/api/proxy/chat` and `/api/proxy/detect` are currently open relays. Harden:

- **Host allowlist per provider**: each `ProviderDef` gets `allowedHosts: string[]`. The proxy parses `baseUrlOverride` and rejects (400) any host not on the active provider's allowlist. Local providers allow `localhost` / `127.0.0.1` / `*.local`.
- **Session gate**: introduce a lightweight signed session cookie (TanStack `useSession`) set on first page load. Proxy routes require a valid session cookie or return 401. Prevents external callers from using the deployment as a relay.
- **Method + size caps**: cap request body at 256KB, reject non-JSON, cap upstream timeout at 60s with `AbortController`.
- **Per-session rate limit**: in-memory token bucket (60 req/min per session id) since this runs on Workers and the existing `cockpit-store` rate limiter is client-only.
- **Detect route**: also gated by allowlist (only URLs whose host matches a known provider's `allowedHosts`).

## 4. Move API keys off `localStorage`

- New encrypted server session via `useSession` from `@tanstack/react-start/server` (password from a new `SESSION_SECRET` env var — will request via secrets tool).
- New server routes:
  - `POST /api/keys/set` — body `{ providerId, apiKey, baseUrl?, model? }` → stored in session, never returned to client.
  - `POST /api/keys/clear` — clears a provider config or all.
  - `GET  /api/keys/status` — returns `{ providerId: { hasKey: bool, model, baseUrl } }` (no plaintext key).
- `cockpit-store.ts` keeps non-secret bits (`userName`, `activeProviderId`, `pinnedProviderIds`, `model`/`baseUrl` overrides) in localStorage; **`apiKey` removed from client state**.
- Settings UI: API key input is write-only ("•••• set" indicator + "Replace" button), submits to `/api/keys/set`.
- `/api/proxy/chat` reads the key from session by `providerId` instead of accepting it in the request body. The browser stops sending the key entirely.
- One-time migration: on first load after deploy, if old `cockpit.settings.v2` contains `apiKey`s, POST them to `/api/keys/set` and then strip them from local state.

## Technical notes

- `transcribePath` and `mediaCapabilities` are additive to `ProviderDef` — existing providers default to `undefined` / `'none'`, so no behavior regressions.
- Session cookie config: `httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30d`.
- All new server routes follow the same CORS-free same-origin pattern as `/api/proxy/chat` (no cross-origin callers expected).
- `SESSION_SECRET` will be added via the secrets tool before deploying server session code.

## Files

**New**
- `src/routes/api/proxy/transcribe.ts`
- `src/routes/api/keys/set.ts`
- `src/routes/api/keys/clear.ts`
- `src/routes/api/keys/status.ts`
- `src/lib/session.server.ts` (session config + helpers)
- `src/lib/proxy-guard.server.ts` (allowlist + rate limit)
- `src/components/cockpit/MicButton.tsx`
- `src/components/cockpit/LiveVoiceButton.tsx`
- `src/components/cockpit/ProviderUsage.tsx`

**Edited**
- `src/lib/providers.ts` (allowedHosts, transcribePath, mediaCapabilities, Ollama URL)
- `src/lib/cockpit-store.ts` (remove apiKey from local state, add setThreadTemporary, assistantImages)
- `src/hooks/use-chat.ts` (drop apiKey from proxy body; capture assistantImages from stream)
- `src/routes/api/proxy/chat.ts` (session gate, allowlist, size/timeout caps, read key from session)
- `src/routes/api/proxy/detect.ts` (session gate, allowlist)
- `src/routes/settings.tsx` (write-only key field, usage section, status fetch)
- `src/routes/index.tsx` (wire Mic, Live, temp toggle, video drop)
- `src/routes/videos.tsx` (aggregate video attachments, new empty state)
- `src/routes/images.tsx` (include assistantImages)

Approve and I'll add `SESSION_SECRET` via secrets tool, then implement.