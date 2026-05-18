# Tribes iOS — Signing & TestFlight Guide

> Adapted from the [Hobbes macOS signing guide](../cai-hobbes/GUIDE_TO_APPLE_SIGNING.md) for iOS Capacitor.

## TL;DR — Get on TestFlight

```bash
# 1. Check everything is ready
npm run ios:preflight

# 2. Fix xcode-select (one-time)
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# 3. Build → Archive → Export IPA
npm run ios:build

# 4. Upload to TestFlight
npm run ios:upload
```

---

## How iOS Signing Differs from macOS

| Concept | macOS (Hobbes) | iOS (Tribes) |
|---------|---------------|--------------|
| **Build Tool** | `dx build` → `codesign` → `productbuild` | `xcodebuild archive` → `xcodebuild -exportArchive` |
| **Output** | `.app` → `.pkg` → Transporter | `.xcarchive` → `.ipa` → Transporter |
| **Code Signing** | Manual (`codesign --sign`) | Automatic (Xcode manages) |
| **Provisioning** | Manual embed (`cp embedded.provisionprofile`) | Automatic (Xcode downloads from Apple) |
| **Notarization** | Required for direct distribution | N/A (App Store handles it) |
| **Sandbox** | Must be in entitlements plist | Always sandboxed on iOS |

**Key difference:** iOS uses **Automatic Signing** through Xcode, so you don't need to manually embed provisioning profiles or call `codesign`. Xcode handles all of it with your Team ID.

---

## Certificates Needed

### For TestFlight / App Store (required)

| Certificate | Where | Status |
|------------|-------|--------|
| `Apple Distribution: DUSTIN ALAN MOORE (ABXVW6PWCW)` | Keychain | ✅ `E129685270266A8B353D5D0954EC5AAB96942AE9` |

This single certificate covers **both** iOS App Store and TestFlight. It's the same cert you use for Hobbes macOS App Store.

### For On-Device Debugging (optional)

| Certificate | Where | Status |
|------------|-------|--------|
| `Apple Development: DUSTIN ALAN MOORE (4753E57CRM)` | Keychain | ✅ `90226E6FC2E4FFBE7888F592FCCD523AE2CD5297` |

### NOT Needed for iOS

- ❌ `3rd Party Mac Developer Installer` — macOS only (for `.pkg`)
- ❌ `Developer ID Application` — macOS direct distribution only
- ❌ Notarization credentials — App Store handles this for iOS

---

## App Store Connect Setup

Before your first upload, you need to create the app in App Store Connect:

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. My Apps → **+** → New App
3. Fill in:
   - **Platform:** iOS
   - **Name:** Tribes
   - **Bundle ID:** `app.tribes.TribesApp`
   - **SKU:** `tribes-mobile-001`
   - **Primary Language:** English (U.S.)

> [!IMPORTANT]
> The Bundle ID `app.tribes.TribesApp` must be registered in your
> [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers/list).
> Go to Identifiers → **+** → App IDs → App → enter `app.tribes.TribesApp`.

---

## Build Pipeline

### Scripts (in `scripts/`)

| Script | Hobbes Equivalent | Purpose |
|--------|------------------|---------|
| `preflight.sh` | `check_mac_store_readiness.sh` | Validate environment |
| `build_ios.sh` | `build_release.sh` + `package_release.sh` | Build, archive, export IPA |
| `build_ios.sh --dev` | `build_dev.sh` | Build for connected device |
| `upload_testflight.sh` | `notarize.sh` (sort of) | Upload IPA to TestFlight |
| `generate_icons.sh` | `install_icon.sh` | Generate icon set from 1024px PNG |

### npm aliases

```bash
npm run ios:preflight    # Check environment
npm run ios:sync         # Sync Capacitor plugins to iOS
npm run ios:open         # Open in Xcode
npm run ios:build        # Full archive → IPA pipeline
npm run ios:build:dev    # Build for connected device
npm run ios:upload       # Upload IPA to TestFlight
npm run ios:icons        # Generate app icon set
```

---

## First-Time Setup Checklist

- [ ] **Xcode installed** and `xcode-select -s /Applications/Xcode.app/Contents/Developer`
- [ ] **Apple Developer membership** active ($99/year)
- [ ] **`Apple Distribution` cert** in Keychain (you have this ✅)
- [ ] **Bundle ID** registered: `app.tribes.TribesApp` in Apple Developer Portal
- [ ] **App created** in App Store Connect with matching Bundle ID
- [ ] **App icon**: 1024×1024 PNG at `assets/icon-1024.png`, then run `npm run ios:icons`
- [ ] Run `npm run ios:preflight` → all green

---

## Troubleshooting

### "xcodebuild requires Xcode"
```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

### "No account for team ABXVW6PWCW"
Open Xcode → Settings → Accounts → add your Apple ID.

### "No profiles for 'app.tribes.TribesApp'"
Xcode auto-creates these. Open the project in Xcode (`npm run ios:open`), select the App target, and under Signing & Capabilities ensure "Automatically manage signing" is checked and your team is selected.

### "Provisioning profile doesn't include NFC capability"
Go to Apple Developer Portal → Identifiers → `app.tribes.TribesApp` → enable "NFC Tag Reading" capability. Then re-download profiles (Xcode does this automatically).

### Archive succeeds but export fails
Open the `.xcarchive` in Xcode Organizer and distribute from there:
```bash
open build/ios/Tribes.xcarchive
```

---

## Sharing with Family via TestFlight

After upload:
1. Wait 15-30 minutes for App Store Connect to process the build
2. Go to [TestFlight](https://appstoreconnect.apple.com/apps) → your app → TestFlight tab
3. Add **Internal Testers** (up to 25, instant — no review needed)
4. Or create an **External Testing Group** (up to 10,000 — requires beta review)
5. Family members install **TestFlight** app from App Store → accept invite → install Tribes

---

*Team ID: ABXVW6PWCW | Bundle ID: app.tribes.TribesApp*
