---
name: gortex-src-lib-1-dirs-fetchmodels
description: "Work in the src/lib +1 dirs · fetchModels area — 20 symbols across 2 files (90% cohesion)"
---

# src/lib +1 dirs · fetchModels

20 symbols | 2 files | 90% cohesion

## When to Use

Use this skill when working on files in:

- `src/lib/providers.ts`
- `src/routes/api/proxy/models.ts`

## Key Files

| File                             | Symbols                                       |
| -------------------------------- | --------------------------------------------- |
| `src/lib/providers.ts`           | Model                                         |
| `src/routes/api/proxy/models.ts` | provider, rl, timer, handlers.GET, creds, ... |

## Entry Points

- `src/routes/api/proxy/models.ts::handlers.GET@75`

## How to Explore

```
get_communities with id: "community-115"
smart_context with task: "understand src/lib +1 dirs · fetchModels", format: "gcx"
find_usages with id: "src/routes/api/proxy/models.ts::handlers.GET@75", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
