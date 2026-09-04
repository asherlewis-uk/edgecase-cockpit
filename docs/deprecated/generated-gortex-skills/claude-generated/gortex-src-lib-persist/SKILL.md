---
name: gortex-src-lib-persist
description: "Work in the src/lib · persist area — 80 symbols across 3 files (90% cohesion)"
---

# src/lib · persist

80 symbols | 3 files | 90% cohesion

## When to Use

Use this skill when working on files in:

- `src/lib/cockpit-store.test.ts`
- `src/lib/cockpit-store.ts`
- `src/lib/tokens.ts`

## Key Files

| File                            | Symbols                                               |
| ------------------------------- | ----------------------------------------------------- |
| `src/lib/cockpit-store.test.ts` | value, setItem, hex, key, randomUUID                  |
| `src/lib/cockpit-store.ts`      | id, id, store.newThread, target, store.pinThread, ... |
| `src/lib/tokens.ts`             | overrides, setCostOverrides                           |

## Connected Communities

- **src/lib · normalizeProfile** (5 cross-edges)
- **src/lib · readArr** (2 cross-edges)
- **src/lib +5 dirs** (2 cross-edges)

## How to Explore

```
get_communities with id: "community-51"
smart_context with task: "understand src/lib · persist", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
