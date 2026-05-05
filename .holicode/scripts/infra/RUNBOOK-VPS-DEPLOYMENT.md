# VPS Deployment Runbook: Coder + VK Remote + VK Relay

**Purpose**: Replicate the full agentic development stack on a new VPS.
**Reference deployment**: GiftCash on OVH VPS-1 (vps-191bcc76.vps.ovh.ca)
**Automation**: `provision-server.sh` handles most steps. This runbook covers what the script does, plus manual steps and lessons learned from the GiftCash deployment.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [DNS and Cloudflare Setup](#2-dns-and-cloudflare-setup)
3. [Server Provisioning](#3-server-provisioning)
4. [GitHub OAuth Apps](#4-github-oauth-apps)
5. [Coder Deployment](#5-coder-deployment)
6. [Workspace Image Build](#6-workspace-image-build)
7. [Coder Template Push](#7-coder-template-push)
8. [VK Remote + Relay Deployment](#8-vk-remote--relay-deployment)
9. [Sysbox Installation](#9-sysbox-installation)
10. [Networking Architecture](#10-networking-architecture)
11. [Data Migration (Optional)](#11-data-migration-optional)
12. [Validation Checklist](#12-validation-checklist)
13. [Troubleshooting](#13-troubleshooting)
14. [Decision Log](#14-decision-log)
15. [Secrets Management](#15-secrets-management)

---

## 1. Prerequisites

### Server Requirements

| Item | Minimum | GiftCash Actual |
|------|---------|-----------------|
| OS | Ubuntu 22.04+ | Ubuntu 24.04 |
| CPU | 2 vCPU | 2 vCPU (CX22) |
| RAM | 8 GB | 22 GB (OVH VPS-1) |
| Disk | 40 GB | 80 GB |
| Architecture | x86_64 or arm64 | x86_64 (amd64) |
| IPv4 | Required | Yes |
| IPv6 | Recommended | Yes |

### Accounts Required

- **Cloudflare**: DNS management for the base domain (free plan works)
- **GitHub**: Two OAuth Apps (one for Coder login, one for workspace git ops)
- **Domain**: A domain managed in Cloudflare

### SSH Access

Ensure you have SSH access to the target server. All commands assume:
```bash
SSH_HOST="ubuntu@<server-ip>"  # adjust user as needed
```

### Tools on Your Local Machine

- `ssh`, `scp`
- `git` (to clone holicode repo)
- `curl` or `jq` (for API calls during post-setup)

---

## 2. DNS and Cloudflare Setup

### Required DNS Records

Create these A (or AAAA for IPv6) records in Cloudflare:

| Record | Type | Name | Content | Proxy |
|--------|------|------|---------|-------|
| Dokploy | A | `dokploy.<domain>` | `<server-ip>` | Proxied (orange) |
| Coder | A | `coder.<domain>` | `<server-ip>` | Proxied (orange) |
| Coder wildcard | A | `*.coder.<domain>` | `<server-ip>` | **DNS only (grey)** |
| VK Remote | A | `vk-remote.<domain>` | `<server-ip>` | Proxied (orange) |
| VK Relay | A | `vk-relay.<domain>` | `<server-ip>` | Proxied (orange) |

**CRITICAL**: The Coder wildcard (`*.coder.<domain>`) MUST be DNS-only (grey cloud).
Cloudflare free plan does not support SSL for second-level wildcards. If you proxy it,
users get `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`.

### Cloudflare API Token

Create a scoped API token for Traefik's DNS challenge:

1. Cloudflare Dashboard -> Profile -> API Tokens -> Create Token
2. Permissions:
   - Zone / DNS / Edit
   - Zone / Zone / Read
3. Zone Resources: Include -> Specific zone -> your domain
4. Save the token (starts with `cfat_`)

**Lesson learned**: Never expose the token in shell output (`cat -A`, `echo`). If exposed, regenerate immediately.

### Cloudflare SSL/TLS Settings

- SSL/TLS mode: **Full (strict)** for proxied records
- Edge Certificates: ensure "Always Use HTTPS" is ON
- Under Security -> Bots: if Bot Fight Mode blocks your server IP, you may need the `coder-access-net` workaround (see Section 10)

---

## 3. Server Provisioning

### Option A: Automated (Recommended)

The `provision-server.sh` script handles Phases 1-5 and post-setup:

```bash
# On your local machine, clone the repo
cd ~/holicode/scripts/infra

# Create environment file
cp provision-server.env.example .env
# Edit .env with your values (see Section 4 for GitHub OAuth)
vim .env

# Copy script to server
scp provision-server.sh .env $SSH_HOST:/tmp/

# Run on server
ssh $SSH_HOST "sudo bash /tmp/provision-server.sh --env-file /tmp/.env"
```

The script is idempotent -- safe to re-run if interrupted.

### Option B: Manual (Step by Step)

#### Phase 1: Install Dokploy

```bash
ssh $SSH_HOST
curl -sSL https://dokploy.com/install.sh | sh
```

This installs Docker, initializes Swarm mode, and starts Dokploy on port 3000.

After install:
1. Visit `http://<server-ip>:3000`
2. Create admin account
3. Go to Settings -> Profile -> generate API key (save it)

#### Phase 2: Configure Traefik for Wildcard SSL

Traefik runs as a Docker Swarm service managed by Dokploy. You need to add the DNS challenge resolver:

```bash
ssh $SSH_HOST

# Edit Traefik config
sudo vim /etc/dokploy/traefik/traefik.yml
```

Add/update the `certificatesResolvers` section:

```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: your-email@domain.com
      storage: /etc/dokploy/traefik/dynamic/acme.json
      httpChallenge:
        entryPoint: web
  letsencrypt-dns:
    acme:
      email: your-email@domain.com
      storage: /etc/dokploy/traefik/dynamic/acme-dns.json
      dnsChallenge:
        provider: cloudflare
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"
```

Set the Cloudflare token as a Docker secret for Traefik:

```bash
# Store token as Docker secret
printf '<your-cf-token>' | sudo docker secret create CF_DNS_API_TOKEN -

# Update Traefik service to use the secret
sudo docker service update \
  --secret-add CF_DNS_API_TOKEN \
  --env-add CF_DNS_API_TOKEN_FILE=/run/secrets/CF_DNS_API_TOKEN \
  dokploy-traefik
```

**Restart Traefik** to pick up config changes:

```bash
sudo docker service update --force dokploy-traefik
```

---

## 4. GitHub OAuth Apps

**CRITICAL**: You need **OAuth Apps**, NOT **GitHub Apps**. OAuth Apps have client IDs starting with `Ov23...`. GitHub Apps (`Iv23...`) are different and will cause "Install GitHub App" prompts in Coder.

### App 1: Coder Login

1. Go to: https://github.com/settings/applications/new
2. Fill in:
   - Application name: `<Project> Coder Login`
   - Homepage URL: `https://coder.<domain>`
   - Authorization callback URL: `https://coder.<domain>/api/v2/users/oauth2/github/callback`
3. Save Client ID and generate Client Secret

### App 2: External Auth (Git in Workspaces)

1. Go to: https://github.com/settings/applications/new
2. Fill in:
   - Application name: `<Project> Coder Git`
   - Homepage URL: `https://coder.<domain>`
   - Authorization callback URL: `https://coder.<domain>/external-auth/github/callback`
3. Save Client ID and generate Client Secret

### App 3: VK Remote GitHub Login

1. Go to: https://github.com/settings/applications/new
2. Fill in:
   - Application name: `<Project> VK Remote`
   - Homepage URL: `https://vk-remote.<domain>`
   - Authorization callback URL: `https://vk-remote.<domain>/api/auth/github/callback`
3. Save Client ID and generate Client Secret

### Organization Requirement

Coder can restrict login to members of a specific GitHub organization. Create one at https://github.com/organizations/plan if needed.

---

## 5. Coder Deployment

### Via provision-server.sh (Automated)

The script renders `templates/coder-compose.yml` with your env vars and registers it as a Dokploy compose service.

### Via Dokploy UI (Manual)

1. In Dokploy, create a new Compose service
2. Paste the compose YAML (see `scripts/infra/templates/coder-compose.yml`)
3. Replace `__VARIABLES__` with actual values:

| Variable | Description | Example |
|----------|-------------|---------|
| `__CODER_VERSION__` | Coder server version | `v2.21.0` |
| `__DOMAIN__` | Base domain | `giftcash.com` |
| `__CODER_DB_PASSWORD__` | Postgres password | (generate: `openssl rand -hex 32`) |

4. In Dokploy Environment tab, set runtime variables:
   - `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` (App 1)
   - `GITHUB_EXT_CLIENT_ID` / `GITHUB_EXT_CLIENT_SECRET` (App 2)
   - `GITHUB_ORG` (your GitHub org slug)

5. **Important**: Do NOT add domain entries in Dokploy's Domains tab -- the compose labels handle routing. Adding both creates duplicate Traefik routers.

### Pre-create External Volumes

Before deploying, create the external volumes referenced by the compose:

```bash
ssh $SSH_HOST "
  sudo docker volume create holicode-coder-config
  sudo docker volume create holicode-coder-db
"
```

### Verify Coder

```bash
curl -sI https://coder.<domain> | head -5
# Should return HTTP/2 200
```

Visit `https://coder.<domain>`, create the first admin user, then log in with GitHub.

---

## 6. Workspace Image Build

The workspace image (`holicode-cde`) must be built on the target server (x86) since GHCR only hosts ARM builds.

### Build on Server

```bash
# Copy Dockerfile and context to server
scp -r ~/holicode/scripts/infra/coder-image/ $SSH_HOST:/tmp/coder-image/

# Build on server
ssh $SSH_HOST "
  cd /tmp/coder-image
  sudo docker build \
    --build-arg VK_SOURCE=npm \
    --build-arg VK_GIT_REF=v0.1.43 \
    --build-arg VK_API_BASE=https://vk-remote.<domain> \
    --build-arg CODER_IMAGE_TAG=2.1.0-amd64 \
    -t holicode-cde:2.1.0-amd64 .
"
```

**Decision point -- VK_SOURCE**:

| Value | When to Use | Trade-off |
|-------|-------------|-----------|
| `npm` | Quick builds, standard API base | VK frontend has npm-published API base baked in |
| `source` | Custom API base needed | Requires Rust toolchain, slower build (~10 min) |
| `prebuilt` | Pre-built tarball available | Fastest, but requires hosting the tarball |

**Lesson learned**: If using `VK_SOURCE=npm`, the VK frontend will have the npm-published API base URL baked in (e.g., `holagence.com`). For a fully custom deployment, use `VK_SOURCE=source` with `VK_API_BASE=https://vk-remote.<domain>`.

### Verify Image

```bash
ssh $SSH_HOST "sudo docker images | grep holicode-cde"
```

**Lesson learned**: Docker may garbage-collect the image when workspace containers are replaced. The image build is cached, so rebuilding is fast (~80 seconds with cache), but be aware.

---

## 7. Coder Template Push

### Create Template Directory

The template for x86 is at `scripts/infra/coder-template-x86/`. For a new deployment, create a copy and update `terraform.tfvars`:

```bash
cd ~/holicode/scripts/infra
cp -r coder-template-x86 coder-template-<project>
```

Update `terraform.tfvars`:

```hcl
agent_arch                 = "amd64"               # or "arm64"
image_name                 = "holicode-cde"        # local build name
image_tag                  = "2.1.0-amd64"         # match what you built
cpu_default                = 1
cpu_max                    = 2                     # match server capacity
memory_default             = 2
memory_min                 = 1
memory_max                 = 8                     # leave headroom for host services
use_dokploy_network        = "false"
use_ipv6_network           = "true"                # if Docker daemon has IPv6 enabled
docker_gid                 = "988"                 # getent group docker | cut -d: -f3
vk_base_domain             = "<domain>"            # e.g., campoya.app
coder_access_url           = "https://coder.<domain>"
coder_internal_url         = "http://coder:7080"   # internal bypass (see Section 10)

# Multi-repo support (HOL-547) — comma-separated repo URLs cloned to ~/repos/<name>
# Empty string is valid (skip auto-clone). Supports git@ and https:// URLs.
default_project_repos      = "https://github.com/<org>/<repo>.git"

# GitHub App credentials (HOL-550) — sourced from your secrets vault, NOT committed.
# Required for the bundled github-app-gh-auth script to mint installation tokens
# inside workspaces (so `gh` and `git` see authenticated GitHub access on startup).
github_app_id              = "<app-id>"
github_app_installation_id = "<installation-id>"
github_app_private_key_b64 = "<base64-encoded-pem>"
```

See Section 15 (Secrets Management) for how to source the GitHub App values from 1Password / Bitwarden at deploy time without committing them.

### Push Template to Coder

```bash
# 1. Package
tar -cf /tmp/template.tar \
  -C scripts/infra/coder-template-x86 \
  main.tf variables.tf provider.tf terraform.tfvars SPEC.md

# 2. Copy to server and into Coder container
scp /tmp/template.tar $SSH_HOST:/tmp/template.tar
CODER_CONTAINER=$(ssh $SSH_HOST "sudo docker ps --format '{{.Names}}' | grep coder-1")
ssh $SSH_HOST "
  sudo rm -rf /tmp/tmpl && sudo mkdir /tmp/tmpl
  sudo tar -xf /tmp/template.tar -C /tmp/tmpl/
  sudo docker cp /tmp/tmpl $CODER_CONTAINER:/tmp/tmpl
"

# 3. Push (first time: create; subsequent: update)
VERSION="2.3.0"
ssh $SSH_HOST "
  sudo docker exec -u root $CODER_CONTAINER bash -c '
    coder templates push holicode-agentic --name $VERSION \
      --message \"Initial deployment for <project>\" \
      --directory /tmp/tmpl --yes
  '
"

# 4. Tag in git
git tag -a coder-template-$VERSION $(git rev-parse HEAD) \
  -m "Coder template $VERSION -- <project> initial deployment"
git push origin coder-template-$VERSION
```

**Note**: Find the Coder container name with:
```bash
ssh $SSH_HOST "sudo docker ps --format '{{.Names}}' | grep coder"
```

### Multi-repo support (HOL-547)

The current template uses a `project_repos` parameter (comma-separated) instead of a single `project_repo`. Each repo is cloned into `~/repos/<repo-name>` (derived from the URL's basename, `.git` suffix stripped). The `default_project_repos` tfvar pre-fills this parameter so users don't have to type it on every workspace creation.

**Path convention**:
- Single repo `https://github.com/org/foo.git` → `/home/coder/repos/foo`
- Multiple repos `git@github.com:org/foo.git,git@github.com:org/bar.git` → `/home/coder/repos/foo` + `/home/coder/repos/bar`

**Note (backward compatibility)**: The legacy `/home/coder/project` path is no longer auto-populated. Tooling, automation, or shell aliases that hardcoded that path must move to `~/repos/<name>`. If you need a stable single-project symlink for legacy automation, create it once in the workspace post-clone (e.g. `ln -s ~/repos/foo ~/project`) and check it in via dotfiles or workspace_env script.

**GitHub App org-installation gotcha**: if `default_project_repos` references a repo under a different GitHub org than where the App is installed, clones will fail with "Repository not found" (GitHub returns 404 for unauthorized private repos). Install the GitHub App on each org whose repos you want auto-cloned. See Troubleshooting → "Clone fails with 'Repository not found'" below.

---

## 8. VK Remote + Relay Deployment

### Via provision-server.sh (Automated)

Phase 5 of the script clones the VK Remote repo, builds the image, and prepares the compose.

### Via Dokploy UI (Manual)

1. Clone VK Remote source on the server:
```bash
ssh $SSH_HOST "
  sudo mkdir -p /etc/dokploy/vk-remote
  sudo git clone --branch fix-remote \
    https://github.com/ciekawy/vibe-kanban.git \
    /etc/dokploy/vk-remote/repo
"
```

2. In Dokploy, create a new Compose service
3. Use the template from `scripts/infra/templates/vk-remote-compose.yml`
4. Replace `__DOMAIN__` with your base domain

5. In Dokploy Environment tab, set:

| Variable | How to Generate |
|----------|----------------|
| `ELECTRIC_ROLE_PASSWORD` | `openssl rand -hex 16` |
| `GITHUB_OAUTH_CLIENT_ID` | From App 3 (Section 4) |
| `GITHUB_OAUTH_CLIENT_SECRET` | From App 3 |
| `VIBEKANBAN_REMOTE_JWT_SECRET` | `python3 -c "import base64,secrets; print(base64.b64encode(secrets.token_bytes(48)).decode())"` |
| `SERVER_PUBLIC_BASE_URL` | `https://vk-remote.<domain>` |

**CRITICAL -- JWT Secret format**: The VK Remote server requires **standard base64** encoding (with `+` and `/`). URL-safe base64 (with `-` and `_`) will cause an "invalid value" error. Always use `base64.b64encode()`, never `base64.urlsafe_b64encode()`.

6. Enable the relay profile by setting in compose or environment:
```
COMPOSE_PROFILES=relay
```

### Pre-create External Volumes

```bash
ssh $SSH_HOST "
  sudo docker volume create holicode-vk-remote-db
  sudo docker volume create holicode-vk-electric
"
```

### Verify VK Remote

```bash
curl -s https://vk-remote.<domain>/health
# Should return OK or JSON health response

curl -s https://vk-relay.<domain>/health
# Relay health check
```

Visit `https://vk-remote.<domain>` and log in with GitHub.

---

## 9. Sysbox Installation

Sysbox provides isolated Docker-in-Docker for workspace containers. Without it, workspaces have no Docker access (the host socket is not mounted for security reasons).

### Install Sysbox CE

```bash
ssh $SSH_HOST

# Download Sysbox CE (check latest at https://github.com/nestybox/sysbox/releases)
SYSBOX_VERSION="0.6.7"
wget https://downloads.nestybox.com/sysbox/releases/v${SYSBOX_VERSION}/sysbox-ce_${SYSBOX_VERSION}-0.linux_amd64.deb

# Install
sudo apt-get install -y jq
sudo dpkg -i sysbox-ce_${SYSBOX_VERSION}-0.linux_amd64.deb

# Verify
sudo systemctl status sysbox
sysbox-runc --version
```

### Configure Docker Daemon for Sysbox

Add Sysbox as a runtime in Docker daemon config:

```bash
sudo vim /etc/docker/daemon.json
```

Ensure it contains:

```json
{
  "runtimes": {
    "sysbox-runc": {
      "path": "/usr/bin/sysbox-runc"
    }
  }
}
```

If you also need IPv6:

```json
{
  "ipv6": true,
  "ip6tables": true,
  "fixed-cidr-v6": "fd00::/80",
  "runtimes": {
    "sysbox-runc": {
      "path": "/usr/bin/sysbox-runc"
    }
  }
}
```

Restart Docker:

```bash
sudo systemctl restart docker
```

**Lesson learned**: After restarting Docker, all non-Swarm containers stop. Dokploy Swarm services auto-recover, but Compose-deployed services (Coder, VK Remote) need manual restart via Dokploy UI or API.

### Verify Sysbox

```bash
sudo docker run --rm --runtime=sysbox-runc alpine uname -a
```

### First-run Forgejo Admin Bootstrap

Each workspace runs an inner Docker daemon (Sysbox) or has no Docker socket at all (non-Sysbox). In either case the workspace cannot see the host's Forgejo sidecar container. The first time a workspace starts, the `forgejo_init` script will print a one-time manual host-side command that needs to run before the Forgejo admin user exists. Logs look like:

```
Admin auth failed (HTTP 401) — bootstrapping via Docker socket...
Forgejo container not visible via Docker socket (Sysbox mode — inner daemon only)
First-run admin bootstrap requires a one-time manual step on the host:
  ssh root@host.docker.internal \
    "docker exec --user git coder-<owner>-<workspace>-forgejo forgejo admin user create \
      --admin --username <owner> --password coder-forgejo-local \
      --email <owner>@workspace.local --must-change-password=false"
Skipping mirror setup until admin is bootstrapped.
```

> **Note:** The script output uses `ssh root@host.docker.internal` because it is printed from inside the workspace where `host.docker.internal` resolves to the VPS host. When running the command **from the VPS host directly**, strip the `ssh root@host.docker.internal` wrapper and run only the `docker exec` part:

```bash
sudo docker exec --user git coder-<owner>-<workspace>-forgejo forgejo admin user create \
  --admin --username <owner> --password coder-forgejo-local \
  --email <owner>@workspace.local --must-change-password=false
```

Replace `<owner>` and `<workspace>` with the actual values from the script output. After this one-time bootstrap, the persistent Forgejo data volume (`coder-<workspace-id>-forgejo`) keeps the admin user across restarts.

---

## 10. Networking Architecture

### The Cloudflare Problem

When Cloudflare proxies traffic to your server, it adds WAF/bot protection. Workspace containers need to download the Coder agent binary from `https://coder.<domain>`. If Cloudflare blocks the server's own IP (e.g., OVH IPs are sometimes flagged), the agent download fails with 403.

### Solution: coder-access-net

Create a Docker bridge network that connects workspace containers directly to the Coder server container, bypassing Cloudflare entirely:

```bash
ssh $SSH_HOST "sudo docker network create coder-access-net"
```

The Coder compose must attach to this network:

```yaml
services:
  coder:
    networks:
      - internal
      - dokploy-network
      - coder-access-net

networks:
  coder-access-net:
    external: true
```

The Coder template (`main.tf`) patches the agent init script to use the internal URL:

```hcl
# In the container entrypoint
replace(coder_agent.main.init_script, var.coder_access_url, var.coder_internal_url)

# Environment variable for agent connection
env {
  key   = "CODER_URL"
  value = var.coder_internal_url
}

# Attach workspace to the network
networks_advanced {
  name = "coder-access-net"
}
```

With `terraform.tfvars`:
```hcl
coder_access_url    = "https://coder.<domain>"
coder_internal_url  = "http://coder:7080"
```

This replaces the external URL in the binary download script with the internal Docker DNS name.

### Workspace Networking (How It Actually Works)

Workspace containers do NOT use Traefik for user access. The Coder agent establishes a WireGuard tunnel back to the Coder server. All workspace traffic (SSH, web apps, ports) flows through this tunnel.

This means:
- Workspace containers do NOT need `dokploy-network`
- `use_dokploy_network = "false"` is correct for most deployments
- The only network workspace containers need is `coder-access-net` (for agent bootstrap)

### Sysbox Network Isolation

Sysbox containers have stricter network isolation than standard Docker. They cannot reach `host.docker.internal` or host-published ports via the Docker bridge gateway (172.17.0.1). The `coder-access-net` dedicated bridge network solves this by providing direct container-to-container DNS resolution.

---

## 11. Data Migration (Optional)

If migrating from an existing VK Remote instance.

### VK Remote Database Migration

Use PostgreSQL COPY to transfer data between instances:

```bash
# Source DB access (example -- adjust container names)
SOURCE_CMD="ssh root@source-host docker exec <source-db-container> psql -U remote -d remote"

# Target DB access
TARGET_CMD="ssh $SSH_HOST sudo docker exec <target-db-container> psql -U remote -d remote"

# Verify schema versions match
$SOURCE_CMD -c "SELECT COUNT(*) FROM _electric_migrations;"
$TARGET_CMD -c "SELECT COUNT(*) FROM _electric_migrations;"
```

Migration must follow FK dependency order:
1. users
2. oauth_accounts
3. organizations
4. organization_member_metadata
5. projects
6. project_statuses
7. tags
8. issues
9. issue_assignees, issue_followers, issue_tags
10. issue_relationships, issue_comments
11. pull_requests, pull_request_issues
12. workspaces

**Do NOT migrate**: auth_sessions, revoked_refresh_tokens, oauth_handoffs, hosts, notifications, organization_billing, organization_invitations. Users will re-authenticate via GitHub OAuth on the new instance.

### Claude Code Sessions Migration

To migrate historical Claude Code sessions from one workspace to another:

```bash
# On source workspace
cd ~/.claude/projects
tar czf /tmp/claude-sessions.tar.gz \
  --exclude='debug' --exclude='cache' --exclude='credentials' \
  .

# Transfer to target workspace
scp /tmp/claude-sessions.tar.gz <target>:~/.claude/projects/
ssh <target> "cd ~/.claude/projects && tar xzf claude-sessions.tar.gz"
```

**Known limitation**: Imported VK sessions may not display Claude's responses in the VK UI. The VK MCP server needs to be active during session creation for full content linkage. See GIF-413 for ongoing investigation.

---

## 12. Validation Checklist

Run through these checks after deployment:

### Infrastructure

- [ ] Dokploy dashboard accessible at `https://dokploy.<domain>`
- [ ] Traefik dashboard shows healthy routers
- [ ] SSL certificates valid for all subdomains
- [ ] `docker ps` shows all containers running

### Coder

- [ ] `https://coder.<domain>` loads login page
- [ ] GitHub OAuth login works (redirects correctly)
- [ ] Template `holicode-agentic` visible in Templates page
- [ ] Create a test workspace -- agent connects successfully
- [ ] Workspace terminal works (SSH via WireGuard tunnel)
- [ ] GitHub auth inside workspace works (`gh auth status`)
- [ ] VK Remote reachable from inside workspace

### VK Remote

- [ ] `https://vk-remote.<domain>` loads UI
- [ ] GitHub OAuth login works
- [ ] Organization and projects visible after login
- [ ] Issue creation works
- [ ] WebSocket sync (Electric SQL) working

### VK Relay

- [ ] `https://vk-relay.<domain>/health` returns OK
- [ ] VK CLI inside workspace connects via relay

### Sysbox (if installed)

- [ ] `docker run --runtime=sysbox-runc alpine uname` works
- [ ] Workspace with `sysbox_enabled=true` starts successfully
- [ ] Inner Docker daemon works inside Sysbox workspace

### Networking

- [ ] Workspace container can reach `http://coder:7080` (coder-access-net)
- [ ] Agent binary downloads without 403
- [ ] Workspace can reach external internet

---

## 13. Troubleshooting

### Agent Download 403

**Symptom**: Workspace starts but agent fails to connect. Logs show 403 downloading binary.
**Cause**: Cloudflare WAF blocking the server's own IP.
**Fix**: Ensure `coder-access-net` is set up (Section 10). Verify `coder_internal_url` in tfvars.

### ERR_SSL_VERSION_OR_CIPHER_MISMATCH on Wildcard

**Symptom**: `*.coder.<domain>` shows SSL error in browser.
**Cause**: Cloudflare free plan doesn't cover second-level wildcards.
**Fix**: Set `*.coder.<domain>` DNS record to DNS-only (grey cloud). Traefik handles SSL via Let's Encrypt DNS challenge.

### VK Remote "invalid value" on JWT Secret

**Symptom**: VK Remote container crashes with "invalid value" for JWT secret.
**Cause**: URL-safe base64 encoding used instead of standard base64.
**Fix**: Regenerate with standard base64:
```python
python3 -c "import base64,secrets; print(base64.b64encode(secrets.token_bytes(48)).decode())"
```

### Dokploy "Github Provider not found"

**Symptom**: Creating Dokploy compose from GitHub fails.
**Cause**: Using `sourceType: "customGit"` instead of `"git"`.
**Fix**: Use `sourceType: "git"` for public HTTPS repos.

### Workspace Image Disappears

**Symptom**: Workspace creation fails with "image not found" after a container replace.
**Cause**: Docker garbage-collected the locally-built image.
**Fix**: Rebuild (fast with cache):
```bash
ssh $SSH_HOST "cd /tmp/coder-image && sudo docker build -t holicode-cde:2.1.0-amd64 ."
```

### Containers Stop After Docker Restart

**Symptom**: After `systemctl restart docker`, Coder and VK Remote are down.
**Cause**: Compose-deployed containers don't auto-restart like Swarm services.
**Fix**: Redeploy via Dokploy UI or API.

### Duplicate Traefik Routers

**Symptom**: 404 or routing errors; Traefik dashboard shows duplicate routes.
**Cause**: Both compose labels AND Dokploy domain entries exist for the same service.
**Fix**: Remove Dokploy domain entries; keep compose labels only.

### host.docker.internal Unreachable from Sysbox

**Symptom**: Workspace can't reach host services via 172.17.0.1 or host.docker.internal.
**Cause**: Sysbox has stricter network isolation.
**Fix**: Use dedicated Docker networks (coder-access-net) instead of host gateway.

### VK Remote DB Container Exits

**Symptom**: VK Remote and Electric stop working; DNS resolution fails inside compose network.
**Cause**: DB container stopped (disk full, OOM, or Docker restart).
**Fix**: Check logs, restart via Dokploy. If DB volume is intact, data is preserved.

### Clone fails with "Repository not found"

**Symptom**: Workspace startup logs show:
```
Cloning into '/home/coder/repos/<name>'...
remote: Repository not found.
fatal: repository 'https://github.com/<org>/<repo>.git/' not found
```
even though `gh auth status` succeeds.

**Cause**: GitHub returns 404 (not 403) for repos the auth token has no access to. Most common reasons:
1. The GitHub App is installed only on a specific user/org, but `default_project_repos` references a repo under a different org.
2. The repo URL is wrong (typo in org/repo).

**Fix**:
- For (1): install the GitHub App on the target org. Open the App's GitHub page → Install App → select the missing org → grant repo access. The same App ID + private key will then mint tokens valid for both installations.
- For (2): correct the URL in `default_project_repos` and push a new template version.

### `github_auth` script falls back even with App credentials

**Symptom**: Workspace logs show "GitHub App auth did not succeed — trying fallback strategies..." despite tfvars being set.

**Cause**: One or more of the 3 GitHub App tfvars (`github_app_id`, `github_app_installation_id`, `github_app_private_key_b64`) is empty in the deployed template version, OR the bundled `/usr/local/bin/github-app-gh-auth` script is not present in the image (only present in `2.1.0-amd64` and later).

**Fix**:
- Verify image: `sudo docker run --rm --entrypoint=ls holicode-cde:<tag> -la /usr/local/bin/github-app-gh-auth` should exist.
- Verify tfvars: re-push the template with all 3 vars set (see Section 15 for sourcing them from a vault).

### Forgejo "still running" indicator never clears

**Symptom**: In the Coder UI, the `forgejo_init` script tile shows "still running" indefinitely even though the workspace is otherwise functional.

**Cause**: Pre-2.2.1-campoya templates had a race condition — `forgejo_init` checked for `/var/run/docker.sock` before the inner dockerd (Sysbox) was ready, fell into the wrong branch, and never called `exit 0`.

**Fix**: Push template version `2.2.1-campoya` or later (HoliCode PR #254 added the 90s socket-wait + clean exit). For Sysbox workspaces also follow the manual Forgejo bootstrap step (Section 9).

---

## 14. Decision Log

Key decisions made during the GiftCash deployment and their rationale:

| Decision | Rationale | Alternative Considered |
|----------|-----------|----------------------|
| DNS-only for wildcard | Cloudflare free plan doesn't SSL wildcards at 2nd level | Upgrade to Cloudflare Pro ($20/mo) |
| coder-access-net bypass | Cloudflare WAF blocks OVH IPs for agent binary download | Whitelist IP in Cloudflare (didn't work reliably) |
| Local image build (no GHCR) | GHCR only has ARM builds; x86 needs local build | Set up GHCR x86 CI/CD (future work) |
| Separate OAuth Apps (not GitHub App) | GitHub Apps require "Install" flow, wrong UX for Coder | Single GitHub App (causes confusing prompts) |
| Standard base64 for JWT | VK Remote Rust code uses standard base64 decoder | URL-safe base64 (crashes the server) |
| use_dokploy_network=false | Workspaces use WireGuard tunnel, not Traefik routing | Attach to dokploy-network (unnecessary overhead) |
| No host socket, Sysbox opt-in | Mounting host socket is a security boundary violation; Sysbox gives isolated Docker | DooD via host socket (rejected — exposes all host containers) |
| VK_SOURCE=npm for quick deploys | Fastest build, works if holagence.com API base is acceptable | VK_SOURCE=source for custom API base (slower build) |

---

## 15. Secrets Management

The deployment requires several secrets — Cloudflare DNS token, GitHub App credentials, Coder admin token, DB passwords. To avoid committing them to the repo, source them from a vault at deploy time.

The image bundles two CLIs so contributors can use whichever vault their team standardizes on:

| Vault | CLI | Image version | When to use |
|-------|-----|---------------|-------------|
| **1Password** | `op` (1password-cli apt package) | `1.8.0+` | Service-account-token-based access, headless-friendly. Read with `op read "op://<vault-id>/<item-id>/<field>"`. |
| **Bitwarden** | `bw` (`@bitwarden/cli` npm) | `2.2.0+` | Self-hosted Vaultwarden or bitwarden.com. Read with `bw get item <name>` after `bw unlock`. |

### Recommended vault layout

Whichever vault you pick, organize items by environment with one item per service. Names listed are conventions used in this repo's procedures (`CAMPOYA-DEPLOYMENT-HANDOFF.md` matches):

| Item title | Fields | Used by |
|------------|--------|---------|
| `GitHub App: HoliCode Agent (<project>)` | `app_id`, `installation_id`, `client_id`, `client_secret`, `private_key_b64`, `domain` | Coder OAuth + workspace `gh` auth + VK Remote |
| `Coder Admin - <project>` | `api-token`, `admin_user`, `admin_password` | Template push, workspace API operations |
| `Dokploy Admin - <project>` | `email`, `password`, `api-token` | compose deployment automation |
| `<project> Stack Secrets` | `coder_db_password`, `vk_remote_jwt_secret`, `vk_remote_electric_pw` | provision-server.sh |
| `Cloudflare - <project> DNS Deploy API token` | `api_token`, `zone_id`, `account_id`, `zone_name` | Traefik DNS challenge |
| `OVH API - <project>` | `app_key`, `app_secret`, `consumer_key`, `region` | (if provisioning OVH VPS) |

### Sourcing tfvars at deploy time

Example for the GitHub App credentials needed by §7 (1Password Service Account Token in `~/.config/op/service_account_token`):

```bash
export OP_SERVICE_ACCOUNT_TOKEN="$(cat ~/.config/op/service_account_token)"
INBOX=$(op vault list --format json | jq -r '.[] | select(.name=="Automation / Inbox") | .id')
ITEM=$(op item list --vault "$INBOX" --format json | jq -r '.[] | select(.title=="GitHub App: HoliCode Agent (<project>)") | .id')

cat > terraform.tfvars <<EOF
# ... other vars ...
github_app_id              = "$(op read "op://${INBOX}/${ITEM}/app_id")"
github_app_installation_id = "$(op read "op://${INBOX}/${ITEM}/installation_id")"
github_app_private_key_b64 = "$(op read "op://${INBOX}/${ITEM}/private_key_b64")"
EOF
chmod 600 terraform.tfvars
```

Equivalent with Bitwarden:

```bash
export BW_SESSION="$(bw unlock --raw)"
GH_APP_JSON=$(bw get item "GitHub App: HoliCode Agent (<project>)" --raw)

cat > terraform.tfvars <<EOF
# ... other vars ...
github_app_id              = "$(echo "$GH_APP_JSON" | jq -r '.fields[] | select(.name=="app_id") | .value')"
github_app_installation_id = "$(echo "$GH_APP_JSON" | jq -r '.fields[] | select(.name=="installation_id") | .value')"
github_app_private_key_b64 = "$(echo "$GH_APP_JSON" | jq -r '.fields[] | select(.name=="private_key_b64") | .value')"
EOF
chmod 600 terraform.tfvars
```

Always `chmod 600` files containing secrets, and `shred -uz` after the template tar has been pushed and accepted.

**Note**: the GitHub App's installation token (minted by `/usr/local/bin/github-app-gh-auth` inside the workspace) is short-lived (~1 hour). The script re-runs at workspace start; mid-session refresh is currently a known gap (see CAM-34 spike) — for now, restart the workspace if `gh` auth expires.

---

## Quick Reference: Environment Variables

### .env File for provision-server.sh

```bash
# Required
DOMAIN=<your-domain.com>
CF_DNS_API_TOKEN=<cloudflare-token>
ACME_EMAIL=<email>
GITHUB_OAUTH_CLIENT_ID=<app1-client-id>
GITHUB_OAUTH_CLIENT_SECRET=<app1-secret>
GITHUB_EXT_CLIENT_ID=<app2-client-id>
GITHUB_EXT_CLIENT_SECRET=<app2-secret>
GITHUB_ORG=<github-org-slug>

# Optional (auto-generated if empty)
CODER_VERSION=v2.21.0
CODER_DB_PASSWORD=
VK_REMOTE_JWT_SECRET=
VK_REMOTE_ELECTRIC_PW=
```

### Server File Locations

| Path | Contents |
|------|----------|
| `/etc/dokploy/` | Dokploy config, Traefik config |
| `/etc/dokploy/traefik/traefik.yml` | Traefik entrypoints + ACME resolvers |
| `/etc/dokploy/coder/` | Coder compose + credentials |
| `/etc/dokploy/vk-remote/` | VK Remote compose + repo clone |
| `/etc/docker/daemon.json` | Docker daemon config (Sysbox, IPv6) |

### Container Names (vary by Dokploy project)

Find with:
```bash
sudo docker ps --format '{{.Names}}' | grep -E 'coder|remote|electric|relay'
```

---

## Estimated Timeline

| Phase | Duration | Notes |
|-------|----------|-------|
| DNS + Cloudflare setup | 15 min | Plus propagation time |
| GitHub OAuth Apps | 10 min | 3 apps to create |
| Server provisioning (automated) | 20-30 min | Includes Docker, Dokploy, Traefik |
| Workspace image build | 5-15 min | Depends on cache and VK_SOURCE |
| Coder deployment + template push | 10 min | |
| VK Remote + Relay deployment | 15 min | Includes DB init |
| Sysbox installation | 10 min | Optional |
| Validation | 15 min | Full checklist |
| **Total** | **~1.5-2 hours** | First deployment; subsequent: ~45 min |
