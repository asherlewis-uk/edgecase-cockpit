# Next Up — native feel pass

Queued work on the iOS shell, in priority order. Raised from device testing on
an iPhone 17 Pro (iOS 27.0) after the inset/zoom fixes in `4a0fa66` and
`ef08909` landed.

Context: Asher picked three axes for "should feel like Discord, not a webpage in
a container" — web artifacts, motion and transitions, and layout/safe-areas.
Navigation IA was explicitly **not** in scope; the drawer-and-routes model
stays. Web artifacts and layout are done. Motion is item 1 below.

---

## 1. Motion and transitions

The last of the three axes, still untouched.

- Route changes swap instantly, like page loads. They should push and pop with
  iOS timing.
- The drawer snaps open/closed instead of tracking the finger. It should be
  gesture-driven, with velocity-based settling.
- Everything gated behind `prefers-reduced-motion` — the codebase already
  threads a `reduceMotion` flag through `src/routes/index.tsx`, so follow that.

## 2. Model picker reports "No models available (using default)"

`src/components/cockpit/ModelPicker.tsx` renders
`⚠️ NO MODELS AVAILABLE (USING DEFAULT)` and lists only the single configured
model, for a provider whose settings panel simultaneously reports
**12 usable models** from the same base URL.

Two code paths disagree about the same provider:

- The settings capability probe (`ProviderCard.tsx`, the "Check models" button)
  hits the provider's `modelsPath` and got `HTTP 200` with 12 models
  (`glm-5.3-flash:cloud`, `deepseek-v4-flash:0731-cloud`, …).
- `ModelPicker`'s own fetch comes back empty.

Start by diffing the two request paths — base URL joining, auth header, and
whether the picker's fetch goes through `apiFetch` (and so the Worker) while the
probe goes direct. Reproduced with a Custom (OpenAI-compatible) provider
pointed at `https://ollama.mcplinux.dev`.

## 3. Temporary chat is not identifiable, and is not truly ephemeral

Two distinct problems under one feature:

- **Visually indistinguishable.** Toggling temporary chat changes almost
  nothing on screen. It should blur the background so the mode is unmistakable
  at a glance.
- **Not actually ephemeral.** Right now "temporary" is a flag
  (`store.setThreadTemporary`) on a thread that still lives in the main store.
  It should genuinely be out of main-thread memory access, not merely marked as
  excluded from persistence. Treat the current behaviour as unproven and verify
  what is actually retained before designing the fix.

## 4. Provider name collapses to zero width in the chat header

A regression from `ef08909`. Adding `min-w-0` + `truncate` to the provider
button in `src/routes/index.tsx` let flex shrink the label to nothing when the
name is long and the model pill is wide — the header renders as
`[☰] [Cu ⌄] [deepseek-v4-flas… ⌄]` with the provider name entirely gone.

Truncating was correct (it previously wrapped to three lines and overlapped the
camera button); the fix is to stop it collapsing past legibility. Give the label
a sensible `min-w`, or cap the model pill so the provider name wins the
remaining space.
