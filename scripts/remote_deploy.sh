#!/usr/bin/env bash
# ============================================================
# Tribes.app — Production Server-Side Deployment Engine
# ============================================================
# Designed to be run remotely via a single SSH invocation.
# Consolidates build, migrations, backfills, swap, and cleanup.
#
# BLUE/GREEN STRATEGY:
#   Each slot has its own Docker image tag (tribes-app:blue, tribes-app:green).
#   We ONLY build and tag the INACTIVE slot. The active slot is never touched.
#   If the new slot fails health checks, we stop it — the old slot is untouched.
# ============================================================

set -euo pipefail

# ── Configuration & Environment ──────────────────────────────
REMOTE_DIR="/opt/tribes"
COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_URL="http://127.0.0.1:9002/api/health"
STATE_FILE=".active-color"

cd "$REMOTE_DIR"

if [ -f .env.production ]; then
  source .env.production
else
  echo -e "\033[0;31m[FAIL]\033[0m .env.production not found in $REMOTE_DIR"
  exit 1
fi

# ── Colors ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${CYAN}[remote-deploy]${NC} $1"; }
ok()    { echo -e "${GREEN}[      ✓      ]${NC} $1"; }
warn()  { echo -e "${YELLOW}[     warn    ]${NC} $1"; }
fail()  { echo -e "${RED}[    FAIL!    ]${NC} $1"; exit 1; }

# Parse arguments
BUILD_ID="${1:-nogit-$(date +%s)}"
SKIP_BUILD="${2:-false}"
MIGRATE_ONLY="${3:-false}"

log "Starting deployment pipeline (Build: ${BUILD_ID})..."

# ── Step 1: Determine target slot BEFORE building ────────────
# This is critical — we need to know which color to tag the image as.
log "Detecting active deployment color..."
ACTIVE_COLOR=$(cat "$STATE_FILE" 2>/dev/null || echo "none")

if [ "$ACTIVE_COLOR" = "none" ]; then
  NEW_COLOR="blue"
elif [ "$ACTIVE_COLOR" = "blue" ]; then
  NEW_COLOR="green"
elif [ "$ACTIVE_COLOR" = "green" ]; then
  NEW_COLOR="blue"
else
  warn "Unknown active color '$ACTIVE_COLOR' — defaulting to blue"
  ACTIVE_COLOR="none"
  NEW_COLOR="blue"
fi

log "Active: ${BOLD}${ACTIVE_COLOR}${NC}  →  Target: ${BOLD}${NEW_COLOR}${NC}"

# ── Step 2: Build Docker image for the TARGET slot ───────────
# Only tags the INACTIVE slot. The active slot's image is NEVER overwritten.
if [ "$SKIP_BUILD" = "true" ]; then
  warn "Skipping build (--skip-build)"
else
  log "Building tribes-app:${NEW_COLOR} (active slot tribes-app:${ACTIVE_COLOR} is untouched)..."
  if docker build --build-arg BUILD_ID="${BUILD_ID}" -t "tribes-app:${NEW_COLOR}" -f Dockerfile . 2>&1 | tail -15; then
    ok "Image built: tribes-app:${NEW_COLOR}"
  else
    fail "Docker build failed — active slot is unaffected"
  fi
fi

# ── Step 3: Run versioned schema migrations ─────────────────
log "Applying database migrations..."
PG_IP=$(docker inspect tribes-postgres-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null || echo "")
PG_NETWORK=$(docker inspect tribes-postgres-1 --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null || echo "")

if [ -z "$PG_IP" ] || [ -z "$PG_NETWORK" ]; then
  fail "PostgreSQL container (tribes-postgres-1) is not running or healthy"
fi

log "Building database builder environment..."
docker build -q --target builder -t tribes-builder . > /dev/null

log "Running drizzle-kit migrate..."
if docker run --rm \
  --network="$PG_NETWORK" \
  -e DATABASE_URL="postgresql://tribes:${POSTGRES_PASSWORD}@${PG_IP}:5432/tribes" \
  tribes-builder npx drizzle-kit migrate 2>&1; then
  ok "Database migrations applied successfully"
else
  fail "Database migrations failed! Active slot is unaffected."
fi

# ── Step 4: Backfill post slugs (one-time, sentinel-gated) ───
BACKFILL_SENTINEL=".backfill-slugs-done"
if [ -f "$BACKFILL_SENTINEL" ]; then
  ok "Post slug backfill already completed — skipping"
else
  log "Running post slug backfill..."
  if docker run --rm \
    --network="$PG_NETWORK" \
    -e DATABASE_URL="postgresql://tribes:${POSTGRES_PASSWORD}@${PG_IP}:5432/tribes" \
    tribes-builder npx tsx src/db/backfill-post-slugs.ts 2>&1; then
    date -u '+completed %Y-%m-%dT%H:%M:%SZ' > "$BACKFILL_SENTINEL"
    ok "Post slug backfill complete"
  else
    warn "Post slug backfill failed — will retry next deploy"
  fi
fi

# ── Step 5: Backfill user slugs (one-time, sentinel-gated) ───
USER_SLUG_SENTINEL=".backfill-user-slugs-done"
if [ -f "$USER_SLUG_SENTINEL" ]; then
  ok "User slug backfill already completed — skipping"
else
  log "Running user slug backfill..."
  if docker run --rm \
    --network="$PG_NETWORK" \
    -e DATABASE_URL="postgresql://tribes:${POSTGRES_PASSWORD}@${PG_IP}:5432/tribes" \
    tribes-builder npx tsx src/db/backfill-user-slugs.ts 2>&1; then
    date -u '+completed %Y-%m-%dT%H:%M:%SZ' > "$USER_SLUG_SENTINEL"
    ok "User slug backfill complete"
  else
    warn "User slug backfill failed — will retry next deploy"
  fi
fi

if [ "$MIGRATE_ONLY" = "true" ]; then
  ok "Migration-only mode. Skipping container swap."
  exit 0
fi

# ── Step 6: Start the NEW container ──────────────────────────
log "Starting app-${NEW_COLOR} container..."
docker compose -f "$COMPOSE_FILE" --profile "$NEW_COLOR" up -d "app-$NEW_COLOR"

log "Reloading Caddy reverse proxy..."
docker exec tribes-caddy-1 caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || warn "Caddy reload skipped"

# ── Step 7: Wait for the NEW container to become healthy ──────
log "Waiting for app-${NEW_COLOR} health check..."
MAX_WAIT=90
ELAPSED=0
HEALTHY=false

while [ $ELAPSED -lt $MAX_WAIT ]; do
  STATUS=$(docker inspect "tribes-app-${NEW_COLOR}" --format '{{.State.Health.Status}}' 2>/dev/null || echo "starting")

  if [ "$STATUS" = "healthy" ]; then
    HEALTHY=true
    break
  fi

  echo -ne "\r  ⏳ ${STATUS} (${ELAPSED}s / ${MAX_WAIT}s)"
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done
echo ""

if [ "$HEALTHY" = "false" ]; then
  warn "app-${NEW_COLOR} failed health check within ${MAX_WAIT}s"
  warn "Stopping failed container. Active slot app-${ACTIVE_COLOR} is UNTOUCHED."
  docker compose -f "$COMPOSE_FILE" --profile "$NEW_COLOR" stop "app-$NEW_COLOR"
  fail "Deploy aborted — app-${ACTIVE_COLOR} is still running with its own image."
fi

ok "app-${NEW_COLOR} is healthy!"

# ── Step 8: Stop the OLD container ───────────────────────────
if [ "$ACTIVE_COLOR" != "none" ]; then
  log "Stopping app-${ACTIVE_COLOR}..."
  docker compose -f "$COMPOSE_FILE" --profile "$ACTIVE_COLOR" stop "app-$ACTIVE_COLOR"
  ok "app-${ACTIVE_COLOR} stopped (image tribes-app:${ACTIVE_COLOR} preserved for rollback)"
else
  OLD_RUNNING=$(docker ps -q --filter name=tribes-app-1 2>/dev/null || echo "")
  if [ -n "$OLD_RUNNING" ]; then
    log "Removing legacy tribes-app-1 container..."
    docker stop tribes-app-1 && docker rm tribes-app-1 || true
    ok "Legacy container removed"
  fi
fi

# ── Step 9: Persist new active color ─────────────────────────
echo "$NEW_COLOR" > "$STATE_FILE"
ok "Active color: ${NEW_COLOR}"

# ── Step 10: Final health verification ───────────────────────
sleep 3
HEALTH_RESULT=$(docker exec "tribes-app-${NEW_COLOR}" wget -qO- "$HEALTH_URL" 2>/dev/null || echo "UNHEALTHY")

if [[ "$HEALTH_RESULT" =~ \"status\":\"ok\" ]]; then
  ok "Health verified: $HEALTH_RESULT"
else
  warn "Health check returned: $HEALTH_RESULT"
fi

# ── Step 11: Cleanup (preserve both slot images!) ────────────
log "Pruning old containers and build cache..."
docker container prune -f >/dev/null
# Remove the builder image immediately — it's rebuilt every deploy (~350MB)
docker rmi tribes-builder 2>/dev/null || true
# Do NOT prune images aggressively — we need both slot images preserved
docker builder prune --keep-storage 2G --force >/dev/null 2>&1 || true
ok "Cleanup complete"

# ── Step 12: Cron Jobs ───────────────────────────────────────
# SeaweedFS orphan cleanup (daily at 3am UTC)
CRON_SEAWEEDFS="0 3 * * * CONTAINER=\$(cat /opt/tribes/.active-color 2>/dev/null || echo blue) && cd /opt/tribes && docker compose -f docker-compose.prod.yml --profile \$CONTAINER exec -T app-\$CONTAINER npx tsx scripts/cleanup-seaweedfs.ts >> /var/log/tribes-cleanup.log 2>&1"
# Server maintenance: Docker image pruning + disk space alerts (every 6 hours)
CRON_MAINTENANCE="0 */6 * * * /usr/bin/bash /opt/tribes/scripts/server-maintenance.sh >> /var/log/tribes-maintenance.log 2>&1"

# Rebuild crontab: remove old entries, add current ones
(crontab -l 2>/dev/null | grep -v "cleanup-seaweedfs.ts" | grep -v "server-maintenance.sh" | grep -v "storage-cleanup" ; echo "$CRON_SEAWEEDFS" ; echo "$CRON_MAINTENANCE") | crontab -
ok "Cron jobs updated (seaweedfs cleanup + server maintenance)"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy complete — app-${NEW_COLOR} is live${NC}"
echo -e "${GREEN}  Rollback available: app-${ACTIVE_COLOR} (tribes-app:${ACTIVE_COLOR})${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
