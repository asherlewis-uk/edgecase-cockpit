---
name: gortex-api-proxy
description: "Work in the api/proxy area — 43 symbols across 1 files (95% cohesion)"
---

# api/proxy

43 symbols | 1 files | 95% cohesion

## When to Use

Use this skill when working on files in:
- `src/routes/api/proxy/chat.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/routes/api/proxy/chat.ts` | rl, e, h, tools, messages, ... |

## Entry Points

- `src/routes/api/proxy/chat.ts::handlers.POST@102`

## How to Explore

```
get_communities with id: "community-128"
smart_context with task: "understand api/proxy", format: "gcx"
find_usages with id: "src/routes/api/proxy/chat.ts::handlers.POST@102", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
