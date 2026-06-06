# Product Direction

## 1. Product Summary

edgecase-cockpit is becoming a personal local-AI control surface: one calm interface for running, selecting, monitoring, and conversing with model providers. It should let one user move between local and cloud models without needing terminal windows, provider-specific dashboards, or scattered setup tools.

The product should stay conversation-first. The prompt surface is the main working area, while provider readiness, model identity, API-key state, media tools, and navigation remain close enough to be discoverable without becoming the center of gravity.

The interface should feel lightweight, immediate, and spatially aware. It should act like an atmospheric layer above the user's normal device environment: dark, translucent, readable, and responsive, with controls that float over a calm canvas rather than filling the screen with heavy dashboard chrome.

The current visual baseline is the catalogue in `edgecase-cockpit-video-catalog/notes/video-catalog.md`. Its important states include first load, main prompt surface, sidebar navigation, images area, providers page, upload flow, voice input color cycling, focus states, warning states, and screenshot mode.

## 2. Primary User

The primary user runs or evaluates multiple AI providers and wants a single interface for daily AI work. They may use OpenAI, Anthropic, local models, vision-capable models, voice input, image uploads, generated media, and future model telemetry.

They want local-first control where possible, but they also need cloud providers to remain easy to configure and switch. They care about knowing which provider and model are active, whether credentials are missing, and what the system is ready to do before they send a request.

They prefer a calm cockpit over scattered terminals, provider consoles, model launchers, image tools, and chat windows. The app should make model activity understandable without demanding that the user think like an operations team.

## 3. Core Jobs

- Start a conversation quickly from the main prompt surface.
- See which provider and model are currently active.
- Detect missing provider setup before a request fails.
- Configure provider credentials safely.
- Switch between cloud and local providers.
- Upload or capture images.
- Review generated or attached media.
- Use voice input.
- Keep navigation simple.
- Surface warnings without disrupting flow.

## 4. Visual System Direction

Preserve the current dark, calm, colorful feel from the video catalogue. The UI should emphasize depth, translucency, soft ambient color, floating controls, and readable surfaces. It should not become industrial chrome, neon clutter, gamer styling, dense enterprise panels, or a generic template aesthetic.

Implementation-ready visual language:

- Use translucent dark surfaces for the shell, prompt bar, sidebar, provider cards, media surfaces, and modal overlays.
- Use blurred backdrops behind overlays and floating panels so the app feels spatially layered.
- Use soft edge highlights and low-contrast hairlines to separate surfaces from the canvas.
- Use subtle inner shadows to create depth without making components look heavy.
- Keep ambient gradient lighting as a signature state layer, especially around the main prompt surface and voice states.
- Use floating pill controls for provider status, warnings, primary prompt-adjacent tools, and compact CTAs.
- Keep motion restrained and purposeful: sidebar slide, backdrop dim, hover response, focus ring, screenshot selection, voice-state cycling, and provider status changes.
- Use colorful state indicators for active provider, missing setup, voice activity, focus, media capture, success, warning, and error.
- Maintain strong legibility over variable backgrounds with stable text colors, adequate contrast, and predictable surface opacity.

Catalogue states that should remain first-class visual references:

- First load and dashboard overview: dark canvas, ambient glow, centered prompt identity, active provider/model line, API-key warning, bottom prompt controls.
- Sidebar navigation: slide-in panel, dimmed background, simple navigation, recent-chat area, bottom provider status.
- Images area: empty state, media CTA, provider dependency surfaced without alarm.
- Providers page: provider cards, credentials, model selector, capability tags, active toggle, warning state.
- Upload flow: image button active state and native file picker overlay compatibility.
- Voice input: cycling cyan, green, yellow, pink, and red button states with matching ambient energy.
- Focus and screenshot states: orange focus ring and dashed screenshot selection mode.

## 5. Token Strategy

Token foundations should come before broad component redesign. The app should have token families for:

- Base canvas tokens: near-black void, background gradients, page-level text colors.
- Translucent surface tokens: shell glass, prompt glass, sidebar glass, modal glass, overlay scrim.
- Elevated panel tokens: provider cards, media cards, menus, drawers, dialogs, input fields.
- Border and hairline tokens: subtle separators, edge highlights, card borders, sidebar dividers.
- Glow and accent tokens: ambient light, logo/starburst accents, interactive highlights, hover light.
- Provider status tokens: active, inactive, unavailable, missing credentials, local ready, cloud ready.
- Warning, error, and success tokens: text, border, fill, icon, and glow variants for each severity.
- Focus tokens: keyboard focus ring, screenshot-target focus, hover focus, reduced-motion-safe focus.
- Voice-state tokens: idle, listening, recording, transcribing, sending, muted, unavailable.
- Media-state tokens: empty, attached, uploading, processing, generated, failed, selected.
- Motion and easing tokens: sidebar slide, backdrop fade, hover response, status transition, voice cycle.
- Blur and saturation tokens: backdrop blur, surface blur, elevated blur, ambient saturation.

Token names should describe product semantics first and raw color second. For example, prefer provider and state names such as `provider.warning.border`, `voice.recording.fill`, or `surface.prompt.background` over generic one-off color names.

## 6. Interaction Principles

- Primary actions stay close to the prompt input.
- Provider status should always be discoverable.
- Settings should feel secondary, not dominant.
- Warnings should be visible but not alarming.
- Media flows should be simple and direct.
- Sidebar is navigation, not the main product.
- Motion should communicate state, not decorate randomly.
- Provider setup should explain readiness without blocking unrelated exploration.
- Local and cloud provider switching should feel like routing a conversation, not administering infrastructure.
- Voice, image, and screenshot tools should be available where the user is already composing.

## 7. Non-Goals

- Large multipanel enterprise dashboards.
- Excessive terminal aesthetics.
- Aggressive sci-fi ornamentation.
- Opaque black boxes everywhere.
- Cluttered metrics before the core chat and provider flow is excellent.
- Redesigning every component before token foundations are stable.
- A generic chatbot clone.
- A developer IDE.
- A model benchmark suite only.
- A provider settings page with chat attached.
- A cyberpunk theme experiment.

## 8. Near-Term Implementation Priorities

1. Lock design tokens.
2. Apply the translucent surface model to the shell, sidebar, cards, input, and provider cards.
3. Normalize warning and provider status states.
4. Refine voice button state animation.
5. Improve media capture and review surfaces.
6. Only then add deeper local-model telemetry.

Implementation should proceed as small, testable passes. Do not redesign every view at once. Use the catalogue states to validate whether the app still feels like the same product while gaining a clearer token system and better state handling.

## 9. Implementation Strategy

The current TypeScript, Vite, and React app is the canonical product prototype and interaction reference. It should be completed far enough to validate the core product flow before any native rewrite is considered.

The web implementation should remain the source of truth for:

- Provider routing.
- Conversation flow.
- Settings and credential states.
- Media capture and review flows.
- Visual tokens.
- Interaction states from the video catalogue.

A future SwiftUI or AppKit client is a valid second implementation if the web shell proves too heavy for the desired device-native, translucent, atmospheric experience. That decision should be based on quality testing, not preference alone.

Quality testing should evaluate:

- Startup time.
- Input latency.
- Sidebar and panel smoothness.
- Blur and translucency performance.
- Memory usage.
- Battery and heat.
- Animation smoothness.
- Perceived native feel on Mac, iPhone, and iPad.

Do not block current product work on a Swift rewrite. First stabilize the TypeScript implementation, token system, and core interaction model.

## 10. Acceptance Criteria

This direction document is complete when another agent can read it and understand:

- What the app is for.
- What the app is not for.
- What visual system it should move toward.
- Which UI states from the catalogue matter.
- What token families need to be implemented.
- What changes should be avoided.

Future work should preserve current UI functionality, keep the existing catalogue intact, and avoid introducing a new brand name unless it is explicitly documented as optional. The app should continue to read as a polished AI operating surface for one user: a conversation-first command center, provider router, local/cloud model launcher and monitor, and media capture/review space.

## 11. Profile & Personalization Direction

Settings must let the user make the cockpit feel personal without turning provider configuration into identity management. Profile data should shape the owner-facing parts of the app, while provider setup remains a separate readiness and routing concern.

Personalization should affect the greeting, assistant label, prompt placeholder, motion preference, and ambient visual intensity. These settings should reinforce the calm cockpit feeling from the catalogue while preserving the existing provider flow.

Profile data is local-first unless a future sync feature is explicitly added. Do not persist provider API keys with profile or personalization settings.
