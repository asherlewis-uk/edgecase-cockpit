---
name: gortex-src-lib-synctokenusagetoserver
description: "Work in the src/lib · syncTokenUsageToServer area — 28 symbols across 3 files (85% cohesion)"
---

# src/lib · syncTokenUsageToServer

28 symbols | 3 files | 85% cohesion

## When to Use

Use this skill when working on files in:
- `src/lib/cockpit-store.ts`
- `src/lib/embeddings.ts`
- `src/lib/providers.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/cockpit-store.ts` | csrfHeaders, threadId, providerId, token, model, ... |
| `src/lib/embeddings.ts` | embedTexts, json, res, txt, model, ... |
| `src/lib/providers.ts` | fd, detectProvider, DetectResult, res, e, ... |

## How to Explore

```
get_communities with id: "community-86"
smart_context with task: "understand src/lib · syncTokenUsageToServer", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
