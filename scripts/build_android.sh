#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# build_android.sh — Build Android release AAB for Play Store
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$PROJECT_DIR/android"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🤖 Tribes Android Build${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

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

# ── Build ────────────────────────────────────────────────────

echo ""
if [ "${1:-}" = "--apk" ]; then
    echo -e "${YELLOW}Building release APK...${NC}"
    cd "$ANDROID_DIR"
    ./gradlew assembleRelease
    APK_PATH="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
    echo ""
    echo -e "${GREEN}✓ APK built:${NC} $APK_PATH"
else
    echo -e "${YELLOW}Building release AAB (for Play Store)...${NC}"
    cd "$ANDROID_DIR"
    ./gradlew bundleRelease
    AAB_PATH="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
    echo ""
    echo -e "${GREEN}✓ AAB built:${NC} $AAB_PATH"
    echo -e "${YELLOW}Upload this .aab file to Google Play Console${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Build complete!${NC}"
