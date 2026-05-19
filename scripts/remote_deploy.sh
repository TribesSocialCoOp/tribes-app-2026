#!/usr/bin/env bash
# ============================================================
# Tribes.app — Production Server-Side Deployment Engine
# ============================================================
# Designed to be run remotely via a single SSH invocation.
# Consolidates build, migrations, backfills, swap, and cleanup.
# ============================================================

set -euo pipefail

# ── Configuration & Environment ──────────────────────────────
REMOTE_DIR="/opt/tribes"
COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_URL="http://127.0.0.1:9002/api/health"
STATE_FILE=".active-color"

# Ensure we are in the correct directory
cd "$REMOTE_DIR"

# Source the production environment file
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
NC='\033[0m' # No Color

log()   { echo -e "${CYAN}[remote-deploy]${NC} $1"; }
ok()    { echo -e "${GREEN}[      ✓      ]${NC} $1"; }
warn()  { echo -e "${YELLOW}[     warn    ]${NC} $1"; }
fail()  { echo -e "${RED}[    FAIL!    ]${NC} $1"; exit 1; }

# Parse arguments
BUILD_ID="${1:-nogit-timestamp}"
SKIP_BUILD="${2:-false}"
MIGRATE_ONLY="${3:-false}"

log "Starting server-side deployment pipeline (Build: ${BUILD_ID})..."

# ── Step 1: Preserve current image for instant rollback ──────
if [ "$SKIP_BUILD" = "true" ]; then
  warn "Skipping build and rollback preservation (--skip-build)"
else
  log "Preserving current tribes-app:latest as tribes-app:rollback..."
  if docker image inspect tribes-app:latest >/dev/null 2>&1; then
    docker tag tribes-app:latest tribes-app:rollback
    ok "Rollback image preserved successfully"
  else
    warn "No existing image to preserve (first deploy)"
  fi

  # ── Step 2: Build Docker image ───────────────────────────────
  log "Building new docker image tribes-app:latest..."
  if docker build --build-arg BUILD_ID="${BUILD_ID}" -t tribes-app:latest -f Dockerfile . 2>&1 | tail -15; then
    ok "Image built: tribes-app:latest"
  else
    fail "Docker build failed"
  fi
fi

# ── Step 3: Run versioned schema migrations ─────────────────
log "Applying database migrations..."
PG_IP=$(docker inspect tribes-postgres-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null || echo "")
PG_NETWORK=$(docker inspect tribes-postgres-1 --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null || echo "")

if [ -z "$PG_IP" ] || [ -z "$PG_NETWORK" ]; then
  fail "PostgreSQL container (tribes-postgres-1) is not running or healthy"
fi

# Build the builder stage (has node_modules and drizzle-kit)
log "Building database builder environment..."
docker build -q --target builder -t tribes-builder . > /dev/null

log "Running drizzle-kit migrate..."
if docker run --rm \
  --network="$PG_NETWORK" \
  -e DATABASE_URL="postgresql://tribes:${POSTGRES_PASSWORD}@${PG_IP}:5432/tribes" \
  tribes-builder npx drizzle-kit migrate 2>&1; then
  ok "Database migrations applied successfully"
else
  fail "Database migrations failed! Aborting deployment"
fi

# ── Step 4: Backfill post slugs (one-time) ──────────────────
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
    ok "Post slug backfill complete (sentinel written)"
  else
    warn "Post slug backfill failed — will retry next deploy"
  fi
fi

# ── Step 5: Backfill user slugs (one-time) ───────────────────
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
    ok "User slug backfill complete (sentinel written)"
  else
    warn "User slug backfill failed — will retry next deploy"
  fi
fi

if [ "$MIGRATE_ONLY" = "true" ]; then
  ok "Migration-only mode requested. Skipping container swap."
  exit 0
fi

# ── Step 6: Detect active color & swap ───────────────────────
log "Detecting active deployment color..."
ACTIVE_COLOR=$(cat "$STATE_FILE" 2>/dev/null || echo "none")

# Handle first deploy or migrations from single container setups
if [ "$ACTIVE_COLOR" = "none" ]; then
  OLD_CONTAINER=$(docker ps -q --filter name=tribes-app-1 2>/dev/null || echo "")
  if [ -n "$OLD_CONTAINER" ]; then
    warn "Legacy single-container setup detected"
  fi
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

log "Currently active: ${BOLD}${ACTIVE_COLOR}${NC}  →  Deploying new target: ${BOLD}${NEW_COLOR}${NC}"

# ── Step 7: Start the NEW container ──────────────────────────
log "Starting app-${NEW_COLOR} container..."
docker compose -f "$COMPOSE_FILE" --profile "$NEW_COLOR" up -d "app-$NEW_COLOR"

# Reload Caddy config so it immediately resolves the new container dns if needed
log "Reloading Caddy reverse proxy config..."
if docker exec tribes-caddy-1 caddy reload --config /etc/caddy/Caddyfile 2>/dev/null; then
  ok "Caddy proxy reloaded"
else
  warn "Caddy reload failed (may not be running yet)"
fi

# ── Step 8: Wait for the NEW container to become healthy ──────
log "Monitoring health checks for app-${NEW_COLOR}..."
MAX_WAIT=90
ELAPSED=0
HEALTHY=false

while [ $ELAPSED -lt $MAX_WAIT ]; do
  STATUS=$(docker inspect "tribes-app-${NEW_COLOR}" --format '{{.State.Health.Status}}' 2>/dev/null || echo "starting")

  if [ "$STATUS" = "healthy" ]; then
    HEALTHY=true
    break
  fi

  echo -ne "\r  ⏳ Status: ${STATUS} (${ELAPSED}s / ${MAX_WAIT}s)"
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done
echo ""

if [ "$HEALTHY" = "false" ]; then
  warn "app-${NEW_COLOR} failed to pass health check within ${MAX_WAIT} seconds"
  warn "Deploy failed! Rolling back to previous container state..."
  docker compose -f "$COMPOSE_FILE" --profile "$NEW_COLOR" stop "app-$NEW_COLOR"
  
  if docker image inspect tribes-app:rollback >/dev/null 2>&1; then
    docker tag tribes-app:rollback tribes-app:latest
    ok "Rollback image tag restored (tribes-app:latest)"
  fi
  fail "Server-side deployment aborted. Old container state preserved."
fi

ok "app-${NEW_COLOR} container passed health check successfully!"

# ── Step 9: Stop the OLD container ───────────────────────────
if [ "$ACTIVE_COLOR" != "none" ]; then
  log "Gracefully stopping app-${ACTIVE_COLOR}..."
  docker compose -f "$COMPOSE_FILE" --profile "$ACTIVE_COLOR" stop "app-$ACTIVE_COLOR"
  ok "app-${ACTIVE_COLOR} stopped"
else
  # Cleanup old legacy single container if exists
  OLD_RUNNING=$(docker ps -q --filter name=tribes-app-1 2>/dev/null || echo "")
  if [ -n "$OLD_RUNNING" ]; then
    log "Stopping legacy tribes-app-1 container..."
    docker stop tribes-app-1 && docker rm tribes-app-1
    ok "Legacy container removed"
  fi
fi

# ── Step 10: Persist new state ───────────────────────────────
echo "$NEW_COLOR" > "$STATE_FILE"
ok "Active color set to: ${NEW_COLOR}"

# ── Step 11: Final end-to-end health verification ────────────
log "Running final internal verification..."
sleep 3
HEALTH_RESULT=$(docker exec "tribes-app-${NEW_COLOR}" wget -qO- "$HEALTH_URL" 2>/dev/null || echo "UNHEALTHY")

if [[ "$HEALTH_RESULT" =~ \"status\":\"ok\" ]]; then
  ok "End-to-end health verification passed: $HEALTH_RESULT"
else
  warn "Warning: End-to-end health verification returned unexpected response: $HEALTH_RESULT"
fi

# ── Step 12: Cleanup old resources ───────────────────────────
log "Pruning exited docker containers, builder caches, and untagged images..."
docker container prune -f >/dev/null
docker image prune -af --filter 'until=168h' >/dev/null
docker builder prune --keep-storage 2G --force >/dev/null
ok "Docker system pruned successfully"

# ── Step 13: Setup Cron Jobs ─────────────────────────────────
log "Configuring cleanup cron jobs..."
CRON_JOB="0 3 * * * CONTAINER=\$(cat /opt/tribes/.active-color 2>/dev/null || echo blue) && cd /opt/tribes && docker compose -f docker-compose.prod.yml --profile \$CONTAINER exec -T app-\$CONTAINER npx tsx scripts/cleanup-seaweedfs.ts >> /var/log/tribes-cleanup.log 2>&1"
(crontab -l 2>/dev/null | grep -v "cleanup-seaweedfs.ts" ; echo "$CRON_JOB") | crontab -
ok "Cron jobs successfully updated"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
# Note: Keep the tone professional and clean, avoiding excessive congratulations
echo -e "${GREEN}  Zero-downtime container swap completed successfully!${NC}"
echo -e "${GREEN}  Active deployment: app-${NEW_COLOR}${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
