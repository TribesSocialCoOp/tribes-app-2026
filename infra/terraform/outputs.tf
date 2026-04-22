output "prod_ip" {
  description = "Production server public IPv4 — point DNS A records here"
  value       = hcloud_server.tribes_prod.ipv4_address
}

output "backup_ip" {
  description = "Backup server public IPv4 — used by restic SFTP target"
  value       = hcloud_server.tribes_backup.ipv4_address
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
