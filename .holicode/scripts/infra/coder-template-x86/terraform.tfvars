agent_arch          = "amd64"
image_name          = "holicode-cde"  # local image, no registry prefix (built on host, not in GHCR)
image_tag           = "2.1.0-amd64"
cpu_default         = 1
cpu_max             = 2    # CX22 has 2 vCPU total
memory_default      = 2
memory_min          = 1
memory_max          = 8    # OVH VPS-1 has 22 GB total
use_dokploy_network = "false"
use_ipv6_network    = "true"   # enable IPv6 (ipv6=true, ip6tables=true in daemon.json)
docker_gid          = "988" # GID of docker group on x86 host; update if different
# vk_base_domain defaults to holagence.com -- override per deployment (e.g. giftcash.com)
vk_base_domain      = "giftcash.com"
coder_access_url    = "https://coder.giftcash.com"  # external URL (Cloudflare blocks OVH IP)
coder_internal_url  = "http://coder:7080"           # internal via coder-access-net (bypasses Cloudflare)
