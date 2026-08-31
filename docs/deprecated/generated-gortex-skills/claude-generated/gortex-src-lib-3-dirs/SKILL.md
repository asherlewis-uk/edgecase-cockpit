---
name: gortex-src-lib-3-dirs
description: "Work in the src/lib +3 dirs area — 96 symbols across 6 files (89% cohesion)"
---

# src/lib +3 dirs

96 symbols | 6 files | 89% cohesion

## When to Use

Use this skill when working on files in:

- `src/components/cockpit/settings/ProviderCard.tsx`
- `src/lib/cockpit-store.ts`
- `src/lib/embeddings.ts`
- `src/lib/providers.ts`
- `src/routes/settings.tsx`
- `src/server.ts`

## Key Files

| File                                               | Symbols                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `src/components/cockpit/settings/ProviderCard.tsx` | keyDraft, settings, setKeyDraft, saveKey, saveKey, ...            |
| `src/lib/cockpit-store.ts`                         | csrfHeaders, hydrate, v, syncTokenUsageToServer, T, ...           |
| `src/lib/embeddings.ts`                            | res, model, embedTexts, json, texts, ...                          |
| `src/lib/providers.ts`                             | p, e, blob, transcribeAudioViaProxy, res, ...                     |
| `src/routes/settings.tsx`                          | ProviderCard, saving, pinned, setKeyDraft, ready, ...             |
| `src/server.ts`                                    | isDocument, brandedErrorResponse, normalized, body, response, ... |

## Entry Points

- `src/components/cockpit/settings/ProviderCard.tsx::ProviderCard`
- `src/routes/settings.tsx::ProviderCard`

## Connected Communities

- **src/lib · persist** (5 cross-edges)
- **src/lib · readArr** (2 cross-edges)
- **src/lib · normalizeProfile** (2 cross-edges)

## How to Explore

```
get_communities with id: "community-57"
smart_context with task: "understand src/lib +3 dirs", format: "gcx"
find_usages with id: "src/components/cockpit/settings/ProviderCard.tsx::ProviderCard", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
