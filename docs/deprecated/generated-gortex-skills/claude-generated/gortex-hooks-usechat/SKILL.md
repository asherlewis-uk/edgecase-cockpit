---
name: gortex-hooks-usechat
description: "Work in the hooks · useChat area — 67 symbols across 2 files (99% cohesion)"
---

# hooks · useChat

67 symbols | 2 files | 99% cohesion

## When to Use

Use this skill when working on files in:

- `src/hooks/use-chat.test.ts`
- `src/hooks/use-chat.ts`

## Key Files

| File                         | Symbols                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `src/hooks/use-chat.test.ts` | selector, randomUUID, useStore                                     |
| `src/hooks/use-chat.ts`      | setCooldownUntil, count, setRagError, cooldownUntil, activeId, ... |

## Entry Points

- `src/hooks/use-chat.ts::useChat`

## How to Explore

```
get_communities with id: "community-43"
smart_context with task: "understand hooks · useChat", format: "gcx"
find_usages with id: "src/hooks/use-chat.ts::useChat", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
