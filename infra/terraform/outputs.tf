output "prod_ip" {
  description = "Production server public IPv4 — point DNS A records here"
  value       = hcloud_server.tribes_prod.ipv4_address
}

output "backup_ip" {
  description = "Backup server public IPv4 — used by restic SFTP target (DECOMMISSIONING: remove in STEP 2 with the tribes_backup resource)"
  value       = hcloud_server.tribes_backup.ipv4_address
}

output "staging_ip" {
  description = "Staging server public IPv4 — point staging.tribes.app DNS records here"
  value       = hcloud_server.tribes_staging.ipv4_address
}

output "staging_dns_instructions" {
  description = "DNS records to configure for the staging environment"
  value       = <<-EOT
    Point these DNS A records to the staging IP (${hcloud_server.tribes_staging.ipv4_address}):

      staging.tribes.app        A  ${hcloud_server.tribes_staging.ipv4_address}
      ws.staging.tribes.app     A  ${hcloud_server.tribes_staging.ipv4_address}
      media.staging.tribes.app  A  ${hcloud_server.tribes_staging.ipv4_address}

    Then add this IP to the Google Workspace SMTP relay allowlist so staging
    can send mail. Caddy auto-provisions TLS within ~60s of DNS propagation.
  EOT
}

output "dns_instructions" {
  description = "DNS records to configure after provisioning"
  value = <<-EOT
    Point these DNS A records to the prod IP (${hcloud_server.tribes_prod.ipv4_address}):

      tribes.app        A  ${hcloud_server.tribes_prod.ipv4_address}
      ws.tribes.app     A  ${hcloud_server.tribes_prod.ipv4_address}
      media.tribes.app  A  ${hcloud_server.tribes_prod.ipv4_address}

    Caddy will auto-provision TLS within ~60 seconds of DNS propagation.
  EOT
}
