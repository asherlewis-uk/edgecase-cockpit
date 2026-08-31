---
name: gortex-src-lib-callproviderchat
description: "Work in the src/lib · callProviderChat area — 41 symbols across 1 files (90% cohesion)"
---

# src/lib · callProviderChat

41 symbols | 1 files | 90% cohesion

## When to Use

Use this skill when working on files in:

- `src/lib/providers.ts`

## Key Files

| File                   | Symbols                                              |
| ---------------------- | ---------------------------------------------------- |
| `src/lib/providers.ts` | reader, signal, ProviderCallOpts, decoder, body, ... |

## Entry Points

- `src/lib/providers.ts::callProviderChat`

## Connected Communities

- **src/lib · callProviderChatViaProxy** (2 cross-edges)
- **src/lib · buildBody** (1 cross-edges)

## How to Explore

```
get_communities with id: "community-88"
smart_context with task: "understand src/lib · callProviderChat", format: "gcx"
find_usages with id: "src/lib/providers.ts::callProviderChat", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
