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
  --exclude='.backfill-slugs-done' \
  -e "ssh -o StrictHostKeyChecking=no" \
  "$LOCAL_DIR/" "$REMOTE_HOST:$REMOTE_DIR/" \
  | tail -5
ok "Files synced"

# ── Step 3: Build Docker image ───────────────────────────────
if [ "$SKIP_BUILD" = true ]; then
  warn "Skipping build (--skip-build flag)"
else
  # Generate a unique build fingerprint for version mismatch detection
  GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "nogit")
  BUILD_TS=$(date +%s)
  BUILD_ID="${GIT_SHA}-${BUILD_TS}"

  # ── Step 3a: Preserve current image for instant rollback ──────
  # Tag the currently running image BEFORE building the new one.
  # If anything goes wrong, we can restore tribes-app:rollback instantly.
  log "Preserving current image as tribes-app:rollback..."
  ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
    "docker tag tribes-app:latest tribes-app:rollback 2>/dev/null || echo 'No existing image to preserve (first deploy)'"
  ok "Rollback image preserved"

  log "Building tribes-app:latest image (build: ${BUILD_ID})..."
  ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
    "cd $REMOTE_DIR && docker build --build-arg BUILD_ID=${BUILD_ID} -t tribes-app:latest -f Dockerfile . 2>&1" \
    | tail -10
  ok "Image built: tribes-app:latest (${BUILD_ID})"

  # ── Step 3b: Crypto module integrity hash ────────────────────
  AUDIT_REPO="$LOCAL_DIR/scratch/tribes-encryption-audit"
  if [ -d "$AUDIT_REPO" ]; then
    log "Hashing crypto source files for integrity verification..."
    CRYPTO_SRC="$LOCAL_DIR/src/lib/crypto"
    INTEGRITY_FILE="$AUDIT_REPO/crypto-integrity.json"
    # Sync current source files to the audit repo (keeps published code in sync)
    log "Syncing crypto source to audit repo..."
    for f in "$CRYPTO_SRC"/*.ts; do
      NAME=$(basename "$f")
      TARGET="$AUDIT_REPO/src/$NAME"
      # Add copyright header if the source file doesn't have one
      if head -1 "$f" | grep -q "Copyright"; then
        cp "$f" "$TARGET"
      else
        echo '// Copyright (c) 2026 Tribes Social Co-Op. MIT License.' > "$TARGET"
        echo '// https://github.com/TribesSocialCoOp/tribes-encryption-audit' >> "$TARGET"
        echo '' >> "$TARGET"
        cat "$f" >> "$TARGET"
      fi
    done

    # Build the JSON with source file hashes
    INTEGRITY_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    cat > "$INTEGRITY_FILE" <<INTEGRITY_EOF
{
  "buildId": "$BUILD_ID",
  "timestamp": "$INTEGRITY_TIMESTAMP",
  "sources": {
INTEGRITY_EOF

    FIRST=true
    for f in "$CRYPTO_SRC"/*.ts; do
      NAME=$(basename "$f")
      HASH=$(shasum -a 256 "$f" | awk '{print $1}')
      if [ "$FIRST" = true ]; then
        FIRST=false
      else
        echo "," >> "$INTEGRITY_FILE"
      fi
      printf '    "%s": "%s"' "$NAME" "$HASH" >> "$INTEGRITY_FILE"
    done

    cat >> "$INTEGRITY_FILE" <<INTEGRITY_EOF

  }
}
INTEGRITY_EOF

    # Auto-commit source files + hashes to audit repo
    if [ -d "$AUDIT_REPO/.git" ]; then
      cd "$AUDIT_REPO"
      git add src/ crypto-integrity.json
      if ! git diff --cached --quiet 2>/dev/null; then
        git commit -m "integrity: source + hashes for build $BUILD_ID" -q
        git push -q 2>/dev/null && ok "Crypto source + hashes pushed to audit repo" || warn "Audit repo push failed (run manually)"
      else
        ok "Crypto source + hashes unchanged"
      fi
      cd "$LOCAL_DIR"
    fi
  else
    log "Audit repository not found at $AUDIT_REPO. Skipping crypto module integrity sync."
  fi
fi

# ── Step 4: Run versioned schema migrations ─────────────────
# Uses drizzle-kit migrate (versioned SQL files in ./drizzle/)
# instead of push --force. Migration failures are FATAL.
#
# To generate a new migration locally:
#   npx drizzle-kit generate
# Review the SQL, commit it, then deploy.
log "Running database migrations..."

set +e
MIGRATE_OUTPUT=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" 'bash -s' <<'MIGRATE_EOF'
cd /opt/tribes
source .env.production

PG_IP=$(docker inspect tribes-postgres-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null)
PG_NETWORK=$(docker inspect tribes-postgres-1 --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null)

if [ -z "$PG_IP" ]; then
  echo "FATAL: PostgreSQL container not found"
  exit 1
fi

# Build the builder stage (has all node_modules including drizzle-kit)
docker build -q --target builder -t tribes-builder . > /dev/null 2>&1

# Run versioned migrations (NOT push --force)
docker run --rm \
  --network="$PG_NETWORK" \
  -e DATABASE_URL="postgresql://tribes:${POSTGRES_PASSWORD}@${PG_IP}:5432/tribes" \
  tribes-builder npx drizzle-kit migrate 2>&1
MIGRATE_EOF
)
MIGRATE_EXIT=$?
set -e

echo "$MIGRATE_OUTPUT" | tail -10
if [ "$MIGRATE_EXIT" -ne 0 ]; then
  fail "DATABASE MIGRATION FAILED — deploy aborted. Fix the migration and retry. The current production deployment is still running."
fi
ok "Database migrations applied successfully"

# ── Step 4b: Backfill post slugs (one-time) ──────────────────
# Ensures all existing posts have SEO slugs before the new app goes live.
# Gated by a sentinel file — only runs once per server.
# To re-run: ssh root@... rm /opt/tribes/.backfill-slugs-done
BACKFILL_SENTINEL=".backfill-slugs-done"
SENTINEL_EXISTS=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "test -f $REMOTE_DIR/$BACKFILL_SENTINEL && echo 'yes' || echo 'no'")

if [ "$SENTINEL_EXISTS" = "yes" ]; then
  ok "Post slug backfill already completed (sentinel exists) — skipping"
else
  log "Running post slug backfill..."

  set +e
  ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" "bash -c '
    cd /opt/tribes
    source .env.production
    PG_IP=\$(docker inspect tribes-postgres-1 --format \"{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}\" 2>/dev/null)
    PG_NETWORK=\$(docker inspect tribes-postgres-1 --format \"{{range \\\$k, \\\$v := .NetworkSettings.Networks}}{{\\\$k}}{{end}}\" 2>/dev/null)
    if [ -z \"\$PG_IP\" ]; then
      echo \"PostgreSQL container not found — skipping backfill\"
      exit 0
    fi
    docker run --rm \
      --network=\"\$PG_NETWORK\" \
      -e DATABASE_URL=\"postgresql://tribes:\${POSTGRES_PASSWORD}@\${PG_IP}:5432/tribes\" \
      tribes-builder npx tsx src/db/backfill-post-slugs.ts 2>&1
  '" | tail -5
  BACKFILL_EXIT=${PIPESTATUS[0]}
  set -e

  if [ "$BACKFILL_EXIT" -ne 0 ]; then
    warn "Post slug backfill failed — will retry next deploy"
  else
    # Write sentinel so future deploys skip this step
    ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
      "date -u '+completed %Y-%m-%dT%H:%M:%SZ' > $REMOTE_DIR/$BACKFILL_SENTINEL"
    ok "Post slug backfill complete (sentinel written)"
  fi
fi

# ── Step 4c: Backfill user slugs (one-time) ───────────────────
# Ensures all existing users have URL slugs for /u/{slug} routing.
# Gated by a sentinel file — only runs once per server.
# To re-run: ssh root@... rm /opt/tribes/.backfill-user-slugs-done
USER_SLUG_SENTINEL=".backfill-user-slugs-done"
USER_SLUG_EXISTS=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "test -f $REMOTE_DIR/$USER_SLUG_SENTINEL && echo 'yes' || echo 'no'")

if [ "$USER_SLUG_EXISTS" = "yes" ]; then
  ok "User slug backfill already completed (sentinel exists) — skipping"
else
  log "Running user slug backfill..."

  set +e
  ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" "bash -c '
    cd /opt/tribes
    source .env.production
    PG_IP=\$(docker inspect tribes-postgres-1 --format \"{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}\" 2>/dev/null)
    PG_NETWORK=\$(docker inspect tribes-postgres-1 --format \"{{range \\\$k, \\\$v := .NetworkSettings.Networks}}{{\\\$k}}{{end}}\" 2>/dev/null)
    if [ -z \"\$PG_IP\" ]; then
      echo \"PostgreSQL container not found — skipping backfill\"
      exit 0
    fi
    docker run --rm \
      --network=\"\$PG_NETWORK\" \
      -e DATABASE_URL=\"postgresql://tribes:\${POSTGRES_PASSWORD}@\${PG_IP}:5432/tribes\" \
      tribes-builder npx tsx src/db/backfill-user-slugs.ts 2>&1
  '" | tail -5
  USER_BACKFILL_EXIT=${PIPESTATUS[0]}
  set -e

  if [ "$USER_BACKFILL_EXIT" -ne 0 ]; then
    warn "User slug backfill failed — will retry next deploy"
  else
    ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
      "date -u '+completed %Y-%m-%dT%H:%M:%SZ' > $REMOTE_DIR/$USER_SLUG_SENTINEL"
    ok "User slug backfill complete (sentinel written)"
  fi
fi

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
  warn "Rolling back: stopping app-${NEW_COLOR}, restoring rollback image..."
  ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
    "cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE --profile $NEW_COLOR stop app-$NEW_COLOR 2>&1"

  # Restore the rollback image so the still-running old container stays healthy
  # and any restart uses the known-good code
  ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
    "docker tag tribes-app:rollback tribes-app:latest 2>/dev/null || true"

  fail "Deploy aborted — old deployment is still running (rollback image restored)"
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
log "Pruning exited containers, unused Docker images and build cache..."
ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "docker container prune -f 2>&1 | tail -1 && \
   docker image prune -af --filter 'until=168h' 2>&1 | tail -1 && \
   docker builder prune --keep-storage 2G --force 2>&1 | tail -1"
ok "Cleanup complete"

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
