---
name: gortex-src-lib-getdocs
description: "Work in the src/lib · getDocs area — 32 symbols across 1 files (91% cohesion)"
---

# src/lib · getDocs

32 symbols | 1 files | 91% cohesion

## When to Use

Use this skill when working on files in:

- `src/lib/vector-store.ts`

## Key Files

| File                      | Symbols                                          |
| ------------------------- | ------------------------------------------------ |
| `src/lib/vector-store.ts` | b, addVectorDocs, docs, dot, queryEmbedding, ... |

## Connected Communities

- **src/lib · readArr** (1 cross-edges)
- **src/lib · persist** (1 cross-edges)

## How to Explore

```
get_communities with id: "community-119"
smart_context with task: "understand src/lib · getDocs", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
