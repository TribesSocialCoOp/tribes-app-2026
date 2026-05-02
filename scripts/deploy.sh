#!/usr/bin/env bash
# ============================================================
# Tribes.app — Zero-Downtime Blue/Green Production Deploy
# ============================================================
# Usage:  ./scripts/deploy.sh [--skip-build] [--migrate-only]
#
# What this does:
#   1. Runs local TypeScript type-check (catches errors before deploy)
#   2. Rsyncs project files to the production server
#   3. Builds Docker image as tribes-app:latest
#   4. Pushes Drizzle schema to PostgreSQL via builder container
#   5. Detects the active color (blue/green) from server state
#   6. Starts the INACTIVE color
#   7. Waits until the new container is healthy
#   8. Stops the OLD color
#   9. Persists the new active color to state file
#  10. Verifies the health endpoint
#  11. Cleans up old Docker images
#  12. Sets up cron jobs
# ============================================================

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
REMOTE_HOST="root@5.78.189.222"
REMOTE_DIR="/opt/tribes"
COMPOSE_FILE="docker-compose.prod.yml"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HEALTH_URL="http://127.0.0.1:9002/api/health"
STATE_FILE=".active-color"

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
  --exclude='.active-color' \
  -e "ssh -o StrictHostKeyChecking=no" \
  "$LOCAL_DIR/" "$REMOTE_HOST:$REMOTE_DIR/" \
  | tail -5
ok "Files synced"

# ── Step 3: Build Docker image ───────────────────────────────
if [ "$SKIP_BUILD" = true ]; then
  warn "Skipping build (--skip-build flag)"
else
  log "Building tribes-app:latest image..."
  ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
    "cd $REMOTE_DIR && docker build -t tribes-app:latest -f Dockerfile . 2>&1" \
    | tail -10
  ok "Image built: tribes-app:latest"
fi

# ── Step 4: Push schema to PostgreSQL ────────────────────────
log "Pushing Drizzle schema to PostgreSQL..."

set +e
MIGRATE_OUTPUT=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" 'bash -s' <<'MIGRATE_EOF'
cd /opt/tribes
source .env.production

PG_IP=$(docker inspect tribes-postgres-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null)
PG_NETWORK=$(docker inspect tribes-postgres-1 --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null)

if [ -z "$PG_IP" ]; then
  echo "PostgreSQL container not found — skipping"
  exit 0
fi

# Build the builder stage (has all node_modules including drizzle-kit)
docker build -q --target builder -t tribes-builder . > /dev/null 2>&1

# Run drizzle-kit push on the same network as Postgres
docker run --rm \
  --network="$PG_NETWORK" \
  -e DATABASE_URL="postgresql://tribes:${POSTGRES_PASSWORD}@${PG_IP}:5432/tribes" \
  tribes-builder npx drizzle-kit push --force 2>&1
MIGRATE_EOF
)
MIGRATE_EXIT=$?
set -e

echo "$MIGRATE_OUTPUT" | tail -5
if [ "$MIGRATE_EXIT" -ne 0 ]; then
  fail "Schema push failed — see errors above"
fi
ok "Schema pushed to PostgreSQL"

if [ "$MIGRATE_ONLY" = true ]; then
  ok "Migration-only mode — skipping restart"
  exit 0
fi

# ── Step 5: Detect active color ──────────────────────────────
log "Detecting active deployment color..."
ACTIVE_COLOR=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "cat $REMOTE_DIR/$STATE_FILE 2>/dev/null || echo 'none'")

# Handle first deploy or migration from old single-container setup
if [ "$ACTIVE_COLOR" = "none" ]; then
  # Check if old single 'tribes-app-1' container exists
  OLD_CONTAINER=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
    "docker ps -q --filter name=tribes-app-1 2>/dev/null || true")
  if [ -n "$OLD_CONTAINER" ]; then
    warn "Migrating from single-container setup..."
    warn "The old 'tribes-app-1' container will be stopped after the new one is healthy."
  fi
  ACTIVE_COLOR="none"
  NEW_COLOR="blue"
elif [ "$ACTIVE_COLOR" = "blue" ]; then
  NEW_COLOR="green"
elif [ "$ACTIVE_COLOR" = "green" ]; then
  NEW_COLOR="blue"
else
  warn "Unknown color '$ACTIVE_COLOR' in state file — defaulting to blue"
  ACTIVE_COLOR="none"
  NEW_COLOR="blue"
fi

log "Active: ${BOLD}${ACTIVE_COLOR}${NC}  →  Deploying: ${BOLD}${NEW_COLOR}${NC}"

# ── Step 6: Start the NEW color ──────────────────────────────
log "Starting app-${NEW_COLOR}..."
ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE --profile $NEW_COLOR up -d app-$NEW_COLOR 2>&1" \
  | tail -5
ok "app-${NEW_COLOR} container started"

# Reload Caddy config so it picks up the new container DNS immediately
log "Reloading Caddy configuration..."
ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "docker exec tribes-caddy-1 caddy reload --config /etc/caddy/Caddyfile 2>&1 || true" \
  | tail -3
ok "Caddy config reloaded"

# ── Step 7: Wait for healthy ─────────────────────────────────
log "Waiting for app-${NEW_COLOR} to become healthy..."
MAX_WAIT=60
ELAPSED=0
HEALTHY=false

while [ $ELAPSED -lt $MAX_WAIT ]; do
  STATUS=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
    "docker inspect tribes-app-${NEW_COLOR} --format '{{.State.Health.Status}}' 2>/dev/null || echo 'starting'")

  if [ "$STATUS" = "healthy" ]; then
    HEALTHY=true
    break
  fi

  echo -ne "\r  ⏳ Status: ${STATUS} (${ELAPSED}s / ${MAX_WAIT}s)"
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done
echo "" # newline after progress

if [ "$HEALTHY" = false ]; then
  warn "app-${NEW_COLOR} failed to become healthy within ${MAX_WAIT}s"
  warn "Rolling back: stopping app-${NEW_COLOR}, keeping app-${ACTIVE_COLOR}"
  ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
    "cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE --profile $NEW_COLOR stop app-$NEW_COLOR 2>&1"
  fail "Deploy aborted — old deployment is still running"
fi
ok "app-${NEW_COLOR} is healthy!"

# ── Step 8: Stop the OLD color ───────────────────────────────
if [ "$ACTIVE_COLOR" != "none" ]; then
  log "Stopping app-${ACTIVE_COLOR}..."
  ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
    "cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE --profile $ACTIVE_COLOR stop app-$ACTIVE_COLOR 2>&1" \
    | tail -3
  ok "app-${ACTIVE_COLOR} stopped"
else
  # First deploy: stop old single-container if it exists
  OLD_RUNNING=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
    "docker ps -q --filter name=tribes-app-1 2>/dev/null || true")
  if [ -n "$OLD_RUNNING" ]; then
    log "Stopping legacy tribes-app-1 container..."
    ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
      "docker stop tribes-app-1 && docker rm tribes-app-1 2>&1 || true" \
      | tail -3
    ok "Legacy container removed"
  fi
fi

# ── Step 9: Persist active color ─────────────────────────────
ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "echo '$NEW_COLOR' > $REMOTE_DIR/$STATE_FILE"
ok "Active color set to: ${NEW_COLOR}"

# ── Step 10: Final health verification ───────────────────────
log "Running final health check..."
sleep 3

HEALTH_RESULT=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "docker exec tribes-app-${NEW_COLOR} wget -qO- $HEALTH_URL 2>/dev/null || echo 'UNHEALTHY'")

if [[ "$HEALTH_RESULT" =~ \"status\":\"ok\" ]]; then
  ok "App is healthy!"
else
  warn "Health check returned: $HEALTH_RESULT"
  warn "The container is running but may still be warming up"
fi

# ── Step 11: Cleanup ─────────────────────────────────────────
log "Pruning unused Docker images..."
ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "docker image prune -f 2>&1 | tail -1"
ok "Image cleanup complete"

# ── Step 12: Setup Cron Jobs ─────────────────────────────────
log "Setting up cron jobs..."
ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" <<'EOF'
  # Read current active color for cron targeting
  ACTIVE=$(cat /opt/tribes/.active-color 2>/dev/null || echo "blue")
  CRON_JOB="0 3 * * * CONTAINER=\$(cat /opt/tribes/.active-color 2>/dev/null || echo blue) && cd /opt/tribes && docker compose -f docker-compose.prod.yml --profile \$CONTAINER exec -T app-\$CONTAINER npx tsx scripts/cleanup-seaweedfs.ts >> /var/log/tribes-cleanup.log 2>&1"
  (crontab -l 2>/dev/null | grep -v "cleanup-seaweedfs.ts" ; echo "$CRON_JOB") | crontab -
EOF
ok "Cron jobs configured (reads active color dynamically)"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Zero-downtime deploy complete!  🚀${NC}"
echo -e "${GREEN}  Active: app-${NEW_COLOR}${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
