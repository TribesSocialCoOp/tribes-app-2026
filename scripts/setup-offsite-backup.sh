#!/bin/bash
# ============================================================
# Tribes.app — One-time setup for offsite backup push
# ============================================================
# Run this ON the prod server (5.78.189.222) as root.
#
# Offsite target is a Hetzner Storage Box (SSH/rsync on port 23).
# Storage Boxes have a *restricted* shell: ssh-copy-id needs -s (SFTP
# mode) to install the key, and only a small command set (mkdir, ls,
# rm, ...) is available — `echo` is NOT, so we test with `ls`.
#
# What it does:
#   1. Generates a dedicated SSH keypair for backup push
#   2. Installs the public key on the Storage Box (SFTP mode)
#   3. Creates /etc/tribes/backup.env with BACKUP_HOST + port
#   4. Tests the connection and a dry-run rsync
#
# Prerequisites:
#   - A Hetzner Storage Box ordered with SSH support enabled
#   - Its credentials below (host uXXXXX.your-storagebox.de, user uXXXXX)
#
# Usage:
#   ssh root@5.78.189.222
#   # Set the real Storage Box creds either by editing the vars below or
#   # via env, then run:
#   BACKUP_HOST=u123456.your-storagebox.de BACKUP_USER=u123456 \
#     bash /opt/tribes/scripts/setup-offsite-backup.sh
# ============================================================

set -euo pipefail

# ── Storage Box config (override via env, or edit the placeholders) ──
BACKUP_HOST="${BACKUP_HOST:-uXXXXX.your-storagebox.de}"
BACKUP_USER="${BACKUP_USER:-uXXXXX}"
BACKUP_SSH_PORT="${BACKUP_SSH_PORT:-23}"   # Hetzner Storage Box SSH/rsync port
BACKUP_REMOTE_PATH="${BACKUP_REMOTE_PATH:-restic-repo}"  # relative to SB home
KEY_PATH="/root/.ssh/backup_key"
ENV_FILE="/etc/tribes/backup.env"

# Guard: refuse to run against the unedited placeholder.
if [[ "$BACKUP_HOST" == *"XXXXX"* || "$BACKUP_USER" == *"XXXXX"* ]]; then
  echo "✗ Set your Storage Box credentials first." >&2
  echo "  Either edit BACKUP_HOST/BACKUP_USER in this script, or run:" >&2
  echo "    BACKUP_HOST=u123456.your-storagebox.de BACKUP_USER=u123456 \\" >&2
  echo "      bash $0" >&2
  exit 1
fi

SSH_OPTS=(-p "$BACKUP_SSH_PORT" -o StrictHostKeyChecking=accept-new)

echo "=== Tribes Offsite Backup Setup (Hetzner Storage Box) ==="
echo "  Target: ${BACKUP_USER}@${BACKUP_HOST}:${BACKUP_REMOTE_PATH} (port ${BACKUP_SSH_PORT})"
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
echo "→ Public key (add to the Storage Box if ssh-copy-id fails):"
cat "${KEY_PATH}.pub"
echo ""

# ── Step 2: Install public key on the Storage Box (SFTP mode) ─
# Storage Boxes have no login shell, so ssh-copy-id must use -s (SFTP)
# to write ~/.ssh/authorized_keys.
echo "→ Installing public key on ${BACKUP_USER}@${BACKUP_HOST} (SFTP mode)..."
echo "  (You will be prompted for the Storage Box password once)"
ssh-copy-id -s -i "${KEY_PATH}.pub" "${SSH_OPTS[@]}" "${BACKUP_USER}@${BACKUP_HOST}" || {
  echo ""
  echo "⚠ ssh-copy-id failed. Manually append this key to the Storage Box"
  echo "  ~/.ssh/authorized_keys (via the Hetzner console or SFTP):"
  cat "${KEY_PATH}.pub"
  echo ""
  echo "Then re-run this script."
  exit 1
}
echo "✓ Public key installed on Storage Box"

# ── Step 3: Test SSH connection (restricted shell — use `ls`) ─
echo "→ Testing SSH connection..."
ssh -i "$KEY_PATH" "${SSH_OPTS[@]}" "${BACKUP_USER}@${BACKUP_HOST}" "ls" >/dev/null || {
  echo "✗ SSH connection failed"
  exit 1
}
echo "✓ SSH connection successful"

# ── Step 4: Ensure remote directory exists ───────────────────
echo "→ Creating remote backup directory..."
ssh -i "$KEY_PATH" "${SSH_OPTS[@]}" "${BACKUP_USER}@${BACKUP_HOST}" "mkdir -p ${BACKUP_REMOTE_PATH}" || true
echo "✓ Remote directory ready: ${BACKUP_REMOTE_PATH}"

# ── Step 5: Write backup environment file ────────────────────
mkdir -p "$(dirname "$ENV_FILE")"
cat > "$ENV_FILE" <<EOF
# Offsite backup configuration — sourced by backup.sh via cron
BACKUP_HOST=${BACKUP_HOST}
BACKUP_USER=${BACKUP_USER}
BACKUP_SSH_PORT=${BACKUP_SSH_PORT}
BACKUP_REMOTE_PATH=${BACKUP_REMOTE_PATH}
EOF
chmod 600 "$ENV_FILE"
echo "✓ Environment file written: $ENV_FILE"

# ── Step 6: Test rsync dry-run ───────────────────────────────
RESTIC_REPO="/backups/restic-repo"
if [[ -d "$RESTIC_REPO" ]]; then
  echo "→ Testing rsync (dry-run)..."
  rsync -az --dry-run \
    -e "ssh ${SSH_OPTS[*]} -i ${KEY_PATH}" \
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
echo "  3. Verify on the Storage Box:"
echo "     ssh -p ${BACKUP_SSH_PORT} ${BACKUP_USER}@${BACKUP_HOST} 'ls -la ${BACKUP_REMOTE_PATH}/'"
