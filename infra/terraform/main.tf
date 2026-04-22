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
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = concat(var.admin_ips, ["${hcloud_server.tribes_prod.ipv4_address}/32"])
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

  user_data = templatefile("${path.module}/cloud-init.yaml", {
    deploy_user = "tribes"
  })

  labels = {
    env     = "production"
    project = "tribes"
    role    = "app"
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

  user_data = templatefile("${path.module}/cloud-init-backup.yaml", {
    deploy_user = "tribes"
  })

  labels = {
    env     = "production"
    project = "tribes"
    role    = "backup"
  }
}

# ── Primary IP (static — survives server rebuilds) ──────────
resource "hcloud_primary_ip" "tribes_prod" {
  name          = "tribes-prod-ip"
  location      = "hil"
  type          = "ipv4"
  assignee_type = "server"
  auto_delete   = false             # Keep IP even if server is deleted
}
