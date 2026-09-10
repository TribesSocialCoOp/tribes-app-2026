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

variable "staging_server_type" {
  description = "Hetzner server type for the staging box. cx (Intel shared) is EU-only and the cheapest 8GB option. cx33=4CPU/8GB ($9.99/mo fsn1), cpx31=4CPU/8GB ($20.49/mo fsn1 vs $73.49/mo hil after the 2026-06-15 US price hike)."
  type        = string
  default     = "cx33"
}

variable "staging_location" {
  description = "Hetzner location for the staging box. EU (fsn1/nbg1/hel1) is ~3.5x cheaper than US (hil/ash) for shared vCPU types since 2026-06-15. Staging latency is not user-facing."
  type        = string
  default     = "fsn1"
}

variable "admin_ips" {
  description = "List of CIDR blocks allowed to SSH. Your home/office IP."
  type        = list(string)
  # Example: ["203.0.113.42/32"]
}
