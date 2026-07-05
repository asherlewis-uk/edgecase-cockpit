---
name: gortex-src-lib-clear
description: "Work in the src/lib · clear area — 30 symbols across 5 files (92% cohesion)"
---

# src/lib · clear

30 symbols | 5 files | 92% cohesion

## When to Use

Use this skill when working on files in:
- `src/lib/cockpit-store.test.ts`
- `src/lib/platform.server.ts`
- `src/lib/proxy-guard.server.ts`
- `src/lib/rate-limit.server.ts`
- `src/lib/tools.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/cockpit-store.test.ts` | clear |
| `src/lib/platform.server.ts` | D1Database, getPlatformEnv, g, env, getDB, ... |
| `src/lib/proxy-guard.server.ts` | clearProxyGuardBuckets |
| `src/lib/rate-limit.server.ts` | now, persistAsync, key, checkLimit, count, ... |
| `src/lib/tools.ts` | reset, reset |

## How to Explore

```
get_communities with id: "community-96"
smart_context with task: "understand src/lib · clear", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
