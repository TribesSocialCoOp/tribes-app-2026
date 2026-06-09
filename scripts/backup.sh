#!/bin/bash
# ============================================================
# Tribes.app — Encrypted Nightly Backup
# ============================================================
# Runs as the 'tribes' user via cron at 3am UTC.
#
# Strategy:
#   1. Atomic SQLite snapshot (no downtime, no corruption)
#   2. SeaweedFS filer metadata snapshot
#   3. Config/env files
#   4. Feed all into restic (AES-256 encrypted, deduplicated)
#   5. Prune old snapshots
#   6. Push to backup server via SFTP
#
# First-time setup:
#   restic -r /backups/restic-repo init
#   echo "your-strong-password" > /etc/tribes/restic-password
#   chmod 600 /etc/tribes/restic-password
# ============================================================

set -euo pipefail

COMPOSE_DIR="/opt/tribes"
STAGING_DIR="/tmp/tribes-backup-$$"          # Unique per run (PID)
RESTIC_REPO="/backups/restic-repo"
RESTIC_PASSWORD_FILE="/etc/tribes/restic-password"
LOG_PREFIX="[tribes-backup $(date '+%Y-%m-%d %H:%M:%S')]"

# Source offsite backup config (created by setup-offsite-backup.sh)
if [[ -f /etc/tribes/backup.env ]]; then
  # shellcheck source=/dev/null
  source /etc/tribes/backup.env
fi

BACKUP_HOST="${BACKUP_HOST:-}"               # Set to backup server IP
BACKUP_USER="${BACKUP_USER:-tribes}"
BACKUP_REMOTE_PATH="${BACKUP_REMOTE_PATH:-/backups/tribes-restic}"

# ── Preflight checks ──────────────────────────────────────
if [[ ! -f "$RESTIC_PASSWORD_FILE" ]]; then
  echo "$LOG_PREFIX ERROR: restic password file not found at $RESTIC_PASSWORD_FILE" >&2
  exit 1
fi

if ! command -v restic &>/dev/null; then
  echo "$LOG_PREFIX ERROR: restic not installed" >&2
  exit 1
fi

mkdir -p "$STAGING_DIR/db" "$STAGING_DIR/media" "$STAGING_DIR/config"
trap 'rm -rf "$STAGING_DIR"' EXIT   # Always clean up staging dir

echo "$LOG_PREFIX Starting backup..."

# ── Step 1: PostgreSQL dump (atomic, custom format for fast restore) ──
echo "$LOG_PREFIX Dumping PostgreSQL database..."
docker compose -f "$COMPOSE_DIR/docker-compose.prod.yml" \
  exec -T postgres pg_dump -U tribes -Fc --no-owner tribes \
  > "$STAGING_DIR/db/tribes.pgdump"

DB_SIZE=$(du -sh "$STAGING_DIR/db/tribes.pgdump" 2>/dev/null | cut -f1)
echo "$LOG_PREFIX DB dump: $DB_SIZE"

if [ ! -s "$STAGING_DIR/db/tribes.pgdump" ]; then
  echo "$LOG_PREFIX ERROR: pg_dump produced empty file!" >&2
  exit 1
fi

# ── Step 2: SeaweedFS filer metadata ──────────────────────
echo "$LOG_PREFIX Snapshotting SeaweedFS metadata..."
docker compose -f "$COMPOSE_DIR/docker-compose.prod.yml" exec -T seaweedfs-filer \
  tar czf /tmp/filer-meta.tar.gz /data 2>/dev/null || true
docker compose -f "$COMPOSE_DIR/docker-compose.prod.yml" \
  cp seaweedfs-filer:/tmp/filer-meta.tar.gz "$STAGING_DIR/media/filer-meta.tar.gz" 2>/dev/null || true

# ── Step 3: Config backup (env file — contains secrets, hence encryption is critical)
echo "$LOG_PREFIX Backing up config..."
cp "$COMPOSE_DIR/.env.production" "$STAGING_DIR/config/" 2>/dev/null || true
cp "$COMPOSE_DIR/docker-compose.prod.yml" "$STAGING_DIR/config/"

# ── Step 4: Restic backup (encrypted + deduplicated) ─────
echo "$LOG_PREFIX Running restic backup..."
restic \
  --repo "$RESTIC_REPO" \
  --password-file "$RESTIC_PASSWORD_FILE" \
  backup "$STAGING_DIR" \
  --tag "tribes-nightly" \
  --tag "$(date '+%Y-%m-%d')"

# ── Step 5: Prune (keep 7 daily, 4 weekly, 3 monthly) ────
echo "$LOG_PREFIX Pruning old snapshots..."
restic \
  --repo "$RESTIC_REPO" \
  --password-file "$RESTIC_PASSWORD_FILE" \
  forget \
  --group-by host \
  --tag tribes-nightly \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 3 \
  --prune

# ── Step 6: Integrity check (run weekly on Sundays) ───────
if [[ "$(date '+%u')" == "7" ]]; then
  echo "$LOG_PREFIX Running integrity check (weekly)..."
  restic \
    --repo "$RESTIC_REPO" \
    --password-file "$RESTIC_PASSWORD_FILE" \
    check
fi

# ── Step 7: Offsite push (if BACKUP_HOST is configured) ──
if [[ -n "$BACKUP_HOST" ]]; then
  echo "$LOG_PREFIX Pushing to offsite ($BACKUP_HOST)..."
  rsync -az --delete \
    -e "ssh -o StrictHostKeyChecking=accept-new -i /root/.ssh/backup_key" \
    "$RESTIC_REPO/" \
    "$BACKUP_USER@$BACKUP_HOST:$BACKUP_REMOTE_PATH/"
  echo "$LOG_PREFIX Offsite push complete."
else
  echo "$LOG_PREFIX BACKUP_HOST not set — skipping offsite push."
fi

echo "$LOG_PREFIX Backup complete."
restic \
  --repo "$RESTIC_REPO" \
  --password-file "$RESTIC_PASSWORD_FILE" \
  snapshots --last \
  --json | jq -r '.[] | "  Snapshot \(.short_id) at \(.time | split("T")[0]) — \(.paths | join(", "))"'
