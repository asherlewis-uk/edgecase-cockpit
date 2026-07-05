---
name: gortex-src-lib-1-dirs-validatecsrftoken
description: "Work in the src/lib +1 dirs · validateCsrfToken area — 24 symbols across 2 files (84% cohesion)"
---

# src/lib +1 dirs · validateCsrfToken

24 symbols | 2 files | 84% cohesion

## When to Use

Use this skill when working on files in:
- `src/lib/csrf.server.ts`
- `src/routes/api/threads.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/csrf.server.ts` | a, headerToken, header, method, cookieToken, ... |
| `src/routes/api/threads.ts` | deleted, session, rl, parsed, handlers.DELETE, ... |

## Entry Points

- `src/routes/api/threads.ts::handlers.DELETE@128`

## How to Explore

```
get_communities with id: "community-66"
smart_context with task: "understand src/lib +1 dirs · validateCsrfToken", format: "gcx"
find_usages with id: "src/routes/api/threads.ts::handlers.DELETE@128", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
