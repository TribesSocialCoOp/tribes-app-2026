#!/bin/bash
# ============================================================
# Tribes.app — One-time setup for offsite backup push
# ============================================================
# Run this ON the prod server (5.78.189.222) as root.
#
# What it does:
#   1. Generates a dedicated SSH keypair for backup push
#   2. Copies the public key to the backup server
#   3. Creates /etc/tribes/backup.env with BACKUP_HOST
#   4. Tests the connection with a dry-run rsync
#   5. Initializes the remote restic repo (if not already done)
#
# Prerequisites:
#   - SSH access to backup server from prod (firewall rule exists)
#   - Your admin SSH key must be in the backup server's authorized_keys
#     (Hetzner cloud-init adds the deploy key automatically)
#
# Usage:
#   ssh root@5.78.189.222
#   bash /opt/tribes/scripts/setup-offsite-backup.sh
# ============================================================

set -euo pipefail

BACKUP_HOST="5.78.183.122"
BACKUP_USER="tribes"
BACKUP_REMOTE_PATH="/backups/tribes-restic"
KEY_PATH="/root/.ssh/backup_key"
ENV_FILE="/etc/tribes/backup.env"

echo "=== Tribes Offsite Backup Setup ==="
echo ""

# ── Step 1: Generate SSH keypair (if not exists) ─────────────
if [[ -f "$KEY_PATH" ]]; then
  echo "✓ SSH key already exists at $KEY_PATH"
else
  echo "→ Generating SSH keypair..."
  ssh-keygen -t ed25519 -f "$KEY_PATH" -N "" -C "tribes-prod-backup"
  chmod 600 "$KEY_PATH"
  echo "✓ Key generated: $KEY_PATH"
fi

echo ""
echo "→ Public key (add to backup server if ssh-copy-id fails):"
cat "${KEY_PATH}.pub"
echo ""

# ── Step 2: Copy public key to backup server ─────────────────
echo "→ Copying public key to ${BACKUP_USER}@${BACKUP_HOST}..."
echo "  (You may be prompted for the backup server password or need to confirm)"
ssh-copy-id -i "${KEY_PATH}.pub" -o StrictHostKeyChecking=accept-new "${BACKUP_USER}@${BACKUP_HOST}" || {
  echo ""
  echo "⚠ ssh-copy-id failed. Manually add this to ${BACKUP_USER}@${BACKUP_HOST}:~/.ssh/authorized_keys:"
  cat "${KEY_PATH}.pub"
  echo ""
  echo "Then re-run this script."
  exit 1
}
echo "✓ Public key installed on backup server"

# ── Step 3: Test SSH connection ──────────────────────────────
echo "→ Testing SSH connection..."
ssh -i "$KEY_PATH" -o StrictHostKeyChecking=accept-new "${BACKUP_USER}@${BACKUP_HOST}" "echo '✓ SSH connection successful'" || {
  echo "✗ SSH connection failed"
  exit 1
}

# ── Step 4: Ensure remote directory exists ───────────────────
echo "→ Creating remote backup directory..."
ssh -i "$KEY_PATH" "${BACKUP_USER}@${BACKUP_HOST}" "mkdir -p ${BACKUP_REMOTE_PATH}"
echo "✓ Remote directory ready: ${BACKUP_REMOTE_PATH}"

# ── Step 5: Write backup environment file ────────────────────
mkdir -p "$(dirname "$ENV_FILE")"
cat > "$ENV_FILE" <<EOF
# Offsite backup configuration — sourced by backup.sh via cron
BACKUP_HOST=${BACKUP_HOST}
BACKUP_USER=${BACKUP_USER}
BACKUP_REMOTE_PATH=${BACKUP_REMOTE_PATH}
EOF
chmod 600 "$ENV_FILE"
echo "✓ Environment file written: $ENV_FILE"

# ── Step 6: Test rsync dry-run ───────────────────────────────
RESTIC_REPO="/backups/restic-repo"
if [[ -d "$RESTIC_REPO" ]]; then
  echo "→ Testing rsync (dry-run)..."
  rsync -az --dry-run \
    -e "ssh -o StrictHostKeyChecking=accept-new -i ${KEY_PATH}" \
    "${RESTIC_REPO}/" \
    "${BACKUP_USER}@${BACKUP_HOST}:${BACKUP_REMOTE_PATH}/"
  echo "✓ Rsync dry-run succeeded"
else
  echo "⚠ Local restic repo not found at ${RESTIC_REPO} — skipping rsync test"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Run a manual backup to test the full pipeline:"
echo "     /opt/tribes/scripts/backup.sh"
echo "  2. Check the backup log for 'Offsite push complete':"
echo "     tail -20 /var/log/tribes-backup.log"
echo "  3. Verify on backup server:"
echo "     ssh ${BACKUP_USER}@${BACKUP_HOST} 'ls -la ${BACKUP_REMOTE_PATH}/'"
