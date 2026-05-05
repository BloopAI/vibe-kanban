# Coder Workspace Image — SPEC

**Image**: `ghcr.io/holagence/holicode-cde:<tag>`
**Base**: `ubuntu:24.04`
**Architecture**: `linux/arm64` (Dokploy host is ARM64)
**Current tag**: `2.1.0` (see `../.version.env`)

---

## What's in the Image

| Component | Version / Source | Notes |
|-----------|-----------------|-------|
| Ubuntu | 24.04 LTS | Base |
| Node.js | 24.15.0 | via nodejs.org tarball (Node 22's npm 10.9.7 has broken arm64 bundling) |
| npm | 11.x (bundled) | ships with Node 24 — no separate upgrade needed |
| pnpm | 10.33.1 | global |
| GitHub CLI (`gh`) | latest stable | via official apt repo |
| opencode-ai | latest | `npm install -g opencode-ai` |
| Codex CLI | latest | `npm install -g @openai/codex` |
| Gemini CLI | latest | `npm install -g @google/gemini-cli` |
| wrangler | latest | Cloudflare Workers/Pages/R2/D1 CLI — `npm install -g wrangler` |
| Coder CLI | latest | `coder.com/install.sh --method standalone` |
| Claude Code | latest | native binary installer (`~/.local/bin/claude`) |
| 1Password CLI (`op`) | latest (apt) | via official 1Password apt repo; required for service-account token ops |
| Go toolchain | 1.26.2 | official tarball from go.dev/dl to `/usr/local/go`; `/usr/local/go/bin` on PATH |
| Tailscale | latest (apt) | mesh networking; installed via `tailscale.com/install.sh` (sets up apt repo) |
| cloudflared | latest | Cloudflare Tunnels client; deb from GitHub releases |
| vibe-kanban | v0.1.36 (npm) | `npm install -g vibe-kanban@0.1.36` |
| postgresql-client | latest (apt) | `psql`, `pg_dump`, `pg_restore` etc. |
| Supabase CLI | 2.90.0 | standalone binary from GitHub releases; arch-neutral via `dpkg --print-architecture` |
| migra | latest (pip) | PostgreSQL schema diff tool (`migra[pg]`); installed as coder user via `pip3 --user` |
| Hugging Face CLI (`hf`) | latest (pip) | `huggingface_hub[cli]` installed as coder user via `pip3 --user` |
| bun | latest | fast JS runtime/bundler; per-user install to `~/.bun/bin` |
| deno | latest | alternative JS/TS runtime; per-user install to `~/.deno/bin` |
| `github-app-gh-auth` | bundled script | `/usr/local/bin/github-app-gh-auth` — mints GitHub App installation token → `gh auth login`. Reads `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY_B64` from env. |
| System tools | `curl wget git jq socat ripgrep fd-find unzip less lsof tini iputils-ping` | standard toolbox |
| Build deps (transient) | `pkg-config libssl-dev libclang-dev clang libsqlite3-dev zip` | kept for source builds; Rust toolchain removed post-build |

**User**: `coder` (uid 1000, `NOPASSWD` sudo)
**Entrypoint**: `tini -g --` (proper PID 1 / zombie reaping)
**Exposed ports**: 3000 (vibe-kanban), 4096 (opencode), 5173 (Vite dev server)

---

## Vibe Kanban — Two Build Paths

Controlled by `VK_SOURCE` in `.version.env`:

### `VK_SOURCE=source` (default, ~5–8 min)

Full build from source. Required when:
- A custom `VITE_VK_SHARED_API_BASE` must be baked into the frontend
- Using a fork or custom branch
- No prebuilt tarball exists for that version

**Build sequence in Dockerfile:**
1. Install Rust toolchain inline (`rustup` + `nightly-2025-12-04`)
2. `git clone --depth 1 --branch <VK_GIT_REF> <VK_REPO>`
3. `pnpm install --frozen-lockfile`
4. Frontend: `VITE_VK_SHARED_API_BASE=<VK_API_BASE> npm run build` (inside `frontend/`)
5. Rust: `cargo build --release` for `server`, `vibe-kanban-mcp`, `vibe-kanban-review`
6. Package assembly: zip each binary → place in `npx-cli/dist/linux-arm64/`
7. `pnpm pack` → `sudo npm install -g <tarball>`
8. Cleanup: `rm -rf /tmp/vibe-kanban /root/.cargo /root/.rustup`

**Why cleanup matters**: The Rust toolchain (~1.5 GB) and build artefacts are deleted after install to keep the image lean. Only the npm package remains under `/usr/local/lib/node_modules/vibe-kanban/`.

### `VK_SOURCE=prebuilt` (~30 sec)

Downloads a pre-built tarball from a GitHub Release. Fast path for iterating on the image without rebuilding vibe-kanban.

**Prerequisite**: Publish a release first via `.github/workflows/prebuild-vibe-kanban.yml`.

```bash
gh workflow run prebuild-vibe-kanban.yml \
  --repo holagence/holicode \
  -f vk_git_ref=v0.1.18
```

The release tag format is `vk-prebuilt-<version>` (e.g. `vk-prebuilt-0.1.18`).

The Dockerfile downloads with:
```bash
GITHUB_TOKEN="${GH_TOKEN}" gh release download "vk-prebuilt-${VK_VERSION}" \
  --repo "${GITHUB_REPO}" \
  --pattern "vibe-kanban-${VK_VERSION}.tgz" \
  --dir /tmp
sudo npm install -g "/tmp/vibe-kanban-${VK_VERSION}.tgz"
```

`GH_TOKEN` must be passed as a build arg (a PAT with `repo` scope, stored as a repo secret). This is separate from the automatic `GITHUB_TOKEN` — needed only for `VK_SOURCE=prebuilt` to download release assets from a private repo. Source builds don't need it.

> **Note**: The prebuilt tarball must have been built with `VITE_VK_SHARED_API_BASE=https://vk-remote.holagence.com` already baked in. If the tarball was built without this variable the OAuth redirect will fall back to `localhost:3002`.

---

## Binary Pre-Extraction (Critical Detail)

vibe-kanban ships its binaries as zip archives inside the npm package:
```
/usr/local/lib/node_modules/vibe-kanban/dist/linux-arm64/
  vibe-kanban.zip
  vibe-kanban-mcp.zip
  vibe-kanban-review.zip
```

The npm `cli.js` would normally extract these on first run — but that requires write access to `/usr/local/lib/node_modules/` which the `coder` user doesn't have.

**Fix**: The Dockerfile pre-extracts and `chmod +x`s all three binaries as root at build time:

```dockerfile
VK_DIST="/usr/local/lib/node_modules/vibe-kanban/dist/linux-arm64"
sudo unzip -o "${VK_DIST}/vibe-kanban.zip"        -d "${VK_DIST}"
sudo unzip -o "${VK_DIST}/vibe-kanban-mcp.zip"    -d "${VK_DIST}"
sudo unzip -o "${VK_DIST}/vibe-kanban-review.zip" -d "${VK_DIST}"
sudo chmod +x "${VK_DIST}/vibe-kanban" "${VK_DIST}/vibe-kanban-mcp" "${VK_DIST}/vibe-kanban-review"
```

Without this step the workspace startup script fails with:
```
Extraction failed: ENOENT: no such file or directory, chmod '.../vibe-kanban'
```

---

## Claude Code

Installed via the native binary installer as the `coder` user:

```dockerfile
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="${HOME}/.local/bin:${PATH}"
```

The installer places the binary at `~/.local/bin/claude` (not `~/.claude/bin` as older docs suggest). The `PATH` is set accordingly.

---

## Version Management

All version pins live in one place: `scripts/infra/.version.env`

```bash
VK_SOURCE=npm
VK_GIT_REF=v0.1.36
VK_API_BASE=https://vk-remote.holagence.com
CODER_IMAGE_TAG=2.1.0
```

`CODER_IMAGE_TAG` is independent of `VK_GIT_REF` — bump it whenever the image changes for any reason (new tool, Dockerfile fix, etc.). There is no hard coupling between the two version numbers.

---

## Build Trigger & GitHub Actions

**Workflow**: `.github/workflows/build-coder-image.yml`

**Automatic trigger**: Push to `main` modifying `scripts/infra/coder-image/Dockerfile` or `scripts/infra/.version.env`.

**Manual trigger**:
```bash
gh workflow run build-coder-image.yml \
  --repo holagence/holicode \
  -f vk_source=npm \
  -f vk_git_ref=v0.1.21 \
  -f vk_api_base=https://vk-remote.holagence.com \
  -f image_tag=1.5
```

**Runner**: `[self-hosted, linux, arm64]` — the Dokploy host itself. Native ARM64 build, no QEMU emulation.

**Registry**: `ghcr.io/holagence/holicode-cde` (pushed via `GITHUB_TOKEN`, no extra secrets needed).

---

## Coder Template

**Location**: `scripts/infra/coder-template/main.tf`

**Push command**:
```bash
cd scripts/infra/coder-template
terraform init   # generates .terraform.lock.hcl (commit this once)
coder templates push holicode-agentic \
  --name "1.7.1" \
  --message "describe changes" \
  --directory .
```

**Key template settings**:

| Setting | Value | Notes |
|---------|-------|-------|
| `docker_image.keep_locally` | `true` | Prevents Terraform destroying images still used by other workspaces |
| `jetbrains_enabled` | bool, mutable | Toggle JetBrains Gateway without workspace recreation |
| `cpu_cores` / `memory_gb` | number, mutable | Adjustable without recreation |
| `project_repo` | string, mutable | Repo to clone on start |

**`keep_locally = true` is required**. Without it, updating the image tag in the template causes Terraform to try destroying the old image, which fails if any other workspace container is still using it.

---

## Workspace Startup Scripts

Three `coder_script` resources run in the container at start:

1. **`clone_repo`** (`start_blocks_login = true`) — clones `$PROJECT_REPO` using SSH TOFU logic; blocks login until done
2. **`vibe_kanban`** (`start_blocks_login = false`) — waits for clone, then `nohup vibe-kanban > /tmp/vibe-kanban.log &`
3. **`opencode`** (`start_blocks_login = false`) — `nohup opencode serve --port 4096 ...`

vibe-kanban needs `VK_SHARED_API_BASE` as a **runtime** env var for the backend process. The frontend API base is baked in at build time; the backend uses the runtime var for server-side OAuth callbacks.

---

## Troubleshooting

### vibe-kanban starts as "local dev" mode
```
Starting vibe-kanban v0.1.18 (local dev)...
```
This is normal — it just means cli.js detected the package has a `dist/` directory (npm-installed path). It doesn't mean the wrong API base is in use. Verify the baked-in URL:
```bash
strings /usr/local/lib/node_modules/vibe-kanban/dist/linux-arm64/vibe-kanban | grep holagence
```

### GitHub OAuth redirects to `localhost:3002`
The frontend was built without `VITE_VK_SHARED_API_BASE`. Rebuild the image with `VK_SOURCE=source` and `VK_API_BASE` set correctly. If using a prebuilt tarball, ensure it was also built with the correct env var (see `prebuild-vibe-kanban.yml`).

### Workspace fails to start — Docker image conflict
```
Error: Unable to remove Docker image ... container is using its referenced image
```
Terraform is trying to destroy the old image tag because another workspace is using it. Fix: ensure `keep_locally = true` is set in the template's `docker_image` resource, then push a new template version. If the error persists from state built without `keep_locally`, remove the stale state entry:
```bash
coder state pull <workspace-name> -o /tmp/ws-state.json
# edit ws-state.json to remove docker_image.workspace resource
coder state push <workspace-name> /tmp/ws-state.json
```

### Binary extraction fails at runtime
```
Extraction failed: ENOENT: no such file or directory, chmod '.../vibe-kanban'
```
The zips were not pre-extracted during image build. Workaround (in container):
```bash
VK_DIST=/usr/local/lib/node_modules/vibe-kanban/dist/linux-arm64
sudo unzip -o $VK_DIST/vibe-kanban.zip -d $VK_DIST
sudo unzip -o $VK_DIST/vibe-kanban-mcp.zip -d $VK_DIST
sudo unzip -o $VK_DIST/vibe-kanban-review.zip -d $VK_DIST
```
The root fix is already in the Dockerfile for new image builds.

### `claude` not found in PATH
The native installer puts the binary at `~/.local/bin/claude`. Ensure `~/.local/bin` is in `PATH`:
```bash
export PATH="$HOME/.local/bin:$PATH"
```
Already set via `ENV PATH` in the Dockerfile for new images.

### ARM runner not available
```bash
ssh root@<dokploy-host> "sudo /opt/actions-runner/svc.sh status"
ssh root@<dokploy-host> "sudo /opt/actions-runner/svc.sh restart"
```
