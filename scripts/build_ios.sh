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
BUNDLE_ID="app.tribes.mobile"
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

npx cap sync ios
echo -e "   ${GREEN}✅ Capacitor synced${NC}"

# ── Step 2: Patch version from package.json ───────────────────────────────────
echo ""
echo "=== Step 2: Version Patch ==="
VERSION=$(node -e "console.log(require('./package.json').version)")
# Auto-increment build number based on git commit count (like Hobbes does with Cargo.toml)
BUILD_NUMBER=$(git rev-list --count HEAD 2>/dev/null || echo "1")

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
    2>&1 | tail -5

IPA_FILE=$(find "$IPA_DIR" -name "*.ipa" -type f | head -1)
if [ -z "$IPA_FILE" ]; then
    echo -e "${RED}❌ IPA export failed${NC}"
    echo "   Check the archive in Xcode: open $ARCHIVE_PATH"
    exit 1
fi

echo -e "   ${GREEN}✅ IPA exported: $IPA_FILE${NC}"

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
