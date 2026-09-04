---
name: gortex-components-cockpit-drawer
description: "Work in the components/cockpit · Drawer area — 40 symbols across 5 files (98% cohesion)"
---

# components/cockpit · Drawer

40 symbols | 5 files | 98% cohesion

## When to Use

Use this skill when working on files in:

- `src/components/cockpit/CommandPalette.tsx`
- `src/components/cockpit/Drawer.tsx`
- `src/components/cockpit/Greeting.test.tsx`
- `src/components/cockpit/Greeting.tsx`
- `src/components/cockpit/ShortcutHelp.tsx`

## Key Files

| File                                        | Symbols                                                              |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `src/components/cockpit/CommandPalette.tsx` | id, navigate, query, id, selectProvider, ...                         |
| `src/components/cockpit/Drawer.tsx`         | assistantName, Drawer, setFilter, setSearchActive, searchActive, ... |
| `src/components/cockpit/Greeting.test.tsx`  | useNavigate                                                          |
| `src/components/cockpit/Greeting.tsx`       | navigate, Greeting                                                   |
| `src/components/cockpit/ShortcutHelp.tsx`   | enabled, ShortcutHelp, categories                                    |

## Entry Points

- `src/components/cockpit/Drawer.tsx::Drawer`
- `src/components/cockpit/CommandPalette.tsx::CommandPalette`

## How to Explore

```
get_communities with id: "community-7"
smart_context with task: "understand components/cockpit · Drawer", format: "gcx"
find_usages with id: "src/components/cockpit/Drawer.tsx::Drawer", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
