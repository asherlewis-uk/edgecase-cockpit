---
name: gortex-src-lib-buildentry
description: "Work in the src/lib · buildEntry area — 22 symbols across 1 files (100% cohesion)"
---

# src/lib · buildEntry

22 symbols | 1 files | 100% cohesion

## When to Use

Use this skill when working on files in:

- `src/lib/logger.server.ts`

## Key Files

| File                       | Symbols                                          |
| -------------------------- | ------------------------------------------------ |
| `src/lib/logger.server.ts` | meta, message, logger.debug, level, message, ... |

## How to Explore

```
get_communities with id: "community-82"
smart_context with task: "understand src/lib · buildEntry", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
