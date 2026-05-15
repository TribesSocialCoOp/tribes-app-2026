terraform {
  required_providers {
    hcloud = {
      source  = "registry.opentofu.org/hetznercloud/hcloud"
      version = "~> 1.50"
    }
  }
  required_version = ">= 1.8"
}

provider "hcloud" {
  token = var.hcloud_token
}

# ── SSH Key ─────────────────────────────────────────────────
resource "hcloud_ssh_key" "tribes" {
  name       = "tribes-deploy"
  public_key = file(var.ssh_public_key_path)
}

# ── Firewall ─────────────────────────────────────────────────
resource "hcloud_firewall" "tribes_prod" {
  name = "tribes-prod-fw"

  # HTTPS (all traffic)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # HTTP — redirect to HTTPS (Caddy handles this)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # SSH — locked to your IP only
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.admin_ips
  }

  # ICMP (ping) — useful for diagnostics
  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # Default deny all other inbound
  # All Docker services (sqld, valkey, seaweedfs) are on internal network only
}

resource "hcloud_firewall" "tribes_backup" {
  name = "tribes-backup-fw"

  # SSH from prod server only (for restic SFTP)
  # NOTE: prod server IP is hardcoded here to avoid a circular dependency /
  # null-value issue when the primary IP is unassigned during tofu operations.
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = concat(var.admin_ips, ["5.78.189.222/32"])
  }

  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

# ── Production Server ────────────────────────────────────────
resource "hcloud_server" "tribes_prod" {
  name        = "tribes-prod"
  server_type = var.server_type      # Default: ccx13 (2 dedicated CPU, 8GB)
  location    = "hil"                # Hillsboro, Oregon
  image       = "ubuntu-24.04"
  ssh_keys    = [hcloud_ssh_key.tribes.id]
  firewall_ids = [hcloud_firewall.tribes_prod.id]

  # Destruction protection — blocks Hetzner Console/API deletion
  delete_protection  = true
  rebuild_protection = true

  # Attach the reserved static IP — survives server rebuilds
  # This is the IP whitelisted in Google Workspace SMTP relay
  public_net {
    ipv4_enabled = true
    ipv4         = hcloud_primary_ip.tribes_prod.id
  }

  user_data = templatefile("${path.module}/cloud-init.yaml", {
    deploy_user = "tribes"
  })

  labels = {
    env     = "production"
    project = "tribes"
    role    = "app"
  }

  # ssh_keys, user_data, and public_net are write-only or already-assigned at
  # creation time — the Hetzner provider cannot reconcile them after import.
  # Ignore to prevent spurious diffs and failed apply attempts.
  # prevent_destroy blocks tofu destroy / accidental resource removal.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [ssh_keys, user_data, public_net]
  }
}

# ── Backup Server ────────────────────────────────────────────
resource "hcloud_server" "tribes_backup" {
  name        = "tribes-backup"
  server_type = "ccx13"              # Smallest dedicated CPU available at hil
  location    = "hil"
  image       = "ubuntu-24.04"
  ssh_keys    = [hcloud_ssh_key.tribes.id]
  firewall_ids = [hcloud_firewall.tribes_backup.id]

  # Destruction protection — blocks Hetzner Console/API deletion
  delete_protection  = true
  rebuild_protection = true

  user_data = templatefile("${path.module}/cloud-init-backup.yaml", {
    deploy_user = "tribes"
  })

  labels = {
    env     = "production"
    project = "tribes"
    role    = "backup"
  }

  # ssh_keys and user_data are write-only at creation time — the Hetzner
  # provider cannot read them back after import, so tofu will always see
  # drift on these fields. Ignore them to prevent accidental server replacement.
  # prevent_destroy blocks tofu destroy / accidental resource removal.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [ssh_keys, user_data]
  }
}

# ── Primary IP (static — survives server rebuilds) ──────────
resource "hcloud_primary_ip" "tribes_prod" {
  name          = "tribes-prod-ip"
  location      = "hil"
  type          = "ipv4"
  assignee_type = "server"
  auto_delete   = false             # Keep IP even if server is deleted

  # Destruction protection — losing this IP breaks DNS + SMTP relay whitelist
  delete_protection = true

  lifecycle {
    prevent_destroy = true
  }
}
