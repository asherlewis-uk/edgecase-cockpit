---
name: gortex-api-keys-3-dirs
description: "Work in the api/keys +3 dirs area — 112 symbols across 10 files (88% cohesion)"
---

# api/keys +3 dirs

112 symbols | 10 files | 88% cohesion

## When to Use

Use this skill when working on files in:
- `src/lib/session.server.ts`
- `src/routes/api/keys/clear.ts`
- `src/routes/api/keys/set.ts`
- `src/routes/api/keys/status.ts`
- `src/routes/api/keys/validate.$providerId.ts`
- `src/routes/api/proxy/detect.ts`
- `src/routes/api/proxy/embeddings.ts`
- `src/routes/api/proxy/transcribe.ts`
- `src/routes/api/stats.ts`
- `src/routes/api/threads.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/session.server.ts` | getCockpitSession, s, getProviderCreds, setProviderCreds, s, ... |
| `src/routes/api/keys/clear.ts` | session, csrfCheck, body, handlers.POST, providerId, ... |
| `src/routes/api/keys/set.ts` | raw, parsed, sessionId, csrfCheck, rl, ... |
| `src/routes/api/keys/status.ts` | cfg, id, handlers.GET, s, providers |
| `src/routes/api/keys/validate.$providerId.ts` | session, providerId, rl, body, provider, ... |
| `src/routes/api/proxy/detect.ts` | rl, ok, handlers.POST, url, t, ... |
| `src/routes/api/proxy/embeddings.ts` | embeddings, upstreamBody, session, body, timer, ... |
| `src/routes/api/proxy/transcribe.ts` | txt, csrfCheck, sessionId, ctrl, headers, ... |
| `src/routes/api/stats.ts` | rl, session, session, handlers.DELETE, handlers.GET, ... |
| `src/routes/api/threads.ts` | session, threads, handlers.GET |

## Entry Points

- `src/routes/api/proxy/embeddings.ts::handlers.POST@16`
- `src/routes/api/proxy/transcribe.ts::handlers.POST@15`
- `src/routes/api/proxy/detect.ts::handlers.POST@17`
- `src/routes/api/keys/set.ts::handlers.POST@22`
- `src/routes/api/keys/validate.$providerId.ts::handlers.POST@11`

## Connected Communities

- **src/lib · persist** (1 cross-edges)

## How to Explore

```
get_communities with id: "community-92"
smart_context with task: "understand api/keys +3 dirs", format: "gcx"
find_usages with id: "src/routes/api/proxy/embeddings.ts::handlers.POST@16", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
