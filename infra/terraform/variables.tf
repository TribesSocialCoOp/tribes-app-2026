variable "hcloud_token" {
  description = "Hetzner Cloud API token (read/write). Generate at: console.hetzner.com → Security → API Tokens"
  type        = string
  sensitive   = true
}

variable "ssh_public_key_path" {
  description = "Path to your SSH public key (~/.ssh/id_ed25519.pub recommended)"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "server_type" {
  description = "Hetzner server type for the prod box. ccx13=2CPU/8GB, ccx23=4CPU/16GB"
  type        = string
  default     = "ccx13"
}

variable "admin_ips" {
  description = "List of CIDR blocks allowed to SSH. Your home/office IP."
  type        = list(string)
  # Example: ["203.0.113.42/32"]
}
