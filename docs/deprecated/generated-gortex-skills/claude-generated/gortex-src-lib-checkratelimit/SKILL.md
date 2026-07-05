---
name: gortex-src-lib-checkratelimit
description: "Work in the src/lib · checkRateLimit area — 22 symbols across 2 files (99% cohesion)"
---

# src/lib · checkRateLimit

22 symbols | 2 files | 99% cohesion

## When to Use

Use this skill when working on files in:
- `src/lib/cockpit-store.test.ts`
- `src/lib/rate-limit.server.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/cockpit-store.test.ts` | key, index |
| `src/lib/rate-limit.server.ts` | key, sessionId, checkRateLimit, statsRateLimit, usageRateLimit, ... |

## How to Explore

```
get_communities with id: "community-88"
smart_context with task: "understand src/lib · checkRateLimit", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
