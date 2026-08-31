---
name: gortex-src-lib-validateproviderkey
description: "Work in the src/lib · validateProviderKey area — 21 symbols across 2 files (87% cohesion)"
---

# src/lib · validateProviderKey

21 symbols | 2 files | 87% cohesion

## When to Use

Use this skill when working on files in:

- `src/lib/providers.ts`
- `src/lib/validate-key.server.ts`

## Key Files

| File                             | Symbols                                                               |
| -------------------------------- | --------------------------------------------------------------------- |
| `src/lib/providers.ts`           | ProviderDef                                                           |
| `src/lib/validate-key.server.ts` | validateProviderKey, apiKey, timeout, provider, buildAuthHeaders, ... |

## How to Explore

```
get_communities with id: "community-104"
smart_context with task: "understand src/lib · validateProviderKey", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
