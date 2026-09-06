# Next Up — native feel pass

**Tracked in Linear.** This file is a pointer, not a second backlog — put detail
in the issues, not here, so the two cannot drift.

Workspace: [asherlewis-uk](https://linear.app/asherlewis-uk) · team `ASH`

| Issue | Priority | |
|---|---|---|
| [ASH-8](https://linear.app/asherlewis-uk/issue/ASH-8) | High | Provider name collapses to zero width in chat header |
| [ASH-9](https://linear.app/asherlewis-uk/issue/ASH-9) | High | Model picker reports "No models available" for a provider that returns 12 |
| [ASH-10](https://linear.app/asherlewis-uk/issue/ASH-10) | High | Temporary chat is neither identifiable nor genuinely ephemeral |
| [ASH-11](https://linear.app/asherlewis-uk/issue/ASH-11) | Medium | Motion and transitions — native push/pop and gesture-driven drawer |

**ASH-8 goes first.** It is a regression shipped in `ef08909`, visible on device
now.

## Context that outlives the issues

Asher picked three axes for "should feel like Discord, not a webpage in a
container": web artifacts, motion and transitions, and layout/safe-areas.
Navigation IA was explicitly **not** in scope — the drawer-and-routes model
stays. Web artifacts (`4a0fa66`) and layout (`ef08909`) are done; motion is
ASH-11.

One finding worth keeping out of any single issue, because it constrains all
layout work: **`env(safe-area-inset-*)` reports 0 inside the Capacitor
WKWebView**, even with `viewport-fit=cover`. Verified on an iPhone 17 Pro
simulator by removing the floor and watching the settings header collide with
the clock; `ios.contentInset: "never"` made no difference and was reverted.
Insets therefore come from `--app-safe-top` / `--app-safe-bottom` in
`src/styles.css`, which floor `env()` via `max()`. Do not reach for bare
`env()` in new work.
