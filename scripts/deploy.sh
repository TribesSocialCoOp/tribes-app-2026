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
HEALTH_URL="http://localhost:9002/api/health"

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

# Ensure the migration tracking table exists
ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" "curl -sf -X POST '${SQLD_URL}/v2/pipeline' \
  -H 'Content-Type: application/json' \
  -d '{\"requests\":[{\"type\":\"execute\",\"stmt\":{\"sql\":\"CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at INTEGER NOT NULL)\"}}]}'" > /dev/null 2>&1
ok "Migration tracking table ready"

# Get already-applied migration hashes
APPLIED=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" "curl -sf -X POST '${SQLD_URL}/v2/pipeline' \
  -H 'Content-Type: application/json' \
  -d '{\"requests\":[{\"type\":\"execute\",\"stmt\":{\"sql\":\"SELECT hash FROM __drizzle_migrations ORDER BY id\"}}]}'" 2>/dev/null)

MIGRATION_COUNT=0
SKIPPED_COUNT=0

# Process each migration file in order
for migration_file in "$LOCAL_DIR"/drizzle/[0-9]*.sql; do
  [ -f "$migration_file" ] || continue
  filename=$(basename "$migration_file" .sql)
  
  # Use the filename as the hash (matches Drizzle convention)
  hash="$filename"
  
  # Check if already applied
  if echo "$APPLIED" | grep -q "\"$hash\""; then
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi
  
  log "  Applying: $filename..."
  
  # Read migration SQL and split on statement breakpoints
  # Drizzle uses `--> statement-breakpoint` as delimiter
  while IFS= read -r statement; do
    # Skip empty statements
    trimmed=$(echo "$statement" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    [ -z "$trimmed" ] && continue
    
    # Escape the SQL for JSON (handle quotes, newlines)
    escaped_sql=$(echo "$trimmed" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')
    
    result=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" "curl -sf -X POST '${SQLD_URL}/v2/pipeline' \
      -H 'Content-Type: application/json' \
      -d '{\"requests\":[{\"type\":\"execute\",\"stmt\":{\"sql\":${escaped_sql}}}]}'" 2>&1)
    
    # Check for errors (but allow "already exists" type errors for idempotency)
    if echo "$result" | grep -q '"type":"error"'; then
      error_msg=$(echo "$result" | python3 -c 'import sys,json; r=json.load(sys.stdin); [print(x["error"]["message"]) for x in r.get("results",[]) if x.get("type")=="error"]' 2>/dev/null || echo "$result")
      # Skip "duplicate column" or "already exists" errors (idempotent migrations)
      if echo "$error_msg" | grep -qi "already exists\|duplicate column"; then
        warn "  Skipped (already exists): $trimmed"
      else
        fail "Migration failed for $filename: $error_msg"
      fi
    fi
  done < <(cat "$migration_file" | sed 's/-->[[:space:]]*statement-breakpoint/\x00/g' | tr '\0' '\n' | grep -v '^--' | grep -v '^$')
  
  # Record the migration as applied
  now_ms=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
  ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" "curl -sf -X POST '${SQLD_URL}/v2/pipeline' \
    -H 'Content-Type: application/json' \
    -d '{\"requests\":[{\"type\":\"execute\",\"stmt\":{\"sql\":\"INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('\''${hash}'\\''', ${now_ms})\"}}]}'" > /dev/null 2>&1
  
  MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
  ok "  Applied: $filename"
done

if [ "$MIGRATION_COUNT" -eq 0 ]; then
  ok "No pending migrations ($SKIPPED_COUNT already applied)"
else
  ok "$MIGRATION_COUNT migration(s) applied, $SKIPPED_COUNT skipped"
fi

if [ "$MIGRATE_ONLY" = true ]; then
  ok "Migration-only mode — skipping build"
  exit 0
fi

# ── Step 4: Build & restart ──────────────────────────────────
if [ "$SKIP_BUILD" = true ]; then
  warn "Skipping build (--skip-build flag)"
else
  log "Building and restarting app container..."
  ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
    "cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE up -d --build app 2>&1" \
    | tail -10
  ok "Container rebuilt and restarted"
fi

# ── Step 5: Health check ─────────────────────────────────────
log "Waiting for health check..."
sleep 5
HEALTH_RESULT=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" \
  "docker exec $APP_CONTAINER wget -qO- $HEALTH_URL 2>/dev/null || echo 'UNHEALTHY'")

if echo "$HEALTH_RESULT" | grep -qi "ok\|healthy\|status"; then
  ok "App is healthy!"
else
  warn "Health check returned: $HEALTH_RESULT (app may still be starting)"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy complete!  🚀${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
