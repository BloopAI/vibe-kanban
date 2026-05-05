# Server Provisioning — Dokploy + Coder + VK Remote

Automate a from-zero setup of the HoliCode cloud dev environment on a fresh Ubuntu server.

## Architecture

```
provision-server.sh          # Main provisioning script (runs on target server)
├── templates/
│   ├── coder-compose.yml    # Coder docker-compose template
│   └── vk-remote-compose.yml # VK Remote docker-compose template
├── coder-template/          # Coder workspace Terraform template
├── coder-image/             # Coder workspace Docker image
└── manage-server.sh         # Server lifecycle (Hetzner + Cloudflare + provisioning)
```

## Workspace Image (`coder-image/`)

The base Docker image (`ghcr.io/holagence/holicode-cde`) includes:
- Ubuntu 24.04, Node.js 22 LTS, GitHub CLI, dev tools
- **Vibe Kanban CLI** (`vk`) — **built from source** with custom API base

### How It Works: Build from Source

Unlike typical Docker images that install pre-built packages, our Coder workspace image **builds vibe-kanban from source during the Docker build**. This allows us to:

1. **Customize the API base URL** - Set `VITE_VK_SHARED_API_BASE` to point to our remote server
2. **Apply custom patches** - Include our MCP dependency modifications
3. **Use any git reference** - Tags, branches, or specific commits

**Build process (in Dockerfile):**
```dockerfile
# Clone vibe-kanban repo at specific git ref
git clone --depth 1 --branch v0.1.18 https://github.com/holagence/vibe-kanban.git

# Build with custom environment variable
VITE_VK_SHARED_API_BASE=https://vk-remote.holagence.com pnpm run build:npx

# Install globally
npm pack && npm install -g <tarball>
```

### Version Configuration

All build parameters are managed in `scripts/infra/.version.env`:
```bash
VK_GIT_REF=v0.1.18                           # Git tag or branch name
VK_API_BASE=https://vk-remote.holagence.com  # Baked into frontend build
CODER_IMAGE_TAG=1.3                           # Image tag (independent)
```

### Updating Vibe-Kanban Version

**To update to a new vibe-kanban version:**

```bash
# 1. Edit .version.env
sed -i 's/VK_GIT_REF=.*/VK_GIT_REF=v0.1.19/' scripts/infra/.version.env

# 2. Commit and push
git add scripts/infra/.version.env
git commit -m "chore(infra): bump vibe-kanban to v0.1.19"
git push

# 3. Trigger build (or wait for auto-trigger on push to main)
gh workflow run build-coder-image.yml \
  --repo holagence/holicode
```

**Or trigger manually with custom parameters:**
```bash
gh workflow run build-coder-image.yml \
  --repo holagence/holicode \
  -f vk_git_ref=v0.1.19 \
  -f vk_api_base=https://vk-remote.holagence.com \
  -f image_tag=1.4
```

### Building the Image (Automated via GitHub Actions)

The Coder workspace image is built automatically using GitHub Actions with a self-hosted ARM64 runner.

**Prerequisites:**
1. **Self-hosted ARM runner** on the Dokploy host (setup once, see below)
2. **Access to vibe-kanban repository** (cloned during Docker build)

#### One-Time Setup: Self-Hosted ARM Runner

Run on the Dokploy host to install a GitHub Actions runner:

```bash
# 1. Get registration token
GITHUB_TOKEN=<your-pat> gh api repos/holagence/holicode/actions/runners/registration-token --jq .token

# 2. Install runner
scp scripts/infra/setup-github-runner.sh root@host.docker.internal:/tmp/
ssh root@host.docker.internal "GITHUB_RUNNER_TOKEN=<token> /tmp/setup-github-runner.sh"
```

Verify at: https://github.com/holagence/holicode/settings/actions/runners

#### Verifying a Build

```bash
# Pull and test
docker pull ghcr.io/holagence/holicode-cde:1.3
docker run --rm ghcr.io/holagence/holicode-cde:1.3 which vibe-kanban
docker run --rm ghcr.io/holagence/holicode-cde:1.3 vibe-kanban --version
```

**Automatic Triggers:**

The workflow runs automatically on:
- Push to `main` branch modifying `scripts/infra/coder-image/Dockerfile` or `.version.env`
- Manual dispatch via GitHub UI or `gh workflow run`

#### Troubleshooting

**Build fails during vibe-kanban source clone:**
- Check git reference exists: `git ls-remote https://github.com/holagence/vibe-kanban.git refs/tags/v0.1.18`
- Try with a known tag or use `main` branch
- Check Docker build logs for git clone errors

**Build fails during pnpm install:**
- Usually means lockfile mismatch or dependency resolution issues
- Check vibe-kanban repo CI - does it build successfully?
- Try building locally first to diagnose

**Build fails with "VITE_VK_SHARED_API_BASE not set":**
- Check `.version.env` has `VK_API_BASE` configured
- Verify workflow passes build args correctly
- Check Docker build logs for environment variable values

**ARM runner not available:**
- Verify runner status: `ssh root@host.docker.internal "sudo /opt/actions-runner/svc.sh status"`
- Check GitHub: https://github.com/holagence/holicode/settings/actions/runners
- Restart if needed: `ssh root@host.docker.internal "sudo /opt/actions-runner/svc.sh restart"`

**Version mismatch after automation:**
- Check `.version.env` was updated: `cat scripts/infra/.version.env`
- Check main.tf comment updated: `grep "vibe-kanban v" scripts/infra/coder-template/main.tf`
- Manual fix: edit `.version.env` and trigger build workflow manually

**ghcr.io push fails:**
- Workflow uses `${{ secrets.GITHUB_TOKEN }}` (automatic) for registry push
- No additional secrets needed for `VK_SOURCE=source` (default)
- `VK_SOURCE=prebuilt` additionally requires `GH_TOKEN` repo secret (a PAT with `repo` scope) to download release assets via `gh release download`

## Phases

| Phase | What | Automated? |
|-------|------|-----------|
| 1 | Install Dokploy (Docker, Swarm, Traefik) | Yes |
| 2 | DNS records in Cloudflare | Manual (or via `manage-server.sh`) |
| 3 | Traefik wildcard SSL via Cloudflare DNS challenge | Yes |
| 4 | Prepare Coder (compose, credentials, volumes) | Yes |
| 5 | Prepare VK Remote (clone, build, compose, volumes) | Yes |
| post-setup | Deploy via Dokploy, upload Coder template, persist CF token | Yes (needs DOKPLOY_API_KEY; CODER_TOKEN optional) |
| GitHub App | Install on the deployment's org + add 3 callback URLs to the App | Manual (see [GITHUB-APP-PLAYBOOK.md](./GITHUB-APP-PLAYBOOK.md)) |

## Runbook: Automated Server Lifecycle

### Step 1: Configure secrets

Create `~/.env.holicode-cloud` (or pass `--env-file`):
```bash
HETZNER_API_KEY=<your-token>
CF_DNS_API_TOKEN=<your-token>
# Optional overrides:
# DOMAIN=yourcompany.com     # default: holagence.com
# TEST_PREFIX=staging         # default: test; set "" for bare domain
# SERVER_TYPE=cax31           # default: cax21
# SERVER_LOCATION=nbg1        # default: hel1
```

### Step 2: Create server + deploy (phases 1-5)

```bash
cd scripts/infra
./manage-server.sh                              # uses defaults (test.holagence.com)
./manage-server.sh --env-file /path/to/prod.env # custom config
TEST_PREFIX="" DOMAIN=client.com ./manage-server.sh  # production for another team
```

This creates a Hetzner server, sets up DNS, runs all provisioning phases, and prints URLs.

### Step 3: Create Dokploy admin + first post-setup

1. Open `https://dokploy.<domain>` — create admin account
2. Go to Settings > Profile > generate API key
3. Add to your secrets file:
   ```bash
   DOKPLOY_API_KEY=<from step above>
   ```
4. Run post-setup (deploys Coder + VK Remote via Dokploy):
   ```bash
   ./manage-server.sh --post-setup
   ```

### Step 4: Create Coder admin + template upload

1. Open `https://coder.<domain>` — create admin account (or sign in via GitHub)
2. Go to Settings > Tokens > generate session token
3. Add to your secrets file:
   ```bash
   CODER_TOKEN=<from step above>
   ```
4. Re-run post-setup (uploads Coder workspace template):
   ```bash
   ./manage-server.sh --post-setup
   ```

### Step 5: Teardown (when done)

```bash
./manage-server.sh --teardown
```

Deletes the Hetzner server, SSH key, and Cloudflare DNS records.

## Runbook: Manual Server Setup

### Prerequisites

- Ubuntu 22.04+ server with root access, ports 80/443/3000 free
- Domain managed via Cloudflare
- Cloudflare API token (Zone/DNS/Edit + Zone/Zone/Read)

### Steps

```bash
# 1. Configure
cp provision-server.env.example .env
vim .env  # Fill DOMAIN, CF_DNS_API_TOKEN, ACME_EMAIL (required)
          # Fill GITHUB_OAUTH_* (optional — password auth if missing)

# 2. Upload to server
scp provision-server.sh .env root@<ip>:/root/
scp -r templates/ root@<ip>:/root/templates/
scp coder-template/main.tf root@<ip>:/root/  # for template upload

# 3. Create DNS records (see Phase 2 output)
ssh root@<ip> "/root/provision-server.sh --env-file /root/.env --phase 1"
# Script prints required DNS records — create them in Cloudflare

# 4. Run remaining phases (prepares Coder + VK Remote — does NOT start them)
ssh root@<ip> "/root/provision-server.sh --env-file /root/.env --phase all"

# 5. Create Dokploy admin account, generate API key

# 6. Add Dokploy key and run post-setup (deploys services via Dokploy)
echo "DOKPLOY_API_KEY=..." >> .env
scp .env root@<ip>:/root/.env
ssh root@<ip> "/root/provision-server.sh --env-file /root/.env --phase post-setup"

# 7. After Coder starts, create admin, get token, re-run for template upload
echo "CODER_TOKEN=..." >> .env
scp .env root@<ip>:/root/.env
ssh root@<ip> "/root/provision-server.sh --env-file /root/.env --phase post-setup"
```

## Token Flow

Tokens are **not available** until after phases 1-5 complete and admin accounts are created. The workflow is:

1. **Phases 1-5**: Prepare everything (Dokploy installed + running, Coder/VK Remote compose files + volumes ready, no services started)
2. **Manual**: Create Dokploy admin account, generate API key
3. **Post-setup (pass 1)**: `DOKPLOY_API_KEY` registers Dokploy compose services + deploys them. Coder and VK Remote start running.
4. **Manual**: Create Coder admin account, generate session token
5. **Post-setup (pass 2)**: `CODER_TOKEN` uploads the Coder workspace template. Idempotent — Dokploy services are already registered, only template upload runs.

After post-setup, Dokploy manages the services and can redeploy them from its UI.

## Compose Templates

Compose files use two types of variables:

- **`__VAR__`** — Substituted at generation time by the script (e.g., `__DOMAIN__` → `test.holagence.com`)
- **`${VAR}`** — Resolved by Dokploy from the service's Environment tab (e.g., `${CODER_DB_PASSWORD}`)

The `build_dokploy_env_string()` function in the script sets these via the Dokploy API during post-setup.

## Running Individual Phases

```bash
./provision-server.sh --env-file .env --phase 1          # Dokploy install
./provision-server.sh --env-file .env --phase 3          # Traefik SSL
./provision-server.sh --env-file .env --phase 4          # Coder deploy
./provision-server.sh --env-file .env --phase 5          # VK Remote deploy
./provision-server.sh --env-file .env --phase post-setup # Dokploy services + template
./provision-server.sh --env-file .env --phase verify     # Check state
./provision-server.sh --env-file .env --phase all --dry-run  # Preview
```

## Idempotency

All phases check current state before acting:
- Phase 1: Skips if Dokploy service exists
- Phase 3: Skips if DNS resolver present + token matches
- Phase 4: Skips if compose file + credentials already prepared
- Phase 5: Skips if compose file + secrets + image already prepared
- Post-setup: Skips existing Dokploy services/domains/templates

## Files on Server

| Path | Purpose |
|------|---------|
| `/etc/dokploy/` | Dokploy config |
| `/etc/dokploy/traefik/traefik.yml` | Traefik config (patched by Phase 3) |
| `/etc/dokploy/coder/docker-compose.yml` | Generated Coder compose |
| `/etc/dokploy/coder/.env.generated` | Saved credentials (mode 600) |
| `/etc/dokploy/vk-remote/docker-compose.yml` | Generated VK Remote compose |
| `/etc/dokploy/vk-remote/.env.generated` | Saved secrets (mode 600) |
| `/etc/dokploy/vk-remote/repo/` | VK Remote git clone |

## Troubleshooting

- **Coder SSL not working**: Check `traefik.http.routers.coder.service=coder` label exists in compose
- **VK Remote deploy fails (pull access denied)**: Compose needs `build:` directive alongside `image:`
- **Secrets mismatch after redeploy**: `.env.generated` must be restored before compose regeneration
- **grep crashes script**: Append `|| true` to pipelines that may return empty (ERR trap issue)
- **Coder template upload fails**: API expects plain tar (not gzipped), use `gunzip -c` first
