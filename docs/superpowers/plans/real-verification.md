# Plan: Real Verification + Webhook Tool Execution

## Context

Two bodies of work, one branch (`fix/real-verification`).

**A. Verification is theater.** An audit found:
- `e2e/runtime-audit.spec.ts` has ZERO assertions and 30 swallowing
  `.catch(() => undefined)` handlers. It is the ONLY e2e spec CI runs
  (`test:e2e:audit:preview`). It cannot fail.
- Specs that DO assert (`v1-local-loop` 46 expects, `account-separation` 24,
  `smoke` 10) never run in CI.
- Coverage 43.51% stmt / 35.9% fn / 41.09% br. 78 of 148 files at 0%.
- 0% AND mocked wherever consumed: `src/lib/tool-execution.server.ts`,
  `src/lib/validate-key.server.ts`.
- 0%: `src/lib/sanitize.ts` (XSS defense, called from `db/index.ts`),
  `src/lib/rate-limit-do.server.ts` (the PRODUCTION Durable Object limiter
  bound in `wrangler.jsonc`; the 88%-covered `rate-limit.server.ts` is only
  the in-memory dev fallback).
- 6.52%: `src/lib/encryption.server.ts` (encrypts provider API keys at rest).
- 55 vacuous assertions; two self-labelled placeholders.

**B. Tool execution is a stub with no substrate.** `executeToolCall` returns
a hardcoded placeholder for approved non-built-in tools. The registry
(`RegisteredTool` in `src/lib/tools.ts`) stores only name/description/
parameters — there is NOWHERE to record what a tool does. `user_tool_
permissions` stores only `(user_id, tool_name, granted_at)`. The registry is
also module-global in-memory, which cannot express per-user tools on Workers.

**Decision (owner-approved):** build HTTP webhook tool execution. A tool
carries a target URL; the executor POSTs validated arguments and returns the
response. Registration and execution are limited to signed-in users, own
tools only. This replaces the placeholder.

## Global Constraints

1. **TDD is mandatory.** Write the test, RUN it, watch it fail for the right
   reason, then write minimal code to pass. Quote the observed failure text
   for each new test in your report file. A test that passed the first time
   you ran it is not TDD — rewrite it so it fails first.
2. **Test real code.** Never mock the module under test. Mock only true
   external boundaries: network `fetch`, D1, Durable Object storage. Assert
   observable behavior, never a mock's call log alone.
3. **No vacuous assertions.** `.not.toThrow()` / `expect(true).toBe(true)`
   are forbidden as a test's only assertion.
4. **Never weaken production code to make a test pass.** If a test reveals a
   real bug, fix the bug and say so in the report.
5. **Security is the product here.** For anything touching the webhook
   executor, a missing guard is a Critical defect, not a nice-to-have.
6. Before reporting: `npx vitest run`, `npm run typecheck`, `npm run lint`
   all clean. Paste the actual output in your report file.
7. Commit with a conventional-commit message. Do not push.
8. Do not dispatch subagents of your own.

## Task 1: Make CI a real gate

**Files:** `.github/workflows/ci.yml`, `package.json`, `vitest.config.ts`

1. Add script `test:e2e:ci`:
   `vite build && E2E_RUNTIME=preview playwright test e2e/v1-local-loop.spec.ts e2e/smoke.spec.ts e2e/account-separation.spec.ts`
2. In the `web-e2e` job add a step "Run asserting E2E suite" running
   `bun run test:e2e:ci`, placed BEFORE the runtime-audit step, allowed to
   fail the job. Keep runtime-audit, retitled to make clear it is
   non-gating diagnostics. Keep `if: always()` on artifact upload.
3. Delete `e2e/account-isolation.spec.ts` — it is `test.describe.skip(...)`
   and its own title says it is superseded by `account-separation.spec.ts`.
4. Add `@vitest/coverage-v8` at the vitest major (4.1.8) to devDependencies.
   Add script `test:coverage`. Configure v8 coverage in `vitest.config.ts`
   with `all: true`, including `src/**/*.{ts,tsx}`, excluding tests,
   `src/test/**`, `src/routeTree.gen.ts`, `src/**/*.d.ts`.
   Set thresholds to the CURRENT baseline so CI locks in no-regression:
   statements 43, branches 41, functions 35, lines 44. Task 10 raises them.
5. Add a "Coverage" step to the `validate` job running `bun run test:coverage`.

**Verify:** `bun run test:coverage` passes locally; workflow is valid YAML.

## Task 2: Test `src/lib/validate-key.server.ts` (0% today)

**Files:** create `src/lib/validate-key.server.test.ts`

Mock ONLY `globalThis.fetch`. Read the file first. Cover:
- `authStyle: "none"` returns `{ valid: true }` and does NOT call fetch.
- 401 and 403 each return `{ valid: false, status, error: "auth_failed" }`.
- 200 returns `{ valid: true }`.
- 500 returns `{ valid: true }` — the documented "anything else means
  accepted" behavior. Test CURRENT behavior; if you think it is wrong, note
  the concern in your report, do not change it.
- Rejection with `new DOMException("aborted", "AbortError")` returns
  `{ valid: false, error: "timeout" }`.
- Other rejection returns `{ valid: false, error: <message> }`.
- URL build: `baseUrl` arg overrides `provider.defaultBaseUrl`; `modelsPath`
  preferred over `chatPath`; falls back to `chatPath` when absent. Assert the
  URL fetch actually received.
- Headers: `authStyle: "x-api-key"` sends `x-api-key`; otherwise
  `Authorization: Bearer <key>`. Assert headers fetch received.

## Task 3: Test `src/lib/sanitize.ts` (0% today)

**Files:** create `src/lib/sanitize.test.ts`. No mocks — pure module.

`sanitizeString`: strips HTML tags incl. a `<script>` payload; removes null
bytes and control chars; PRESERVES tab(9)/newline(10)/CR(13); removes
DEL(127); collapses space/tab runs and trims; safe on empty string and on
tags-only input; emoji and other astral-plane characters survive intact
(the code uses `Array.from`, so surrogate pairs must not split).

`sanitizeMessage`: sanitizes string content; recurses into array content and
nested object content (tool-call payloads); does NOT mutate the input
(`structuredClone`) — assert the original is unchanged; preserves numbers,
booleans, null unchanged; preserves `role`.

## Task 4: Test `src/lib/rate-limit-do.server.ts` (0% today)

**Files:** create `src/lib/rate-limit-do.server.test.ts`

The PRODUCTION limiter. Read the whole file first. Build a fake
`DurableObjectState` with in-memory `storage` implementing exactly the
surface the class uses, and a fake namespace whose `idFromName`/`get` return
a stub wired to a REAL `RateLimiterDurableObject`, so calls flow through the
real class. Use `vi.useFakeTimers()` / `vi.setSystemTime()` — no real sleeps.

Cover: missing/invalid params return 400 "Invalid params"; first request
allowed; allowed up to the limit then denied; denied result carries a
sensible retry-after/reset; window resets after the reset time; separate keys
get separate buckets; state rehydrates from storage into a second instance if
`init()` does that; the `IRateLimiterBackend` adapter satisfies the interface
`rate-limit.server.ts` expects and `clearAll` works.

Match tests to what the code ACTUALLY does. Report any bug found; fix only if
unambiguous, and say so.

## Task 5: Test `src/lib/encryption.server.ts` (6.52% today)

**Files:** create/extend `src/lib/encryption.server.test.ts`

Real WebCrypto; do not mock crypto. Read the file first. Cover: encrypt→
decrypt round trip; ciphertext differs from plaintext and differs across two
encryptions of the same plaintext (random IV); wrong key fails (match actual
behavior — reject or null); tampered ciphertext fails GCM auth (flip a byte);
empty string and unicode round-trip; and the production key-validation branch
near line 15 (`process.env.NODE_ENV === "production"`) — set NODE_ENV in the
test, assert the real behavior for a missing/short key, restore in
`afterEach`.

## Task 6: SSRF-hardened webhook transport

**Files:** create `src/lib/tool-webhook.server.ts` and
`src/lib/tool-webhook.server.test.ts`

This module is the security boundary. Build it TDD, guards first.

Export `assertSafeWebhookUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string }`:
- Reject anything that is not `https:`. (Allow `http:` ONLY when
  `process.env.NODE_ENV !== "production"` AND the host is `localhost` or
  `127.0.0.1`, so local development works. Test both sides of that gate.)
- Reject URLs with embedded credentials (`user:pass@`).
- Reject non-default ports outside {80, 443} in production.
- Reject literal IP hosts in these ranges (v4): `0.0.0.0/8`, `10/8`,
  `100.64/10`, `127/8`, `169.254/16` (INCLUDING the cloud metadata address
  `169.254.169.254`), `172.16/12`, `192.168/16`, `192.0.0/24`, `198.18/15`,
  `224/4`, `240/4`.
- Reject IPv6: `::`, `::1`, `fc00::/7`, `fe80::/10`, and IPv4-mapped
  (`::ffff:a.b.c.d`) that decode into any blocked v4 range.
- Reject hosts that normalize to a blocked target via decimal/octal/hex IPv4
  encodings (e.g. `2130706433`, `0x7f000001`, `0177.0.0.1`).
- Reject `.local`/`.internal` suffixes and bare single-label hosts.
- Write one test per rejection rule, each naming the attack it blocks.

Export `executeWebhook(url: string, payload: unknown, opts?): Promise<{ ok: true; content: string } | { ok: false; error: string }>`:
- Re-runs `assertSafeWebhookUrl` itself (never trust the caller).
- `method: "POST"`, `Content-Type: application/json`, a fixed
  `User-Agent: edgecase-cockpit-tools/1`.
- **`redirect: "manual"`** — a 3xx is an error, never followed. This blocks
  redirect-to-internal SSRF. Test it.
- Sends NO cookies, NO ambient credentials, and NO app secrets.
- 10s timeout via `AbortController`; timeout returns a `timeout` error.
- Caps the response body at 64 KiB; oversize is an error (read via the
  stream reader, do not buffer unbounded).
- Non-2xx returns `ok: false` including the status.
- Always clears the timer.

In your report, state plainly which SSRF vectors remain (DNS rebinding
cannot be fully closed without resolve-then-connect, unavailable on Workers).

## Task 7: Per-user tool persistence

**Files:** `migrations/0004_user_tools.sql`, `src/lib/db/index.ts`,
`src/lib/db/index.test.ts`

Add migration `0004_user_tools.sql` following the style of the existing
migrations in `migrations/`:

```sql
CREATE TABLE IF NOT EXISTS user_tools (
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  parameters_json TEXT,
  endpoint_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_user_tools_user ON user_tools(user_id);
```

Add DB functions beside the existing tool-permission ones (~line 1000),
matching their exact style and the project's D1 prepare/bind idiom:
`getUserTool(userId, name)`, `listUserTools(userId)`,
`upsertUserTool(userId, tool)`, `deleteUserTool(userId, name)`.

Every query MUST be scoped by `user_id`. Add a test proving one user cannot
read or delete another user's tool. Follow the mocking approach already used
in `src/lib/db/index.test.ts`.

## Task 8: Wire `executeToolCall` to real webhook execution

**Files:** `src/lib/tool-execution.server.ts`,
`src/lib/tool-execution.server.test.ts` (create)

Mock ONLY `./db` and `./tool-webhook.server`. Use the REAL `./tools`.
Read `src/lib/tools.ts` first for real tool names and argument shapes.

New behavior for `executeToolCall(userId, call)`:
1. Existing validation is unchanged: invalid shape → "Invalid tool call
   shape"; unsafe name → "Unsafe tool name"; bad args → "Invalid or oversized
   arguments".
2. Built-in tool → `executeBuiltInTool`, WITHOUT consulting permissions
   (assert `getUserToolPermission` not called).
3. Non-built-in, no `userId` → "User-defined tools require an account".
4. Non-built-in, permission not granted → `ok: false`, error names the tool
   and says "not approved". **Assert the webhook was NOT called** — this is
   the authorization gate.
5. Non-built-in, permission granted, but no `user_tools` row → `ok: false`,
   error says the tool has no registered endpoint. Assert no webhook call.
6. Non-built-in, permission granted, row exists → calls `executeWebhook` with
   the row's `endpoint_url` and the parsed arguments, and returns its content
   as `{ ok: true, content }`.
7. Webhook failure (non-2xx, timeout, unsafe URL) → `{ ok: false, error }`
   surfacing the reason. Never leak the raw endpoint URL of another user or
   any app secret in the error.
8. `getToolApprovalStatus` keeps working; extend it to include the user's
   registered tools with their approval state. Built-ins stay excluded.

Delete the placeholder return. The old test expectation that approved tools
return "no executable implementation" is now obsolete — that is the point of
this task.

## Task 9: Tool registration API

**Files:** create `src/routes/api/tools/user.ts` and
`src/routes/api/-tools-user.test.ts`

Follow the EXACT shape of the sibling routes (`execute.ts`, `permissions.ts`)
— CSRF via `validateCsrfToken`, `getAuthUserId`, `sessionRateLimit`,
`rateLimitResponse`, `createFileRoute`. Study `permissions.ts` first.

- `GET` — list the signed-in user's tools. 401 when not signed in.
- `POST` — upsert `{ name, description, parameters, endpointUrl }`.
  Validate `name` with `validateToolName`, reject names colliding with a
  built-in, and validate `endpointUrl` with `assertSafeWebhookUrl`, returning
  400 with the reason when unsafe. 401 when not signed in.
- `DELETE` — remove by name. 401 when not signed in.

Test the auth gate, the CSRF gate, the rate-limit path, the SSRF rejection
(a `http://169.254.169.254/...` endpoint must be refused with 400), the
built-in name collision, and cross-user isolation. Mirror the mocking style
of `src/routes/api/-tools-permissions.test.ts`.

## Task 10: Kill vacuous assertions, raise the floor

**Files:** `src/components/cockpit/OnboardingModal.test.tsx`,
`src/lib/vector-store.test.ts`, `src/lib/rate-limit.server.test.ts`,
`src/lib/proxy-guard.server.test.ts`, `src/hooks/use-chat.test.ts`,
`src/lib/env.server.test.ts`, `vitest.config.ts`

1. `OnboardingModal.test.tsx:44` `expect(true).toBe(true); // Placeholder` —
   replace with a real behavioral assertion, or delete the test if genuinely
   redundant. No placeholder may remain.
2. `vector-store.test.ts:158` — same treatment.
3. `rate-limit.server.test.ts` — the three
   `expect(() => warnInMemoryRateLimitInProduction()).not.toThrow()` tests
   verify nothing. Rewrite to spy on `console.warn`/`console.error` and
   assert the ACTUAL message per branch: not-production (silent), custom
   backend set (silent), production + `ALLOW_IN_MEMORY_RATE_LIMIT=true`
   (warn), production without it (error).
4. Add a `logCustomProviderPolicy` test to `proxy-guard.server.test.ts` — it
   is currently only ever mocked. Spy on `console.warn`, set NODE_ENV, assert
   the ALLOWED/BLOCKED message.
5. In `use-chat.test.ts` and `env.server.test.ts`, strengthen any
   `.not.toThrow()` that is a test's ONLY assertion. Leave supplementary ones.
6. Re-run coverage; raise `vitest.config.ts` thresholds to just below the
   newly achieved numbers (round down to whole percent).

## Task 11: Settings UI for webhook tools

**Files:** `src/components/cockpit/settings/ToolsSection.tsx` (create),
its test, and wire into the settings page

Study `src/components/cockpit/settings/ProviderCard.tsx` and its test for the
house pattern, and how `settings.tsx` composes sections. Build a section that
lists the user's registered tools, adds one (name, description, endpoint
URL), deletes one, and toggles the approval grant. Show the server's
validation error when an endpoint is rejected as unsafe. Signed-in only —
local-only profiles see an explanatory empty state, matching how the codebase
already handles local-vs-account gating. Test with React Testing Library
following the existing component-test conventions.

## Task 12: Full-stack verification

Verification only, plus fixes for whatever it turns up.

1. `npm run typecheck` — clean.
2. `npm run lint` — clean.
3. `npx vitest run` — all pass.
4. `bun run test:coverage` — passes new thresholds.
5. `npx vite build` — succeeds.
6. `npx wrangler deploy --dry-run --outdir=/tmp/wr-verify` — succeeds, shows
   D1 + Durable Object + Assets bindings.
7. `npx playwright test e2e/smoke.spec.ts e2e/v1-local-loop.spec.ts` on the
   dev runtime. Report pass/fail per test honestly. Diagnose any failure as
   real bug vs stale test; fix real bugs; state exactly what changed.

Paste actual command output. Never claim success without it.
