# Tribes Android — Signing & Play Console Testing Guide

> A companion guide to [GUIDE_TO_IOS_SIGNING.md](file:///Users/dustmoo/Sites/tribes-app-2026/GUIDE_TO_IOS_SIGNING.md) for Android Capacitor.

---

## TL;DR — Fast Testing & Release

There are two primary ways to test your Android build.

### Method A: Direct Sideloading (Fastest QA — No Store Review)
Generate a signed `.apk` file and install it directly on any Android device.
```bash
# 1. Build and compile the signed APK
npm run android:build:apk

# 2. Get the output file
# android/app/build/outputs/apk/release/app-release.apk

# 3. Share & Sideload
# Email, AirDrop, or Slack the .apk to your device, tap to install!
```

### Method B: Google Play Console (Equivalent to iOS TestFlight)
Generate a signed `.aab` (Android App Bundle) and upload it to the Play Store for internal testers.
```bash
# 1. Build the release AAB
npm run android:build

# 2. Get the output file
# android/app/build/outputs/bundle/release/app-release.aab

# 3. Upload to Play Console
# Upload the .aab to Google Play Console → Testing → Internal testing.
```

---

## Quick Comparison: iOS vs Android Testing

| Concept | iOS (Apple) | Android (Google) |
|---|---|---|
| **Local Format** | `.ipa` (Hard to install directly without enterprise certs or connected Xcode) | `.apk` (Extremely easy to share and sideload directly on any device) |
| **Store Format** | `.ipa` / `.xcarchive` | `.aab` (Android App Bundle) |
| **Instant Beta** | TestFlight Internal (Instant, up to 25 users) | Internal Testing (Instant, up to 100 users, no review required) |
| **Public Beta** | TestFlight External (Requires initial Beta App Review) | Closed Testing (Alpha) or Open Testing (Beta) (Requires review) |
| **Signing Setup** | Automatic signing via Xcode & Keychain | Configured via `android/keystore.properties` and `keys/tribes-release.keystore` |

---

## Environment & Signing Setup

Your project is already configured with release signing:
* **Keystore**: Located at `keys/tribes-release.keystore` ✅
* **Properties**: Configured at `android/keystore.properties` ✅
* **Gradle Setup**: `android/app/build.gradle` automatically loads these credentials for the `release` build type ✅

### Dependencies Required on Your Mac
To run the builds locally, you need:
1. **Android Studio** installed.
2. **Java Development Kit (JDK)**: The build script automatically detects and uses Android Studio's bundled JDK (located at `/Applications/Android Studio.app/Contents/jbr/Contents/Home`) to ensure version compatibility.
3. **Android SDK**: Automatically searches in `~/Library/Android/sdk`.

---

## Build Pipeline

### npm aliases

```bash
npm run android:sync       # Sync frontend web assets to the Android capacitor project
npm run android:copy       # Copy web assets to the Android folder
npm run android:open       # Open the project in Android Studio
npm run android:build      # Build the signed release AAB (for Google Play Console)
npm run android:build:apk  # Build the signed release APK (for direct sideloading)
```

---

## Google Play Console Step-by-Step Setup

Before uploading your first Android App Bundle (`.aab`), you need to register the app in the Google Play Console.

### 1. Register the App
1. Go to the [Google Play Console](https://play.google.com/console/).
2. Click **Create app**.
3. Fill in:
   * **App Name**: Tribes
   * **Default Language**: English (U.S.)
   * **App or Game**: App
   * **Free or Paid**: Free
4. Confirm declarations and click **Create app**.

### 2. Configure Google Play App Signing
When you upload your first AAB, Google Play will ask how you want to manage your app signing key:
* **Recommended**: Let Google manage and protect your app signing key (Google Play App Signing).
* Choose this option. Google will generate the final delivery signing key, and decrypt/re-sign your AAB when delivering custom APKs to devices. Your local `tribes-release.keystore` will act as the **Upload Key**.

### 3. Set Up Internal Testing (The TestFlight Equivalent)
Internal testing is the fastest way to distribute builds on Android because **it bypasses Google's App Review process completely**.

1. In the left menu of the Play Console, navigate to **Testing** → **Internal testing**.
2. Click the **Testers** tab:
   * Create an email list containing the Google accounts (Gmail/Workspace) of your testers.
   * Check the box next to your list to select them.
3. Click the **Releases** tab → **Create new release**.
4. Drag and drop your built bundle `app-release.aab` (located at `android/app/build/outputs/bundle/release/app-release.aab`).
5. Enter a release name (e.g., `1.0.0 (1)`) and release notes.
6. Click **Save** → **Review release** → **Start rollout to Internal testing**.

### 4. Share with Testers
1. On the **Internal testing** page, go back to the **Testers** tab.
2. Scroll down to **How testers join your test**.
3. Copy the **Web link** (looks like `https://play.google.com/apps/testing/app.tribes.TribesApp`).
4. Send this link to your internal testers:
   * They must open the link while logged into their Google account.
   * They will click **Become a tester**.
   * Then, they can click the link to download the app directly from the Google Play Store on their Android devices.

---

## Sideloading (Method A) In Detail

If you want to test your changes immediately on your device without uploading anything to Google Play Console:

1. Connect your Android phone to your Mac via USB.
2. Run:
   ```bash
   npm run android:build:apk
   ```
3. Enable **USB Debugging** on your phone (Settings → Developer Options → Enable USB Debugging).
4. Run:
   ```bash
   adb install android/app/build/outputs/apk/release/app-release.apk
   ```
   *(Or drag-and-drop the `.apk` file into an Android Emulator window, or send it to your phone via AirDrop-alternatives, email, or messaging, and tap to install).*

> [!NOTE]
> When installing an APK directly, Android will show a "Blocked by Play Protect" warning because it's self-signed. Just tap **Install anyway** to proceed.

---

## Troubleshooting & FAQ

### 1. `JAVA_HOME` or Gradle Build Errors
If you see errors about unsupported class file major/minor versions, your system Java is likely too new (e.g., Java 21) for the Gradle version currently in use.
* **Fix**: The script automatically tries to use Android Studio's bundled JDK (`/Applications/Android Studio.app/Contents/jbr/Contents/Home`). If you are running Gradle manually, ensure you point your terminal to this path:
  ```bash
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  ```

### 2. "App not installed" or "Signature mismatch"
If you already have a version of Tribes installed from a different source (e.g., a dev build built directly from Android Studio or an old APK), Android will block the installation of a new APK with the same bundle ID if the certificates do not match.
* **Fix**: Uninstall the existing Tribes app from your phone completely, then install the new build.

### 3. Testers see "App not available" in the web link
If testers open the join link and see a "404 Not Found" or "App not available" page:
* Ensure their Google account email is exactly added to the **Internal Testers** email list in Play Console.
* Ensure they are logged into *that specific Google Account* in their browser when visiting the join link.
* Ensure you clicked **Start rollout to Internal testing** on your release.

---

*Package Name / Bundle ID: `app.tribes.TribesApp` | Key Alias: `tribes-release`*
