---
name: gortex-db-1-dirs-upsertproviderstat
description: "Work in the db +1 dirs · upsertProviderStat area — 20 symbols across 2 files (97% cohesion)"
---

# db +1 dirs · upsertProviderStat

20 symbols | 2 files | 97% cohesion

## When to Use

Use this skill when working on files in:

- `src/lib/db/index.ts`
- `src/routes/api/stats.ts`

## Key Files

| File                      | Symbols                                            |
| ------------------------- | -------------------------------------------------- |
| `src/lib/db/index.ts`     | db, record, db, upsertProviderStat, kind, ...      |
| `src/routes/api/stats.ts` | csrfCheck, session, parsed, handlers.POST, rl, ... |

## Entry Points

- `src/routes/api/stats.ts::handlers.POST@36`

## How to Explore

```
get_communities with id: "community-117"
smart_context with task: "understand db +1 dirs · upsertProviderStat", format: "gcx"
find_usages with id: "src/routes/api/stats.ts::handlers.POST@36", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
