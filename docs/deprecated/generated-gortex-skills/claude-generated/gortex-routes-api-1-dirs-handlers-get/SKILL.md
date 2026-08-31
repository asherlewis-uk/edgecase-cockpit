---
name: gortex-routes-api-1-dirs-handlers-get
description: "Work in the routes/api +1 dirs · handlers.GET area — 27 symbols across 3 files (83% cohesion)"
---

# routes/api +1 dirs · handlers.GET

27 symbols | 3 files | 83% cohesion

## When to Use

Use this skill when working on files in:

- `src/lib/db/index.ts`
- `src/routes/api/threads.$id.export.ts`
- `src/routes/api/threads.$id.ts`

## Key Files

| File                                   | Symbols                                              |
| -------------------------------------- | ---------------------------------------------------- |
| `src/lib/db/index.ts`                  | sessionId, id, db, getThread, messages, ...          |
| `src/routes/api/threads.$id.export.ts` | msg, handlers.GET, extension, filename, session, ... |
| `src/routes/api/threads.$id.ts`        | session, handlers.GET, thread, id                    |

## Entry Points

- `src/routes/api/threads.$id.export.ts::handlers.GET@8`

## How to Explore

```
get_communities with id: "community-135"
smart_context with task: "understand routes/api +1 dirs · handlers.GET", format: "gcx"
find_usages with id: "src/routes/api/threads.$id.export.ts::handlers.GET@8", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
