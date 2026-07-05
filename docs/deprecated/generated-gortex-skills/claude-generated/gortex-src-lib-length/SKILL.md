---
name: gortex-src-lib-length
description: "Work in the src/lib · length area — 59 symbols across 7 files (90% cohesion)"
---

# src/lib · length

59 symbols | 7 files | 90% cohesion

## When to Use

Use this skill when working on files in:
- `src/lib/cockpit-store.test.ts`
- `src/lib/cockpit-store.ts`
- `src/lib/env.server.ts`
- `src/lib/rag-proxy-integration.test.ts`
- `src/lib/storage-limits.server.ts`
- `src/lib/tools.ts`
- `src/lib/vector-store.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/cockpit-store.test.ts` | length |
| `src/lib/cockpit-store.ts` | store.getMessageCount, store.getThreadCount, store.getTotalTokens |
| `src/lib/env.server.ts` | warnings, key, missing, validateEnv, key |
| `src/lib/rag-proxy-integration.test.ts` | sanitizeArgs, args, call, validateToolCall, validateToolName, ... |
| `src/lib/storage-limits.server.ts` | LimitViolation, threads, t, message, validateMessage, ... |
| `src/lib/tools.ts` | args, parsed, executeBuiltInTool, sanitizeToolCallArgs, parsed, ... |
| `src/lib/vector-store.ts` | chunks, text, sent, chunkText, acc, ... |

## Entry Points

- `src/lib/tools.ts::executeBuiltInTool`
- `src/lib/vector-store.ts::chunkText`

## How to Explore

```
get_communities with id: "community-106"
smart_context with task: "understand src/lib · length", format: "gcx"
find_usages with id: "src/lib/tools.ts::executeBuiltInTool", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
