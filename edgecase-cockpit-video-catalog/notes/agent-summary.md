# Agent Summary — Cockpit UI Video Catalog

## What the video shows

A ~39-second screen recording of **Cockpit**, a dark-themed AI chat client application (mobile portrait layout, 400x688px). The user performs a UI walkthrough demonstrating:

1. **Opening the sidebar** via hamburger menu — reveals full navigation panel with "Cockpit" branding, menu items (New chat, Search chats, Images, Videos, Library, Providers), recent chats section, and a bottom status bar with provider warning + agent identity card.

2. **Navigating to Images** — shows an empty state page with crossed-eye icon and "Choose a vision provider" CTA.

3. **Opening Providers** — displays a configuration page with OpenAI and Anthropic provider cards, each showing capability tags (CHAT, VISION, TOOLS, EMBEDDINGS), API key inputs, model selectors, and an "Active" toggle.

4. **Screenshot tool interaction** — hovers the fullscreen/screenshot button, triggering a dashed marching-ants border around the viewport.

5. **Image upload flow** — clicks the image upload icon, opening a native macOS file picker dialog.

6. **Voice input button** — the circular voice button in the bottom-right continuously cycles through 5 colors (cyan → green → yellow → pink → red), synchronized with a dynamic ambient gradient glow at the top of the screen.

## Which frames matter most

| Priority | Frame | Why |
|----------|-------|-----|
| **Critical** | `0000_00s_dashboard-overview.png` | Baseline dashboard — shows all core components |
| **Critical** | `0003_03s_sidebar-cockpit-menu.png` | Full sidebar navigation — primary navigation pattern |
| **Critical** | `0009_15s_providers-page.png` | Most complex UI state — provider config with cards, tags, toggles |
| **Important** | `0006_10s_images-empty-state.png` | Empty state pattern + back navigation |
| **Important** | `0013_25s_file-picker-dialog.png` | Modal overlay + system dialog integration |
| **Important** | `0017_33s_voice-btn-yellow.png` | Best voice button color + gradient sync visible |
| **Important** | `0019_36s_screenshot-selection-mode.png` | Screenshot tool with marching ants border |
| **Reference** | `0018_35s_image-icon-focus-ring.png` | Focus ring accessibility pattern |

## What UI states were captured

- **Dashboard overview** (empty state, no API key configured)
- **Sidebar navigation** (open/closed/transition states)
- **Empty states** (images, recent chats)
- **Provider configuration** (multi-provider cards with capability tags)
- **Hover/active/focus interactions** (hamburger, screenshot button, image upload, focus ring)
- **Modal dialog** (macOS file picker overlay)
- **Voice input color cycle** (5-phase continuous animation)
- **Screenshot selection mode** (marching ants border)

## What design tokens should be extracted

### Immediate tokens:
- `bg-void` (#0A0A0A) — app background
- `bg-sidebar` (#000000) — nav panel
- `bg-surface` (#1C1C1E) — cards, input bar
- `accent-teal` (#00D4AA) — primary brand
- `accent-*` — full voice button color cycle (cyan, green, yellow, pink, red)
- `accent-orange` (#FF9500) — focus ring
- `warning-pill` pattern (transparent bg + yellow border/text)
- `radius-pill` (9999px) — heavily used for buttons and input bar
- `text-primary/secondary/tertiary` hierarchy

### Tokenized patterns:
- **Ambient glow system** — dynamic radial gradient that syncs with voice button color
- **Voice color cycle** — 8s linear animation through 5 colors
- **Sidebar transition** — 300ms ease-out slide + backdrop dim
- **Provider card** — dark surface with avatar, tags, input, toggle

## Is this a good candidate for a local-model metal UI?

**Yes — with additions.** The existing dark theme, "Cockpit" branding, minimal chrome, and technical layout (provider configs, capability tags) already align with a cockpit/control-panel aesthetic. The dynamic ambient glow is a strong foundation for a "living" metal interface.

### To strengthen the metal UI:
1. Add **glass/frosted transparency** to overlays
2. Add **subtle inner shadows/bevels** to surfaces for machined depth
3. Replace static status dots with **glowing LED indicators**
4. Use **monospace fonts** for data displays (model names, API keys)
5. Add **brushed metal textures** to top bar edges
6. Consider **CRT scanlines** or **grid overlays** for retro-tech feel
7. Add **gauge/meter components** for token usage, model load

---

*21 frames extracted across 9 state groups. Full documentation in `video-catalog.md`. Machine-readable index in `video-catalog.json`.*
