#!/usr/bin/env bash
# ============================================================
# Tribes.app — One-Command Production Deploy
# ============================================================
# Usage:  ./scripts/deploy.sh [--skip-build] [--migrate-only]
#
# What this does:
#   1. Runs local TypeScript type-check (catches errors before deploy)
#   2. Rsyncs project files to the production server
#   3. Applies pending Drizzle migrations to the sqld primary
#   4. Rebuilds the app Docker container
#   5. Restarts the app service
#   6. Verifies the health endpoint
# ============================================================

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
REMOTE_HOST="root@5.78.189.222"
REMOTE_DIR="/opt/tribes"
SQLD_CONTAINER="tribes-sqld-1"
APP_CONTAINER="tribes-app-1"
COMPOSE_FILE="docker-compose.prod.yml"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HEALTH_URL="http://127.0.0.1:9002/api/health"

# ── Colors ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()   { echo -e "${CYAN}[deploy]${NC} $1"; }
ok()    { echo -e "${GREEN}[  ✓  ]${NC} $1"; }
warn()  { echo -e "${YELLOW}[ warn]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL!]${NC} $1"; exit 1; }

# ── Parse flags ────────────────────────────────────────────────
SKIP_BUILD=false
MIGRATE_ONLY=false
for arg in "$@"; do
  case $arg in
    --skip-build)    SKIP_BUILD=true ;;
    --migrate-only)  MIGRATE_ONLY=true ;;
    *)               warn "Unknown flag: $arg" ;;
  esac
done

# ── Step 1: Local type-check ──────────────────────────────────
log "Running TypeScript type-check..."
cd "$LOCAL_DIR"
if npx tsc --noEmit 2>&1; then
  ok "Type-check passed"
else
  fail "TypeScript errors found — fix before deploying"
fi

# ── Step 2: Rsync to server ──────────────────────────────────
log "Syncing files to $REMOTE_HOST:$REMOTE_DIR..."
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='tribes.db' \
  --exclude='local.db' \
  --exclude='sqlite.db' \
  --exclude='data' \
  --exclude='.env*' \
  --exclude='tmp' \
  --exclude='*.png' \
  -e "ssh -o StrictHostKeyChecking=no" \
  "$LOCAL_DIR/" "$REMOTE_HOST:$REMOTE_DIR/" \
  | tail -5
ok "Files synced"

# ── Step 3: Run migrations against sqld ──────────────────────
log "Applying pending migrations to sqld..."
# Get the sqld container's IP on the Docker network
SQLD_IP=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "docker inspect $SQLD_CONTAINER --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'")
SQLD_URL="http://${SQLD_IP}:8080"
log "  sqld endpoint: $SQLD_URL"

# Run the Python migration runner on the server
# (migrate.py was synced in Step 2 along with the drizzle/ directory)
MIGRATE_OUTPUT=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "cd $REMOTE_DIR && python3 scripts/migrate.py '$SQLD_URL' drizzle" 2>&1)
MIGRATE_EXIT=$?

echo "$MIGRATE_OUTPUT" | while IFS= read -r line; do
  if echo "$line" | grep -q '✗'; then
    fail "  $line"
  elif echo "$line" | grep -q '⚠'; then
    warn "  $line"
  else
    log "  $line"
  fi
done

if [ "$MIGRATE_EXIT" -ne 0 ]; then
  fail "Migration failed — see errors above"
fi
ok "Migrations complete"

if [ "$MIGRATE_ONLY" = true ]; then
  ok "Migration-only mode — skipping build"
  exit 0
fi

# ── Step 4: Build & restart ──────────────────────────────────
if [ "$SKIP_BUILD" = true ]; then
  warn "Skipping build (--skip-build flag)"
else
  log "Building and restarting all containers..."
  ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
    "cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE up -d --build 2>&1" \
    | tail -10
  ok "Containers rebuilt and restarted"
fi

# ── Step 5: Health check ─────────────────────────────────────
log "Waiting for app to boot (10s)..."
sleep 10

MAX_RETRIES=5
RETRY_COUNT=0
HEALTHY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  log "Health check attempt $((RETRY_COUNT + 1))/$MAX_RETRIES..."
  
  HEALTH_RESULT=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
    "docker exec $APP_CONTAINER wget -qO- $HEALTH_URL 2>/dev/null || echo 'UNHEALTHY'")

  # Improved regex: must contain 'ok' or 'healthy' but NOT be exactly 'UNHEALTHY'
  if [[ "$HEALTH_RESULT" =~ \"status\":\"ok\" ]] || [[ "$HEALTH_RESULT" == *"healthy"* && "$HEALTH_RESULT" != "UNHEALTHY" ]]; then
    ok "App is healthy!"
    HEALTHY=true
    break
  else
    warn "Health check failed: $HEALTH_RESULT"
    RETRY_COUNT=$((RETRY_COUNT + 1))
    [ $RETRY_COUNT -lt $MAX_RETRIES ] && sleep 5
  fi
done

if [ "$HEALTHY" = false ]; then
  fail "App failed health check after $MAX_RETRIES attempts"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy complete!  🚀${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
