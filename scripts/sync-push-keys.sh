#!/usr/bin/env bash
# ============================================================
# Tribes.app — Push Notification Key Sync
# ============================================================
# Syncs FCM and APNs push notification keys to the production server.
#
# Usage:
#   ./scripts/sync-push-keys.sh                    # Sync from local keys/ directory
#   ./scripts/sync-push-keys.sh --from-secrets      # Decode from env vars (CI usage)
#
# Environment variables (--from-secrets mode):
#   FCM_SERVICE_ACCOUNT_JSON   — Raw JSON content of FCM service account key
#   APNS_PUSH_P12_BASE64       — Base64-encoded APNs .p12 certificate
#
# The script is additive-only: it never deletes existing keys on the server.
# ============================================================

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
REMOTE_HOST="${REMOTE_HOST:-root@5.78.189.222}"
REMOTE_DIR="${REMOTE_DIR:-/opt/tribes}"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KEYS_DIR="$LOCAL_DIR/keys"

# ── Colors ─────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${CYAN}[push-keys]${NC} $1"; }
ok()   { echo -e "${GREEN}[  ✓  ]${NC} $1"; }
warn() { echo -e "${YELLOW}[ warn]${NC} $1"; }
fail() { echo -e "${RED}[FAIL!]${NC} $1"; exit 1; }

# ── Parse flags ────────────────────────────────────────────────
FROM_SECRETS=false

for arg in "$@"; do
  case $arg in
    --from-secrets) FROM_SECRETS=true ;;
    *)              warn "Unknown flag: $arg" ;;
  esac
done

# ── Step 1: Ensure keys exist locally ──────────────────────────
mkdir -p "$KEYS_DIR"

if [ "$FROM_SECRETS" = true ]; then
  log "Decoding push keys from environment variables..."

  if [ -n "${FCM_SERVICE_ACCOUNT_JSON:-}" ]; then
    echo "$FCM_SERVICE_ACCOUNT_JSON" > "$KEYS_DIR/fcm-service-account.json"
    ok "FCM service account key written to keys/"
  else
    warn "FCM_SERVICE_ACCOUNT_JSON not set — skipping FCM key"
  fi

  if [ -n "${APNS_PUSH_P12_BASE64:-}" ]; then
    echo "$APNS_PUSH_P12_BASE64" | base64 -d > "$KEYS_DIR/apns-push.p12"
    ok "APNs .p12 certificate written to keys/"
  else
    warn "APNS_PUSH_P12_BASE64 not set — skipping APNs key"
  fi
fi

# ── Step 2: Sync keys to server (additive-only) ───────────────
HAS_KEYS=false

if [ -f "$KEYS_DIR/fcm-service-account.json" ] || [ -f "$KEYS_DIR/apns-push.p12" ]; then
  HAS_KEYS=true
fi

if [ "$HAS_KEYS" = false ]; then
  warn "No push keys found in $KEYS_DIR — nothing to sync"
  warn "Expected: keys/fcm-service-account.json and/or keys/apns-push.p12"
  exit 0
fi

log "Syncing push notification keys to $REMOTE_HOST..."
ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" "mkdir -p $REMOTE_DIR/keys"

if [ -f "$KEYS_DIR/fcm-service-account.json" ]; then
  scp -o StrictHostKeyChecking=no "$KEYS_DIR/fcm-service-account.json" \
    "$REMOTE_HOST:$REMOTE_DIR/keys/fcm-service-account.json"
  ok "FCM service account key synced"
fi

if [ -f "$KEYS_DIR/apns-push.p12" ]; then
  scp -o StrictHostKeyChecking=no "$KEYS_DIR/apns-push.p12" \
    "$REMOTE_HOST:$REMOTE_DIR/keys/apns-push.p12"
  ok "APNs .p12 certificate synced"
fi

ok "Push notification keys synced to server"
