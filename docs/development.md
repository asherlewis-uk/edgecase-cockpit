# Development

Package manager, scripts, the test suites and release gates, and the safe change workflow. Moved verbatim from the root `README.md`.

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
5. **Update `README.md` only for broad source-backed repo status.** Account-separation direction belongs in `docs/archive/SURFACE_AUDIT.md`, `docs/archive/RECONSTRUCTION_PLAN.md`, and `docs/archive/ACCOUNT_SEPARATION_PLAN.md`.
6. Do not advertise provider support unless it is wired and verified end-to-end
7. Do not rename symbols with find-and-replace; use graph-aware refactoring tools
8. Do not push without passing all gates

### Package manager

This project uses **Bun** (`bun.lock`, `bunfig.toml`). Use `bun install`, `bun run dev`, `bun run test`, etc.

### Scripts

| Script             | Command                                                |
| ------------------ | ------------------------------------------------------ |
| `dev`              | `vite dev`                                             |
| `build`            | `vite build`                                           |
| `build:dev`        | `vite build --mode development`                        |
| `preview`          | `vite preview`                                         |
| `lint`             | `eslint .`                                             |
| `format`           | `prettier --write .`                                   |
| `typecheck`        | `tsc --noEmit`                                         |
| `test`             | `vitest run`                                           |
| `test:live`        | `vitest run --config vitest.live.config.ts`            |
| `test:release`     | `npm run test && (OPENAI_API_KEY present → test:live)` |
| `test:e2e`         | `playwright test`                                      |
| `test:e2e:install` | `playwright install --with-deps chromium`              |

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
- **Current count:** 540+ tests, 35+ test files (including unit, API route, and Playwright E2E smoke tests)
- **Credential-free:** All normal tests run without any provider API keys; E2E smoke tests run against a local dev server without external credentials
- **V1 E2E requirement:** focused browser E2E must prove the generic local OpenAI-compatible endpoint model-list loop with deterministic mocked/local test responses and must fail if the first loop requires OpenAI, any cloud key, OAuth, marketplace install, signed native builds, live provider accounts, unrelated agent infrastructure, or a real local daemon in CI
- **Coverage areas:** CSRF, CSP, rate limiting (D1 + Durable Object + in-memory backends, preset limiters), storage limits, proxy guard, providers, tools (schema registry, discovery, permissions, name validation, arg sanitization, streaming accumulators, execution gate), vector store (chunking, add/remove/search/clear, cross-tab sync), tokens (exact extraction, heuristic, cost estimation, pricing cache), cockpit store (defaults, normalization, sync flags, migration, onboarding), chat hook (offline queue, error handling, provider status, server-side tool fallback), keyboard shortcuts, chat input, greeting, RAG/proxy integration, API routes

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
