#!/usr/bin/env bash
# ============================================================
# Hash the crypto-core bundle for SRI verification
# ============================================================
# Run after `next build`. Outputs crypto-integrity.json with
# SHA-256 hashes of the bundled chunk and each source file.
#
# The output is committed to the audit repo so anyone can verify
# the deployed code matches the published source.
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NEXT_DIR="$PROJECT_DIR/.next"
CRYPTO_SRC="$PROJECT_DIR/src/lib/crypto"
AUDIT_REPO="$PROJECT_DIR/scratch/tribes-encryption-audit"
OUTPUT_FILE="$AUDIT_REPO/crypto-integrity.json"

# ── Find the crypto-core chunk ────────────────────────────────

CHUNK_FILE=$(find "$NEXT_DIR/static/chunks" -name 'crypto-core-*.js' 2>/dev/null | head -1)

if [ -z "$CHUNK_FILE" ]; then
  echo "⚠️  No crypto-core chunk found in $NEXT_DIR/static/chunks/"
  echo "   Did you run 'next build'? Is the webpack splitChunks config in place?"
  exit 1
fi

CHUNK_NAME=$(basename "$CHUNK_FILE")
CHUNK_HASH=$(shasum -a 256 "$CHUNK_FILE" | awk '{print $1}')

echo "✓ Found chunk: $CHUNK_NAME"
echo "  SHA-256: $CHUNK_HASH"

# ── Hash each source file ─────────────────────────────────────

BUILD_ID=$(cat "$NEXT_DIR/BUILD_ID" 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Start JSON
cat > "$OUTPUT_FILE" <<EOF
{
  "buildId": "$BUILD_ID",
  "timestamp": "$TIMESTAMP",
  "bundle": {
    "file": "$CHUNK_NAME",
    "sha256": "$CHUNK_HASH"
  },
  "sources": {
EOF

# Hash each .ts file in the crypto directory
FIRST=true
for f in "$CRYPTO_SRC"/*.ts; do
  NAME=$(basename "$f")
  HASH=$(shasum -a 256 "$f" | awk '{print $1}')
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    echo "," >> "$OUTPUT_FILE"
  fi
  printf '    "%s": "%s"' "$NAME" "$HASH" >> "$OUTPUT_FILE"
done

# Close JSON
cat >> "$OUTPUT_FILE" <<EOF

  }
}
EOF

echo "✓ Wrote $OUTPUT_FILE"
echo ""
echo "Source file hashes:"
for f in "$CRYPTO_SRC"/*.ts; do
  NAME=$(basename "$f")
  HASH=$(shasum -a 256 "$f" | awk '{print $1}')
  echo "  $NAME: $HASH"
done

# ── Auto-commit to audit repo ─────────────────────────────────

if [ -d "$AUDIT_REPO/.git" ]; then
  cd "$AUDIT_REPO"
  if ! git diff --quiet crypto-integrity.json 2>/dev/null; then
    git add crypto-integrity.json
    git commit -m "integrity: update crypto-core hash for build $BUILD_ID

Bundle: $CHUNK_NAME
SHA-256: $CHUNK_HASH
Timestamp: $TIMESTAMP"
    git push 2>/dev/null && echo "✓ Pushed to audit repo" || echo "⚠️  Push failed (run manually)"
  else
    echo "✓ No changes to crypto-integrity.json"
  fi
fi
