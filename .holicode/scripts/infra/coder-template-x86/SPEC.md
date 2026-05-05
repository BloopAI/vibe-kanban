# Coder Workspace Template (x86_64) -- SPEC

**Template name**: `holicode-agentic`
**Location**: `scripts/infra/coder-template-x86/main.tf`
**Provider**: Docker (kreuzwerker/docker) -- local Unix socket
**Architecture**: Multi-container sidecar pattern (identical to ARM template)
**Story Reference**: HOL-259, HOL-275

---

## Template Sync -- x86 vs ARM

`main.tf`, `variables.tf`, and `provider.tf` are **byte-for-byte identical** between both templates.
Only `terraform.tfvars` differs (deployment-specific values):

| Value | ARM (`coder-template/`) | x86 (`coder-template-x86/`) |
|-------|------------------------|-----------------------------|
| `agent_arch` | `arm64` | `amd64` |
| `image_name` | `ghcr.io/holagence/holicode-cde` | `holicode-cde` (local build) |
| `image_tag` | `2.0.5` | `2.0.1-amd64` |
| `cpu_max` | `8` | `2` (CX22) |
| `memory_max` | `16` | `8` (OVH VPS-1 has 22 GB) |
| `use_ipv6_network` | `"true"` | `"true"` |
| `vk_base_domain` | (default: holagence.com) | `giftcash.com` |
| `coder_access_url` | (empty) | `https://coder.giftcash.com` |
| `coder_internal_url` | (empty) | `http://coder:7080` |

When editing `main.tf` or `variables.tf`, **always apply the same change to both templates**.

---

## Versioning and Tagging Convention

Coder template versions are semver strings passed to `coder templates push --name <version>`.
Every version pushed to production **must** have a matching git tag on main.

### Tag format

```
coder-template-<version>
```

Examples: `coder-template-2.2.2`, `coder-template-2.3.0`

### Version bump rules

| Change | Bump |
|--------|------|
| Script/logic fix (forgejo, idempotency, etc.) | patch (x.y.Z) |
| New parameter, new resource, new script | minor (x.Y.0) |
| Breaking change (provider swap, param removal) | major (X.0.0) |

### How to tag after a push

```bash
# After merging to main and pushing the template:
VERSION=2.2.2
COMMIT=$(git rev-parse origin/main)
git tag -a coder-template-$VERSION $COMMIT \
  -m "Coder template $VERSION -- <one-line summary>

Deployed to OVH VPS-1 (holicode-agentic) on $(date -u +%Y-%m-%d)."
git push origin coder-template-$VERSION
```

### Tag history

| Tag | Commit | Deployed | Summary |
|-----|--------|----------|---------|
| `coder-template-2.2.2` | `69827da` | 2026-04-09 | Forgejo fix + IPv6 + sysbox opt-in + infra hardening; x86+ARM in sync |

---

## Template Push (OVH VPS-1)

The Coder server runs inside a Docker container. Push from inside it:

```bash
# 1. Package
tar -cf /tmp/template.tar \
  -C scripts/infra/coder-template-x86 \
  main.tf variables.tf provider.tf terraform.tfvars SPEC.md

# 2. Copy to host and into container
scp /tmp/template.tar ubuntu@vps-191bcc76.vps.ovh.ca:/tmp/template.tar
ssh ubuntu@vps-191bcc76.vps.ovh.ca "
  sudo rm -rf /tmp/tmpl && sudo mkdir /tmp/tmpl
  sudo tar -xf /tmp/template.tar -C /tmp/tmpl/
  sudo docker cp /tmp/tmpl compose-hack-online-firewall-68qdy9-coder-1:/tmp/tmpl
"

# 3. Push
ssh ubuntu@vps-191bcc76.vps.ovh.ca "
  sudo docker exec -u root compose-hack-online-firewall-68qdy9-coder-1 bash -c '
    coder templates push holicode-agentic --name <version> \
      --message \"<summary>\" \
      --directory /tmp/tmpl --yes
  '
"

# 4. Tag
git tag -a coder-template-<version> $(git rev-parse origin/main) \
  -m "Coder template <version> -- <summary>"
git push origin coder-template-<version>
```

---

## Known Limitations

1. **Resource-constrained** -- CX22 (2 vCPU, 4 GB RAM default); memory_max raised to 8 GB
2. **Local image** -- `image_name = "holicode-cde"` requires image pre-built on OVH host; no GHCR pull

## Linked Specifications

- **ARM template SPEC**: [../coder-template/SPEC.md](../coder-template/SPEC.md)
- **Parent issue**: HOL-259
