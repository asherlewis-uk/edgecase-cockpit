# Deployment

Cloudflare Worker and D1 setup, migrations, startup guards, environment variables, the production checklist, and native build status. Moved verbatim from the root `README.md`.

## 11. Deployment / Cloudflare / D1 setup

### wrangler.jsonc

```jsonc
{
  "name": "tanstack-start-app",
  "compatibility_date": "2025-09-24",
  "compatibility_flags": ["nodejs_compat"],
  "main": ".output/server/index.mjs",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "edgecase-cockpit",
      "database_id": "f89b278d-301f-4a98-a018-b92eeb279449",
    },
  ],
}
```

D1 is configured with a real database ID and `DB` binding. The device-local default is enforced in code — chat data is `localStorage` by default and only synced to D1 when an authenticated user explicitly enables it.

### D1 schema setup

```bash
bunx wrangler d1 migrations list edgecase-cockpit --remote
bunx wrangler d1 migrations apply edgecase-cockpit --remote
```

Tables: `users`, `user_provider_keys`, `user_settings`, `guest_sessions`, `sessions`, `threads`, `provider_stats`, `usage_records`, `vector_docs`, `rate_limits`, `pricing_cache`, `user_tool_permissions`.

### Startup guards (cold start)

`server.ts` runs at module init:

1. **`validateEnv()`** — validates `SESSION_SECRET` ≥32 chars, and validates production/D1 `ENCRYPTION_KEY` ≥32 chars; returns 503 for all requests if invalid
2. **D1 binding check** — warns if the `DB` platform binding is not available
3. **`configureRateLimiterFromEnv()`** — selects D1 or in-memory backend based on `RATE_LIMIT_BACKEND` env var
4. **`warnInMemoryRateLimitInProduction()`** — emits `console.error` if in-memory is used in production without acknowledgement
5. **`logCustomProviderPolicy()`** — logs whether custom-provider wildcard hosts are allowed or blocked

### Environment variables

| Name                          | Required                 | Purpose                                                            |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------ |
| `SESSION_SECRET`              | **Yes**                  | Encryption key for cookie sessions (≥32 chars)                     |
| `ENCRYPTION_KEY`              | **Yes in production/D1** | Dedicated AES-256-GCM key for provider key encryption (≥32 chars)  |
| `NODE_ENV`                    | No                       | Runtime environment (`development` / `production`)                 |
| `LOG_LEVEL`                   | No                       | Structured logger level                                            |
| `DB`                          | Yes (platform binding)   | Cloudflare D1 binding (configured in `wrangler.jsonc`)             |
| `RATE_LIMIT_BACKEND`          | No                       | `auto` (default), `d1`, or `memory`                                |
| `ALLOW_IN_MEMORY_RATE_LIMIT`  | Production opt-in        | Set `true` to acknowledge in-memory rate limiting in production    |
| `PROXY_ALLOW_CUSTOM_WILDCARD` | Production opt-in        | Set `true` to allow wildcard host matching for the custom provider |

### Production deployment checklist

- [ ] Set `SESSION_SECRET` to a random 32+ character string
- [ ] Set `ENCRYPTION_KEY` to a different random 32+ character string for provider key encryption
- [x] D1 database ID and `DB` binding configured in `wrangler.jsonc`
- [ ] Run `bunx wrangler d1 migrations apply edgecase-cockpit --remote` to apply one-time D1 migrations
- [ ] For multi-node strong consistency set `RATE_LIMIT_BACKEND=durable_object` and deploy the `RATE_LIMITER_DO` Durable Object; otherwise set `RATE_LIMIT_BACKEND=d1` or `ALLOW_IN_MEMORY_RATE_LIMIT=true` (single-node only)
- [ ] Confirm D1 schema includes `users`, `user_provider_keys`, `user_settings`, `threads` (with `sync_enabled`/`is_local` columns), `guest_sessions`, `sessions`, `rate_limits`, `usage_records`, `provider_stats`, `vector_docs`, `pricing_cache`, `user_tool_permissions`
- [ ] **Do not enable thread sync without reviewing privacy implications** — this writes full message content to D1 for authenticated users who opt in
- [ ] If the custom provider needs to reach arbitrary hosts, set `PROXY_ALLOW_CUSTOM_WILDCARD=true`; otherwise leave blocked
- [ ] Run `bun run test && bun run typecheck && bun run lint && bun run build` before deploying

---

## 17. Native release status (non-V1 hardening)

> This section records **status** — what is verified today and what still needs
> credentials. For the **procedure** — the exact per-target commands, the signing
> secrets each release needs, and the store submission steps — see
> [native-release.md](native-release.md). The two overlap; they have not been
> deduplicated yet.

**Native build scaffolding is verified for iOS and Android; Electron compile and native-shell are verified; full packaging/signing requires external certificates and a GUI/CI environment. Native signing, store submission, and device E2E are not V1 product promises.**

The following native packaging tooling is present in this repository:

| Item                                              | Status                               | Verified by source                                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native packaging framework (Capacitor + Electron) | ✅ Present                           | `capacitor.config.ts`, `@capacitor/*` deps, `electron` + `electron-builder` deps                                                                                                     |
| macOS build command (Electron)                    | ✅ Verified (compile + native-shell) | `bun run native:desktop:dev` builds and compiles; `npx electron-builder build` stalls in headless env but prior DMGs exist                                                           |
| macOS install/run command (Electron dev)          | ✅ Exists                            | `bun run native:desktop:dev`                                                                                                                                                         |
| macOS app bundle                                  | ✅ Verified (unsigned)               | `bun run native:desktop:package:unsigned` produces `electron/release/mac-arm64/Edgecase Cockpit.app`                                                                                 |
| macOS signing / notarization config               | ⚠️ Configured, needs secrets         | `electron-builder.yml` ready; requires `CSC_LINK`, `APPLE_ID`, etc. in CI/secrets                                                                                                    |
| iOS Xcode project (Capacitor)                     | ✅ Build verified                    | `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination generic/platform=iOS CODE_SIGNING_ALLOWED=NO build` succeeds                                                     |
| iOS bundle ID                                     | ✅ Configured                        | `uk.asherlewis.edgecase.cockpit` in `capacitor.config.ts`                                                                                                                            |
| iOS app icon / permissions                        | ✅ Configured                        | `ios/App/App/Assets.xcassets/AppIcon.appiconset/`                                                                                                                                    |
| Android Gradle project (Capacitor)                | ✅ Build verified                    | `./gradlew assembleDebug` succeeds after `bun run native:android:sync`                                                                                                               |
| Android application ID                            | ✅ Configured                        | `uk.asherlewis.edgecase.cockpit` in `capacitor.config.ts`                                                                                                                            |
| Android app icon / permissions                    | ✅ Configured                        | `android/app/src/main/res/mipmap-*/`                                                                                                                                                 |
| PWA manifest / service worker                     | ⚠️ Not present                       | PWA manifest not a V1 native target; add only if web-install is required                                                                                                             |
| Native release scripts / CI jobs                  | ✅ Scripts verified                  | `native:desktop:package:unsigned`, `native:desktop:package:signed`, `native:ios:build`, `native:ios:archive`, `native:android:assembleRelease` exist; signed CI job only needs certs |
| Automated user-flow E2E (browser)                 | ✅ Implemented                       | Playwright harness (`playwright.config.ts`, `e2e/smoke.spec.ts`); run `bun run test:e2e:install` then `bun run test:e2e`                                                             |

### What exists (native scaffolding)

```bash
# Web build + native shell generation (produces dist/client/ for Capacitor/Electron)
bun run native:build

# Capacitor iOS
bun run native:ios:sync    # Sync web assets to iOS project
bun run native:ios:open    # Open Xcode project

# Capacitor Android
bun run native:android:sync  # Sync web assets to Android project
bun run native:android:open  # Open Android Studio

# Electron desktop (macOS)
bun run native:desktop:dev   # Dev build + compile + run Electron
bun run native:desktop:build # Build + compile + package unsigned .app
```

iOS and Android native builds are verified with `CODE_SIGNING_ALLOWED=NO` / debug signing. Electron compile and native-shell generation are verified; Electron packaging (`electron-builder`) stalls in this headless environment but previously produced unsigned DMGs. Release-ready artifacts require signing certificates, provisioning profiles / keystores, and either a GUI environment or CI runner with the correct secrets.

### Verified native build commands

Commands that passed in this environment (no device launch required):

```bash
# iOS: sync assets, then build the Xcode project for arm64 without signing
bun run native:ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS' -derivedDataPath /tmp/edgecase-ios-derived CODE_SIGNING_ALLOWED=NO build

# Android: sync assets, then assemble a debug APK
bun run native:android:sync
cd android && ./gradlew assembleDebug

# Electron: build the client shell and compile the main process
bun run native:desktop:dev   # builds + compiles; GUI launch requires display
```

### Native transport configuration for local providers

The hybrid architecture requires each native platform to allow direct HTTP requests to local model daemons (localhost, 127.0.0.1, \*.local). The following configurations are in place:

| Platform                | Configuration                    | File                                       | What it does                                                                                                                       |
| ----------------------- | -------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **macOS (Electron)**    | `webRequest.onHeadersReceived`   | `electron/main.ts`                         | Injects CORS headers (`Access-Control-Allow-Origin: *`) into responses from localhost providers so `file://` origin can fetch them |
| **iOS (Capacitor)**     | `NSLocalNetworkUsageDescription` | `ios/App/App/Info.plist`                   | Explains to the user why the app needs local network access; required for LAN/loopback connections                                 |
| **iOS (Capacitor)**     | `CapacitorHttp` plugin           | `capacitor.config.ts`                      | Intercepts all `fetch` / `XMLHttpRequest` in the WebView and routes through native networking, bypassing CORS                      |
| **Android (Capacitor)** | `usesCleartextTraffic="true"`    | `android/app/src/main/AndroidManifest.xml` | Allows unencrypted HTTP traffic to localhost and local network IPs                                                                 |
| **Android (Capacitor)** | `CapacitorHttp` plugin           | `capacitor.config.ts`                      | Same as iOS — native networking bypass for WebView requests                                                                        |

**Note:** Browser/web builds cannot use local providers directly due to CORS and mixed-content restrictions. Browser users must use the proxy path for local providers, or serve the app from a secure origin with a CORS proxy.

### Native packaging framework decision

**Capacitor + Electron are already selected and installed.** Capacitor covers iOS and Android. Electron covers desktop (macOS). No additional framework selection is required.

| Framework     | Target       | Status       | Notes                              |
| ------------- | ------------ | ------------ | ---------------------------------- |
| **Capacitor** | iOS, Android | ✅ Installed | Xcode + Gradle projects present    |
| **Electron**  | Desktop      | ✅ Installed | macOS `.app` builds; unsigned only |
