---
name: gortex-api-keys-4-dirs
description: "Work in the api/keys +4 dirs area — 124 symbols across 11 files (88% cohesion)"
---

# api/keys +4 dirs

124 symbols | 11 files | 88% cohesion

## When to Use

Use this skill when working on files in:
- `src/lib/session.server.ts`
- `src/routes/api/keys/clear.ts`
- `src/routes/api/keys/set.ts`
- `src/routes/api/keys/status.ts`
- `src/routes/api/keys/validate.$providerId.ts`
- `src/routes/api/keys/validate.ts`
- `src/routes/api/proxy/embeddings.ts`
- `src/routes/api/proxy/transcribe.ts`
- `src/routes/api/stats.ts`
- `src/routes/api/threads.ts`
- `src/routes/api/tools/schemas.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/session.server.ts` | s, password, next, s, providerId, ... |
| `src/routes/api/keys/clear.ts` | providerId, handlers.POST, csrfCheck, session, body, ... |
| `src/routes/api/keys/set.ts` | raw, parsed, session, handlers.POST, sessionId, ... |
| `src/routes/api/keys/status.ts` | id, s, handlers.GET, providers, cfg |
| `src/routes/api/keys/validate.$providerId.ts` | provider, result, creds, handlers.POST, body, ... |
| `src/routes/api/keys/validate.ts` | csrfCheck, sessionId, settled, session, rl, ... |
| `src/routes/api/proxy/embeddings.ts` | body, creds, input, timer, session, ... |
| `src/routes/api/proxy/transcribe.ts` | form, msg, ctrl, upstream, file, ... |
| `src/routes/api/stats.ts` | stats, csrfCheck, handlers.GET, rl, session, ... |
| `src/routes/api/threads.ts` | handlers.GET, threads, session |
| `src/routes/api/tools/schemas.ts` | rl, csrfCheck, rl, handlers.GET, counts, ... |

## Entry Points

- `src/routes/api/proxy/embeddings.ts::handlers.POST@16`
- `src/routes/api/proxy/transcribe.ts::handlers.POST@15`
- `src/routes/api/keys/set.ts::handlers.POST@22`
- `src/routes/api/keys/validate.$providerId.ts::handlers.POST@11`
- `src/routes/api/keys/validate.ts::handlers.POST@11`

## Connected Communities

- **src/lib · persist** (1 cross-edges)

## How to Explore

```
get_communities with id: "community-104"
smart_context with task: "understand api/keys +4 dirs", format: "gcx"
find_usages with id: "src/routes/api/proxy/embeddings.ts::handlers.POST@16", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
