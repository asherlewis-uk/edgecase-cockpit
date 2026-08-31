---
name: gortex-src-lib-estimatethreadcost
description: "Work in the src/lib · estimateThreadCost area — 21 symbols across 1 files (98% cohesion)"
---

# src/lib · estimateThreadCost

21 symbols | 1 files | 98% cohesion

## When to Use

Use this skill when working on files in:

- `src/lib/tokens.ts`

## Key Files

| File                | Symbols                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `src/lib/tokens.ts` | msg, wordEstimate, thread, providerId, estimateMessageTokens, ... |

## How to Explore

```
get_communities with id: "community-95"
smart_context with task: "understand src/lib · estimateThreadCost", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
