#!/bin/bash
# ==============================================================================
# build_ios.sh — Build and archive Tribes iOS app for TestFlight/App Store
#
# Adapted from cai-hobbes/scripts/build_release.sh for iOS Capacitor workflow.
#
# The iOS flow is fundamentally different from macOS Dioxus:
#   macOS: cargo build → patch plist → codesign → productbuild → .pkg → Transporter
#   iOS:   cap sync → xcodebuild archive → xcodebuild -exportArchive → .ipa → Transporter
#
# Usage:
#   ./scripts/build_ios.sh                  # Archive for App Store / TestFlight
#   ./scripts/build_ios.sh --dev            # Build for connected device (debug)
#   TRIBES_TEAM_ID=XXXX ./scripts/build_ios.sh  # Override team ID
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
APP_NAME="Tribes"
BUNDLE_ID="app.tribes.TribesApp"
TEAM_ID="${TRIBES_TEAM_ID:-ABXVW6PWCW}"
SCHEME="App"
WORKSPACE="ios/App/App.xcworkspace"
PROJECT="ios/App/App.xcodeproj"
ARCHIVE_DIR="build/ios"
ARCHIVE_PATH="$ARCHIVE_DIR/$APP_NAME.xcarchive"
IPA_DIR="$ARCHIVE_DIR/ipa"
EXPORT_PLIST="scripts/ExportOptions.plist"

# Parse args
BUILD_MODE="release"
if [ "$1" = "--dev" ]; then
    BUILD_MODE="dev"
fi

echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   🏔️  Tribes iOS Build Pipeline           ║${NC}"
echo -e "${CYAN}║   Mode: $(printf '%-32s' "$BUILD_MODE")║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Step 0: Ensure xcode-select points to Xcode ──────────────────────────────
ACTIVE_DEV=$(xcode-select -p 2>/dev/null || echo "")
if ! echo "$ACTIVE_DEV" | grep -q "Xcode.app"; then
    echo -e "${YELLOW}⚠️  xcode-select not pointing to Xcode.app${NC}"
    echo "   Current: $ACTIVE_DEV"
    echo "   Running: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
    sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
    echo -e "   ${GREEN}✅ Fixed${NC}"
fi

# ── Step 1: Sync Capacitor ────────────────────────────────────────────────────
echo ""
echo "=== Step 1: Capacitor Sync ==="
echo "   Syncing web assets and native plugins..."

# Create a minimal 'out' directory if it doesn't exist
# (Capacitor needs webDir to exist even in server-url mode)
mkdir -p out
if [ ! -f "out/index.html" ]; then
    echo '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=https://tribes.app"></head><body>Loading Tribes...</body></html>' > out/index.html
fi

# Generate the offline error screen
cat > out/error.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>No Connection</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #0a0a0a;
            color: #ffffff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            text-align: center;
        }
        .container { padding: 2rem; }
        h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
        p { font-size: 1rem; color: #a1a1aa; margin-bottom: 2rem; line-height: 1.5; }
        button {
            background-color: #007aff;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px 24px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            outline: none;
        }
        button:active { background-color: #0056b3; }
        svg { width: 64px; height: 64px; margin-bottom: 1.5rem; color: #007aff; }
    </style>
</head>
<body>
    <div class="container">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
        </svg>
        <h1>You are offline</h1>
        <p>Tribes requires an internet connection to securely load your encrypted communications.</p>
        <button onclick="window.location.href = 'https://tribes.app'">Try Again</button>
    </div>
</body>
</html>
EOF

npx cap sync ios
echo -e "   ${GREEN}✅ Capacitor synced${NC}"

# ── Step 2: Patch version from package.json ───────────────────────────────────
echo ""
echo "=== Step 2: Version Patch ==="
VERSION=$(node -e "console.log(require('./package.json').version)")
# Build number = max(git commit count, stored floor + 1)
# The floor file prevents regressions when git history is squashed/rebased.
GIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo "1")
FLOOR_FILE=".ios-build-floor"
FLOOR=$(cat "$FLOOR_FILE" 2>/dev/null || echo "0")
if [ "$GIT_COUNT" -gt "$FLOOR" ]; then
    BUILD_NUMBER="$GIT_COUNT"
else
    BUILD_NUMBER=$((FLOOR + 1))
fi
echo "$BUILD_NUMBER" > "$FLOOR_FILE"

echo "   Version: $VERSION (build $BUILD_NUMBER)"

# Patch Info.plist
PLIST="ios/App/App/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$PLIST" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string $VERSION" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$PLIST" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleVersion string $BUILD_NUMBER" "$PLIST"
echo -e "   ${GREEN}✅ Patched Info.plist${NC}"

# ── Step 3: Build / Archive ──────────────────────────────────────────────────
echo ""

if [ "$BUILD_MODE" = "dev" ]; then
    echo "=== Step 3: Development Build (Device) ==="
    echo "   Building for connected iOS device..."

    # Determine workspace vs project
    if [ -d "$WORKSPACE" ]; then
        BUILD_TARGET="-workspace $WORKSPACE"
    else
        BUILD_TARGET="-project $PROJECT"
    fi

    xcodebuild \
        $BUILD_TARGET \
        -scheme "$SCHEME" \
        -configuration Debug \
        -destination 'generic/platform=iOS' \
        -allowProvisioningUpdates \
        DEVELOPMENT_TEAM="$TEAM_ID" \
        CODE_SIGN_STYLE=Automatic \
        build 2>&1 | tail -5

    echo ""
    echo -e "${GREEN}✅ Development build complete!${NC}"
    echo "   Connect your device and run from Xcode:"
    echo "   npx cap open ios"
    exit 0
fi

echo "=== Step 3: Archive for TestFlight ==="
mkdir -p "$ARCHIVE_DIR"
rm -rf "$ARCHIVE_PATH"

# Determine workspace vs project
if [ -d "$WORKSPACE" ]; then
    BUILD_TARGET="-workspace $WORKSPACE"
else
    BUILD_TARGET="-project $PROJECT"
fi

echo "   Archiving..."
xcodebuild archive \
    $BUILD_TARGET \
    -scheme "$SCHEME" \
    -configuration Release \
    -archivePath "$ARCHIVE_PATH" \
    -destination 'generic/platform=iOS' \
    -allowProvisioningUpdates \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    CODE_SIGN_STYLE=Automatic \
    2>&1 | tail -5

if [ ! -d "$ARCHIVE_PATH" ]; then
    echo -e "${RED}❌ Archive failed — no .xcarchive produced${NC}"
    echo "   Try opening in Xcode for detailed errors: npx cap open ios"
    exit 1
fi
echo -e "   ${GREEN}✅ Archive created: $ARCHIVE_PATH${NC}"

# ── Step 4: Export IPA ───────────────────────────────────────────────────────
echo ""
echo "=== Step 4: Export IPA ==="
mkdir -p "$IPA_DIR"

# Generate ExportOptions.plist if it doesn't exist
if [ ! -f "$EXPORT_PLIST" ]; then
    echo "   Generating ExportOptions.plist..."
    cat > "$EXPORT_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>$TEAM_ID</string>
    <key>uploadBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
    <key>destination</key>
    <string>upload</string>
    <key>signingStyle</key>
    <string>automatic</string>
</dict>
</plist>
EOF
fi

xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$IPA_DIR" \
    -exportOptionsPlist "$EXPORT_PLIST" \
    -allowProvisioningUpdates \
    2>&1 | tail -10

EXPORT_EXIT=${PIPESTATUS[0]}

IPA_FILE=$(find "$IPA_DIR" -name "*.ipa" -type f | head -1)
if [ -n "$IPA_FILE" ]; then
    echo -e "   ${GREEN}✅ IPA exported: $IPA_FILE${NC}"
elif [ $EXPORT_EXIT -eq 0 ]; then
    # destination=upload mode: no local IPA, but upload succeeded
    echo -e "   ${GREEN}✅ Build uploaded directly to App Store Connect${NC}"
    IPA_FILE="(uploaded directly)"
else
    echo -e "${RED}❌ IPA export failed${NC}"
    echo "   Check the archive in Xcode: open $ARCHIVE_PATH"
    exit 1
fi

# ── Step 5: Verification ────────────────────────────────────────────────────
echo ""
echo "=== Step 5: Verification ==="
IPA_SIZE=$(du -h "$IPA_FILE" | cut -f1)
echo "   📱 IPA Size: $IPA_SIZE"
echo "   📦 Bundle ID: $BUNDLE_ID"
echo "   🏷️  Version: $VERSION ($BUILD_NUMBER)"
echo "   👤 Team: $TEAM_ID"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   ✅ Build Complete!                      ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "   Upload to TestFlight:"
echo "     Option A: open $IPA_FILE   (opens Transporter)"
echo "     Option B: xcrun altool --upload-app -f $IPA_FILE -t ios -u YOUR_APPLE_ID -p @keychain:AC_PASSWORD"
echo "     Option C: xcodebuild -exportArchive with 'destination=upload' (already attempted above)"
echo ""
echo "   Or open the archive in Xcode to manually upload:"
echo "     open $ARCHIVE_PATH"
