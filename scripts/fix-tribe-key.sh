#!/usr/bin/env bash
# ============================================================
# Fix Tribe Key: Remove the bad key from the Moore Family tribe
# ============================================================
# 
# WHAT THIS DOES:
#   1. Lists all tribe keys for moore-family tribe
#   2. Identifies the NEWER key (the bad one desktop generated)
#   3. Deletes all grants for the bad key
#   4. Deletes the bad key record
#   5. Ensures the ORIGINAL key is marked as is_active=true
#
# USAGE:
#   1. First: ssh-add ~/.ssh/id_rsa   (enter your passphrase)
#   2. Then:  bash scripts/fix-tribe-key.sh
#
# This is safe because:
#   - Sarah's post was encrypted with the ORIGINAL key
#   - Mobile still has the original key in IndexedDB
#   - The bad key (from desktop) hasn't been used to encrypt anything
#   - After removing the bad key, the KeySyncProvider will:
#     a) Re-detect that the tribe needs a key grant for desktop
#     b) Use mobile's original key to wrap grants for all members
# ============================================================

set -euo pipefail

REMOTE_HOST="root@5.78.189.222"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${CYAN}[fix-key]${NC} $1"; }
ok()    { echo -e "${GREEN}[  ✓   ]${NC} $1"; }
warn()  { echo -e "${YELLOW}[ warn ]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL! ]${NC} $1"; exit 1; }

# ── Step 1: Inspect current state ──────────────────────────────
log "Connecting to production database..."

INSPECT_OUTPUT=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" 'bash -s' <<'REMOTE_EOF'
cd /opt/tribes
source .env.production

PG_IP=$(docker inspect tribes-postgres-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null)
PG_NETWORK=$(docker inspect tribes-postgres-1 --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null)

if [ -z "$PG_IP" ]; then
  echo "ERROR: PostgreSQL container not found"
  exit 1
fi

docker run --rm --network="$PG_NETWORK" \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  postgres:17-alpine psql -h "$PG_IP" -U tribes -d tribes -t -A -c "
-- Output format: id|key_version|is_active|created_by|created_at|creator_name
SELECT tk.id, tk.key_version, tk.is_active, tk.created_by, tk.created_at, u.name
FROM tribe_keys tk
LEFT JOIN users u ON tk.created_by = u.id
INNER JOIN tribes t ON tk.tribe_id = t.id
WHERE t.slug = 'moore-family'
ORDER BY tk.created_at ASC;
"
REMOTE_EOF
)

echo ""
log "Current tribe keys for moore-family:"
echo "────────────────────────────────────────────────────"
echo -e "${BOLD}ID | Version | Active | Created By | Created At | Creator${NC}"
echo "────────────────────────────────────────────────────"
echo "$INSPECT_OUTPUT" | while IFS='|' read -r id version active created_by created_at creator; do
  if [ "$active" = "t" ]; then
    color="$GREEN"
    status="ACTIVE"
  else
    color="$RED"
    status="inactive"
  fi
  echo -e "${color}$id | v${version} | ${status} | ${created_by:0:12}... | $created_at | $creator${NC}"
done
echo "────────────────────────────────────────────────────"
echo ""

# Count the keys
KEY_COUNT=$(echo "$INSPECT_OUTPUT" | grep -c '|' || true)

if [ "$KEY_COUNT" -lt 2 ]; then
  if [ "$KEY_COUNT" -eq 1 ]; then
    ok "Only one tribe key found — nothing to fix!"
  else
    warn "No tribe keys found for moore-family"
  fi
  exit 0
fi

# ── Step 2: Identify the bad key ──────────────────────────────
# The BAD key is the NEWER one (created second, by desktop)
# The GOOD key is the OLDER one (created first, by mobile — Sarah's key)
BAD_KEY_ID=$(echo "$INSPECT_OUTPUT" | tail -1 | cut -d'|' -f1)
GOOD_KEY_ID=$(echo "$INSPECT_OUTPUT" | head -1 | cut -d'|' -f1)

log "Original (good) key: ${GREEN}${GOOD_KEY_ID}${NC}"
log "Desktop-generated (bad) key: ${RED}${BAD_KEY_ID}${NC}"
echo ""

# ── Confirmation ──────────────────────────────────────────────
warn "This will DELETE the bad key (${BAD_KEY_ID}) and its grants."
warn "The original key will be ensured as is_active=true."
echo ""
read -p "Proceed? (y/N): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

# ── Step 3: Execute the fix ──────────────────────────────────
log "Removing bad key and restoring original..."

FIX_OUTPUT=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" "bash -s" <<REMOTE_FIX
cd /opt/tribes
source .env.production

PG_IP=\$(docker inspect tribes-postgres-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null)
PG_NETWORK=\$(docker inspect tribes-postgres-1 --format '{{range \$k, \$v := .NetworkSettings.Networks}}{{\$k}}{{end}}' 2>/dev/null)

docker run --rm --network="\$PG_NETWORK" \
  -e PGPASSWORD="\$POSTGRES_PASSWORD" \
  postgres:17-alpine psql -h "\$PG_IP" -U tribes -d tribes -c "
BEGIN;

-- 1. Delete all grants for the bad key
DELETE FROM tribe_key_grants WHERE tribe_key_id = '${BAD_KEY_ID}';

-- 2. Delete the bad key record
DELETE FROM tribe_keys WHERE id = '${BAD_KEY_ID}';

-- 3. Ensure the original key is active
UPDATE tribe_keys SET is_active = true, rotated_at = NULL WHERE id = '${GOOD_KEY_ID}';

COMMIT;
"
REMOTE_FIX
)

echo "$FIX_OUTPUT"

# ── Step 4: Verify ──────────────────────────────────────────
log "Verifying fix..."

VERIFY_OUTPUT=$(ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" 'bash -s' <<'VERIFY_EOF'
cd /opt/tribes
source .env.production

PG_IP=$(docker inspect tribes-postgres-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null)
PG_NETWORK=$(docker inspect tribes-postgres-1 --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null)

docker run --rm --network="$PG_NETWORK" \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  postgres:17-alpine psql -h "$PG_IP" -U tribes -d tribes -c "
-- Final state
SELECT tk.id, tk.key_version, tk.is_active, u.name as creator
FROM tribe_keys tk
LEFT JOIN users u ON tk.created_by = u.id
INNER JOIN tribes t ON tk.tribe_id = t.id
WHERE t.slug = 'moore-family';

-- Remaining grants
SELECT tkg.id, u.name as recipient, u2.name as granter
FROM tribe_key_grants tkg
LEFT JOIN users u ON tkg.recipient_id = u.id
LEFT JOIN users u2 ON tkg.granted_by = u2.id
INNER JOIN tribe_keys tk ON tkg.tribe_key_id = tk.id
INNER JOIN tribes t ON tk.tribe_id = t.id
WHERE t.slug = 'moore-family';
"
VERIFY_EOF
)

echo ""
log "Post-fix state:"
echo "$VERIFY_OUTPUT"

echo ""
ok "Fix complete!"
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Next steps:${NC}"
echo -e "${GREEN}  1. Open Tribes on MOBILE (has the original key)${NC}"
echo -e "${GREEN}  2. The KeySyncProvider will auto-detect ungranted${NC}"
echo -e "${GREEN}     members and distribute the correct key${NC}"
echo -e "${GREEN}  3. Desktop should then be able to decrypt${NC}"
echo -e "${GREEN}  4. Sarah's post will be readable everywhere 🎉${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
