#!/bin/bash
# ==============================================================================
# preflight.sh — Verify iOS build environment before wasting time building
# Adapted from cai-hobbes/scripts/check_mac_store_readiness.sh for iOS Capacitor
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'
PASS=0
WARN=0
FAIL=0

check_pass()  { echo -e "  ${GREEN}✅ $1${NC}"; PASS=$((PASS+1)); }
check_warn()  { echo -e "  ${YELLOW}⚠️  $1${NC}"; WARN=$((WARN+1)); }
check_fail()  { echo -e "  ${RED}❌ $1${NC}"; FAIL=$((FAIL+1)); }

echo "🔍 Tribes iOS — Pre-flight Check"
echo "================================="
echo ""

# 1. Xcode
echo "📱 Xcode"
XCODE_PATH=$(mdfind "kMDItemCFBundleIdentifier == com.apple.dt.Xcode" 2>/dev/null | head -1)
if [ -n "$XCODE_PATH" ]; then
    check_pass "Xcode found at $XCODE_PATH"

    # Check if xcode-select points to Xcode (not CommandLineTools)
    ACTIVE_DEV_DIR=$(xcode-select -p 2>/dev/null)
    if echo "$ACTIVE_DEV_DIR" | grep -q "Xcode.app"; then
        check_pass "xcode-select → $ACTIVE_DEV_DIR"
    else
        check_warn "xcode-select points to '$ACTIVE_DEV_DIR' (not Xcode)"
        echo "         Fix: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
    fi
else
    check_fail "Xcode not found. Install from the Mac App Store."
fi

echo ""

# 2. Signing Identities
echo "🔐 Signing Identities"
# For iOS, "Apple Distribution" covers both App Store and TestFlight
DIST_CERT=$(security find-identity -v -p codesigning | grep "Apple Distribution" | grep -v "CSSMERR_TP_CERT_REVOKED" | head -1)
DEV_CERT=$(security find-identity -v -p codesigning | grep "Apple Development" | grep -v "CSSMERR_TP_CERT_REVOKED" | head -1)

if [ -n "$DIST_CERT" ]; then
    DIST_FINGERPRINT=$(echo "$DIST_CERT" | awk '{print $2}')
    DIST_NAME=$(echo "$DIST_CERT" | sed 's/.*"\(.*\)".*/\1/')
    check_pass "Distribution: $DIST_NAME ($DIST_FINGERPRINT)"
else
    check_fail "No valid 'Apple Distribution' certificate found"
    echo "         You need this to upload to TestFlight/App Store."
    echo "         Generate one at: https://developer.apple.com/account/resources/certificates"
fi

if [ -n "$DEV_CERT" ]; then
    DEV_FINGERPRINT=$(echo "$DEV_CERT" | awk '{print $2}')
    DEV_NAME=$(echo "$DEV_CERT" | sed 's/.*"\(.*\)".*/\1/')
    check_pass "Development: $DEV_NAME ($DEV_FINGERPRINT)"
else
    check_warn "No valid 'Apple Development' certificate found"
    echo "         You need this for on-device debugging."
fi

echo ""

# 3. Capacitor Project
echo "📦 Capacitor"
if [ -f "capacitor.config.ts" ] || [ -f "capacitor.config.json" ]; then
    check_pass "Capacitor config found"
else
    check_fail "No capacitor.config.ts or .json found"
fi

if [ -d "ios/App" ]; then
    check_pass "iOS platform added"
else
    check_fail "iOS platform missing. Run: npx cap add ios"
fi

if [ -d "node_modules/@capacitor/core" ]; then
    CAP_VER=$(node -e "console.log(require('@capacitor/core/package.json').version)" 2>/dev/null || echo "unknown")
    check_pass "Capacitor core v$CAP_VER installed"
else
    check_fail "Capacitor not installed. Run: npm install"
fi

echo ""

# 4. Bundle ID
echo "🏷️  Bundle ID"
BUNDLE_ID=$(grep "PRODUCT_BUNDLE_IDENTIFIER" ios/App/App.xcodeproj/project.pbxproj 2>/dev/null | head -1 | sed 's/.*= //;s/;.*//' | tr -d '[:space:]')
if [ -n "$BUNDLE_ID" ]; then
    check_pass "Bundle ID: $BUNDLE_ID"
else
    check_warn "Could not determine Bundle ID from Xcode project"
fi

echo ""

# 5. Info.plist permissions
echo "📋 Info.plist Permissions"
PLIST="ios/App/App/Info.plist"
if [ -f "$PLIST" ]; then
    for KEY in NFCReaderUsageDescription NSCameraUsageDescription; do
        if grep -q "$KEY" "$PLIST"; then
            check_pass "$KEY present"
        else
            check_warn "$KEY missing — add before App Store submission"
        fi
    done
else
    check_fail "Info.plist not found at $PLIST"
fi

echo ""

# 6. CocoaPods / SPM
echo "📚 Dependencies"
if [ -d "ios/App/Pods" ]; then
    check_pass "CocoaPods installed"
elif [ -d "ios/App/CapApp-SPM" ]; then
    check_pass "CapApp-SPM (Swift Package Manager) present"
else
    check_warn "No Pods or SPM packages found — run 'npx cap sync' first"
fi

echo ""
echo "================================="
echo -e "Results: ${GREEN}$PASS passed${NC}, ${YELLOW}$WARN warnings${NC}, ${RED}$FAIL failures${NC}"

if [ $FAIL -gt 0 ]; then
    echo -e "${RED}❌ Fix failures before building.${NC}"
    exit 1
else
    echo -e "${GREEN}✨ Pre-flight check complete. Ready to build!${NC}"
fi
