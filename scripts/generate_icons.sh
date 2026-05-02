#!/bin/bash
# ==============================================================================
# generate_icons.sh — Generate iOS app icon set from a single source image
#
# Requires: sips (built into macOS) — no ImageMagick needed
#
# Usage:
#   ./scripts/generate_icons.sh [source_image.png]
#   Default source: assets/icon-1024.png
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

SOURCE="${1:-assets/icon-1024.png}"
ASSET_DIR="ios/App/App/Assets.xcassets/AppIcon.appiconset"

if [ ! -f "$SOURCE" ]; then
    echo -e "${RED}❌ Source image not found: $SOURCE${NC}"
    echo ""
    echo "   Please provide a 1024×1024 PNG image."
    echo "   Usage: ./scripts/generate_icons.sh path/to/icon.png"
    echo ""
    echo "   Requirements:"
    echo "   - 1024×1024 pixels minimum"
    echo "   - PNG format"
    echo "   - No alpha channel (no transparency)"
    echo "   - No rounded corners (iOS adds them automatically)"
    exit 1
fi

echo -e "${CYAN}=== Generating iOS App Icons ===${NC}"
echo "   Source: $SOURCE"
echo "   Target: $ASSET_DIR"
echo ""

mkdir -p "$ASSET_DIR"

# iOS required sizes (points × scale)
# Modern iOS only needs 1024 for App Store + a few for device
SIZES=(
    "20x20@2x:40"
    "20x20@3x:60"
    "29x29@2x:58"
    "29x29@3x:87"
    "38x38@2x:76"
    "38x38@3x:114"
    "40x40@2x:80"
    "40x40@3x:120"
    "60x60@2x:120"
    "60x60@3x:180"
    "64x64@2x:128"
    "64x64@3x:192"
    "68x68@2x:136"
    "76x76@2x:152"
    "83.5x83.5@2x:167"
    "1024x1024@1x:1024"
)

IMAGES_JSON='{"images":['
FIRST=true

for ENTRY in "${SIZES[@]}"; do
    LABEL="${ENTRY%%:*}"
    SIZE="${ENTRY##*:}"
    FILENAME="icon-${SIZE}.png"

    # Parse size and scale from label
    POINTS=$(echo "$LABEL" | sed 's/x.*//')
    SCALE=$(echo "$LABEL" | sed 's/.*@//' | sed 's/x//')

    sips -z "$SIZE" "$SIZE" "$SOURCE" --out "$ASSET_DIR/$FILENAME" > /dev/null 2>&1
    echo "   ✅ ${FILENAME} (${SIZE}×${SIZE})"

    if [ "$FIRST" = true ]; then
        FIRST=false
    else
        IMAGES_JSON+=','
    fi

    IMAGES_JSON+="{\"filename\":\"${FILENAME}\",\"idiom\":\"universal\",\"platform\":\"ios\",\"size\":\"${POINTS}x${POINTS}\",\"scale\":\"${SCALE}\"}"
done

IMAGES_JSON+='],"info":{"author":"xcode","version":1}}'

echo "$IMAGES_JSON" | python3 -m json.tool > "$ASSET_DIR/Contents.json"

echo ""
echo -e "${GREEN}✅ Generated $(echo "${SIZES[@]}" | wc -w | tr -d ' ') icon sizes${NC}"
echo "   Contents.json written to $ASSET_DIR/Contents.json"
echo "   Run 'npx cap sync ios' to update the Xcode project."
