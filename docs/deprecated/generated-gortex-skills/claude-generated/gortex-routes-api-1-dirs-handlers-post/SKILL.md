---
name: gortex-routes-api-1-dirs-handlers-post
description: "Work in the routes/api +1 dirs · handlers.POST area — 29 symbols across 3 files (84% cohesion)"
---

# routes/api +1 dirs · handlers.POST

29 symbols | 3 files | 84% cohesion

## When to Use

Use this skill when working on files in:
- `src/lib/db/index.ts`
- `src/routes/api/threads.import.ts`
- `src/routes/api/threads.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/db/index.ts` | row, getThreadCount, db, sessionId |
| `src/routes/api/threads.import.ts` | now, t, csrfCheck, handlers.POST, session, ... |
| `src/routes/api/threads.ts` | rl, thread, messageViolation, csrfCheck, session, ... |

## Entry Points

- `src/routes/api/threads.import.ts::handlers.POST@44`
- `src/routes/api/threads.ts::handlers.POST@66`

## Connected Communities

- **db +1 dirs · handlers.POST · index · threads.$id.fork** (1 cross-edges)

## How to Explore

```
get_communities with id: "community-137"
smart_context with task: "understand routes/api +1 dirs · handlers.POST", format: "gcx"
find_usages with id: "src/routes/api/threads.import.ts::handlers.POST@44", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
