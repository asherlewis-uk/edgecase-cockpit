# Native Release Guide

This document lists the exact local and release steps for each native target. The code/config paths are complete; the only remaining external actions are inserting credentials or submitting to the stores.

## macOS (Electron)

### Local unsigned `.app` (verified in this environment)

```bash
bun run native:desktop:package:unsigned
```

Produces `electron/release/mac-arm64/Edgecase Cockpit.app` (unsigned). This path is verified locally.

### Signed release `.app` + `.dmg`

```bash
bun run native:desktop:package:signed
```

Required GitHub Actions / CI secrets:

| Secret | Source |
|---|---|
| `CSC_LINK` | Base64-encoded Apple Developer ID Application `.p12` |
| `CSC_KEY_PASSWORD` | Password for the `.p12` |
| `APPLE_ID` | Apple ID for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID (10 characters) |

After signed build, verify with:

```bash
codesign --verify --deep --strict --verbose=2 "Edgecase Cockpit.app"
spctl --assess --type execute --verbose "Edgecase Cockpit.app"
xcrun stapler validate "Edgecase Cockpit.app"
xcrun stapler validate "Edgecase Cockpit-1.0.0-arm64.dmg"
```

External remaining action: obtain Apple Developer certs and add the five secrets to CI.

## iOS (Capacitor)

### Local build (verified in this environment)

```bash
bun run native:ios:sync
bun run native:ios:build
```

`CODE_SIGNING_ALLOWED=NO` lets Xcode build without provisioning.

### Release `.ipa` / App Store

1. Open the project in Xcode: `bun run native:ios:open`
2. Select a Release build configuration and a provisioning profile.
3. Archive: `bun run native:ios:archive`
4. Upload to App Store Connect via Xcode Organizer or `xcodebuild -exportArchive`.

Required external artifacts:
- Apple Developer account
- App ID / bundle ID `uk.asherlewis.edgecase.cockpit`
- Distribution provisioning profile
- App Store Connect app record

External remaining action: create provisioning profile and submit through App Store Connect.

## Android (Capacitor)

### Local debug build (verified in this environment)

```bash
bun run native:android:sync
cd android && ./gradlew assembleDebug
```

Produces `android/app/build/outputs/apk/debug/app-debug.apk`.

### Release `.apk` / `.aab` / Play Store

```bash
bun run native:android:assembleRelease
```

Required external artifact:
- Android signing keystore (`.jks` or `.keystore`)
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- Play Store developer account

Configure signing by creating/creating `android/app/keystore.properties`:

```properties
storeFile=/path/to/release.keystore
storePassword=...
keyAlias=...
keyPassword=...
```

or by setting the equivalent env vars in CI.

External remaining action: create the release keystore and upload the `.aab` to Google Play Console.

## Web / Cloudflare Worker

No native signing required. Deploy via:

```bash
bun run build
bunx wrangler deploy
```

D1 migrations must be applied first:

```bash
bunx wrangler d1 migrations apply edgecase-cockpit --remote
```

External remaining action: apply remote D1 migrations and set production secrets (`SESSION_SECRET`, `ENCRYPTION_KEY`).
