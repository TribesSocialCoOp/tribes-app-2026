#!/usr/bin/env bash
# ==============================================================
# migrate-sqlite-to-postgres.sh
# Phase 4: Migrate existing data from sqld (SQLite) → PostgreSQL
#
# Usage:
#   POSTGRES_PASSWORD=<your-password> ./scripts/migrate-sqlite-to-postgres.sh
#
# Prerequisites:
#   - pgloader installed (brew install pgloader / apt install pgloader)
#   - Postgres running (docker compose -f docker-compose.prod.yml up postgres -d)
#   - sqld container still running (for the cp step)
# ==============================================================
set -euo pipefail

PG_USER="${PG_USER:-tribes}"
PG_DB="${PG_DB:-tribes}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD}"

# Auto-detect the Postgres container IP on the Docker network
if [ -z "${PG_HOST:-}" ]; then
  PG_HOST=$(docker inspect tribes-postgres-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null || echo "")
  if [ -z "$PG_HOST" ]; then
    echo "✗ Could not detect PostgreSQL container. Is it running?"
    echo "  Hint: docker compose -f docker-compose.prod.yml up postgres -d"
    exit 1
  fi
  echo "  Auto-detected Postgres container IP: $PG_HOST"
fi
PG_PORT="${PG_PORT:-5432}"
PG_URL="postgresql://${PG_USER}:${POSTGRES_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}"
BACKUP_FILE="./backup-sqld-$(date +%Y%m%d-%H%M%S).db"

echo "═══════════════════════════════════════════════════"
echo "  Tribes: SQLite → PostgreSQL Migration"
echo "═══════════════════════════════════════════════════"

# ── Step 1: Snapshot the sqld database ───────────────────────
echo ""
echo "→ Step 1: Extracting sqld database snapshot..."
if docker ps --format '{{.Names}}' | grep -q sqld; then
  docker cp "$(docker ps --format '{{.Names}}' | grep sqld):/var/lib/sqld/dbs/default/data" "$BACKUP_FILE"
  echo "  ✓ Snapshot saved to $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
else
  echo "  ⚠ No sqld container found. Looking for local .db file..."
  if [ -f "./tribes.db" ]; then
    cp "./tribes.db" "$BACKUP_FILE"
    echo "  ✓ Copied local tribes.db to $BACKUP_FILE"
  else
    echo "  ✗ No database found. Exiting."
    exit 1
  fi
fi

# ── Step 2: Pre-migration row counts (SQLite) ───────────────
echo ""
echo "→ Step 2: Pre-migration row counts (SQLite)..."
echo "  Table                  | Rows"
echo "  -----------------------|------"
sqlite3 "$BACKUP_FILE" "
  SELECT 'users', COUNT(*) FROM users;
  SELECT 'tribes', COUNT(*) FROM tribes;
  SELECT 'bonds', COUNT(*) FROM bonds;
  SELECT 'posts', COUNT(*) FROM posts;
  SELECT 'messages', COUNT(*) FROM messages;
  SELECT 'vault_backups', COUNT(*) FROM vault_backups;
  SELECT 'sessions', COUNT(*) FROM sessions;
" 2>/dev/null | while IFS='|' read -r table cnt; do
  printf "  %-23s | %s\n" "$table" "$cnt"
done

# ── Step 3: Push Postgres schema via Drizzle ─────────────────
echo ""
echo "→ Step 3: Pushing schema to PostgreSQL..."
DATABASE_URL="$PG_URL" npx drizzle-kit push --force
echo "  ✓ Schema pushed"

# ── Step 4: Run pgloader ─────────────────────────────────────
echo ""
echo "→ Step 4: Running pgloader (data only)..."
pgloader \
  --with "data only" \
  --with "truncate" \
  --cast "type blob to bytea using byte-vector-to-bytea" \
  "$BACKUP_FILE" \
  "$PG_URL"
echo "  ✓ pgloader complete"

# ── Step 5: Post-migration verification ──────────────────────
echo ""
echo "→ Step 5: Post-migration verification..."
echo ""
echo "  Row counts (PostgreSQL):"
psql "$PG_URL" -t -A -c "
  SELECT 'users', COUNT(*) FROM users
  UNION ALL SELECT 'tribes', COUNT(*) FROM tribes
  UNION ALL SELECT 'bonds', COUNT(*) FROM bonds
  UNION ALL SELECT 'posts', COUNT(*) FROM posts
  UNION ALL SELECT 'messages', COUNT(*) FROM messages
  UNION ALL SELECT 'vault_backups', COUNT(*) FROM vault_backups
  UNION ALL SELECT 'sessions', COUNT(*) FROM sessions;
" | while IFS='|' read -r table cnt; do
  printf "  %-23s | %s\n" "$table" "$cnt"
done

echo ""
echo "  Encrypted blob integrity:"
psql "$PG_URL" -t -A -c "
  SELECT 'vault_backups', id, octet_length(encrypted_vault) AS bytes FROM vault_backups
  UNION ALL
  SELECT 'posts (ciphertext)', id, octet_length(ciphertext) FROM posts WHERE ciphertext IS NOT NULL
  UNION ALL
  SELECT 'messages (ciphertext)', id, octet_length(ciphertext) FROM messages WHERE ciphertext IS NOT NULL;
" | while IFS='|' read -r table id bytes; do
  printf "  %-25s | %s | %s bytes\n" "$table" "$id" "$bytes"
done

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Migration complete!"
echo "  Backup file: $BACKUP_FILE"
echo ""
echo "  Next steps:"
echo "  1. Verify blob byte counts match SQLite originals"
echo "  2. Test login + post creation + encrypted message send"
echo "  3. Stop sqld container: docker compose stop sqld"
echo "═══════════════════════════════════════════════════"
