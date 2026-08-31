---
name: gortex-src-lib-callproviderchatviaproxy
description: "Work in the src/lib · callProviderChatViaProxy area — 44 symbols across 1 files (91% cohesion)"
---

# src/lib · callProviderChatViaProxy

44 symbols | 1 files | 91% cohesion

## When to Use

Use this skill when working on files in:

- `src/lib/providers.ts`

## Key Files

| File                   | Symbols                                    |
| ---------------------- | ------------------------------------------ |
| `src/lib/providers.ts` | signal, tools, line, text, retryAfter, ... |

## Entry Points

- `src/lib/providers.ts::callProviderChatViaProxy`

## Connected Communities

- **src/lib · callProviderChat** (1 cross-edges)
- **src/lib · syncTokenUsageToServer** (1 cross-edges)

## How to Explore

```
get_communities with id: "community-89"
smart_context with task: "understand src/lib · callProviderChatViaProxy", format: "gcx"
find_usages with id: "src/lib/providers.ts::callProviderChatViaProxy", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
