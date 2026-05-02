#!/bin/bash
SOURCE="${1:-assets/icon-1024.png}"
ASSET_DIR="ios/App/App/Assets.xcassets/AppIcon.appiconset"
mkdir -p "$ASSET_DIR"

# Standard iOS Icon Sizes (Size:Points:Scale:Idiom)
SIZES=(
    "40:20:2:iphone"
    "60:20:3:iphone"
    "58:29:2:iphone"
    "87:29:3:iphone"
    "80:40:2:iphone"
    "120:40:3:iphone"
    "120:60:2:iphone"
    "180:60:3:iphone"
    "20:20:1:ipad"
    "40:20:2:ipad"
    "29:29:1:ipad"
    "58:29:2:ipad"
    "40:40:1:ipad"
    "80:40:2:ipad"
    "76:76:1:ipad"
    "152:76:2:ipad"
    "167:83.5:2:ipad"
    "1024:1024:1:ios-marketing"
)

cat > "$ASSET_DIR/Contents.json" << 'EOF'
{
  "images": [
EOF

FIRST=true
for ENTRY in "${SIZES[@]}"; do
    IFS=':' read -r PIXELS POINTS SCALE IDIOM <<< "$ENTRY"
    FILENAME="icon-${PIXELS}.png"
    
    if [ ! -f "$ASSET_DIR/$FILENAME" ]; then
        sips -z "$PIXELS" "$PIXELS" "$SOURCE" --out "$ASSET_DIR/$FILENAME" > /dev/null 2>&1
    fi
    
    if [ "$FIRST" = true ]; then FIRST=false; else echo "," >> "$ASSET_DIR/Contents.json"; fi
    
    printf '    { "size": "%sx%s", "idiom": "%s", "filename": "%s", "scale": "%sx" }' "$POINTS" "$POINTS" "$IDIOM" "$FILENAME" "$SCALE" >> "$ASSET_DIR/Contents.json"
done

cat >> "$ASSET_DIR/Contents.json" << 'EOF'

  ],
  "info": {
    "version": 1,
    "author": "xcode"
  }
}
EOF
echo "✅ Rebuilt iOS icon set with standard idioms"
