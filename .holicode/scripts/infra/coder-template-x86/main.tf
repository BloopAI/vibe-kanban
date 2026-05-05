terraform {
  required_providers {
    coder = {
      source = "coder/coder"
    }
    docker = {
      source = "kreuzwerker/docker"
    }
  }
}

data "coder_workspace" "me" {}
data "coder_workspace_owner" "me" {}

# --- Parameters (user selects at workspace creation) ---

data "coder_parameter" "project_repos" {
  name         = "project_repos"
  display_name = "Project Repositories"
  description  = "Comma-separated repo URLs to clone on startup (e.g. git@github.com:org/repo1.git,git@github.com:org/repo2.git). Each repo is cloned into ~/repos/<repo-name>. Leave empty to skip — you can always clone manually later."
  type         = "string"
  default      = var.default_project_repos
  mutable      = true
}

data "coder_parameter" "cpu_cores" {
  name         = "cpu_cores"
  display_name = "CPU Cores"
  type         = "number"
  default      = tostring(var.cpu_default)
  mutable      = true
  validation {
    min = 1
    max = var.cpu_max
  }
}

data "coder_parameter" "memory_gb" {
  name         = "memory_gb"
  display_name = "Memory (GB)"
  type         = "number"
  default      = tostring(var.memory_default)
  mutable      = true
  validation {
    min = var.memory_min
    max = var.memory_max
  }
}

data "coder_parameter" "jetbrains_enabled" {
  name         = "jetbrains_enabled"
  display_name = "Enable JetBrains Gateway"
  description  = "Show JetBrains Gateway IDE option. Disable to reduce startup overhead."
  type         = "bool"
  default      = "false"
  mutable      = true
}

data "coder_parameter" "vk_preview" {
  name         = "vk_preview"
  display_name = "VK Preview Channel"
  description  = "Install latest VK release from GitHub on startup (overrides image version). Requires gh auth."
  type         = "bool"
  default      = "false"
  mutable      = true
}

data "coder_parameter" "vk_version" {
  name         = "vk_version"
  display_name = "VK Version Override"
  description  = "Pin a specific VK version (e.g. 0.1.40). Only used when VK Preview Channel is enabled. Leave empty to use the latest release."
  type         = "string"
  default      = ""
  mutable      = true
}

data "coder_parameter" "sysbox_enabled" {
  name         = "sysbox_enabled"
  display_name = "Inner Docker (Sysbox)"
  description  = "Run workspace with an isolated inner Docker daemon via Sysbox. Each workspace gets its own dockerd -- containers are invisible to other workspaces and the host. Disable only if the host does not have sysbox-runc installed, in which case Docker is unavailable inside the workspace. Inner containers share the workspace memory budget -- select 8 GB+ when running Docker workloads inside. Changing this rebuilds the container (home volume is preserved)."
  type         = "bool"
  default      = "false"
  mutable      = true # Changing triggers container rebuild via Terraform ForceNew; home volume is preserved
}

data "coder_parameter" "force_rebuild" {
  name         = "force_rebuild"
  display_name = "Force Rebuild"
  description  = "Force workspace rebuild to pick up template changes. Toggle this to trigger rebuild."
  type         = "bool"
  default      = "false"
  mutable      = true
}

data "coder_parameter" "enable_forgejo" {
  name         = "enable_forgejo"
  display_name = "Enable Forgejo (Git UI)"
  description  = "Start the Forgejo sidecar container and show the Forgejo app button. Disable to reduce memory footprint when Git browsing is not needed."
  type         = "bool"
  default      = "true"
  mutable      = true
}

data "coder_parameter" "enable_opencode" {
  name         = "enable_opencode"
  display_name = "Enable OpenCode"
  description  = "Start the OpenCode AI coding agent and show its app button."
  type         = "bool"
  default      = "true"
  mutable      = true
}

# --- Persistent volume (survives stop/start) ---

resource "docker_volume" "home" {
  name = "coder-${data.coder_workspace_owner.me.name}-${lower(data.coder_workspace.me.name)}-home"
}

# --- Shared workspace network (inter-container communication) ---

resource "docker_network" "workspace" {
  name        = "coder-${data.coder_workspace.me.id}-net"
  ipv6 = var.use_ipv6_network == "true"
}

# --- Forgejo data volume (persistent across stop/start/rebuild) ---

resource "docker_volume" "forgejo_data" {
  name = "coder-${data.coder_workspace.me.id}-forgejo"
  lifecycle {
    ignore_changes = all
  }
}

# --- Inner Docker data volume (Sysbox mode only) ---
# Persists /var/lib/docker inside the workspace across stop/start and template updates.
# Without this, every workspace start requires re-pulling all inner images (images live
# in the container writable layer which is destroyed on every stop/terraform-apply).
# Named per-owner+workspace (not per-workspace-id) so it survives workspace rebuilds
# that change the workspace ID — same as the home volume naming convention.
# lifecycle.ignore_changes = all: prevents Terraform from destroying it on template updates.

resource "docker_volume" "inner_docker" {
  count = data.coder_parameter.sysbox_enabled.value == "true" ? 1 : 0
  name  = "coder-${data.coder_workspace_owner.me.name}-${lower(data.coder_workspace.me.name)}-docker"
  lifecycle {
    ignore_changes = all
  }
}

# --- Workspace container ---

resource "docker_image" "workspace" {
  name         = "${var.image_name}:${var.image_tag}"
  keep_locally = true
  # Image tag is set per deployment in terraform.tfvars
  # New in 2.0.0: Sysbox opt-in (full docker-ce + containerd.io), dokploy-network removed (HOL-467)
  # New in 1.9: postgresql-client, Supabase CLI 2.84.2, migra[pg] (HOL-459)
  # New in 1.8: Docker CLI + compose plugin (DooD — socket already mounted; group_add gives coder socket access)
  # New in 1.7: VK 0.1.36 (latest npm), stale cache cleanup in startup script
  # New in 1.5/1.6: Node 24, Codex/Gemini/Coder/Claude CLIs, VK R2 pre-download
}

resource "docker_container" "workspace" {
  count = data.coder_workspace.me.start_count
  image = docker_image.workspace.image_id
  name  = "coder-${data.coder_workspace_owner.me.name}-${lower(data.coder_workspace.me.name)}"

  hostname = lower(data.coder_workspace.me.name)
  dns      = ["1.1.1.1", "8.8.8.8"]

  # Sysbox runtime — each workspace gets its own isolated dockerd
  # When empty string or null, Docker uses the default runtime (runc)
  runtime = data.coder_parameter.sysbox_enabled.value == "true" ? "sysbox-runc" : null

  # Resource limits — with Sysbox, inner containers share this budget
  memory = data.coder_parameter.memory_gb.value * 1024

  # Coder agent bootstrap
  # CODER_URL override: when coder_internal_url is set (e.g. Cloudflare blocks the VPS
  # outbound IP), the agent and binary download use the internal network path instead.
  env = concat(
    [
      "CODER_AGENT_TOKEN=${coder_agent.main.token}",
      "PROJECT_REPOS=${data.coder_parameter.project_repos.value}",
      "GITHUB_APP_ID=${var.github_app_id}",
      "GITHUB_APP_INSTALLATION_ID=${var.github_app_installation_id}",
      "GITHUB_APP_PRIVATE_KEY_B64=${var.github_app_private_key_b64}",
    ],
    var.coder_internal_url != "" ? ["CODER_URL=${var.coder_internal_url}"] : []
  )

  # Patch init_script to download agent binary via internal network when coder_internal_url
  # is set. The init_script embeds the binary download URL as the Coder access URL — replace
  # it with the internal URL so Cloudflare (or any external block) is bypassed entirely.
  entrypoint = var.coder_internal_url != "" ? [
    "sh", "-c",
    replace(coder_agent.main.init_script, var.coder_access_url, var.coder_internal_url)
  ] : ["sh", "-c", coder_agent.main.init_script]

  # Persistent home directory
  volumes {
    container_path = "/home/coder"
    volume_name    = docker_volume.home.name
  }

  # Allow reaching host services if needed
  host {
    host = "host.docker.internal"
    ip   = "host-gateway"
  }

  # Inner Docker data root — Sysbox mode only.
  # Mounts the persistent volume at /var/lib/docker so inner images and named volumes
  # survive workspace stop/start and template updates. The container writable layer is
  # ephemeral; without this mount every start requires re-pulling all inner images.
  # Sysbox handles UID remapping on the volume transparently.
  dynamic "volumes" {
    for_each = data.coder_parameter.sysbox_enabled.value == "true" ? [1] : []
    content {
      container_path = "/var/lib/docker"
      volume_name    = docker_volume.inner_docker[0].name
    }
  }

  # Docker socket intentionally NOT mounted.
  # Sysbox mode: inner dockerd provides /var/run/docker.sock inside the workspace.
  # No-Sysbox mode: Docker is unavailable inside the workspace (no DooD — mounting the host
  #   socket would expose all host containers to the workspace, which is a security boundary
  #   violation). Use Sysbox if Docker-in-Docker is needed.

  # dokploy-network removed — live-verified (HOL-467): coder_app routing goes through
  # Coder agent WireGuard tunnel, not Traefik→container. Workspace has zero Traefik labels.
  # Only Coder server needs dokploy-network. See .holicode/analysis/sysbox/networking.md

  # Internal Coder network — only when coder_internal_url is set.
  # Connects workspace to the Coder server container directly (alias "coder") so the
  # agent reaches http://coder:7080 without going through Cloudflare or external routing.
  dynamic "networks_advanced" {
    for_each = var.coder_internal_url != "" ? [1] : []
    content {
      name = "coder-access-net"
    }
  }

  # Shared network for sidecar containers (e.g., Forgejo)
  networks_advanced {
    name    = docker_network.workspace.name
    aliases = ["workspace"]
  }
}

# --- Forgejo sidecar (Git web UI for branch/commit browsing) ---

resource "docker_image" "forgejo" {
  # Pin to exact release — floating :9 can pull unexpected updates on rebuild.
  # To update: bump tag and push a new template version.
  # Releases: https://codeberg.org/forgejo/forgejo/releases
  name         = "codeberg.org/forgejo/forgejo:9.0.3"
  keep_locally = true
}

resource "docker_container" "forgejo" {
  count   = data.coder_parameter.enable_forgejo.value == "true" ? data.coder_workspace.me.start_count : 0
  image   = docker_image.forgejo.image_id
  name    = "coder-${data.coder_workspace_owner.me.name}-${lower(data.coder_workspace.me.name)}-forgejo"
  restart = "unless-stopped"

  env = [
    "USER_UID=1001",
    "USER_GID=1001",
    "FORGEJO__server__HTTP_PORT=3001",
    "FORGEJO__server__ROOT_URL=http://localhost:3001",
    "FORGEJO__server__SSH_DISABLE=true",
    "FORGEJO__repository__MAX_CREATION_LIMIT=0",
    "FORGEJO__service__DISABLE_REGISTRATION=true",
    "FORGEJO__service__REQUIRE_SIGNIN_VIEW=false",
    "FORGEJO__service__DEFAULT_ALLOW_CREATE_ORGANIZATION=false",
    "FORGEJO__database__DB_TYPE=sqlite3",
    "FORGEJO__admin__DISABLE_REGULAR_ORG_CREATION=true",
    "FORGEJO__repository__ROOT=/home/coder/.forgejo-mirrors",
    "FORGEJO__security__INSTALL_LOCK=true",
    "FORGEJO__security__SECRET_KEY=holicode-forgejo-secret",
    # bcrypt is faster than pbkdf2$320000 for API auth (local single-user instance)
    "FORGEJO__security__PASSWORD_HASH_ALGO=bcrypt",
    # Allow mirroring from file:// paths (workspace home volume) and local network addresses.
    # IMPORT_LOCAL_PATHS is under [security] (not [repository]) — prevents all-users block on local paths.
    # ALLOW_LOCALNETWORKS covers local IP ranges. Both are required for file:// mirrors.
    "FORGEJO__security__IMPORT_LOCAL_PATHS=true",
    "FORGEJO__migrations__ALLOW_LOCALNETWORKS=true",
    # Explicit DB path — prevents drift if app.ini is regenerated (default path differs from template path)
    "FORGEJO__database__PATH=/data/gitea/gitea.db",
    # Trust all directories — mirrors are owned by coder (1001) not git (1001 remapped)
    "GIT_CONFIG_COUNT=1",
    "GIT_CONFIG_KEY_0=safe.directory",
    "GIT_CONFIG_VALUE_0=*",
    # Note: GITEA_ADMIN_* env vars are NOT processed by Forgejo 9.0.3's s6 entrypoint.
    # Admin user is bootstrapped via Docker socket exec in coder_script.forgejo_init instead.
  ]

  networks_advanced {
    name    = docker_network.workspace.name
    aliases = ["forgejo", "git"]
  }

  healthcheck {
    test         = ["CMD", "curl", "-sf", "http://localhost:3001/api/v1/version"]
    interval     = "15s"
    timeout      = "5s"
    retries      = 5
    start_period = "30s"
  }

  # Forgejo persistent data (SQLite DB, config)
  volumes {
    container_path = "/data"
    volume_name    = docker_volume.forgejo_data.name
  }

  # Shared home volume — Forgejo reads bare mirrors from .forgejo-mirrors/
  # Not read-only: Forgejo may need to write temp/lock files during indexing
  volumes {
    container_path = "/home/coder"
    volume_name    = docker_volume.home.name
  }

  depends_on = [docker_network.workspace]

  lifecycle {
    # When the workspace network is replaced (e.g. ipv6 toggle), forgejo must be
    # replaced too -- otherwise it stays attached to the old network, blocking its
    # deletion and causing a 30s timeout error.
    replace_triggered_by = [docker_network.workspace]
  }
}

# --- Coder agent (runs inside the container) ---

resource "coder_agent" "main" {
  arch = var.agent_arch
  os   = "linux"
  dir  = "/home/coder"

  # No startup_script here — using coder_script resources instead

  metadata {
    display_name = "CPU Usage"
    key          = "cpu"
    script       = "top -bn1 | head -1 | awk '{print $NF}' | sed 's/,/ /'"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "Memory Usage"
    key          = "mem"
    script       = "free -h | awk '/^Mem:/ {print $3 \"/\" $2}'"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "Disk Usage"
    key          = "disk"
    script       = "df -h /home/coder | awk 'NR==2 {print $3 \"/\" $2}'"
    interval     = 60
    timeout      = 1
  }

  metadata {
    display_name = "Image"
    key          = "image_version"
    script       = "cat /etc/coder-image-version 2>/dev/null || echo unknown"
    interval     = 3600
    timeout      = 1
  }

  metadata {
    display_name = "Docker"
    key          = "docker_containers"
    script       = "docker ps -q 2>/dev/null | wc -l | tr -d ' ' | xargs -I{} echo '{} running'"
    interval     = 15
    timeout      = 2
  }

  metadata {
    display_name = "VK"
    key          = "vk_version"
    # Follow the vibe-kanban symlink → package dir → package.json (works regardless of npm prefix)
    # Short interval to catch vk_preview upgrades after workspace start
    script       = "jq -r .version /usr/local/lib/node_modules/vibe-kanban/package.json 2>/dev/null || echo unknown"
    interval     = 300
    timeout      = 2
  }

  metadata {
    display_name = "OpenCode"
    key          = "opencode_version"
    script       = "jq -r .version /usr/local/lib/node_modules/opencode-ai/package.json 2>/dev/null || echo unknown"
    interval     = 3600
    timeout      = 1
  }

  metadata {
    display_name = "Claude"
    key          = "version_claude"
    # Native binary install — version is encoded in the path (e.g. .../versions/2.1.90)
    script       = "basename \"$(readlink -f /home/coder/.local/bin/claude 2>/dev/null)\" 2>/dev/null || echo unknown"
    interval     = 3600
    timeout      = 2
  }
}

# # See https://registry.coder.com/modules/code-server
# module "code-server" {
#   count  = data.coder_workspace.me.start_count
#   source = "registry.coder.com/modules/code-server/coder"

#   # This ensures that the latest version of the module gets downloaded, you can also pin the module version to prevent breaking changes in production.
#   version = ">= 1.0.0"

#   agent_id = coder_agent.main.id
#   order    = 1
# }

# See https://registry.coder.com/modules/jetbrains-gateway
module "jetbrains_gateway" {
  count  = data.coder_parameter.jetbrains_enabled.value == "true" ? data.coder_workspace.me.start_count : 0
  source = "registry.coder.com/modules/jetbrains-gateway/coder"

  # JetBrains IDEs to make available for the user to select
  jetbrains_ides = ["IU", "PS", "WS", "PY", "CL", "GO", "RM", "RD", "RR"]
  default        = "PY"

  # Default folder to open when starting a JetBrains IDE
  folder = "/home/coder"

  # This ensures that the latest version of the module gets downloaded, you can also pin the module version to prevent breaking changes in production.
  version = ">= 1.0.0"

  agent_id   = coder_agent.main.id
  agent_name = "main"
  order      = 2
}

# --- Startup scripts (separate lifecycle per service) ---

# 0. GitHub CLI auth setup — waterfall strategy (Coder bridge → device flow)
resource "coder_script" "github_auth" {
  agent_id           = coder_agent.main.id
  display_name       = "GitHub Auth"
  icon               = "/emojis/1f4c4.png"
  run_on_start       = true
  start_blocks_login = false  # Non-blocking; user can work while auth happens
  script             = <<-EOT
    #!/bin/bash
    set -e

    echo "Setting up GitHub CLI authentication..."

    if gh auth status >/dev/null 2>&1; then
      echo "GitHub CLI already authenticated"
      exit 0
    fi

    # Primary: GitHub App auth (image-bundled script, uses GITHUB_APP_* env vars)
    if [ -x /usr/local/bin/github-app-gh-auth ]; then
      echo "Trying GitHub App authentication..."
      if /usr/local/bin/github-app-gh-auth; then
        echo "GitHub CLI authenticated via GitHub App"
        exit 0
      fi
      echo "GitHub App auth did not succeed — trying fallback strategies..."
    fi

    # Fallback: old multi-strategy script (Coder external auth, GH_TOKEN, device flow)
    FALLBACK="/home/coder/holicode/scripts/infra/gh-auth-app/gh-auth-setup.sh"
    if [ -f "$FALLBACK" ]; then
      bash "$FALLBACK" || true
    else
      echo "Manual auth required: run 'gh auth login' in the workspace"
    fi

    if gh auth status >/dev/null 2>&1; then
      echo "GitHub CLI authenticated"
    else
      echo "GitHub CLI auth not completed (optional — will retry on next command)"
    fi
  EOT
}

# 1. Workspace env — bake Terraform-known values into /etc/profile.d so all sessions see them
resource "coder_script" "workspace_env" {
  agent_id           = coder_agent.main.id
  display_name       = "Workspace Env"
  icon               = "/emojis/1f4c4.png"
  run_on_start       = true
  start_blocks_login = true
  script             = <<-EOT
    #!/bin/bash
    sudo bash -c 'cat > /etc/profile.d/coder-workspace.sh << '\''EOF'\''
export CODER_WORKSPACE_OWNER_NAME=${data.coder_workspace_owner.me.name}

# Supabase local dev defaults — referenced via env() in supabase/config.toml.
# These disable heavyweight optional services for all projects in this workspace.
# Override per-project by setting the env var before running supabase start.
export SUPABASE_LOCAL_ANALYTICS=false
export SUPABASE_LOCAL_STUDIO=false
EOF'
    echo "Workspace env set (owner: ${data.coder_workspace_owner.me.name})"
  EOT
}

# 2. Clone repos — supports comma-separated list, each into ~/repos/<name>
resource "coder_script" "clone_repos" {
  agent_id           = coder_agent.main.id
  display_name       = "Clone Repositories"
  icon               = "/icon/git.svg"
  run_on_start       = true
  start_blocks_login = true # block login until clones complete
  script             = <<-EOT
    #!/bin/bash
    set -e

    if [ -z "$PROJECT_REPOS" ]; then
      echo "No repos specified — skipping clone. Clone manually: git clone <url> ~/repos/<name>"
      exit 0
    fi

    REPOS_BASE="/home/coder/repos"
    mkdir -p "$REPOS_BASE"

    SSH_DIR="/home/coder/.ssh"
    KNOWN_HOSTS="$SSH_DIR/known_hosts"
    mkdir -p "$SSH_DIR"
    chmod 700 "$SSH_DIR"
    touch "$KNOWN_HOSTS"
    chmod 600 "$KNOWN_HOSTS"

    # Split comma-separated URLs
    IFS=',' read -ra REPO_URLS <<< "$PROJECT_REPOS"

    for REPO_URL in "$${REPO_URLS[@]}"; do
      REPO_URL="$(echo "$REPO_URL" | tr -d ' ')"
      [ -z "$REPO_URL" ] && continue

      # Derive directory name from repo URL (last path component, strip .git)
      REPO_NAME="$(basename "$REPO_URL" .git)"
      REPO_DIR="$REPOS_BASE/$REPO_NAME"

      if [ -d "$REPO_DIR/.git" ]; then
        echo "$REPO_NAME: already cloned, skipping."
        continue
      fi

      # Clean partial clone if dir exists without .git
      [ -d "$REPO_DIR" ] && rm -rf "$REPO_DIR"

      # TOFU host key
      HOST="$(printf '%s\n' "$REPO_URL" | sed -E 's#^[a-z]+://##; s#^[^@]+@##; s#/.*$##; s#:.*$##')"
      ssh-keygen -R "$HOST" >/dev/null 2>&1 || true
      ssh-keyscan -H "$HOST" >> "$KNOWN_HOSTS" 2>/dev/null

      echo "Cloning $REPO_URL -> $REPO_DIR ..."
      git clone "$REPO_URL" "$REPO_DIR"
      echo "$REPO_NAME: done."
    done

    echo ""
    echo "Repos available in $REPOS_BASE:"
    ls "$REPOS_BASE"
  EOT
}

# 2. Vibe Kanban — long-running, uses exec to replace shell cleanly
resource "coder_script" "vibe_kanban" {
  agent_id           = coder_agent.main.id
  display_name       = "Vibe Kanban"
  icon               = "/emojis/1f4cb.png"
  run_on_start       = true
  start_blocks_login = false # let user connect while VK starts
  script             = <<-EOT
    #!/bin/bash
    set -e

    # VK runs from $HOME — it uses its own DB, not the repo directory.
    # No dependency on any cloned repo.

    # Clean up stale VK installs from persistent home volume (existing workspaces).
    # 1. Old npm-installed VK under ~/.local/ (pre-1.5 images installed globally as coder user)
    if [ -d "$HOME/.local/lib/node_modules/vibe-kanban" ]; then
      echo "Removing stale ~/.local/lib/node_modules/vibe-kanban"
      rm -rf "$HOME/.local/lib/node_modules/vibe-kanban"
    fi
    for f in "$HOME/.local/bin/vk" "$HOME/.local/bin/vibe-kanban" "$HOME/.local/bin/vibe-kanban-mcp" "$HOME/.local/bin/vibe-kanban-review"; do
      [ -e "$f" ] && echo "Removing stale $f" && rm -f "$f"
    done
    # 2. Stale R2 binary cache under ~/.vibe-kanban/bin/ (npm-mode VK caches binary per BINARY_TAG).
    #    Keep only the tag matching the currently installed npm package; remove all others.
    VK_BINARY_TAG=$(node -e "try{console.log(require('/usr/local/lib/node_modules/vibe-kanban/bin/download').BINARY_TAG)}catch(e){}" 2>/dev/null || true)
    if [ -d "$HOME/.vibe-kanban/bin" ] && [ -n "$VK_BINARY_TAG" ]; then
      for d in "$HOME/.vibe-kanban/bin"/*/; do
        tag=$(basename "$d" 2>/dev/null) || continue
        if [ "$tag" != "$VK_BINARY_TAG" ]; then
          echo "Removing stale VK binary cache: $d"
          rm -rf "$d"
        fi
      done
    fi

    cd /home/coder

    # VK preview-channel: install GitHub release tarball if enabled (public repo, no gh auth needed)
    if [ "${data.coder_parameter.vk_preview.value}" = "true" ]; then
      VK_PIN="${data.coder_parameter.vk_version.value}"
      GH_API="https://api.github.com/repos/BloopAI/vibe-kanban/releases"
      if [ -n "$VK_PIN" ]; then
        echo "VK preview mode: looking up release for version $VK_PIN..."
        VK_LATEST=$(curl -sf "$GH_API?per_page=50" \
          | jq -r --arg v "$VK_PIN" '[.[] | select(.tag_name | startswith("v\($v)"))] | .[0].tag_name')
        VK_VERSION="$VK_PIN"
      else
        echo "VK preview mode: fetching latest release from GitHub..."
        VK_LATEST=$(curl -sf "$GH_API?per_page=10" \
          | jq -r '[.[] | select(.tag_name | test("^v[0-9]"))] | .[0].tag_name')
        VK_VERSION=$(echo "$VK_LATEST" | sed 's/^v//' | sed 's/-[0-9]\{14\}$//')
      fi
      if [ -n "$VK_LATEST" ] && [ "$VK_LATEST" != "null" ]; then
        DOWNLOAD_URL=$(curl -sf "$GH_API/tags/$VK_LATEST" \
          | jq -r ".assets[] | select(.name == \"vibe-kanban-$${VK_VERSION}.tgz\") | .browser_download_url")
        curl -fL "$DOWNLOAD_URL" -o "/tmp/vibe-kanban-$${VK_VERSION}.tgz" && \
        sudo npm install -g "/tmp/vibe-kanban-$${VK_VERSION}.tgz" && \
        rm -f "/tmp/vibe-kanban-$${VK_VERSION}.tgz"
        echo "VK preview installed: $VK_VERSION"
      else
        echo "VK preview: could not determine latest release, using image version"
      fi
    fi

    # Idempotency: skip if VK is already listening on port 3000 (agent reconnect re-runs scripts)
    if lsof -ti :3000 > /dev/null 2>&1; then
      echo "Vibe Kanban already running on :3000, skipping"
    else
      VK_SHARED_API_BASE=https://vk-remote.${var.vk_base_domain} \
        VK_SHARED_RELAY_API_BASE=https://vk-relay.${var.vk_base_domain} \
        HOST=0.0.0.0 \
        PORT=3000 \
        nohup vibe-kanban > /tmp/vibe-kanban.log 2>&1 &
      echo "Vibe Kanban started (PID $!), logs at /tmp/vibe-kanban.log"
    fi
  EOT
}

# 3. OpenCode — long-running AI coding agent
resource "coder_script" "opencode" {
  count              = data.coder_parameter.enable_opencode.value == "true" ? 1 : 0
  agent_id           = coder_agent.main.id
  display_name       = "OpenCode"
  icon               = "/emojis/1f916.png"
  run_on_start       = true
  start_blocks_login = false
  script             = <<-EOT
    #!/bin/bash
    set -e

    if lsof -ti :4096 > /dev/null 2>&1; then
      echo "OpenCode already running on :4096, skipping"
    else
      nohup opencode serve --port 4096 --hostname 0.0.0.0 > /tmp/opencode.log 2>&1 &
      echo "OpenCode started (PID $!), logs at /tmp/opencode.log"
    fi
  EOT
}

# 3b. Inner Docker daemon — Sysbox mode only (starts isolated dockerd inside workspace)
resource "coder_script" "inner_dockerd" {
  count              = data.coder_parameter.sysbox_enabled.value == "true" ? 1 : 0
  agent_id           = coder_agent.main.id
  display_name       = "Inner Docker"
  icon               = "/emojis/1f433.png"
  run_on_start       = true
  start_blocks_login = true # Block login until dockerd is ready — inner containers depend on it

  script = <<-EOT
    #!/bin/bash
    set -e

    # Idempotency: skip if dockerd is already running (agent reconnect re-runs scripts)
    if docker info > /dev/null 2>&1; then
      echo "Inner Docker daemon already running, skipping"
      exit 0
    fi

    echo "Starting inner Docker daemon (Sysbox isolation)..."

    # --- Sysbox + runc 1.3.x procfs compatibility: use crun instead of runc ---
    # runc 1.3.0+ uses openat2(RESOLVE_NO_XDEV) when writing sysctls (e.g.
    # net.ipv4.ip_unprivileged_port_start) during container init. Sysbox's virtual /proc
    # is a separate device, causing EXDEV -- every container fails to start.
    # Fix: use crun (C OCI runtime) as the inner Docker default -- crun handles procfs
    # access without the openat2 restriction and is fully OCI-compatible.
    # crun is downloaded once to /usr/local/bin/crun (persists on home volume is NOT needed
    # since /usr/local/bin is in the container writable layer -- re-downloaded each start).
    # Ref: nestybox/sysbox#973
    CRUN_BIN=/usr/local/bin/crun
    CRUN_VER=1.19.1
    if [ ! -x "$CRUN_BIN" ]; then
      echo "  Downloading crun $${CRUN_VER} (Sysbox procfs workaround)..."
      sudo curl -fsSL \
        "https://github.com/containers/crun/releases/download/$${CRUN_VER}/crun-$${CRUN_VER}-linux-amd64" \
        -o "$CRUN_BIN" 2>/dev/null && sudo chmod +x "$CRUN_BIN" \
        && echo "  crun installed" || echo "  WARNING: crun download failed, falling back to runc"
    fi

    sudo mkdir -p /etc/docker
    if [ -x "$CRUN_BIN" ]; then
      sudo python3 -c "
import json
path = '/etc/docker/daemon.json'
try:
  with open(path) as f: d = json.load(f)
except: d = {}
d['default-runtime'] = 'crun'
d.setdefault('runtimes', {})['crun'] = {'path': '$CRUN_BIN'}
with open(path, 'w') as f: json.dump(d, f, indent=2)
print('  daemon.json: default-runtime=crun')
"
    fi

    # --- Registry pull-through cache (any registry) ---
    # rpardini/docker-registry-proxy proxies ALL registries (Docker Hub, ghcr.io, quay.io,
    # etc.) via a single HTTPS CONNECT proxy. Unlike --registry-mirror (Docker Hub only),
    # this is universal. Host setup: run rpardini/docker-registry-proxy on port 3128.
    # Falls back gracefully if the proxy is absent.
    #
    # CA cert is self-bootstrapped: the proxy serves its own cert at :3128/ca.crt.
    # On first run (new workspace or cert missing) it is fetched and persisted to the
    # home volume so subsequent starts skip the fetch.
    PROXY_ENV=""
    PROXY_URL="http://host.docker.internal:3128"
    if curl -sf --max-time 2 "$PROXY_URL" > /dev/null 2>&1; then
      CERT_DIR="/home/coder/.docker-registry-proxy"
      CERT_FILE="$CERT_DIR/ca.crt"

      # Auto-fetch CA cert if not yet cached on home volume
      if [ ! -f "$CERT_FILE" ]; then
        mkdir -p "$CERT_DIR"
        if curl -sf --max-time 5 "$PROXY_URL/ca.crt" -o "$CERT_FILE"; then
          echo "  Registry proxy CA fetched and cached at $CERT_FILE"
        else
          echo "  WARNING: Could not fetch registry proxy CA cert — proxy pulls may fail"
          rm -f "$CERT_FILE"
        fi
      fi

      # Trust the cert (system-wide, affects dockerd and all inner containers)
      if [ -f "$CERT_FILE" ]; then
        sudo cp "$CERT_FILE" /usr/local/share/ca-certificates/registry-proxy.crt
        sudo update-ca-certificates --fresh > /dev/null 2>&1
        echo "  Registry proxy CA trusted"
      fi

      PROXY_ENV="HTTPS_PROXY=$PROXY_URL HTTP_PROXY=$PROXY_URL NO_PROXY=localhost,127.0.0.1"
      echo "  Registry proxy active ($PROXY_URL)"
    fi

    # shellcheck disable=SC2086
    nohup sudo env $PROXY_ENV dockerd > /tmp/inner-dockerd.log 2>&1 < /dev/null &
    disown

    # Wait for dockerd socket to be ready
    for i in $(seq 1 30); do
      if docker info > /dev/null 2>&1; then
        echo "Inner Docker daemon ready ($(docker info --format '{{.ServerVersion}}'))"

        # --- Background Supabase image cache warming ---
        # Pulls known Supabase images through the registry proxy after dockerd is ready.
        # Non-blocking: background subshell, all failures silently ignored.
        # Effect: warms the proxy cache so every OTHER workspace gets instant pulls.
        # The proxy daemon already has HTTPS_PROXY in its environment from startup above,
        # so docker pull commands automatically route through the cache.
        # Update these tags when the Supabase CLI version used by the project changes.
        (
          SUPA_IMAGES="
            public.ecr.aws/supabase/postgres:17.6.1.095
            public.ecr.aws/supabase/kong:2.8.1
            public.ecr.aws/supabase/gotrue:v2.188.1
            public.ecr.aws/supabase/postgrest:v14.7
            public.ecr.aws/supabase/storage-api:v1.44.11
            public.ecr.aws/supabase/edge-runtime:v1.73.0
            public.ecr.aws/supabase/realtime:v2.78.18
            public.ecr.aws/supabase/mailpit:v1.22.3
            public.ecr.aws/supabase/postgres-meta:v0.96.1
          "
          # Excluded (disabled by default, large images -- pull on demand via proxy):
          #   studio           ~500 MB compressed  (SUPABASE_LOCAL_STUDIO=false)
          #   logflare/vector  ~300 MB combined    ([analytics] enabled=false)
          #   imgproxy         ~70 MB              (not needed without storage transforms)
          for img in $SUPA_IMAGES; do
            docker pull "$img" >> /tmp/supabase-prefetch.log 2>&1 || true
          done
          echo "Supabase image pre-fetch done" >> /tmp/supabase-prefetch.log
        ) > /dev/null 2>&1 < /dev/null &
        disown

        exit 0
      fi
      sleep 1
    done

    echo "ERROR: Inner Docker daemon did not start within 30s"
    tail -20 /tmp/inner-dockerd.log
    exit 1
  EOT
}

# 4. Forgejo init — socat proxy, admin bootstrap, repo mirroring, sync loop
resource "coder_script" "forgejo_init" {
  count              = data.coder_parameter.enable_forgejo.value == "true" ? 1 : 0
  agent_id           = coder_agent.main.id
  display_name       = "Forgejo Init"
  icon               = "/icon/git.svg"
  run_on_start       = true
  start_blocks_login = false
  script             = <<-EOT
    #!/bin/bash
    set -e

    FORGEJO_URL="http://forgejo:3001"
    ADMIN_USER="${data.coder_workspace_owner.me.name}"
    ADMIN_PASS="coder-forgejo-local"
    ADMIN_EMAIL="${data.coder_workspace_owner.me.name}@workspace.local"

    # --- Wait for Forgejo API (INSTALL_LOCK=true skips install page, API up immediately) ---
    echo "Waiting for Forgejo API..."
    for i in $(seq 1 60); do
      if curl -sf "$FORGEJO_URL/api/v1/version" > /dev/null 2>&1; then
        echo "Forgejo API ready"
        break
      fi
      if [ "$i" -eq 60 ]; then
        echo "WARNING: Forgejo API not ready after 120s, skipping init"
        exit 0
      fi
      sleep 2
    done

    # --- Start socat proxy: localhost:3001 -> forgejo:3001 ---
    # Required because coder_app needs localhost URLs.
    # Use lsof to check port (pgrep matches grep itself — unreliable).
    # setsid detaches from script process group so proxy survives script exit.
    if ! lsof -i :3001 > /dev/null 2>&1; then
      setsid socat TCP-LISTEN:3001,fork,reuseaddr TCP:forgejo:3001 \
        > /tmp/forgejo-proxy.log 2>&1 &
      disown
      echo "Forgejo proxy started (PID $!)"
    else
      echo "Forgejo proxy already running on :3001"
    fi

    # --- Check admin auth, bootstrap via Docker socket if needed ---
    # Forgejo 9.0.3's s6 entrypoint does NOT process GITEA_ADMIN_* env vars.
    # On first run there is no admin user — create one via Docker socket exec.
    # On subsequent runs (persistent volume) the user already exists — just verify auth.
    FORGEJO_CONTAINER="coder-$ADMIN_USER-${lower(data.coder_workspace.me.name)}-forgejo"

    # Wait for Forgejo DB to be ready — /api/v1/version responds before DB migrations
    # complete. Probe /api/v1/settings/api which requires a working DB layer.
    echo "Waiting for Forgejo DB readiness..."
    for i in $(seq 1 30); do
      if curl -sf "$FORGEJO_URL/api/v1/settings/api" > /dev/null 2>&1; then
        echo "Forgejo DB ready"
        break
      fi
      if [ "$i" -eq 30 ]; then
        echo "WARNING: Forgejo DB not ready after 60s, continuing anyway"
      fi
      sleep 2
    done

    AUTH_STATUS=$(curl -so /dev/null -w '%%{http_code}' \
      -u "$ADMIN_USER:$ADMIN_PASS" \
      "$FORGEJO_URL/api/v1/user" 2>/dev/null)

    # In Sysbox mode the inner dockerd may not be ready yet — wait so the
    # container-visibility check below correctly detects the Sysbox path.
    if [ ! -S /var/run/docker.sock ]; then
      echo "Docker socket not yet available — waiting up to 90s for inner daemon..."
      sock_timeout=90
      while [ ! -S /var/run/docker.sock ] && [ "$sock_timeout" -gt 0 ]; do
        sleep 3
        sock_timeout=$((sock_timeout - 3))
      done
    fi

    if [ "$AUTH_STATUS" != "200" ]; then
      echo "Admin auth failed (HTTP $AUTH_STATUS) — bootstrapping via Docker socket..."

      if [ -S /var/run/docker.sock ]; then
        # Detect whether this socket is the host daemon (DooD) or the inner daemon (Sysbox).
        # In Sysbox mode /var/run/docker.sock belongs to the inner dockerd — the Forgejo
        # sidecar runs on the HOST daemon and is not visible here.
        # Use grep -q (quiet, no output) in a direct if to avoid the grep-c/|| capture bug
        # where "grep -c exits 1 on no match → || echo 0 appends a second 0".
        if ! sudo curl -sf --unix-socket /var/run/docker.sock \
          "http://localhost/v1.41/containers/$FORGEJO_CONTAINER/json" 2>/dev/null \
          | grep -q '"Id"'; then
          echo "Forgejo container not visible via Docker socket (Sysbox mode — inner daemon only)"
          echo "First-run admin bootstrap requires a one-time manual step on the host:"
          echo "  ssh root@host.docker.internal \\"
          echo "    \"docker exec --user git $FORGEJO_CONTAINER forgejo admin user create \\"
          echo "      --admin --username $ADMIN_USER --password $ADMIN_PASS \\"
          echo "      --email $ADMIN_EMAIL --must-change-password=false\""
          echo "Skipping mirror setup until admin is bootstrapped."
          exit 0
        fi

        # Host Docker socket confirmed — proceed with exec bootstrap (DooD mode)
        # Use Docker Engine API over Unix socket (curl is available, no docker CLI needed)
        # Step 1: create exec instance
        EXEC_RESP=$(sudo curl -sf --unix-socket /var/run/docker.sock \
          -X POST "http://localhost/v1.41/containers/$FORGEJO_CONTAINER/exec" \
          -H "Content-Type: application/json" \
          -d "{\"User\":\"git\",\"AttachStdout\":true,\"AttachStderr\":true,\"Cmd\":[\"forgejo\",\"admin\",\"user\",\"create\",\"--admin\",\"--username\",\"$ADMIN_USER\",\"--password\",\"$ADMIN_PASS\",\"--email\",\"$ADMIN_EMAIL\",\"--must-change-password=false\"]}" \
          2>/dev/null)
        EXEC_ID=$(echo "$EXEC_RESP" | grep -o '"Id":"[^"]*"' | cut -d'"' -f4)

        if [ -n "$EXEC_ID" ]; then
          # Step 2: run and capture output (Docker stream has binary framing — strip non-printable)
          EXEC_OUTPUT=$(sudo curl -s --unix-socket /var/run/docker.sock \
            -X POST "http://localhost/v1.41/exec/$EXEC_ID/start" \
            -H "Content-Type: application/json" \
            -d '{"Detach":false}' 2>/dev/null | tr -dc '[:print:]\n')
          echo "Docker exec output: $EXEC_OUTPUT"

          # Step 3: check exit code
          EXEC_INSPECT=$(sudo curl -sf --unix-socket /var/run/docker.sock \
            "http://localhost/v1.41/exec/$EXEC_ID/json" 2>/dev/null)
          EXEC_EXIT=$(echo "$EXEC_INSPECT" | grep -o '"ExitCode":[0-9]*' | cut -d: -f2)
          echo "Docker exec exit code: $EXEC_EXIT"

          # If user already exists (non-zero exit), reset password to ensure auth works.
          # Handles: must_change_password flag, password hash algo change, stale credentials.
          if [ "$EXEC_EXIT" != "0" ]; then
            echo "Admin create returned exit $EXEC_EXIT — user may already exist, resetting password..."
            RESET_RESP=$(sudo curl -sf --unix-socket /var/run/docker.sock \
              -X POST "http://localhost/v1.41/containers/$FORGEJO_CONTAINER/exec" \
              -H "Content-Type: application/json" \
              -d "{\"User\":\"git\",\"AttachStdout\":true,\"AttachStderr\":true,\"Cmd\":[\"forgejo\",\"admin\",\"user\",\"change-password\",\"--username\",\"$ADMIN_USER\",\"--password\",\"$ADMIN_PASS\"]}" \
              2>/dev/null)
            RESET_ID=$(echo "$RESET_RESP" | grep -o '"Id":"[^"]*"' | cut -d'"' -f4)
            if [ -n "$RESET_ID" ]; then
              RESET_OUTPUT=$(sudo curl -s --unix-socket /var/run/docker.sock \
                -X POST "http://localhost/v1.41/exec/$RESET_ID/start" \
                -H "Content-Type: application/json" \
                -d '{"Detach":false}' 2>/dev/null | tr -dc '[:print:]\n')
              echo "Password reset output: $RESET_OUTPUT"
            fi
          fi

          # Step 4: retry auth — Forgejo needs time to commit user + hash password
          echo "Waiting for admin auth to propagate..."
          for i in $(seq 1 15); do
            sleep 2
            AUTH_STATUS=$(curl -so /dev/null -w '%%{http_code}' \
              -u "$ADMIN_USER:$ADMIN_PASS" \
              "$FORGEJO_URL/api/v1/user" 2>/dev/null)
            echo "  Auth check $i/15: HTTP $AUTH_STATUS"
            if [ "$AUTH_STATUS" = "200" ]; then
              break
            fi
          done
        else
          echo "ERROR: Docker exec create failed — response: $EXEC_RESP"
        fi
      else
        echo "WARNING: Docker socket not available at /var/run/docker.sock"
      fi
    else
      echo "Admin user exists (auth OK)"
    fi

    if [ "$AUTH_STATUS" != "200" ]; then
      echo "WARNING: Admin auth still failing (HTTP $AUTH_STATUS) — skipping mirror setup"
      echo "  Manual fix: docker exec --user git $FORGEJO_CONTAINER forgejo admin user create --admin --username $ADMIN_USER --password $ADMIN_PASS --email $ADMIN_EMAIL --must-change-password=false"
      exit 0
    fi

    # --- Build input bare mirrors with all branches as refs/heads/* ---
    # Problem: the live clone (/home/coder/<repo>) stores remote branches as
    # refs/remotes/origin/* — Forgejo's refs/*:refs/* mirror refspec copies these
    # as remotes/origin/* in its internal repo, which it does NOT show as branches.
    # Fix: maintain an intermediate bare mirror at .forgejo-input/<repo>.git using
    # --shared (shares object store with live clone). After each fetch in the live
    # clone, update refs/heads/* in the bare mirror directly via update-ref.
    # Forgejo mirrors from the bare mirror and sees all branches as local heads.

    sync_input_mirror() {
      local name="$1"
      local src="/home/coder/$name"
      local bare="/home/coder/.forgejo-input/$name.git"

      # Create shared bare clone on first run
      if [ ! -d "$bare/objects" ]; then
        git clone --bare --shared "$src" "$bare" > /dev/null 2>&1 || return 1
      fi

      # Fetch latest from origin into the live clone (gets new remote branches)
      git -C "$src" fetch origin --prune 2>/dev/null || true

      # Sync local branches (main, vk/* worktree branches, etc.)
      git -C "$src" for-each-ref --format='%(refname) %(objectname)' refs/heads/ | \
        while read ref sha; do
          git -C "$bare" update-ref "$ref" "$sha" 2>/dev/null || true
        done

      # Map all remote tracking branches as local heads
      git -C "$src" for-each-ref --format='%(refname) %(objectname)' refs/remotes/origin/ | \
        grep -v '/HEAD ' | while read ref sha; do
          git -C "$bare" update-ref "refs/heads/$${ref#refs/remotes/origin/}" "$sha" 2>/dev/null || true
        done
    }

    mirror_repo() {
      local name="$1"
      local input_bare="/home/coder/.forgejo-input/$name.git"
      sync_input_mirror "$name" || { echo "  sync_input_mirror failed: $name"; return; }

      local repo_info default_branch exists
      repo_info=$(curl -s --max-time 10 \
        -u "$ADMIN_USER:$ADMIN_PASS" \
        "$FORGEJO_URL/api/v1/repos/$ADMIN_USER/$name" 2>/dev/null)
      exists=$(echo "$repo_info" | grep -o '"id":[0-9]*' | cut -d: -f2)
      default_branch=$(echo "$repo_info" | grep -o '"default_branch":"[^"]*"' | cut -d'"' -f4)
      default_branch="$${default_branch:-main}"

      if [ -n "$exists" ]; then
        echo "Triggering sync: $name"
        curl -sf --max-time 60 \
          -X POST "$FORGEJO_URL/api/v1/repos/$ADMIN_USER/$name/mirror-sync" \
          -u "$ADMIN_USER:$ADMIN_PASS" 2>/dev/null || true
        # Refresh Forgejo branch DB cache (TD-forgejo-sidecar §4.2.1)
        curl -sf -u "$ADMIN_USER:$ADMIN_PASS" \
          -X POST "$FORGEJO_URL/api/v1/repos/$ADMIN_USER/$name/branches" \
          -H "Content-Type: application/json" \
          -d "{\"new_branch_name\":\"_sync\",\"old_branch_name\":\"$default_branch\"}" > /dev/null 2>&1 \
          && curl -sf -u "$ADMIN_USER:$ADMIN_PASS" \
            -X DELETE "$FORGEJO_URL/api/v1/repos/$ADMIN_USER/$name/branches/_sync" > /dev/null 2>&1 \
          || true
      else
        echo "Creating mirror: $name"
        http=$(curl -so /dev/null -w '%%{http_code}' --max-time 120 \
          -X POST "$FORGEJO_URL/api/v1/repos/migrate" \
          -u "$ADMIN_USER:$ADMIN_PASS" \
          -H "Content-Type: application/json" \
          -d "{\"clone_addr\":\"file:///home/coder/.forgejo-input/$name.git\",\"repo_name\":\"$name\",\"mirror\":true,\"mirror_interval\":\"10m\",\"private\":false}" \
          2>/dev/null)
        if [ "$http" = "409" ]; then
          # Stale git dir in Forgejo repo root — remove and retry
          rm -rf "/home/coder/.forgejo-mirrors/$ADMIN_USER/$name.git"
          http=$(curl -so /dev/null -w '%%{http_code}' --max-time 120 \
            -X POST "$FORGEJO_URL/api/v1/repos/migrate" \
            -u "$ADMIN_USER:$ADMIN_PASS" \
            -H "Content-Type: application/json" \
            -d "{\"clone_addr\":\"file:///home/coder/.forgejo-input/$name.git\",\"repo_name\":\"$name\",\"mirror\":true,\"mirror_interval\":\"10m\",\"private\":false}" \
            2>/dev/null)
        fi
        echo "  migrate HTTP $http: $name"
      fi
    }

    # --- Clean up stale forgejo remotes pointing at the local sidecar ---
    # Remotes named 'forgejo' pointing at localhost:3001 are from a superseded push-based
    # approach. They break VK PR linking ("unsupported repository type" on localhost URLs).
    # Only remove if the URL is the local sidecar — preserve any real upstream forgejo remotes.
    for repo_path in /home/coder/*/; do
      repo_path="$${repo_path%%/}"
      [ -d "$repo_path/.git" ] || continue
      forgejo_remote_url=$(git -C "$repo_path" remote get-url forgejo 2>/dev/null || true)
      if echo "$forgejo_remote_url" | grep -qE 'localhost:3001|127\.0\.0\.1:3001'; then
        git -C "$repo_path" remote remove forgejo 2>/dev/null || true
        echo "Removed local sidecar forgejo remote from $(basename "$repo_path")"
      fi
    done

    if [ "$AUTH_STATUS" = "200" ]; then
      for repo_path in /home/coder/*/; do
        repo_path="$${repo_path%%/}"
        [ -d "$repo_path/.git" ] || continue
        mirror_repo "$(basename "$repo_path")"
      done
    fi

    # --- Background sync daemon — update input mirrors + trigger Forgejo sync every 60s ---
    # Kill stale sync daemon from previous workspace start.
    # flock is the reliable identity check: the daemon holds an exclusive lock on
    # SYNC_LOCK for its entire lifetime. If the lock can be acquired the daemon is
    # already dead and the PID file is stale — no kill needed. If the lock cannot
    # be acquired the stored PID is provably the daemon (not a reused PID).
    SYNC_LOCK="/tmp/forgejo-sync.lock"
    if [ -f /tmp/forgejo-sync.pid ]; then
      OLD_PID=$(cat /tmp/forgejo-sync.pid 2>/dev/null || true)
      if [ -n "$OLD_PID" ]; then
        if ! flock -n "$SYNC_LOCK" true 2>/dev/null; then
          # Lock held — daemon is alive and PID is valid, safe to kill
          kill "$OLD_PID" 2>/dev/null || true
          flock -w 10 "$SYNC_LOCK" true 2>/dev/null || true  # wait for daemon to exit
        fi
        # Lock acquired means daemon already dead — skip kill, just clean up
      fi
      rm -f /tmp/forgejo-sync.pid
    fi
    (
      exec 9>"$SYNC_LOCK"
      flock -x 9  # Hold exclusive lock for daemon lifetime
      echo "$BASHPID" > /tmp/forgejo-sync.pid
      while true; do
        sleep 60
        for repo_path in /home/coder/*/; do
          repo_path="$${repo_path%%/}"
          [ -d "$repo_path/.git" ] || continue
          name=$(basename "$repo_path")
          sync_input_mirror "$name" 2>/dev/null || true
          repo_info=$(curl -s --max-time 5 \
            -u "$ADMIN_USER:$ADMIN_PASS" \
            "$FORGEJO_URL/api/v1/repos/$ADMIN_USER/$name" 2>/dev/null)
          exists=$(echo "$repo_info" | grep -o '"id":[0-9]*' | cut -d: -f2)
          default_branch=$(echo "$repo_info" | grep -o '"default_branch":"[^"]*"' | cut -d'"' -f4)
          default_branch="$${default_branch:-main}"
          if [ -n "$exists" ]; then
            curl -sf --max-time 30 \
              -X POST "$FORGEJO_URL/api/v1/repos/$ADMIN_USER/$name/mirror-sync" \
              -u "$ADMIN_USER:$ADMIN_PASS" 2>/dev/null || true
            # Refresh Forgejo branch DB cache (TD-forgejo-sidecar §4.2.1)
            curl -sf -u "$ADMIN_USER:$ADMIN_PASS" \
              -X POST "$FORGEJO_URL/api/v1/repos/$ADMIN_USER/$name/branches" \
              -H "Content-Type: application/json" \
              -d "{\"new_branch_name\":\"_sync\",\"old_branch_name\":\"$default_branch\"}" > /dev/null 2>&1 \
              && curl -sf -u "$ADMIN_USER:$ADMIN_PASS" \
                -X DELETE "$FORGEJO_URL/api/v1/repos/$ADMIN_USER/$name/branches/_sync" > /dev/null 2>&1 \
              || true
          else
            echo "forgejo-sync: new repo, creating mirror: $name" >&2
            mirror_repo "$name" 2>/dev/null || true
          fi
        done
      done
    ) >> /tmp/forgejo-sync.log 2>&1 &
    disown
    echo "Mirror sync daemon started (PID $!)"
    echo "Forgejo init complete"
  EOT
}

# 5. Agent MCP config — pre-configure VK MCP server for all supported coding agents
resource "coder_script" "agent_mcp_config" {
  agent_id           = coder_agent.main.id
  display_name       = "Agent MCP Config"
  icon               = "/emojis/1f527.png"
  run_on_start       = true
  start_blocks_login = true
  script             = <<-EOT
    #!/bin/bash

    # Pre-configure VK MCP server for all supported coding agents.
    # Write-once: adds the vibe_kanban entry only when absent; skips if already present.
    # Creates the config file when it does not exist yet.

    # Helper: add vibe_kanban to a JSON config if the key is absent.
    # Usage: ensure_json_mcp <file> <key> <server_json>
    # Prints one of: "added (new file)" | "added" | "skip" | "warn: ..."
    ensure_json_mcp() {
      local file="$1" key="$2" server_json="$3"
      mkdir -p "$(dirname "$file")"
      if [ ! -f "$file" ]; then
        printf '{"%s":{"vibe_kanban":%s}}' "$key" "$server_json" | jq . > "$file"
        echo "added (new file)"
        return
      fi
      if jq -e ".\"$key\".vibe_kanban" "$file" > /dev/null 2>&1; then
        echo "skip"
        return
      fi
      local tmp
      tmp=$(mktemp)
      if jq --argjson srv "$server_json" \
        ".\"$key\" //= {} | .\"$key\".vibe_kanban = \$srv" \
        "$file" > "$tmp" 2>/dev/null; then
        mv "$tmp" "$file"
        echo "added"
      else
        rm -f "$tmp"
        echo "warn: invalid JSON in $file — skipped"
      fi
    }

    VK_SERVER='{"command":"vibe-kanban","args":["--mcp"]}'

    r=$(ensure_json_mcp "$HOME/.claude.json" "mcpServers" "$VK_SERVER")
    echo "Claude Code: $r"

    r=$(ensure_json_mcp "$HOME/.gemini/settings.json" "mcpServers" "$VK_SERVER")
    echo "Gemini CLI: $r"

    VK_COPILOT='{"command":"vibe-kanban","args":["--mcp"],"tools":["*"]}'
    r=$(ensure_json_mcp "$HOME/.copilot/mcp-config.json" "mcpServers" "$VK_COPILOT")
    echo "GitHub Copilot: $r"

    OC_SERVER='{"type":"local","command":["vibe-kanban","--mcp"],"enabled":true}'
    r=$(ensure_json_mcp "$HOME/.config/opencode/opencode.json" "mcp" "$OC_SERVER")
    echo "OpenCode: $r"

    # Codex CLI — TOML format (stdio only)
    CODEX_DIR="$${CODEX_HOME:-$HOME/.codex}"
    CODEX_CFG="$CODEX_DIR/config.toml"
    mkdir -p "$CODEX_DIR"
    if [ ! -f "$CODEX_CFG" ]; then
      cat > "$CODEX_CFG" <<'TOML'
[mcp_servers.vibe_kanban]
command = "vibe-kanban"
args = ["--mcp"]
TOML
      echo "Codex CLI: added (new file)"
    elif grep -q '^\[mcp_servers\.vibe_kanban\]' "$CODEX_CFG"; then
      echo "Codex CLI: skip"
    else
      cat >> "$CODEX_CFG" <<'TOML'

[mcp_servers.vibe_kanban]
command = "vibe-kanban"
args = ["--mcp"]
TOML
      echo "Codex CLI: added"
    fi

    echo "Agent MCP config complete"
  EOT
}

# 6. Supabase graceful stop — Sysbox mode only, runs on workspace stop/restart/update
# Ensures Postgres performs a clean checkpoint before the container is killed.
# Without this, Postgres gets SIGKILL and runs crash recovery on next start.
# Never fails — silently exits if Supabase is not running.
resource "coder_script" "supabase_stop" {
  count       = data.coder_parameter.sysbox_enabled.value == "true" ? 1 : 0
  agent_id    = coder_agent.main.id
  display_name = "Supabase Stop"
  icon         = "https://supabase.com/favicon/favicon-32x32.png"
  run_on_stop  = true
  script       = <<-EOT
    #!/bin/bash
    # Gracefully stop Supabase on workspace shutdown so Postgres checkpoints cleanly.
    # Runs on: workspace stop, restart, template update — any event that stops the agent.

    # If no supabase_db container is running, nothing to do
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'supabase_db_'; then
      exit 0
    fi

    echo "Stopping Supabase instances (graceful checkpoint)..."

    # Find ALL projects with a supabase/config.toml in the workspace home.
    # Handles multiple repos in one workspace -- each gets a graceful stop.
    FOUND=0
    for d in /home/coder/*/; do
      d="$${d%%/}"
      [ -f "$d/supabase/config.toml" ] || continue
      FOUND=1
      echo "  Stopping Supabase for: $(basename $d)"
      (cd "$d" && timeout 20 supabase stop 2>/dev/null) \
        && echo "  Stopped: $(basename $d)" \
        || echo "  Timed out or failed: $(basename $d) (will be killed)"
    done

    if [ "$FOUND" = "0" ]; then
      echo "No supabase/config.toml found in any project, skipping graceful stop"
    fi
  EOT
}

# --- Web apps exposed through Coder ---

resource "coder_app" "vibekanban" {
  agent_id     = coder_agent.main.id
  display_name = "Vibe Kanban"
  slug         = "vk"
  url          = "http://localhost:3000"
  icon         = "/icon/kanban.svg"
  subdomain    = true
  share        = "owner"

  healthcheck {
    url       = "http://localhost:3000"
    interval  = 5
    threshold = 6
  }
}

resource "coder_app" "opencode" {
  count        = data.coder_parameter.enable_opencode.value == "true" ? 1 : 0
  agent_id     = coder_agent.main.id
  display_name = "OpenCode"
  slug         = "opencode"
  url          = "http://localhost:4096"
  icon         = "https://opencode.ai/favicon.svg"
  subdomain    = true
  share        = "owner"

  healthcheck {
    url       = "http://localhost:4096"
    interval  = 5
    threshold = 6
  }
}

resource "coder_app" "forgejo" {
  count        = data.coder_parameter.enable_forgejo.value == "true" ? 1 : 0
  agent_id     = coder_agent.main.id
  display_name = "Forgejo"
  slug         = "forgejo"
  url          = "http://localhost:3001"
  icon         = "/icon/git.svg"
  subdomain    = true
  share        = "owner"

  healthcheck {
    url       = "http://localhost:3001"
    interval  = 5
    threshold = 10
  }
}

# Supabase Studio app button removed — Studio is disabled by default and the
# permanently-unhealthy healthcheck (port 54323 never listening) added noise
# to the workspace panel and may have contributed to workspace state errors.
# To access Studio: run `SUPABASE_LOCAL_STUDIO=true supabase start` from the
# project directory, then open http://localhost:54323 via Open Ports.
