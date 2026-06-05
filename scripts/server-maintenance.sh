#!/usr/bin/env bash
# ============================================================
# Tribes.app — Server Maintenance (Docker Cleanup + Disk Alert)
# ============================================================
# Runs via cron every 6 hours. Two responsibilities:
#   1. Prune stale Docker images, keeping only active blue/green
#      app images and the service images (postgres, caddy, etc.)
#   2. Alert if disk usage exceeds thresholds (70% warn, 85% crit)
#
# Install:  Automatically installed by remote_deploy.sh
# Manual:   bash /opt/tribes/scripts/server-maintenance.sh
# Note:     Designed for GNU/Linux production environment.
# ============================================================

set -euo pipefail

# Source production env (needed for CRON_SECRET when run from cron)
if [ -f /opt/tribes/.env.production ]; then
  set -a
  source /opt/tribes/.env.production
  set +a
fi

LOG_FILE="/var/log/tribes-maintenance.log"
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

log()  { echo "[$TIMESTAMP] [INFO]  $1" | tee -a "$LOG_FILE"; }
warn() { echo "[$TIMESTAMP] [WARN]  $1" | tee -a "$LOG_FILE"; }
crit() { echo "[$TIMESTAMP] [CRIT]  $1" | tee -a "$LOG_FILE"; }

# ── Configuration ────────────────────────────────────────────
DISK_WARN_THRESHOLD=70   # percentage
DISK_CRIT_THRESHOLD=85   # percentage
DISK_EMRG_THRESHOLD=95   # percentage — triggers emergency prune
STATE_FILE="/opt/tribes/.active-color"
ALERT_COOLDOWN_FILE="/tmp/tribes-disk-alert-sent"
ALERT_COOLDOWN_HOURS=6

# ── Step 1: Docker Image Cleanup ─────────────────────────────
# Keep: tribes-app:blue, tribes-app:green (active + rollback)
# Keep: All service images used by running containers
# Remove: tribes-builder, dangling layers, old tagged images

log "Starting Docker image cleanup..."

# Get list of images currently used by running containers
USED_IMAGES=$(docker ps --format '{{.Image}}' | sort -u)

# Get the active color — protect both slots
ACTIVE_COLOR=$(cat "$STATE_FILE" 2>/dev/null || echo "unknown")

# Build a list of images to protect
PROTECTED_IMAGES="tribes-app:blue tribes-app:green"

# Count images before
BEFORE_COUNT=$(docker images -q | wc -l | tr -d ' ')

# Remove the tribes-builder image (rebuilt every deploy, ~350MB each)
if docker image inspect tribes-builder &>/dev/null; then
  docker rmi tribes-builder 2>/dev/null && log "Removed tribes-builder image" || true
fi

# Prune dangling images (untagged layers from interrupted builds)
DANGLING_RECLAIMED=$(docker image prune -f 2>/dev/null | tail -1 || echo "0B")
log "Dangling prune: $DANGLING_RECLAIMED"

# Remove any tribes-app images that aren't :blue or :green
# (e.g., :latest, :rollback, or other stale tags)
docker images "tribes-app" --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | while read -r img; do
  if [[ "$img" != "tribes-app:blue" && "$img" != "tribes-app:green" ]]; then
    docker rmi "$img" 2>/dev/null && log "Removed stale app image: $img" || true
  fi
done

# Remove any image not used by a running container AND not in our protected list
# This catches old base images, builder intermediates, etc.
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' 2>/dev/null | while read -r img_tag img_id; do
  # Skip protected images
  for protected in $PROTECTED_IMAGES; do
    [[ "$img_tag" == "$protected" ]] && continue 2
  done

  # Skip images used by running containers
  for used in $USED_IMAGES; do
    [[ "$img_tag" == "$used" ]] && continue 2
    # Also check by ID (some containers reference by ID)
    [[ "$img_id" == "$used"* ]] && continue 2
  done

  # Skip <none>:<none> — handled by dangling prune above
  [[ "$img_tag" == "<none>:<none>" ]] && continue

  # This image is not protected and not in use — check if it's a base image
  # used by our protected app images (don't remove shared layers)
  # docker rmi is safe here — it won't remove images that are parents of other images
  docker rmi "$img_tag" 2>/dev/null && log "Removed unused image: $img_tag" || true
done

# Clean up build cache (keep 2G for faster rebuilds)
docker builder prune --keep-storage 2G --force >/dev/null 2>&1 || true

AFTER_COUNT=$(docker images -q | wc -l | tr -d ' ')
log "Image cleanup complete: $BEFORE_COUNT → $AFTER_COUNT images"

# ── Step 2: Disk Space Monitoring ─────────────────────────────

DISK_USAGE=$(df / --output=pcent | tail -1 | tr -d ' %')
DISK_AVAIL=$(df -h / --output=avail | tail -1 | tr -d ' ')
DISK_TOTAL=$(df -h / --output=size | tail -1 | tr -d ' ')

log "Disk usage: ${DISK_USAGE}% (${DISK_AVAIL} available of ${DISK_TOTAL})"

# Emergency: if above 95%, do aggressive prune NOW
if [ "$DISK_USAGE" -ge "$DISK_EMRG_THRESHOLD" ]; then
  crit "EMERGENCY: Disk at ${DISK_USAGE}% — running aggressive cleanup!"

  # Aggressive cleanup, but ALWAYS preserve tribes-app:blue and tribes-app:green
  # for rollback capability. Named volumes are also never touched.

  # 1. Remove ALL non-running containers
  docker container prune -f 2>/dev/null || true

  # 2. Remove images NOT used by running containers, EXCEPT our protected tags.
  #    We iterate manually instead of using `docker system prune -af` which would
  #    nuke the inactive blue/green slot image.
  docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' 2>/dev/null | while read -r img_tag img_id; do
    # Always protect both blue/green app images
    [[ "$img_tag" == "tribes-app:blue" ]] && continue
    [[ "$img_tag" == "tribes-app:green" ]] && continue
    # Skip <none>:<none> — handled by dangling prune
    [[ "$img_tag" == "<none>:<none>" ]] && continue
    # Skip images used by running containers
    skip=false
    for used in $USED_IMAGES; do
      [[ "$img_tag" == "$used" || "$img_id" == "$used"* ]] && skip=true && break
    done
    [[ "$skip" == "true" ]] && continue
    docker rmi -f "$img_tag" 2>/dev/null && crit "Emergency removed: $img_tag" || true
  done

  # 3. Prune dangling images (untagged layers) and build cache
  docker image prune -f 2>/dev/null || true
  docker builder prune --all --force 2>/dev/null || true

  # 4. Remove ONLY anonymous volumes (unnamed, orphaned).
  #    Named volumes declared in docker-compose.prod.yml are NOT affected.
  docker volume prune -f 2>/dev/null || true

  # 5. Truncate large log files
  find /var/log -name "*.log" -size +50M -exec truncate -s 10M {} \;

  # Re-check
  DISK_USAGE=$(df / --output=pcent | tail -1 | tr -d ' %')
  crit "Post-emergency disk: ${DISK_USAGE}%"
fi

# Alert logic with cooldown (don't spam every 6 hours if nothing changed)
send_alert() {
  local level="$1"
  local message="$2"

  # Check cooldown
  if [ -f "$ALERT_COOLDOWN_FILE" ]; then
    LAST_ALERT=$(cat "$ALERT_COOLDOWN_FILE" 2>/dev/null || echo "0")
    NOW=$(date +%s)
    DIFF=$(( (NOW - LAST_ALERT) / 3600 ))
    if [ "$DIFF" -lt "$ALERT_COOLDOWN_HOURS" ] && [ "$level" != "EMERGENCY" ]; then
      log "Alert suppressed (cooldown: ${DIFF}h < ${ALERT_COOLDOWN_HOURS}h)"
      return
    fi
  fi

  # Send alert via the app's health endpoint (which logs + can trigger email)
  ACTIVE=$(cat "$STATE_FILE" 2>/dev/null || echo "green")
  CONTAINER="tribes-app-${ACTIVE}"

  # Try to send via the running app container's internal API
  SERVER_HOSTNAME=$(hostname -f 2>/dev/null || hostname)
  SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown")
  docker exec "$CONTAINER" wget -qO- --post-data="{\"level\":\"$level\",\"message\":\"$message\",\"disk_usage\":$DISK_USAGE,\"disk_avail\":\"$DISK_AVAIL\",\"hostname\":\"$SERVER_HOSTNAME\",\"server_ip\":\"$SERVER_IP\"}" \
    --header="Content-Type: application/json" \
    --header="Authorization: Bearer ${CRON_SECRET:-}" \
    "http://127.0.0.1:9002/api/cron/disk-alert" 2>/dev/null || true

  # Also write to journald for external monitoring pickup
  logger -t tribes-disk-alert -p "user.${level,,}" "$message"

  # Record alert timestamp
  date +%s > "$ALERT_COOLDOWN_FILE"
  warn "Alert sent: [$level] $message"
}

if [ "$DISK_USAGE" -ge "$DISK_EMRG_THRESHOLD" ]; then
  send_alert "EMERGENCY" "🚨 Tribes.app disk at ${DISK_USAGE}% (${DISK_AVAIL} free). Emergency prune executed. Immediate attention required!"
elif [ "$DISK_USAGE" -ge "$DISK_CRIT_THRESHOLD" ]; then
  send_alert "CRITICAL" "🔴 Tribes.app disk at ${DISK_USAGE}% (${DISK_AVAIL} free). Service may be impacted soon."
elif [ "$DISK_USAGE" -ge "$DISK_WARN_THRESHOLD" ]; then
  send_alert "WARNING" "⚠️ Tribes.app disk at ${DISK_USAGE}% (${DISK_AVAIL} free). Consider cleanup."
else
  log "Disk healthy (${DISK_USAGE}%)"
fi

# ── Step 3: Log Rotation ─────────────────────────────────────
# Trim our own maintenance log to prevent unbounded growth
if [ -f "$LOG_FILE" ]; then
  LOG_LINES=$(wc -l < "$LOG_FILE")
  if [ "$LOG_LINES" -gt 1000 ]; then
    tail -500 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
    log "Trimmed maintenance log (was $LOG_LINES lines)"
  fi
fi

log "Maintenance complete."
