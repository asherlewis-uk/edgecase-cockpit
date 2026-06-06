# Cockpit UI Walkthrough — Video Catalog

## Video Metadata

| Field | Value |
|-------|-------|
| **Filename** | `A4BB9E7E-8C7D-44F7-B9E0-20577042921D_FullSizeRender.mov` |
| **Duration** | ~38.8 seconds |
| **Frames Extracted** | 21 |
| **Resolution** | 400 x 688 (mobile portrait) |
| **App Name** | Cockpit |
| **Theme** | Dark mode |

---

## Directory Structure

```
./design-reference/edgecase-cockpit-video-catalog/
├── frames/
│   ├── 0000_00s_dashboard-overview.png
│   ├── 0001_01s_hamburger-hover.png
│   ├── 0002_02s_sidebar-opening.png
│   ├── 0003_03s_sidebar-cockpit-menu.png
│   ├── 0004_05s_sidebar-stable.png
│   ├── 0005_09s_main-view-closing.png
│   ├── 0006_10s_images-empty-state.png
│   ├── 0007_11s_hamburger-hover-return.png
│   ├── 0008_13s_sidebar-open-bottombar.png
│   ├── 0009_15s_providers-page.png
│   ├── 0010_17s_dashboard-return.png
│   ├── 0011_20s_screenshot-btn-hover.png
│   ├── 0012_24s_image-upload-active.png
│   ├── 0013_25s_file-picker-dialog.png
│   ├── 0014_27s_file-picker-stable.png
│   ├── 0015_29s_voice-btn-pink.png
│   ├── 0016_31s_voice-btn-red.png
│   ├── 0017_33s_voice-btn-yellow.png
│   ├── 0018_35s_image-icon-focus-ring.png
│   ├── 0019_36s_screenshot-selection-mode.png
│   └── 0020_38s_final-frame.png
├── states/
│   ├── 01-first-load/
│   ├── 02-dashboard-overview/
│   ├── 03-sidebar-navigation/
│   ├── 04-images-section/
│   ├── 05-providers-page/
│   ├── 06-interaction-states/
│   ├── 07-voice-input/
│   ├── 08-modal-dialog/
│   └── 09-screenshot-tool/
└── notes/
    ├── video-catalog.md
    ├── video-catalog.json
    └── agent-summary.md
```

---

## Chronological Frame Table

| # | Timestamp | Frame File | UI State | Visible Components | Design Token Observations | Interaction / State Notes |
|---|-----------|------------|----------|-------------------|--------------------------|---------------------------|
| 0 | 00s | `frames/0000_00s_dashboard-overview.png` | Dashboard overview (empty) | Centered starburst logo, "Ask away, friend!" headline, subtext "Routing through OpenAI · gpt-4o-mini", yellow warning pill "No API key set for OpenAI", bottom input bar with image icon, mic icon, voice wave button, hamburger menu (top-left), provider selector (top-center), screenshot button (top-right) | Deep black (#0A0A0A) void background; top gradient glow shifts between teal and warm amber; centered 4-point starburst with teal core and warm amber tips; text in white and muted gray; warning pill uses yellow (#F5A623) text on transparent with yellow border; input bar has rounded pill shape with dark gray surface; voice button cycles cyan → green → amber | Initial app load state. No API key configured. Hamburger menu shows blue notification dot. Input bar has image upload, mic, and voice input buttons. Bottom disclaimer text in muted gray. |
| 1 | 01s | `frames/0001_01s_hamburger-hover.png` | Hamburger hover | Same dashboard + cursor hovering hamburger menu | Hamburger icon gets subtle lighter background on hover | Hover state reveals interactive feedback. Cursor visible indicating user interaction. |
| 2 | 02s | `frames/0002_02s_sidebar-opening.png` | Sidebar opening (transition) | Dashboard dimming, sidebar sliding in from left, "Cockpit" header visible at top of sidebar | Background dims with semi-transparent overlay; sidebar slides with smooth easing | Transition animation — sidebar is entering. The main content area darkens. |
| 3 | 03s | `frames/0003_03s_sidebar-cockpit-menu.png` | Sidebar fully open — Cockpit menu | Full sidebar overlay: "Cockpit" title with close (X) button, "New chat" button, "Search chats", "Images", "Videos", "Library", "Providers" menu items with icons, "Recent" section with "Filter recent..." input, "No chats yet" empty state, bottom bar: "OpenAI · set API key" warning pill + settings gear + agent card "friend / OpenAI" with avatar | Sidebar uses pure black (#000000) background; menu items in white with muted gray icons; "New chat" button has dark gray (#1C1C1E) pill background; section headers in muted gray; bottom bar separated by hairline border; agent avatar is teal circle with "AI" text | Fully expanded navigation sidebar. Primary navigation surface. Close button (X) top-right of sidebar. Bottom status bar shows provider warning. |
| 4 | 05s | `frames/0004_05s_sidebar-stable.png` | Sidebar stable (cursor movement) | Same fully open sidebar, cursor moving between menu items | Menu items show no visible hover highlight in this frame — flat design | Cursor exploring menu options. Stable state for documentation. |
| 5 | 09s | `frames/0005_09s_main-view-closing.png` | Sidebar closing / main view returning | Sidebar sliding out, main dashboard becoming visible again | Transition: sidebar slides left, main content brightens back | Sidebar dismissal transition. |
| 6 | 10s | `frames/0006_10s_images-empty-state.png` | Images section — empty state | "Images" header (top-left with back arrow), centered crossed-eye icon "No images yet. Drop or paste one into a chat.", "Choose a vision provider" CTA button, top still shows "OpenAI · set API key" warning | Empty state uses muted gray icon and text; CTA button has dark gray pill background; background remains deep black | Images library empty state. Back arrow navigation pattern. No images uploaded yet. |
| 7 | 11s | `frames/0007_11s_hamburger-hover-return.png` | Return to main + hamburger hover | Main dashboard with cursor on hamburger, sidebar beginning to open | Background gradient has shifted to more green/warm tone | User navigates back and reopens sidebar. |
| 8 | 13s | `frames/0008_13s_sidebar-open-bottombar.png` | Sidebar open — bottom bar detail | Full sidebar open, cursor near "Providers" menu item, bottom bar clearly visible with "OpenAI · set API key" warning + settings gear + "friend / OpenAI" agent card | Bottom bar is distinct surface with hairline separator; warning pill uses yellow/amber tones; settings gear icon in muted gray | Good frame for bottom bar component detail. Shows provider status + agent identity. |
| 9 | 15s | `frames/0009_15s_providers-page.png` | Providers configuration page | "Providers" header with back arrow, "DISPLAY NAME" field with "friend" value, "CLOUD PROVIDERS" section: OpenAI card (teal avatar, description, CHAT/EMBEDDINGS/VISION/TOOLS tags, API key input, "Save" button, "Model · default gpt-4o-mini" selector, "Needs API key" warning, "Active" toggle) + Anthropic card (orange avatar, description, CHAT/VISION/TOOLS tags, API key input, "Save" button) | Provider cards use dark gray (#1C1C1E) surface with rounded corners; provider avatars use distinct brand colors (teal for OpenAI, orange for Anthropic); capability tags are small dark pills with white text; toggle switch is white with checkmark; input fields have dark backgrounds with placeholder text in muted gray; section headers use uppercase muted gray text | Full provider configuration page. Shows multi-provider architecture. Cards are stacked vertically. Each provider shows capabilities as tags. Active toggle indicates provider selection. API key inputs with security note "Keys are stored server-side only." |
| 10 | 17s | `frames/0010_17s_dashboard-return.png` | Dashboard — return from providers | Main dashboard view, cursor near hamburger, background shifted to red/magenta hue | Top gradient glow has shifted to warm red/magenta — indicates dynamic ambient lighting effect | Return navigation. The gradient color shifts are a notable visual effect. |
| 11 | 20s | `frames/0011_20s_screenshot-btn-hover.png` | Screenshot button hover | Main dashboard, cursor hovering screenshot button (top-right), button has lighter circular background | Screenshot button (dashed square icon) gets subtle highlight on hover | Hover interaction on fullscreen/screenshot tool. |
| 12 | 24s | `frames/0012_24s_image-upload-active.png` | Image upload button active | Main dashboard, cursor on image upload button (bottom-left of input bar), voice button is green/cyan | Image icon in input bar shows active/highlighted state; voice button cycles through colors (cyan/green) | Image upload interaction. Button in bottom input bar. |
| 13 | 25s | `frames/0013_25s_file-picker-dialog.png` | File picker dialog (macOS) | macOS file picker overlay: left sidebar with Recents, Shared, Favorites (Desktop, Documents, Downloads, Applications, iCloud Drive, user folder, Macintosh HD), main area shows files grouped by "Today" and "Yesterday", "Show Options" button at bottom | Native macOS dark mode file picker; uses system translucency/blur; file list with icons; sidebar uses system folder icons | System modal dialog overlay. Shows file selection capability. The app dark theme blends with macOS dark mode. |
| 14 | 27s | `frames/0014_27s_file-picker-stable.png` | File picker stable | Same macOS file picker, cursor near "Show Options" button | Stable state of file dialog | Good reference for modal overlay styling. |
| 15 | 29s | `frames/0015_29s_voice-btn-pink.png` | Voice button — pink state | Main dashboard, voice button in bottom-right is pink/magenta | Voice button: pink/magenta (#FF2D92) circular button with white waveform icon | Voice input button color cycle — pink phase. The button color cycles continuously. |
| 16 | 31s | `frames/0016_31s_voice-btn-red.png` | Voice button — red state | Main dashboard, voice button is red/orange | Voice button: red/orange (#FF3B30) circular button with white waveform icon | Voice input button color cycle — red phase. |
| 17 | 33s | `frames/0017_33s_voice-btn-yellow.png` | Voice button — yellow state | Main dashboard, voice button is yellow/green, background gradient is green | Voice button: yellow/lime (#C8E600) circular button; background gradient glow shifted to green | Voice input button color cycle — yellow phase. Background gradient shifts with button color. |
| 18 | 35s | `frames/0018_35s_image-icon-focus-ring.png` | Image icon — focus ring | Main dashboard, image upload button has orange focus ring (indicating keyboard focus or screenshot tool targeting) | Image icon button has orange (#FF9500) circular focus ring outline | Focus state for accessibility/screenshot tool. Orange ring indicates focused element. |
| 19 | 36s | `frames/0019_36s_screenshot-selection-mode.png` | Screenshot selection mode | Main dashboard with dashed border (marching ants) around viewport, image icon still has orange focus ring | Screenshot tool adds dashed animated border (marching ants) around the window | Screenshot selection mode active. The dashed border is the selection indicator. |
| 20 | 38s | `frames/0020_38s_final-frame.png` | Final frame — stable dashboard | Main dashboard in default state, voice button cyan, all elements stable | Return to baseline state | End of walkthrough. Baseline reference frame. |

---

## Design Token Candidates

### Background / Void Colors

| Token | Value | Source | Usage |
|-------|-------|--------|-------|
| `--bg-void` | `#0A0A0A` | Dashboard background | Primary app background |
| `--bg-sidebar` | `#000000` | Sidebar panel | Navigation panel background |
| `--bg-surface` | `#1C1C1E` | Cards, input bar, buttons | Elevated surfaces |
| `--bg-overlay` | `rgba(0,0,0,0.6)` | Modal backdrop | Dimming overlay |

### Panel / Card Colors

| Token | Value | Source | Usage |
|-------|-------|--------|-------|
| `--card-bg` | `#1C1C1E` | Provider cards | Card backgrounds |
| `--card-border` | `#2C2C2E` | Card edges | Subtle card borders |
| `--input-bg` | `#2C2C2E` | Text inputs | Input field backgrounds |

### Border and Hairline Colors

| Token | Value | Source | Usage |
|-------|-------|--------|-------|
| `--border-hairline` | `#38383A` | Section dividers | Thin separators |
| `--border-warning` | `#F5A623` | Warning pill border | Alert outlines |
| `--border-focus` | `#FF9500` | Focus ring | Accessibility focus |

### Metal / Chrome / Glass Effects

The UI does **not** currently exhibit strong metal/chrome/glass effects. It uses flat dark surfaces. However, these effects could enhance the "cockpit" metaphor:

- **Suggested**: Subtle inner shadows on panels for depth
- **Suggested**: Gloss highlights on interactive elements
- **Suggested**: Frosted glass blur for overlays (currently solid dark)
- **Current**: Solid flat dark surfaces with minimal depth

### Text Hierarchy

| Token | Color | Size/Weight | Usage |
|-------|-------|-------------|-------|
| `--text-primary` | `#FFFFFF` | 24px/600 | Headlines ("Ask away, friend!") |
| `--text-secondary` | `#8E8E93` | 14px/400 | Subtext, descriptions |
| `--text-tertiary` | `#636366` | 12px/400 | Placeholder text, disclaimers |
| `--text-warning` | `#F5A623` | 13px/500 | Warning messages |
| `--text-link` | `#0A84FF` | 14px/500 | Interactive text (if any) |

### Accent Colors

| Token | Value | Source | Usage |
|-------|-------|--------|-------|
| `--accent-teal` | `#30D158` / `#00D4AA | Provider avatar, logo | Brand primary |
| `--accent-cyan` | `#00D4AA` | Voice button (phase 1) | Interactive accent |
| `--accent-green` | `#30D158` | Voice button (phase 2) | Success/ready state |
| `--accent-yellow` | `#C8E600` | Voice button (phase 3) | Alert/active state |
| `--accent-pink` | `#FF2D92` | Voice button (phase 4) | Recording state |
| `--accent-red` | `#FF3B30` | Voice button (phase 5) | Error/warning state |
| `--accent-orange` | `#FF9500` | Focus ring | Focus/accessibility |

### Warning / Error / Success Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--warning-text` | `#F5A623` | "No API key" warning |
| `--warning-border` | `#F5A62340` | Warning pill border |
| `--error-text` | `#FF3B30` | Error states |
| `--success-text` | `#30D158` | "Active" toggle, success |

### Shadows / Glows

| Token | Value | Usage |
|-------|-------|-------|
| `--glow-ambient` | Dynamic (teal/amber/green/pink) | Top-center gradient glow — shifts with voice button color |
| `--shadow-none` | — | The UI uses minimal shadows; depth is achieved through color contrast |

The **ambient gradient glow** at the top of the screen is a distinctive feature. It dynamically shifts colors:
- Teal/cyan (default)
- Warm amber/gold
- Green/lime
- Red/magenta
- Pink

This creates an atmospheric lighting effect that reflects the current interaction state.

### Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `8px` | Small buttons, tags |
| `--radius-md` | `12px` | Input fields, cards |
| `--radius-lg` | `16px` | Large cards, panels |
| `--radius-pill` | `9999px` | Input bar, CTA buttons, warning pills |
| `--radius-icon` | `50%` | Circular buttons, avatars |

### Spacing Rhythm

The UI appears to use an 8px grid:
- Small gaps: 8px (icon to text)
- Medium gaps: 16px (card padding)
- Large gaps: 24px (section spacing)
- The layout is vertically centered for the main content

### Animation Patterns

| Pattern | Duration | Easing | Notes |
|---------|----------|--------|-------|
| Sidebar slide | ~300ms | ease-out | Smooth left-slide transition |
| Background dim | ~200ms | ease | Semi-transparent overlay fade |
| Voice button color cycle | ~8s | linear | Continuous hue rotation through 5 colors |
| Ambient glow shift | ~8s | ease-in-out | Matches voice button color cycle |
| Hover feedback | ~150ms | ease | Subtle background lightening |
| Focus ring | instant | — | Orange ring appears immediately |

---

## Local Model Metal UI Relevance

### Does this UI already feel like a local-model cockpit?

**Partially.** The dark theme, minimal chrome, and focus on function over decoration align with cockpit aesthetics. The "Cockpit" branding itself suggests this intent. However, several elements are missing for a strong metal UI system:

### Which frames best support a local-model cockpit aesthetic?

| Frame | Support |
|-------|---------|
| `0000_00s_dashboard-overview.png` | Dark void background, minimal UI, centered prompt — feels like a command terminal |
| `0003_03s_sidebar-cockpit-menu.png` | Full navigation panel with provider status — feels like a control panel |
| `0009_15s_providers-page.png` | Provider configuration with capability tags — most "cockpit-like" frame with structured data |
| `0019_36s_screenshot-selection-mode.png` | Dashed border, technical feel |

### Which visual states should become tokens?

1. **Ambient glow system** — The dynamic top-gradient is the most distinctive visual element. Should be tokenized as a mutable gradient that responds to state.
2. **Voice button color cycle** — The 5-phase color rotation is a signature interaction. Should be a tokenized animation.
3. **Warning pill pattern** — The "No API key" pill is a reusable component for status messages.
4. **Provider card pattern** — The provider configuration cards are a core UI component.
5. **Sidebar navigation pattern** — The slide-out panel with sections.

### What is missing before this becomes a strong metal UI system?

| Missing Element | Recommendation |
|-----------------|----------------|
| **Glass/liquid surfaces** | Add subtle transparency + blur to overlays for depth |
| **Beveled edges / depth** | Current surfaces are flat; add subtle inner shadows for "machined" feel |
| **Indicator lights / LEDs** | Replace static dots with glowing status indicators (pulsing green for active, amber for warning) |
| **Monospace data display** | Provider stats, model names would benefit from monospace font |
| **Grid overlay** | Subtle technical grid on background for "radar/scope" feel |
| **Brushed metal textures** | Top bar or sidebar edges could use subtle metallic texture |
| **Gauge / meter elements** | Token usage, model load, or latency could display as circular gauges |
| **Sound design cues** | Metal clicks, servo sounds for sidebar motion |
| **CRT scanline effect** | Subtle horizontal scanlines for retro-tech aesthetic (optional) |
| **Holographic depth** | Multi-layer parallax on sidebar open for spatial depth |

---

*Generated from video analysis. Frames saved as PNG. Do not modify app source code based on this catalog alone — use for design-token extraction only.*
