#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# build_android.sh — Build Android release AAB for Play Store
#
# Usage:
#   ./scripts/build_android.sh                # production AAB
#   ./scripts/build_android.sh --apk          # production APK
#   ./scripts/build_android.sh --staging      # staging AAB (staging.tribes.app)
#   ./scripts/build_android.sh --staging --apk
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$PROJECT_DIR/android"

# ── Parse args ────────────────────────────────────────────────
BUILD_APK="false"
FLAVOR="production"   # gradle product flavor
for arg in "$@"; do
    case "$arg" in
        --apk)     BUILD_APK="true" ;;
        --staging) FLAVOR="staging" ;;
    esac
done
# Capitalize the flavor for gradle task names (e.g. assembleStagingRelease).
FLAVOR_CAP="$(echo "${FLAVOR:0:1}" | tr '[:lower:]' '[:upper:]')${FLAVOR:1}"
# Exporting TRIBES_ENV makes capacitor.config.ts emit the staging server.url,
# passkey origin/domains, and UA token during `npx cap sync` below.
if [ "$FLAVOR" = "staging" ]; then
    export TRIBES_ENV="staging"
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🤖 Tribes Android Build${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "   Flavor: ${YELLOW}${FLAVOR}${NC}$([ "$FLAVOR" = "staging" ] && echo "  (app.tribes.android.staging → staging.tribes.app)")"

# ── Preflight checks ──────────────────────────────────────────

# Use Android Studio's bundled JDK (system Java may be too new for Gradle)
AS_JDK="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
if [ -d "$AS_JDK" ]; then
    export JAVA_HOME="$AS_JDK"
    echo -e "${GREEN}✓${NC} Using Android Studio JDK: $("$JAVA_HOME/bin/java" --version 2>&1 | head -1)"
fi

# Check Android SDK
if [ -z "${ANDROID_HOME:-}" ]; then
    # Try common macOS locations
    if [ -d "$HOME/Library/Android/sdk" ]; then
        export ANDROID_HOME="$HOME/Library/Android/sdk"
    elif [ -d "/usr/local/share/android-sdk" ]; then
        export ANDROID_HOME="/usr/local/share/android-sdk"
    else
        echo -e "${RED}✗ ANDROID_HOME not set and SDK not found${NC}"
        echo "  Install Android Studio or set ANDROID_HOME"
        exit 1
    fi
fi
echo -e "${GREEN}✓${NC} Android SDK: $ANDROID_HOME"

# Check keystore
KEYSTORE="$PROJECT_DIR/keys/tribes-release.keystore"
if [ ! -f "$KEYSTORE" ]; then
    echo -e "${RED}✗ Release keystore not found at $KEYSTORE${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Release keystore found"

# Check keystore.properties
KEYSTORE_PROPS="$ANDROID_DIR/keystore.properties"
if [ ! -f "$KEYSTORE_PROPS" ]; then
    echo -e "${RED}✗ keystore.properties not found at $KEYSTORE_PROPS${NC}"
    echo "  Create it with storeFile, storePassword, keyAlias, keyPassword"
    exit 1
fi
echo -e "${GREEN}✓${NC} keystore.properties found"

# ── Sync web assets ──────────────────────────────────────────

echo ""
echo -e "${YELLOW}Syncing Capacitor...${NC}"
cd "$PROJECT_DIR"
npx cap sync android
echo -e "${GREEN}✓${NC} Capacitor synced"

# Guard: cap sync regenerates the passkey asset-statements resource from
# capacitor.config.ts (keyed off TRIBES_ENV). If the generated host doesn't match
# the flavor being built, passkeys would be bound to the wrong origin — fail now.
EXPECTED_HOST="tribes.app"
[ "$FLAVOR" = "staging" ] && EXPECTED_HOST="staging.tribes.app"
PASSKEY_XML="$ANDROID_DIR/app/src/main/res/values/capacitor-passkey.xml"
if ! grep -q "https://${EXPECTED_HOST}/.well-known/assetlinks.json" "$PASSKEY_XML"; then
    echo -e "${RED}✗ ${PASSKEY_XML} does not reference ${EXPECTED_HOST}${NC}"
    echo "  cap sync produced the wrong passkey origin for flavor '${FLAVOR}'."
    echo "  Check TRIBES_ENV plumbing in capacitor.config.ts / this script."
    exit 1
fi
echo -e "${GREEN}✓${NC} Passkey asset-statements point at ${EXPECTED_HOST}"

# ── Build ────────────────────────────────────────────────────

echo ""
if [ "$BUILD_APK" = "true" ]; then
    echo -e "${YELLOW}Building release APK (${FLAVOR})...${NC}"
    cd "$ANDROID_DIR"
    ./gradlew "assemble${FLAVOR_CAP}Release"
    APK_PATH="$ANDROID_DIR/app/build/outputs/apk/${FLAVOR}/release/app-${FLAVOR}-release.apk"
    echo ""
    echo -e "${GREEN}✓ APK built:${NC} $APK_PATH"
else
    echo -e "${YELLOW}Building release AAB (${FLAVOR}, for Play Store)...${NC}"
    cd "$ANDROID_DIR"
    ./gradlew "bundle${FLAVOR_CAP}Release"
    AAB_PATH="$ANDROID_DIR/app/build/outputs/bundle/${FLAVOR}Release/app-${FLAVOR}-release.aab"
    echo ""
    echo -e "${GREEN}✓ AAB built:${NC} $AAB_PATH"
    echo -e "${YELLOW}Upload this .aab file to Google Play Console${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Build complete!${NC}"
