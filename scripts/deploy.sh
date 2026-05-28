#!/usr/bin/env bash
# ============================================================
# Tribes.app — Simple & Robust Production Deploy Orchestrator
# ============================================================
# Usage:  ./scripts/deploy.sh [--skip-build] [--migrate-only] [--skip-typecheck]
# ============================================================

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
REMOTE_HOST="root@5.78.189.222"
REMOTE_DIR="/opt/tribes"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── Colors ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log()   { echo -e "${CYAN}[deploy]${NC} $1"; }
ok()    { echo -e "${GREEN}[  ✓  ]${NC} $1"; }
warn()  { echo -e "${YELLOW}[ warn]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL!]${NC} $1"; exit 1; }

# ── Parse flags ────────────────────────────────────────────────
SKIP_BUILD=false
MIGRATE_ONLY=false
SKIP_TYPECHECK=false

for arg in "$@"; do
  case $arg in
    --skip-build)     SKIP_BUILD=true ;;
    --migrate-only)   MIGRATE_ONLY=true ;;
    --skip-typecheck) SKIP_TYPECHECK=true ;;
    *)                warn "Unknown flag: $arg" ;;
  esac
done

# ── Step 1: Local type-check ──────────────────────────────────
if [ "$SKIP_TYPECHECK" = true ] || [ "${CI:-false}" = "true" ]; then
  warn "Skipping TypeScript type-check"
else
  log "Running TypeScript type-check..."
  cd "$LOCAL_DIR"
  if npx tsc --noEmit 2>&1; then
    ok "Type-check passed"
  else
    fail "TypeScript errors found — fix before deploying"
  fi
fi

# Generate a unique build fingerprint
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "nogit")
BUILD_TS=$(date +%s)
BUILD_ID="${GIT_SHA}-${BUILD_TS}"

# Ensure deploy scripts are executable before syncing
chmod +x "$LOCAL_DIR/scripts/deploy.sh"
chmod +x "$LOCAL_DIR/scripts/remote_deploy.sh"

# ── Step 2: Rsync to server ──────────────────────────────────
log "Syncing files to $REMOTE_HOST:$REMOTE_DIR..."
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='keys' \
  --exclude='tribes.db' \
  --exclude='local.db' \
  --exclude='sqlite.db' \
  --exclude='data' \
  --exclude='.env*' \
  --exclude='tmp' \
  --exclude='*.png' \
  --exclude='.active-color' \
  --exclude='.backfill-slugs-done' \
  -e "ssh -o StrictHostKeyChecking=no" \
  "$LOCAL_DIR/" "$REMOTE_HOST:$REMOTE_DIR/" \
  | tail -5
ok "Files synced successfully"

# ── Step 2b: Push keys (additive-only, never deletes server keys) ────
if [ -f "$LOCAL_DIR/keys/fcm-service-account.json" ]; then
  log "Syncing FCM service account key to server..."
  ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" "mkdir -p $REMOTE_DIR/keys"
  scp -o StrictHostKeyChecking=no "$LOCAL_DIR/keys/fcm-service-account.json" "$REMOTE_HOST:$REMOTE_DIR/keys/fcm-service-account.json"
  ok "FCM key synced"
fi

# ── Step 3: Run consolidated remote deployment ───────────────
log "Invoking remote deployment pipeline..."
if ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" "bash $REMOTE_DIR/scripts/remote_deploy.sh ${BUILD_ID} ${SKIP_BUILD} ${MIGRATE_ONLY}"; then
  ok "Deployment completed successfully"
else
  fail "Deployment failed during remote execution"
fi
