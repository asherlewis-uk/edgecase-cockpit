---
name: gortex-src-lib-5-dirs
description: "Work in the src/lib +5 dirs area — 83 symbols across 7 files (87% cohesion)"
---

# src/lib +5 dirs

83 symbols | 7 files | 87% cohesion

## When to Use

Use this skill when working on files in:

- `src/components/cockpit/settings/ProviderCard.tsx`
- `src/lib/cockpit-store.ts`
- `src/lib/vector-store.ts`
- `src/live/providers.live.test.ts`
- `src/routes/api/proxy/detect.ts`
- `src/routes/settings.tsx`
- `src/server.ts`

## Key Files

| File                                               | Symbols                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/components/cockpit/settings/ProviderCard.tsx` | saving, saveKey, clearKey, setSaving, keyDraft, ...                                                  |
| `src/lib/cockpit-store.ts`                         | map, entries, LegacyProviderKey, v, id, ...                                                          |
| `src/lib/vector-store.ts`                          | loadVectorDocsFromServer, doc, syncVectorDocToServer, json, res                                      |
| `src/live/providers.live.test.ts`                  | data, fetchFromProvider, body, headers, url, ...                                                     |
| `src/routes/api/proxy/detect.ts`                   | session, res, ctrl, handlers.POST, msg, ...                                                          |
| `src/routes/settings.tsx`                          | saveKey, pinned, cfg, clearKey, ready, ...                                                           |
| `src/server.ts`                                    | getServerEntry, normalizeCatastrophicSsrResponse, response, payload, isCatastrophicSsrErrorBody, ... |

## Entry Points

- `src/components/cockpit/settings/ProviderCard.tsx::ProviderCard`
- `src/routes/settings.tsx::ProviderCard`
- `src/routes/api/proxy/detect.ts::handlers.POST@17`

## Connected Communities

- **src/lib · persist** (3 cross-edges)

## How to Explore

```
get_communities with id: "community-165"
smart_context with task: "understand src/lib +5 dirs", format: "gcx"
find_usages with id: "src/components/cockpit/settings/ProviderCard.tsx::ProviderCard", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
