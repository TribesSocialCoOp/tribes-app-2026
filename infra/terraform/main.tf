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

  # The registered key must not churn based on which operator's machine runs
  # tofu (ssh_public_key_path resolves per-machine). Servers bake the key in at
  # creation (ssh_keys is ignore_changes on them), so the registered key is only
  # used for FUTURE provisioning — pin it to avoid spurious replacement.
  lifecycle {
    ignore_changes = [public_key]
  }
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

# NOTE: tribes-backup server + firewall were decommissioned on 2026-06-29.
# Offsite backups now go to a Hetzner Storage Box (u624360.your-storagebox.de,
# managed outside Terraform — Storage Boxes are a separate product). See
# scripts/backup.sh + /etc/tribes/backup.env on prod.

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

# ── Staging Firewall ─────────────────────────────────────────
# Mirrors the prod firewall. The deploy workflow temporarily injects the
# GitHub runner IP into the SSH rule (via STAGING_FIREWALL_ID), same as prod.
resource "hcloud_firewall" "tribes_staging" {
  name = "tribes-staging-fw"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # SSH — locked to admin IPs (CI runner IP injected at deploy time)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.admin_ips
  }

  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

# ── Staging Server ───────────────────────────────────────────
# Runs the full stack as a single disposable box. NOT destruction-protected
# and NO prevent_destroy — staging is meant to be rebuilt freely.
#
# Region note: hil (US) offers only cpx (shared AMD) and ccx (dedicated)
# server types — the cx (shared Intel) line is EU-only. The deploy pipeline
# runs `docker build` ON the box (remote_deploy.sh), and Next.js builds are
# memory-hungry, so default to an 8GB type to avoid OOM. Downsize via
# var.staging_server_type if builds prove light enough.
resource "hcloud_server" "tribes_staging" {
  name         = "tribes-staging"
  server_type  = var.staging_server_type # Default: cpx31 (4 vCPU AMD, 8GB)
  location     = "hil"
  image        = "ubuntu-24.04"
  ssh_keys     = [hcloud_ssh_key.tribes.id]
  firewall_ids = [hcloud_firewall.tribes_staging.id]

  # Ephemeral public IPv4 (persists for the server's lifetime; no reserved IP
  # needed — staging email uses the same Workspace relay with this IP whitelisted).
  public_net {
    ipv4_enabled = true
  }

  user_data = templatefile("${path.module}/cloud-init.yaml", {
    deploy_user = "tribes"
  })

  labels = {
    env     = "staging"
    project = "tribes"
    role    = "app"
  }

  # Same write-only-at-creation fields as prod — ignore to avoid spurious diffs.
  lifecycle {
    ignore_changes = [ssh_keys, user_data]
  }
}
