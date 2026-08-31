---
name: gortex-src-lib-validateimportpayload
description: "Work in the src/lib · validateImportPayload area — 32 symbols across 4 files (87% cohesion)"
---

# src/lib · validateImportPayload

32 symbols | 4 files | 87% cohesion

## When to Use

Use this skill when working on files in:

- `src/lib/cockpit-store.test.ts`
- `src/lib/cockpit-store.ts`
- `src/lib/env.server.ts`
- `src/lib/storage-limits.server.ts`

## Key Files

| File                               | Symbols                                                           |
| ---------------------------------- | ----------------------------------------------------------------- |
| `src/lib/cockpit-store.test.ts`    | length                                                            |
| `src/lib/cockpit-store.ts`         | store.getThreadCount, store.getMessageCount, store.getTotalTokens |
| `src/lib/env.server.ts`            | validateEnv, key, warnings, key, missing                          |
| `src/lib/storage-limits.server.ts` | violation, validateMessages, m, getStorageLimits, limits, ...     |

## How to Explore

```
get_communities with id: "community-94"
smart_context with task: "understand src/lib · validateImportPayload", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
