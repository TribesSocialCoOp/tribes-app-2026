#!/usr/bin/env bash
# ============================================================
# Tribes.app — Instant Production Rollback
# ============================================================
# Usage:  ./scripts/rollback.sh
#
# What this does:
#   1. Restores tribes-app:rollback → tribes-app:latest
#   2. Stops the active color container
#   3. Starts the OTHER color with the rollback image
#   4. Verifies health
#
# This is a sub-10-second operation. The rollback image is
# preserved automatically by deploy.sh before every build.
# ============================================================

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
REMOTE_HOST="root@5.78.189.222"
REMOTE_DIR="/opt/tribes"
COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_URL="http://127.0.0.1:9002/api/health"
STATE_FILE=".active-color"

# ── Colors ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${CYAN}[rollback]${NC} $1"; }
ok()    { echo -e "${GREEN}[   ✓   ]${NC} $1"; }
warn()  { echo -e "${YELLOW}[  warn ]${NC} $1"; }
fail()  { echo -e "${RED}[ FAIL! ]${NC} $1"; exit 1; }

echo ""
echo -e "${YELLOW}════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  ⚠  PRODUCTION ROLLBACK  ⚠${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════${NC}"
echo ""

# ── Step 1: Check rollback image exists ──────────────────────
log "Checking for rollback image..."
ROLLBACK_EXISTS=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "docker image inspect tribes-app:rollback >/dev/null 2>&1 && echo 'yes' || echo 'no'")

if [ "$ROLLBACK_EXISTS" = "no" ]; then
  fail "No rollback image found (tribes-app:rollback). Cannot rollback."
fi
ok "Rollback image found"

# ── Step 2: Detect current active color ──────────────────────
ACTIVE_COLOR=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "cat $REMOTE_DIR/$STATE_FILE 2>/dev/null || echo 'blue'")

if [ "$ACTIVE_COLOR" = "blue" ]; then
  ROLLBACK_COLOR="green"
else
  ROLLBACK_COLOR="blue"
fi

log "Active: ${BOLD}${ACTIVE_COLOR}${NC}  →  Rolling back to: ${BOLD}${ROLLBACK_COLOR}${NC}"

# ── Step 3: Restore rollback image ───────────────────────────
log "Restoring tribes-app:rollback → tribes-app:latest..."
ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "docker tag tribes-app:rollback tribes-app:latest"
ok "Image restored"

# ── Step 4: Start rollback color ─────────────────────────────
log "Starting app-${ROLLBACK_COLOR} with rollback image..."
ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE --profile $ROLLBACK_COLOR up -d app-$ROLLBACK_COLOR 2>&1" \
  | tail -5

# ── Step 5: Wait for healthy ─────────────────────────────────
log "Waiting for app-${ROLLBACK_COLOR} to become healthy..."
MAX_WAIT=30
ELAPSED=0
HEALTHY=false

while [ $ELAPSED -lt $MAX_WAIT ]; do
  STATUS=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
    "docker inspect tribes-app-${ROLLBACK_COLOR} --format '{{.State.Health.Status}}' 2>/dev/null || echo 'starting'")

  if [ "$STATUS" = "healthy" ]; then
    HEALTHY=true
    break
  fi

  echo -ne "\r  ⏳ Status: ${STATUS} (${ELAPSED}s / ${MAX_WAIT}s)"
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done
echo ""

if [ "$HEALTHY" = false ]; then
  fail "Rollback container failed to become healthy! Manual intervention required."
fi
ok "app-${ROLLBACK_COLOR} is healthy!"

# ── Step 6: Stop the broken active color ─────────────────────
log "Stopping app-${ACTIVE_COLOR}..."
ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE --profile $ACTIVE_COLOR stop app-$ACTIVE_COLOR 2>&1" \
  | tail -3
ok "app-${ACTIVE_COLOR} stopped"

# ── Step 7: Update state file ────────────────────────────────
ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "echo '$ROLLBACK_COLOR' > $REMOTE_DIR/$STATE_FILE"
ok "Active color set to: ${ROLLBACK_COLOR}"

# ── Step 8: Verify ───────────────────────────────────────────
sleep 2
HEALTH_RESULT=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "docker exec tribes-app-${ROLLBACK_COLOR} wget -qO- $HEALTH_URL 2>/dev/null || echo 'UNHEALTHY'")

if [[ "$HEALTH_RESULT" =~ \"status\":\"ok\" ]]; then
  ok "App is healthy!"
else
  warn "Health check returned: $HEALTH_RESULT"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Rollback complete!  🔙${NC}"
echo -e "${GREEN}  Active: app-${ROLLBACK_COLOR} (previous image)${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
