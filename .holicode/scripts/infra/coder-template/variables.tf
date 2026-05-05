# Architecture-specific values — set in terraform.tfvars per template directory.
# main.tf is identical across templates; only provider.tf and terraform.tfvars differ.

variable "agent_arch" {
  description = "Coder agent architecture string (arm64 or amd64)"
  type        = string
}

variable "image_name" {
  description = "Docker image name without tag (full registry path). Default uses GHCR for ARM. Override in terraform.tfvars for local/x86 images (e.g. image_name = \"holicode-cde\")."
  type        = string
  default     = "ghcr.io/holagence/holicode-cde"
}

variable "image_tag" {
  description = "Docker image tag for the workspace image"
  type        = string
}

variable "cpu_default" {
  description = "Default CPU cores shown in workspace creation UI"
  type        = number
}

variable "cpu_max" {
  description = "Maximum CPU cores allowed in workspace creation UI"
  type        = number
}

variable "memory_default" {
  description = "Default memory (GB) shown in workspace creation UI"
  type        = number
}

variable "memory_min" {
  description = "Minimum memory (GB) allowed in workspace creation UI"
  type        = number
}

variable "memory_max" {
  description = "Maximum memory (GB) allowed in workspace creation UI"
  type        = number
}

variable "use_dokploy_network" {
  description = "Attach workspace container to dokploy-network for Traefik routing"
  # string not bool — Coder's HCL parser does not support cty.Bool in tfvars
  type    = string
  default = "false"
}

variable "use_ipv6_network" {
  description = "Enable IPv6 on the workspace Docker bridge network. Required for IPv6-only endpoints (e.g. Supabase direct connections). Only set true if the Docker daemon has IPv6 enabled globally."
  # string not bool — Coder's HCL parser does not support cty.Bool in tfvars
  type    = string
  default = "false"
}

variable "docker_gid" {
  description = "GID of the docker group on the host. Used for DooD — grants coder user socket access without sudo. Find with: getent group docker | cut -d: -f3"
  type        = string
  default     = "988"
}

variable "vk_base_domain" {
  description = "Base domain for VK Remote services. Produces https://vk-remote.<domain> and https://vk-relay.<domain> at workspace startup."
  type        = string
  default     = "holagence.com"
}

variable "default_project_repos" {
  description = "Default value for the project_repos workspace parameter. Comma-separated repo URLs to suggest at workspace creation. Set per deployment in terraform.tfvars (e.g. \"https://github.com/MyOrg/MyRepo.git\")."
  type        = string
  default     = ""
}

variable "coder_access_url" {
  description = "External Coder access URL as seen by users (e.g. https://coder.giftcash.com). Required when coder_internal_url is set — used as the string to replace in the agent init_script."
  type        = string
  default     = ""
}

variable "coder_internal_url" {
  description = "Internal URL the workspace container uses to reach the Coder server, bypassing external routing (e.g. Cloudflare). When set, replaces coder_access_url in the agent init_script and adds CODER_URL env var + attaches the container to coder-access-net. Leave empty when the external URL is directly reachable from the container."
  type        = string
  default     = ""
}

variable "github_app_id" {
  description = "GitHub App ID for automated CLI authentication"
  type        = string
  default     = ""
}

variable "github_app_installation_id" {
  description = "GitHub App installation ID for automated CLI authentication"
  type        = string
  default     = ""
}

variable "github_app_private_key_b64" {
  description = "Base64-encoded GitHub App private key for automated CLI authentication"
  type        = string
  default     = ""
  sensitive   = true
}
