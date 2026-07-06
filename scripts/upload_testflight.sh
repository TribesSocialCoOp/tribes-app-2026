#!/bin/bash
# ==============================================================================
# upload_testflight.sh — Upload the built IPA to TestFlight via App Store Connect
#
# Adapted from cai-hobbes/scripts/notarize.sh for iOS.
# macOS uses notarytool → stapler. iOS uses altool or Transporter.
#
# Prerequisites:
#   1. Run ./scripts/build_ios.sh first to produce the .ipa
#   2. Store your App Store Connect credentials:
#      xcrun notarytool store-credentials "AC_PASSWORD" \
#        --apple-id "your@email.com" --team-id "ABXVW6PWCW" --password "app-specific-password"
#
#      OR set TRIBES_APPLE_ID and TRIBES_APP_PASSWORD env vars
#
# Usage:
#   ./scripts/upload_testflight.sh
#   TRIBES_APPLE_ID=you@email.com TRIBES_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx ./scripts/upload_testflight.sh
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

IPA_DIR="build/ios/ipa"
IPA_FILE=$(find "$IPA_DIR" -name "*.ipa" -type f -newer "$IPA_DIR" 2>/dev/null | head -1)

# Fallback: find any IPA in the directory
if [ -z "$IPA_FILE" ]; then
    IPA_FILE=$(find "$IPA_DIR" -name "*.ipa" -type f 2>/dev/null | head -1)
fi

if [ -z "$IPA_FILE" ]; then
    echo -e "${RED}❌ No IPA found in $IPA_DIR${NC}"
    echo "   Run ./scripts/build_ios.sh first."
    exit 1
fi

echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   🚀 Tribes — TestFlight Upload           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "   IPA: $IPA_FILE"
echo "   Size: $(du -h "$IPA_FILE" | cut -f1)"
# Surface which app this IPA targets (staging vs prod) so uploads aren't mixed up.
# App Store Connect routes the upload by the bundle id baked into the IPA, so this
# script is flavor-agnostic — it uploads whatever build_ios.sh / build_ios.sh
# --staging produced.
BUNDLE_IN_IPA=$(unzip -p "$IPA_FILE" 'Payload/*.app/Info.plist' 2>/dev/null \
    | plutil -extract CFBundleIdentifier raw - 2>/dev/null || echo "unknown")
echo "   Bundle ID: $BUNDLE_IN_IPA"
echo ""

# Determine upload method
APPLE_ID="${TRIBES_APPLE_ID:-}"
APP_PASSWORD="${TRIBES_APP_PASSWORD:-}"

if [ -n "$APPLE_ID" ] && [ -n "$APP_PASSWORD" ]; then
    echo "=== Uploading via xcrun altool ==="
    echo "   Apple ID: $APPLE_ID"
    echo "   This may take several minutes..."
    echo ""

    xcrun altool --upload-app \
        -f "$IPA_FILE" \
        -t ios \
        -u "$APPLE_ID" \
        -p "$APP_PASSWORD" \
        --verbose

    echo ""
    echo -e "${GREEN}✅ Upload complete!${NC}"
    echo "   Check TestFlight in App Store Connect for processing status."
    echo "   https://appstoreconnect.apple.com"

elif command -v /Applications/Transporter.app/Contents/MacOS/itms/bin/iTMSTransporter &> /dev/null || [ -d "/Applications/Transporter.app" ]; then
    echo "=== Opening in Transporter ==="
    echo "   Drag-and-drop the IPA, or it may auto-detect..."
    open -a Transporter "$IPA_FILE"

    echo ""
    echo -e "${GREEN}✅ Transporter opened with IPA${NC}"
    echo "   Click 'Deliver' in Transporter to upload."

else
    echo "=== Upload Options ==="
    echo ""
    echo "   Option 1 — Set credentials and re-run:"
    echo "     TRIBES_APPLE_ID=you@email.com \\"
    echo "     TRIBES_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \\"
    echo "     ./scripts/upload_testflight.sh"
    echo ""
    echo "   Option 2 — Install Transporter from the Mac App Store:"
    echo "     https://apps.apple.com/app/transporter/id1450874784"
    echo ""
    echo "   Option 3 — Open the archive in Xcode and use Organizer:"
    echo "     open build/ios/Tribes.xcarchive"
    echo ""
    echo "   Option 4 — Use xcrun altool directly:"
    echo "     xcrun altool --upload-app -f $IPA_FILE -t ios -u APPLE_ID -p APP_PASSWORD"
fi
