#!/usr/bin/env bash
# provision-server.sh — From-zero Dokploy + Coder provisioning
#
# Automates Phases 1, 3, 4, 5 from the HoliCode dev instance setup guide:
#   Phase 1: Install Dokploy (Docker, Swarm, Traefik, PostgreSQL, Redis)
#   Phase 3: Configure Traefik wildcard SSL via Cloudflare DNS challenge
#   Phase 4: Deploy Coder via Docker Compose with Traefik routing
#   Phase 5: Deploy Vibe Kanban Remote service with Traefik routing
#
# Phase 2 (DNS) is manual — the script prints the required records.
#
# Usage:
#   ./provision-server.sh --env-file .env --phase all
#   ./provision-server.sh --phase 3          # Run only Traefik config
#   ./provision-server.sh --phase verify     # Check current state
#   ./provision-server.sh --phase post-setup
#
# See provision-server.env.example for configuration.
set -Eeuo pipefail
IFS=$'\n\t'

# ============================================================================
# Inline library (self-contained — this script runs on bare servers)
# ============================================================================

readonly SCRIPT_NAME="provision-server"
readonly SCRIPT_VERSION="1.0.0"

_log() { local lvl=$1; shift; printf "[%s] [%s] %s\n" "$(date -Iseconds)" "$lvl" "$*" >&2; }
debug() { if [[ "${HC_DEBUG:-0}" = "1" ]]; then _log "DEBUG" "$*"; fi; }
info()  { _log "INFO" "$*"; }
warn()  { _log "WARN" "$*"; }
err()   { _log "ERROR" "$*"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Missing required command: $1"
    exit 127
  fi
}

require_root() {
  if [[ "$(id -u)" != "0" ]]; then
    err "This script must be run as root"
    exit 1
  fi
}

wait_for_url() {
  local url=$1 max_seconds=${2:-60}
  local label=${3:-$url}
  info "Waiting for ${label} (up to ${max_seconds}s)..."
  local elapsed=0
  while ! curl -sf "$url" >/dev/null 2>&1; do
    elapsed=$((elapsed + 2))
    if [[ $elapsed -ge $max_seconds ]]; then
      err "${label} did not respond within ${max_seconds}s"
      return 1
    fi
    sleep 2
  done
  info "${label} is responding"
}

get_public_ip() {
  curl -sf https://ifconfig.me 2>/dev/null \
    || curl -sf https://api.ipify.org 2>/dev/null \
    || echo "<server-ip>"
}

on_err() {
  local lineno=$1 code=${2:-1}
  err "Unexpected error at line ${lineno} (exit code ${code})"
  err "Phase: ${CURRENT_PHASE:-unknown}"
  if [[ "${HC_DEBUG:-0}" = "1" ]]; then
    docker ps -a >&2 2>/dev/null || true
  fi
}
trap 'on_err ${LINENO} $?' ERR

CURRENT_PHASE="init"

# Template directory (co-located with this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="${SCRIPT_DIR}/templates"

render_template() {
  # Replace __VAR__ placeholders with environment variable values.
  # ${VAR} references are left intact for Dokploy to resolve.
  local template_path=$1 output_path=$2
  if [[ ! -f "$template_path" ]]; then
    err "Template not found: ${template_path}"
    return 1
  fi
  local content
  content=$(<"$template_path")
  # Replace __VAR__ style placeholders
  content="${content//__DOMAIN__/$DOMAIN}"
  content="${content//__CODER_VERSION__/$CODER_VERSION}"
  content="${content//__CODER_SSH_KEYGEN_ALGORITHM__/$CODER_SSH_KEYGEN_ALGORITHM}"
  content="${content//__HOLIBOT_IMAGE_TAG__/$HOLIBOT_IMAGE_TAG}"
  printf '%s\n' "$content" > "$output_path"
  debug "Rendered template ${template_path} → ${output_path}"
}

# ============================================================================
# CLI parsing
# ============================================================================

PHASE="all"
DRY_RUN=false
SKIP_VERIFY=false
ENV_FILE=".env"

usage() {
  cat <<'EOF'
Usage: provision-server.sh [OPTIONS]

Automate Dokploy + Coder setup on a fresh Ubuntu server.

Options:
  --phase PHASE         Run specific phase (see below, default: all)
  --env-file FILE       Path to .env file (default: .env)
  --dry-run             Print what would be done without executing
  --skip-verify         Skip verification steps after each phase
  --debug               Enable debug output
  -h, --help            Show this help

Phases:
  1           Install Dokploy (Docker, Swarm, Traefik, PostgreSQL, Redis)
  3           Configure Traefik wildcard SSL via Cloudflare DNS challenge
  4           Prepare Coder (compose, credentials, volumes — deployed via Dokploy)
  5           Prepare VK Remote (clone, build, compose — deployed via Dokploy)
  all         Run phases 1 -> (print DNS docs) -> 3 -> 4 -> 5 sequentially
  post-setup  Register Dokploy services + deploy (requires DOKPLOY_API_KEY;
              CODER_TOKEN optional — needed only for template upload)
  verify      Run verification checks only (no changes)

Required env vars (set in .env or environment):
  DOMAIN                Base domain (e.g., holagence.com)
  CF_DNS_API_TOKEN      Cloudflare API token with Zone/DNS/Edit permissions
  ACME_EMAIL            Email for Let's Encrypt notifications

Post-setup env vars:
  DOKPLOY_API_KEY       Dokploy API key (from Dokploy UI) — required
  CODER_TOKEN           Coder session/API token — optional (for template upload)

See provision-server.env.example for the full list.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase)           PHASE="$2"; shift 2 ;;
    --env-file)        ENV_FILE="$2"; shift 2 ;;
    --dry-run)         DRY_RUN=true; shift ;;
    --skip-verify)     SKIP_VERIFY=true; shift ;;
    --debug)           HC_DEBUG=1; shift ;;
    -h|--help)         usage; exit 0 ;;
    *)                 err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# ============================================================================
# Configuration
# ============================================================================

load_config() {
  # Load .env file (existing env vars take precedence)
  if [[ -f "$ENV_FILE" ]]; then
    info "Loading configuration from ${ENV_FILE}"
    while IFS= read -r line || [[ -n "$line" ]]; do
      # Skip comments and blank lines
      [[ "$line" =~ ^[[:space:]]*# ]] && continue
      [[ -z "${line// /}" ]] && continue
      # Split on first '=' only (values may contain '=')
      key="${line%%=*}"
      val="${line#*=}"
      # Trim leading/trailing whitespace (bash-native, no xargs)
      key="${key#"${key%%[![:space:]]*}"}" ; key="${key%"${key##*[![:space:]]}"}"
      val="${val#"${val%%[![:space:]]*}"}" ; val="${val%"${val##*[![:space:]]}"}"
      # Strip surrounding quotes
      val="${val%\"}" ; val="${val#\"}"
      val="${val%\'}" ; val="${val#\'}"
      # Skip lines without a key
      [[ -z "$key" ]] && continue
      # Don't override already-set env vars
      if [[ -z "${!key:-}" ]]; then
        export "$key=$val"
        debug "Loaded $key from .env"
      else
        debug "Env var $key already set, keeping existing value"
      fi
    done < "$ENV_FILE"
  elif [[ "$ENV_FILE" != ".env" ]]; then
    err "Specified env file not found: ${ENV_FILE}"
    exit 1
  fi

  # Validate required vars
  local required=(DOMAIN CF_DNS_API_TOKEN ACME_EMAIL)
  # Phase 4: GitHub OAuth is optional — Coder will start without it (password auth)
  if [[ "$PHASE" == "4" || "$PHASE" == "all" ]]; then
    if [[ -z "${GITHUB_OAUTH_CLIENT_ID:-}" || "${GITHUB_OAUTH_CLIENT_ID:-}" == "placeholder-test" ]]; then
      warn "GITHUB_OAUTH_CLIENT_ID not set — Coder will use password auth (no GitHub SSO)"
    fi
    if [[ -z "${GITHUB_ORG:-}" ]]; then
      warn "GITHUB_ORG is not set — ANY GitHub user will be able to sign in and create workspaces"
      warn "Set GITHUB_ORG to restrict access to members of a specific organization"
    fi
  fi

  local missing=()
  for var in "${required[@]}"; do
    if [[ -z "${!var:-}" ]]; then
      missing+=("$var")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    err "Missing required configuration: ${missing[*]}"
    err "Set them in ${ENV_FILE} or as environment variables"
    exit 1
  fi

  # Auto-detect / generate optional values
  : "${CODER_VERSION:=v2.21.0}"
  : "${TRAEFIK_VERSION:=v3.6.7}"
  : "${CODER_DB_PASSWORD:=$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-32)}"
  : "${GITHUB_ORG:=}"
  : "${GITHUB_EXT_CLIENT_ID:=}"
  : "${GITHUB_EXT_CLIENT_SECRET:=}"
  : "${CODER_SSH_KEYGEN_ALGORITHM:=rsa4096}"

  # HoliBot defaults
  : "${HOLIBOT_IMAGE_TAG:=latest}"

  # VK Remote defaults
  : "${VK_REMOTE_REPO:=https://github.com/ciekawy/vibe-kanban.git}"
  : "${VK_REMOTE_BRANCH:=fix-remote}"
  : "${VK_REMOTE_JWT_SECRET:=$(openssl rand -base64 48)}"
  : "${VK_REMOTE_ELECTRIC_PW:=$(openssl rand -base64 16 | tr -d '=+/' | cut -c1-16)}"
  : "${GOOGLE_OAUTH_CLIENT_ID:=}"
  : "${GOOGLE_OAUTH_CLIENT_SECRET:=}"
  : "${GITHUB_APP_ID:=}"
  : "${LOOPS_EMAIL_API_KEY:=}"

  # Docker GID — auto-detect if not set (may not exist yet before Phase 1)
  if [[ -z "${DOCKER_GID:-}" ]]; then
    if getent group docker >/dev/null 2>&1; then
      DOCKER_GID=$(getent group docker | cut -d: -f3)
      debug "Auto-detected DOCKER_GID=${DOCKER_GID}"
    else
      DOCKER_GID=""
      debug "Docker group not found yet (will detect after Phase 1)"
    fi
  fi

  # Post-setup tokens (optional — only needed for --phase post-setup)
  : "${CODER_TOKEN:=}"
  : "${DOKPLOY_API_KEY:=}"
  : "${DOKPLOY_ACME_EMAIL:=ciekawy+dokploy@gmail.com}"

  export DOMAIN CF_DNS_API_TOKEN ACME_EMAIL CODER_VERSION TRAEFIK_VERSION
  export CODER_DB_PASSWORD DOCKER_GID GITHUB_ORG
  export GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET
  export GITHUB_EXT_CLIENT_ID GITHUB_EXT_CLIENT_SECRET
  export CODER_SSH_KEYGEN_ALGORITHM HOLIBOT_IMAGE_TAG
  export VK_REMOTE_REPO VK_REMOTE_BRANCH VK_REMOTE_JWT_SECRET VK_REMOTE_ELECTRIC_PW
  export GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET GITHUB_APP_ID LOOPS_EMAIL_API_KEY
  export CODER_TOKEN DOKPLOY_API_KEY DOKPLOY_ACME_EMAIL

  info "Configuration loaded: DOMAIN=${DOMAIN}, CODER_VERSION=${CODER_VERSION}"
}

# ============================================================================
# Phase 1: Dokploy Installation
# ============================================================================

phase_1_dokploy_install() {
  CURRENT_PHASE="1-dokploy-install"
  info "================================================================"
  info "Phase 1: Dokploy Installation"
  info "================================================================"

  # Idempotency: check if Dokploy is already running
  if docker info >/dev/null 2>&1 && docker service ls 2>/dev/null | grep -q "dokploy "; then
    info "Dokploy service already exists, skipping installation"
    [[ "$SKIP_VERIFY" = true ]] || verify_phase_1
    return 0
  fi

  # Pre-flight: check ports
  for port in 80 443 3000; do
    if command -v ss >/dev/null 2>&1 && ss -tulnp 2>/dev/null | grep -q ":${port} "; then
      err "Port ${port} is already in use — Dokploy needs ports 80, 443, 3000"
      exit 1
    fi
  done

  if [[ "$DRY_RUN" = true ]]; then
    info "[DRY RUN] Would run: curl -sSL https://dokploy.com/install.sh | sh"
    return 0
  fi

  info "Running Dokploy installer..."
  # Run under bash (not sh/dash) to avoid '[[: not found' from Dokploy's scripts
  curl -sSL https://dokploy.com/install.sh | bash

  # Wait for Dokploy to start
  wait_for_url "http://localhost:3000" 120 "Dokploy dashboard"

  # Re-detect Docker GID now that Docker is installed
  if [[ -z "${DOCKER_GID:-}" ]]; then
    DOCKER_GID=$(getent group docker | cut -d: -f3)
    export DOCKER_GID
    info "Detected DOCKER_GID=${DOCKER_GID}"
  fi

  [[ "$SKIP_VERIFY" = true ]] || verify_phase_1
  info "Phase 1 complete"
}

verify_phase_1() {
  info "Verifying Phase 1..."
  local failures=()

  docker info >/dev/null 2>&1 \
    || failures+=("Docker not running")

  docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -q "active" \
    || failures+=("Docker Swarm not active")

  docker service ls --format '{{.Name}}' 2>/dev/null | grep -q "^dokploy$" \
    || failures+=("Swarm service 'dokploy' not found")

  docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dokploy-traefik" \
    || failures+=("Traefik container not running")

  [[ -f /etc/dokploy/traefik/traefik.yml ]] \
    || failures+=("Traefik config /etc/dokploy/traefik/traefik.yml not found")

  curl -sf http://localhost:3000 >/dev/null 2>&1 \
    || failures+=("Dokploy not responding on port 3000")

  if [[ ${#failures[@]} -gt 0 ]]; then
    err "Phase 1 verification FAILED:"
    for f in "${failures[@]}"; do err "  - $f"; done
    return 1
  fi
  info "Phase 1 verified OK"
}

# ============================================================================
# Phase 2: DNS Documentation (manual — print only)
# ============================================================================

phase_2_dns_docs() {
  CURRENT_PHASE="2-dns-docs"
  local pub_ip
  pub_ip=$(get_public_ip)

  info "================================================================"
  info "Phase 2: DNS Setup (MANUAL)"
  info "================================================================"
  info ""
  info "Create the following DNS records in Cloudflare:"
  info ""
  info "  Type   Name                       Value              Proxy"
  info "  ----   ----                       -----              -----"
  info "  A      ${DOMAIN}                  ${pub_ip}          ON or OFF"
  info "  CNAME  dokploy.${DOMAIN}          ${DOMAIN}          ON"
  info "  A      coder.${DOMAIN}            ${pub_ip}          OFF (grey cloud!)"
  info "  A      *.coder.${DOMAIN}          ${pub_ip}          OFF (grey cloud!)"
  info "  A      vk-remote.${DOMAIN}        ${pub_ip}          OFF (grey cloud!)"
  info ""
  info "Coder records MUST have Cloudflare proxy OFF (DNS only)."
  info "Cloudflare's proxy breaks WebSocket upgrades for Coder's wildcard subdomains."
  info ""
  info "Verify with:"
  info "  dig +short coder.${DOMAIN}"
  info "  dig +short test.coder.${DOMAIN}"
  info ""
  info "After DNS propagates, continue with: $0 --phase 3"
}

# ============================================================================
# Phase 3: Traefik Wildcard SSL via Cloudflare DNS Challenge
# ============================================================================

phase_3_traefik_dns_challenge() {
  CURRENT_PHASE="3-traefik-dns"
  info "================================================================"
  info "Phase 3: Traefik Wildcard SSL (Cloudflare DNS Challenge)"
  info "================================================================"

  require_cmd docker

  local traefik_yml="/etc/dokploy/traefik/traefik.yml"

  if [[ ! -f "$traefik_yml" ]]; then
    err "Traefik config not found at ${traefik_yml}"
    err "Run Phase 1 first, or verify Dokploy installation"
    exit 1
  fi

  # Step 1: Patch traefik.yml if needed
  if grep -q "letsencrypt-dns" "$traefik_yml" 2>/dev/null; then
    info "DNS certificate resolver already present in traefik.yml"
  else
    patch_traefik_yml "$traefik_yml"
  fi

  # Step 2: Patch dokploy.yml to route Dokploy dashboard via HTTPS with DNS cert
  patch_dokploy_dynamic_config

  # Step 3: Recreate Traefik container with CF_DNS_API_TOKEN
  recreate_traefik_with_token

  [[ "$SKIP_VERIFY" = true ]] || verify_phase_3

  info "Phase 3 complete"
  warn ""
  warn "IMPORTANT: After creating admin accounts, run --phase post-setup"
  warn "to persist CF_DNS_API_TOKEN for Traefik restart survival."
}

patch_traefik_yml() {
  local traefik_yml=$1

  if [[ "$DRY_RUN" = true ]]; then
    info "[DRY RUN] Would patch ${traefik_yml} to add letsencrypt-dns resolver"
    return 0
  fi

  # Backup
  local backup
  backup="${traefik_yml}.bak.$(date +%s)"
  cp "$traefik_yml" "$backup"
  info "Backed up traefik.yml to ${backup}"

  # Try python3 + PyYAML for safe YAML merge
  if command -v python3 >/dev/null 2>&1 && python3 -c "import yaml" 2>/dev/null; then
    info "Patching traefik.yml via python3+PyYAML"
    # Pass variables as arguments to avoid shell interpolation into Python code
    python3 - "$traefik_yml" "$ACME_EMAIL" <<'PYEOF'
import yaml, sys

traefik_yml = sys.argv[1]
acme_email = sys.argv[2]

with open(traefik_yml) as f:
    cfg = yaml.safe_load(f) or {}

if 'certificatesResolvers' not in cfg:
    cfg['certificatesResolvers'] = {}

cfg['certificatesResolvers']['letsencrypt-dns'] = {
    'acme': {
        'email': acme_email,
        'storage': '/etc/dokploy/traefik/dynamic/acme-dns.json',
        'dnsChallenge': {
            'provider': 'cloudflare',
            'delayBeforeCheck': 10,
            'resolvers': ['1.1.1.1:53', '8.8.8.8:53']
        }
    }
}

with open(traefik_yml, 'w') as f:
    yaml.dump(cfg, f, default_flow_style=False, sort_keys=False)
PYEOF
  else
    # Fallback without PyYAML: use sed to insert at the right YAML position
    info "python3/PyYAML not available, using sed fallback"

    local resolver_block
    resolver_block=$(cat <<RESOLVER
  letsencrypt-dns:\\
    acme:\\
      email: ${ACME_EMAIL}\\
      storage: /etc/dokploy/traefik/dynamic/acme-dns.json\\
      dnsChallenge:\\
        provider: cloudflare\\
        delayBeforeCheck: 10\\
        resolvers:\\
          - "1.1.1.1:53"\\
          - "8.8.8.8:53"
RESOLVER
)

    if grep -q "certificatesResolvers:" "$traefik_yml"; then
      # Insert immediately after 'certificatesResolvers:' line
      sed -i "/^certificatesResolvers:/a\\
${resolver_block}" "$traefik_yml"
    else
      # No certificatesResolvers section — append entire block at end
      cat >> "$traefik_yml" <<YAML

certificatesResolvers:
  letsencrypt-dns:
    acme:
      email: ${ACME_EMAIL}
      storage: /etc/dokploy/traefik/dynamic/acme-dns.json
      dnsChallenge:
        provider: cloudflare
        delayBeforeCheck: 10
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"
YAML
    fi
  fi

  info "traefik.yml patched with letsencrypt-dns resolver"
}

patch_dokploy_dynamic_config() {
  local dokploy_yml="/etc/dokploy/traefik/dynamic/dokploy.yml"

  if [[ ! -f "$dokploy_yml" ]]; then
    warn "Dokploy dynamic config not found at ${dokploy_yml} — skipping"
    return 0
  fi

  # Check if already patched (has our HTTPS router)
  if grep -q "dokploy.${DOMAIN}" "$dokploy_yml" 2>/dev/null; then
    info "Dokploy dynamic config already patched for ${DOMAIN}"
    return 0
  fi

  if [[ "$DRY_RUN" = true ]]; then
    info "[DRY RUN] Would patch ${dokploy_yml} for HTTPS routing"
    return 0
  fi

  local backup="${dokploy_yml}.bak.$(date +%s)"
  cp "$dokploy_yml" "$backup"
  info "Backed up dokploy.yml to ${backup}"

  # Overwrite with HTTPS-enabled routing config
  cat > "$dokploy_yml" <<DOKPLOY
http:
  routers:
    dokploy-router-app:
      rule: "Host(\`dokploy.${DOMAIN}\`)"
      service: dokploy-service-app
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt-dns
        domains:
          - main: "dokploy.${DOMAIN}"
    dokploy-router-redirect:
      rule: "Host(\`dokploy.${DOMAIN}\`)"
      service: dokploy-service-app
      entryPoints:
        - web
      middlewares:
        - redirect-to-https
  middlewares:
    redirect-to-https:
      redirectScheme:
        scheme: https
        permanent: true
  services:
    dokploy-service-app:
      loadBalancer:
        servers:
          - url: "http://dokploy:3000"
        passHostHeader: true
DOKPLOY

  info "Dokploy dynamic config patched for HTTPS routing at dokploy.${DOMAIN}"
}

recreate_traefik_with_token() {
  # Check if token is already set on running container
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dokploy-traefik"; then
    local current_token
    current_token=$(docker inspect dokploy-traefik \
      --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
      | grep "^CF_DNS_API_TOKEN=" | cut -d= -f2- || true)
    if [[ "$current_token" == "$CF_DNS_API_TOKEN" ]]; then
      info "Traefik container already has correct CF_DNS_API_TOKEN"
      return 0
    fi
  fi

  if [[ "$DRY_RUN" = true ]]; then
    info "[DRY RUN] Would recreate Traefik container with CF_DNS_API_TOKEN"
    return 0
  fi

  # Capture current image
  local traefik_image
  traefik_image=$(docker inspect dokploy-traefik --format '{{.Config.Image}}' 2>/dev/null \
    || echo "traefik:${TRAEFIK_VERSION}")
  debug "Traefik image: ${traefik_image}"

  # Capture networks
  local networks
  networks=$(docker inspect dokploy-traefik \
    --format '{{range $net, $_ := .NetworkSettings.Networks}}{{$net}} {{end}}' 2>/dev/null || echo "")
  debug "Traefik networks: ${networks}"

  warn "Traefik recreation will temporarily interrupt HTTP/HTTPS traffic"
  warn "Note: Dokploy-managed labels and extra env vars on the original container will NOT be preserved"
  warn "Run --fix-persistence after this to ensure Dokploy restores the token on future restarts"

  info "Stopping existing Traefik container..."
  docker stop dokploy-traefik 2>/dev/null || true
  docker rename dokploy-traefik dokploy-traefik-backup 2>/dev/null || true

  info "Starting Traefik with CF_DNS_API_TOKEN..."
  if ! docker run -d \
    --name dokploy-traefik \
    --restart always \
    -e "CF_DNS_API_TOKEN=${CF_DNS_API_TOKEN}" \
    -v /etc/dokploy/traefik/traefik.yml:/etc/traefik/traefik.yml \
    -v /etc/dokploy/traefik/dynamic:/etc/dokploy/traefik/dynamic \
    -v /var/run/docker.sock:/var/run/docker.sock:ro \
    -p 80:80/tcp \
    -p 443:443/tcp \
    -p 443:443/udp \
    "$traefik_image"; then
    err "Failed to start new Traefik container — rolling back to previous container"
    docker rm dokploy-traefik 2>/dev/null || true
    docker rename dokploy-traefik-backup dokploy-traefik 2>/dev/null || true
    docker start dokploy-traefik 2>/dev/null || true
    err "Rollback complete. Original Traefik container restored (without CF_DNS_API_TOKEN)."
    return 1
  fi

  # New container started successfully — remove backup
  docker rm dokploy-traefik-backup 2>/dev/null || true

  # Reconnect to dokploy-network (required for Traefik to discover routed services)
  info "Connecting Traefik to dokploy-network..."
  docker network connect dokploy-network dokploy-traefik 2>/dev/null || true

  # Reconnect to any other networks the original container was on
  for net in $networks; do
    [[ "$net" == "bridge" || "$net" == "dokploy-network" ]] && continue
    docker network connect "$net" dokploy-traefik 2>/dev/null || true
    debug "Reconnected Traefik to network: ${net}"
  done

  # Verify dokploy-network connection
  if docker inspect dokploy-traefik \
    --format '{{range $net, $_ := .NetworkSettings.Networks}}{{$net}} {{end}}' 2>/dev/null \
    | grep -q "dokploy-network"; then
    info "Traefik connected to dokploy-network OK"
  else
    err "Failed to connect Traefik to dokploy-network — service routing will not work"
    return 1
  fi

  info "Traefik container recreated with CF_DNS_API_TOKEN"

  # Brief wait for Traefik to initialize
  sleep 3
}

verify_phase_3() {
  info "Verifying Phase 3..."
  local failures=()

  docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dokploy-traefik" \
    || failures+=("Traefik container not running")

  grep -q "letsencrypt-dns" /etc/dokploy/traefik/traefik.yml 2>/dev/null \
    || failures+=("DNS resolver not found in traefik.yml")

  docker inspect dokploy-traefik \
    --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | grep -q "^CF_DNS_API_TOKEN=" \
    || failures+=("CF_DNS_API_TOKEN not set on Traefik container")

  # Check Traefik logs for startup (non-fatal — may take time)
  if ! docker logs dokploy-traefik 2>&1 | tail -20 | grep -qi "configuration\|started\|entrypoint"; then
    warn "Traefik startup not confirmed in logs yet (may still be initializing)"
  fi

  if [[ ${#failures[@]} -gt 0 ]]; then
    err "Phase 3 verification FAILED:"
    for f in "${failures[@]}"; do err "  - $f"; done
    return 1
  fi
  info "Phase 3 verified OK"
}

# ============================================================================
# Phase 4: Prepare Coder (compose, credentials, volumes — deployed via Dokploy)
# ============================================================================

generate_compose_file() {
  local output_path=$1

  # Validate DOCKER_GID is available
  if [[ -z "${DOCKER_GID:-}" ]]; then
    if getent group docker >/dev/null 2>&1; then
      DOCKER_GID=$(getent group docker | cut -d: -f3)
      export DOCKER_GID
    else
      err "DOCKER_GID not set and docker group not found"
      exit 1
    fi
  fi

  render_template "${TEMPLATE_DIR}/coder-compose.yml" "$output_path"
  info "Generated compose file at ${output_path}"
}

phase_4_coder_deploy() {
  CURRENT_PHASE="4-coder-prepare"
  info "================================================================"
  info "Phase 4: Prepare Coder (compose + credentials + volumes)"
  info "================================================================"

  require_cmd docker

  local compose_dir="/etc/dokploy/coder"
  local compose_file="${compose_dir}/docker-compose.yml"

  # Idempotency: skip if already prepared
  if [[ -f "$compose_file" ]] && [[ -f "${compose_dir}/.env.generated" ]]; then
    info "Coder already prepared (compose + credentials exist)"
    [[ "$SKIP_VERIFY" = true ]] || verify_phase_4
    return 0
  fi

  if [[ "$DRY_RUN" = true ]]; then
    info "[DRY RUN] Would prepare Coder compose stack in ${compose_dir}"
    generate_compose_file "/dev/stdout"
    return 0
  fi

  mkdir -p "$compose_dir"

  # Restore or save the DB password — the password in the Postgres volume must match
  local env_record="${compose_dir}/.env.generated"
  if [[ -f "$env_record" ]]; then
    local saved_pw
    saved_pw=$(grep "^CODER_DB_PASSWORD=" "$env_record" | cut -d= -f2-)
    if [[ -n "$saved_pw" ]]; then
      CODER_DB_PASSWORD="$saved_pw"
      export CODER_DB_PASSWORD
      info "Restored CODER_DB_PASSWORD from ${env_record}"
    fi
  else
    cat > "$env_record" <<EOF
# Auto-generated by provision-server.sh on $(date -Iseconds)
# Keep this file safe — it contains the Coder database password.
CODER_DB_PASSWORD=${CODER_DB_PASSWORD}
DOCKER_GID=${DOCKER_GID}
CODER_VERSION=${CODER_VERSION}
DOMAIN=${DOMAIN}
EOF
    chmod 600 "$env_record"
    info "Saved generated credentials to ${env_record} (mode 600)"
  fi

  generate_compose_file "$compose_file"

  # Create external volumes (idempotent — ignored if they already exist)
  docker volume create holicode-coder-config 2>/dev/null || true
  docker volume create holicode-coder-db 2>/dev/null || true
  docker volume create holicode-holibot-redis 2>/dev/null || true
  docker volume create holicode-holibot-workspace 2>/dev/null || true

  [[ "$SKIP_VERIFY" = true ]] || verify_phase_4

  info "Phase 4 complete — Coder prepared (will be deployed via Dokploy in post-setup)"
  info "Generated credentials saved to: ${env_record}"
}

verify_phase_4() {
  info "Verifying Phase 4..."
  local failures=()

  [[ -f "/etc/dokploy/coder/docker-compose.yml" ]] \
    || failures+=("Coder compose file not found")

  [[ -f "/etc/dokploy/coder/.env.generated" ]] \
    || failures+=("Coder credentials file not found")

  docker volume inspect holicode-coder-config >/dev/null 2>&1 \
    || failures+=("Volume holicode-coder-config not created")

  docker volume inspect holicode-coder-db >/dev/null 2>&1 \
    || failures+=("Volume holicode-coder-db not created")

  docker volume inspect holicode-holibot-redis >/dev/null 2>&1 \
    || failures+=("Volume holicode-holibot-redis not created")

  docker volume inspect holicode-holibot-workspace >/dev/null 2>&1 \
    || failures+=("Volume holicode-holibot-workspace not created")

  if [[ ${#failures[@]} -gt 0 ]]; then
    err "Phase 4 verification FAILED:"
    for f in "${failures[@]}"; do err "  - $f"; done
    return 1
  fi
  info "Phase 4 verified OK"
}

# ============================================================================
# Phase 5: Prepare Vibe Kanban Remote (clone, build, compose — deployed via Dokploy)
# ============================================================================

phase_5_vk_remote_deploy() {
  CURRENT_PHASE="5-vk-remote-prepare"
  info "================================================================"
  info "Phase 5: Prepare Vibe Kanban Remote (clone + build + compose)"
  info "================================================================"

  require_cmd docker
  require_cmd git

  local vk_dir="/etc/dokploy/vk-remote"
  local repo_dir="${vk_dir}/repo"
  local compose_file="${vk_dir}/docker-compose.yml"

  # Idempotency: skip if already prepared
  if [[ -f "$compose_file" ]] && [[ -f "${vk_dir}/.env.generated" ]] \
      && docker image inspect vk-remote:latest >/dev/null 2>&1; then
    info "VK Remote already prepared (compose + secrets + image exist)"
    [[ "$SKIP_VERIFY" = true ]] || verify_phase_5
    return 0
  fi

  if [[ "$DRY_RUN" = true ]]; then
    info "[DRY RUN] Would prepare Vibe Kanban Remote from ${VK_REMOTE_REPO} (${VK_REMOTE_BRANCH})"
    return 0
  fi

  mkdir -p "$vk_dir"

  # Clone or update the repo
  if [[ -d "${repo_dir}/.git" ]]; then
    info "Updating existing VK Remote repo..."
    git -C "$repo_dir" fetch origin
    git -C "$repo_dir" checkout "$VK_REMOTE_BRANCH"
    git -C "$repo_dir" pull origin "$VK_REMOTE_BRANCH"
  else
    info "Cloning VK Remote from ${VK_REMOTE_REPO} (${VK_REMOTE_BRANCH})..."
    git clone --branch "$VK_REMOTE_BRANCH" --single-branch "$VK_REMOTE_REPO" "$repo_dir"
  fi

  # Restore or save generated secrets
  local env_record="${vk_dir}/.env.generated"
  if [[ -f "$env_record" ]]; then
    local saved_jwt saved_electric_pw
    saved_jwt=$(grep "^VK_REMOTE_JWT_SECRET=" "$env_record" | cut -d= -f2-)
    saved_electric_pw=$(grep "^VK_REMOTE_ELECTRIC_PW=" "$env_record" | cut -d= -f2-)
    [[ -n "$saved_jwt" ]] && VK_REMOTE_JWT_SECRET="$saved_jwt"
    [[ -n "$saved_electric_pw" ]] && VK_REMOTE_ELECTRIC_PW="$saved_electric_pw"
    export VK_REMOTE_JWT_SECRET VK_REMOTE_ELECTRIC_PW
    info "Restored VK Remote secrets from ${env_record}"
  else
    cat > "$env_record" <<EOF
# Auto-generated by provision-server.sh on $(date -Iseconds)
VK_REMOTE_JWT_SECRET=${VK_REMOTE_JWT_SECRET}
VK_REMOTE_ELECTRIC_PW=${VK_REMOTE_ELECTRIC_PW}
EOF
    chmod 600 "$env_record"
    info "Saved VK Remote secrets to ${env_record} (mode 600)"
  fi

  # Build the remote-server image from the cloned repo
  info "Building VK Remote image (this may take a few minutes)..."
  docker build \
    -t vk-remote:latest \
    -f "${repo_dir}/crates/remote/Dockerfile" \
    "$repo_dir"

  # Generate the compose file with Traefik labels
  generate_vk_remote_compose "$compose_file"

  # Create external volumes (idempotent — ignored if they already exist)
  docker volume create holicode-vk-remote-db 2>/dev/null || true
  docker volume create holicode-vk-electric 2>/dev/null || true

  [[ "$SKIP_VERIFY" = true ]] || verify_phase_5

  info "Phase 5 complete — VK Remote prepared (will be deployed via Dokploy in post-setup)"
}

generate_vk_remote_compose() {
  local output_path=$1

  render_template "${TEMPLATE_DIR}/vk-remote-compose.yml" "$output_path"
  info "Generated VK Remote compose file at ${output_path}"
}

verify_phase_5() {
  info "Verifying Phase 5..."
  local failures=()

  [[ -f "/etc/dokploy/vk-remote/docker-compose.yml" ]] \
    || failures+=("VK Remote compose file not found")

  [[ -f "/etc/dokploy/vk-remote/.env.generated" ]] \
    || failures+=("VK Remote secrets file not found")

  [[ -d "/etc/dokploy/vk-remote/repo/.git" ]] \
    || failures+=("VK Remote repo not cloned")

  docker image inspect vk-remote:latest >/dev/null 2>&1 \
    || failures+=("VK Remote image not built")

  docker volume inspect holicode-vk-remote-db >/dev/null 2>&1 \
    || failures+=("Volume holicode-vk-remote-db not created")

  docker volume inspect holicode-vk-electric >/dev/null 2>&1 \
    || failures+=("Volume holicode-vk-electric not created")

  if [[ ${#failures[@]} -gt 0 ]]; then
    err "Phase 5 verification FAILED:"
    for f in "${failures[@]}"; do err "  - $f"; done
    return 1
  fi
  info "Phase 5 verified OK"
}

# ============================================================================
# Post-setup: Coder template + Dokploy services + CF persistence
# ============================================================================

phase_post_setup() {
  CURRENT_PHASE="post-setup"
  info "================================================================"
  info "Post-setup: Coder template, Dokploy services, CF persistence"
  info "================================================================"

  # Validate required tokens
  if [[ -z "${DOKPLOY_API_KEY:-}" ]]; then
    err "Post-setup requires DOKPLOY_API_KEY"
    err "1. Create admin account at Dokploy"
    err "2. Generate API key: Settings > Profile"
    err "3. Add to your .env file: DOKPLOY_API_KEY=<key>"
    exit 1
  fi

  if [[ -z "${CODER_TOKEN:-}" ]]; then
    warn "CODER_TOKEN not set — Coder template upload will be skipped"
    warn "After Coder starts, create admin account, generate token, and re-run post-setup"
  fi

  local dokploy_url="http://localhost:3000"
  local coder_api="http://localhost:7080"

  # ---- Step 1: Register Dokploy compose services (migrates + deploys) ----
  post_setup_dokploy_services "$dokploy_url"

  # ---- Step 2: Upload Coder template (after Coder is running via Dokploy) ----
  if [[ -n "${CODER_TOKEN:-}" ]]; then
    post_setup_coder_template "$coder_api"
  else
    info "--- Coder template upload: skipped (no CODER_TOKEN) ---"
  fi

  # ---- Step 3: Persist CF_DNS_API_TOKEN via Dokploy ----
  post_setup_cf_persistence "$dokploy_url"

  info ""
  info "Post-setup complete"
  if [[ -z "${CODER_TOKEN:-}" ]]; then
    info ""
    info "Note: Coder template was not uploaded (no CODER_TOKEN)."
    info "After Coder starts, create admin account, generate token, and re-run:"
    info "  $0 --phase post-setup --env-file <your .env>"
  fi
}

find_coder_container() {
  # Find the Coder app container regardless of Dokploy appName prefix.
  # Matches: coder-coder-1, coder-puws0i-coder-1, etc.
  docker ps --format '{{.Names}}' 2>/dev/null \
    | grep -E '^(coder-)?.*coder-1$' 2>/dev/null \
    | grep -v database 2>/dev/null \
    | head -1 || true
}

post_setup_coder_template() {
  local coder_api=$1
  info "--- Coder template upload ---"

  local template_tar="/root/coder-template.tar.gz"
  if [[ ! -f "$template_tar" ]]; then
    info "No template file at ${template_tar} — skipping"
    return 0
  fi

  local coder_container
  coder_container=$(find_coder_container)
  if [[ -z "$coder_container" ]]; then
    warn "Coder container not running — skipping template upload"
    return 0
  fi
  debug "Using Coder container: ${coder_container}"

  # Check if template already exists
  local templates_resp
  templates_resp=$(docker exec "$coder_container" curl -s \
    -H "Coder-Session-Token: ${CODER_TOKEN}" \
    "${coder_api}/api/v2/organizations/default/templates" 2>&1 || true)

  if echo "$templates_resp" | grep -q '"holicode-workspace"'; then
    info "Template 'holicode-workspace' already exists"
    return 0
  fi

  if [[ "$DRY_RUN" = true ]]; then
    info "[DRY RUN] Would upload Coder template from ${template_tar}"
    return 0
  fi

  # Coder API expects plain tar (not gzipped)
  local plain_tar="/root/coder-template.tar"
  if [[ "$template_tar" == *.tar.gz || "$template_tar" == *.tgz ]]; then
    gunzip -c "$template_tar" > "$plain_tar"
  else
    plain_tar="$template_tar"
  fi

  # Copy into Coder container; fix permissions (container runs as uid 1000)
  docker cp "$plain_tar" "${coder_container}:/tmp/coder-template.tar"
  docker exec -u root "$coder_container" chmod 644 /tmp/coder-template.tar

  # Step 1: Upload file
  local upload_resp
  upload_resp=$(docker exec "$coder_container" curl -s -X POST \
    -H "Coder-Session-Token: ${CODER_TOKEN}" \
    -H "Content-Type: application/x-tar" \
    --data-binary "@/tmp/coder-template.tar" \
    "${coder_api}/api/v2/files" 2>&1 || true)

  local file_hash
  file_hash=$(echo "$upload_resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['hash'])" 2>/dev/null || true)

  if [[ -z "$file_hash" ]]; then
    warn "Template file upload failed: ${upload_resp}"
    warn "Upload manually via Coder UI > Templates > Create"
    return 0
  fi
  info "Template file uploaded (hash: ${file_hash})"

  # Step 2: Create template version (triggers provisioner job)
  local tv_resp
  tv_resp=$(docker exec "$coder_container" curl -s -X POST \
    -H "Coder-Session-Token: ${CODER_TOKEN}" \
    -H "Content-Type: application/json" \
    "${coder_api}/api/v2/organizations/default/templateversions" \
    -d "{\"file_id\":\"${file_hash}\",\"storage_method\":\"file\",\"provisioner\":\"terraform\"}" 2>&1 || true)

  local tv_id
  tv_id=$(echo "$tv_resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || true)

  if [[ -z "$tv_id" ]]; then
    warn "Template version creation failed: ${tv_resp}"
    warn "Upload manually via Coder UI > Templates > Create"
    return 0
  fi
  info "Template version created (id: ${tv_id}), waiting for provisioner..."

  # Step 3: Wait for provisioner job to complete
  local status="" elapsed=0
  while [[ "$status" != "succeeded" && "$status" != "failed" && "$status" != "canceled" ]]; do
    elapsed=$((elapsed + 2))
    if [[ $elapsed -ge 60 ]]; then
      warn "Template version job did not complete within 60s (status: ${status})"
      warn "Check Coder UI for template status"
      return 0
    fi
    sleep 2
    status=$(docker exec "$coder_container" curl -s \
      -H "Coder-Session-Token: ${CODER_TOKEN}" \
      "${coder_api}/api/v2/templateversions/${tv_id}" 2>&1 \
      | python3 -c "import sys,json; print(json.load(sys.stdin)['job']['status'])" 2>/dev/null || true)
    debug "Template version job status: ${status}"
  done

  if [[ "$status" != "succeeded" ]]; then
    warn "Template version job ${status} — check Coder UI"
    return 0
  fi
  info "Template version provisioner succeeded"

  # Step 4: Create template referencing the version
  local create_resp
  create_resp=$(docker exec "$coder_container" curl -s -X POST \
    -H "Coder-Session-Token: ${CODER_TOKEN}" \
    -H "Content-Type: application/json" \
    "${coder_api}/api/v2/organizations/default/templates" \
    -d "{\"name\":\"holicode-workspace\",\"display_name\":\"HoliCode Workspace\",\"description\":\"ARM64 dev workspace with Node.js, GitHub CLI, and dev tools\",\"template_version_id\":\"${tv_id}\"}" 2>&1 || true)

  if echo "$create_resp" | grep -q '"id"'; then
    info "Template 'holicode-workspace' created successfully"
  else
    warn "Template creation response: ${create_resp}"
    warn "You may need to upload manually via Coder UI"
  fi
}

post_setup_dokploy_services() {
  local dokploy_url=$1
  info "--- Dokploy compose services ---"

  if [[ "$DRY_RUN" = true ]]; then
    info "[DRY RUN] Would register Coder and VK Remote as Dokploy compose services"
    return 0
  fi

  # Get or create project
  local projects_resp
  projects_resp=$(curl -s "${dokploy_url}/api/project.all" \
    -H "x-api-key: ${DOKPLOY_API_KEY}" 2>&1)

  local project_id env_id
  project_id=$(echo "$projects_resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data:
    if p.get('name') == 'HoliCode Infra':
        print(p['projectId'])
        break
" 2>/dev/null || true)

  if [[ -z "$project_id" ]]; then
    info "Creating Dokploy project 'HoliCode Infra'..."
    local create_proj
    create_proj=$(curl -s -X POST "${dokploy_url}/api/project.create" \
      -H "x-api-key: ${DOKPLOY_API_KEY}" \
      -H "Content-Type: application/json" \
      -d '{"name":"HoliCode Infra","description":"Coder + VK Remote infrastructure"}' 2>&1)
    project_id=$(echo "$create_proj" | python3 -c "
import sys, json
data = json.load(sys.stdin)
pid = data.get('projectId') or data.get('project', {}).get('projectId', '')
print(pid)
" 2>/dev/null || true)
    if [[ -z "$project_id" ]]; then
      warn "Failed to create Dokploy project: ${create_proj}"
      return 0
    fi
    info "Project created (id: ${project_id})"
  else
    info "Found existing project 'HoliCode Infra' (id: ${project_id})"
  fi

  # Get environment ID from project
  local project_detail
  project_detail=$(curl -s "${dokploy_url}/api/project.one?projectId=${project_id}" \
    -H "x-api-key: ${DOKPLOY_API_KEY}" 2>&1)

  env_id=$(echo "$project_detail" | python3 -c "
import sys, json
data = json.load(sys.stdin)
envs = data.get('environments', [])
if envs:
    print(envs[0]['environmentId'])
elif data.get('environmentId'):
    print(data['environmentId'])
elif data.get('environment', {}).get('environmentId'):
    print(data['environment']['environmentId'])
" 2>/dev/null || true)

  if [[ -z "$env_id" ]]; then
    warn "Could not determine environmentId from project"
    warn "Register services manually in Dokploy UI"
    return 0
  fi

  # ---- Restore saved secrets (must happen before compose regeneration) ----
  local coder_env="/etc/dokploy/coder/.env.generated"
  if [[ -f "$coder_env" ]]; then
    local saved_pw
    saved_pw=$(grep "^CODER_DB_PASSWORD=" "$coder_env" | cut -d= -f2-)
    if [[ -n "$saved_pw" ]]; then
      CODER_DB_PASSWORD="$saved_pw"; export CODER_DB_PASSWORD
      debug "Restored CODER_DB_PASSWORD from ${coder_env}"
    fi
  fi

  local vk_env="/etc/dokploy/vk-remote/.env.generated"
  if [[ -f "$vk_env" ]]; then
    local saved_jwt saved_electric_pw
    saved_jwt=$(grep "^VK_REMOTE_JWT_SECRET=" "$vk_env" | cut -d= -f2-)
    saved_electric_pw=$(grep "^VK_REMOTE_ELECTRIC_PW=" "$vk_env" | cut -d= -f2-)
    [[ -n "$saved_jwt" ]] && { VK_REMOTE_JWT_SECRET="$saved_jwt"; export VK_REMOTE_JWT_SECRET; }
    [[ -n "$saved_electric_pw" ]] && { VK_REMOTE_ELECTRIC_PW="$saved_electric_pw"; export VK_REMOTE_ELECTRIC_PW; }
    debug "Restored VK Remote secrets from ${vk_env}"
  fi

  # ---- Migrate legacy volumes if they exist (from older direct-deploy installs) ----
  migrate_legacy_volumes

  # ---- Build Dokploy Environment tab env vars ----
  local coder_dokploy_env
  coder_dokploy_env=$(build_dokploy_env_string "coder")
  local vk_dokploy_env
  vk_dokploy_env=$(build_dokploy_env_string "vk-remote")

  # ---- Register and deploy Coder ----
  register_and_deploy_dokploy_compose "$dokploy_url" "$env_id" \
    "coder" "/etc/dokploy/coder/docker-compose.yml" \
    "coder" "7080" "coder.${DOMAIN}" "*.coder.${DOMAIN}" \
    "$coder_dokploy_env"

  # ---- Register and deploy VK Remote ----
  register_and_deploy_dokploy_compose "$dokploy_url" "$env_id" \
    "vk-remote" "/etc/dokploy/vk-remote/docker-compose.yml" \
    "remote-server" "8081" "vk-remote.${DOMAIN}" "" \
    "$vk_dokploy_env"

  # Wait for Coder to be accessible (needed for template upload in next step)
  info "Waiting for Coder to be ready after Dokploy deploy..."
  local coder_container="" elapsed=0
  while [[ -z "$coder_container" ]]; do
    coder_container=$(find_coder_container)
    elapsed=$((elapsed + 3))
    if [[ $elapsed -ge 120 ]]; then
      warn "Coder container not found after 120s — template upload may fail"
      break
    fi
    sleep 3
  done

  if [[ -n "$coder_container" ]]; then
    elapsed=0
    while ! docker exec "$coder_container" curl -sf http://localhost:7080/api/v2/buildinfo >/dev/null 2>&1; do
      elapsed=$((elapsed + 3))
      if [[ $elapsed -ge 90 ]]; then
        warn "Coder API not responding after 90s — template upload may fail"
        break
      fi
      sleep 3
    done
    info "Coder is ready"
  fi
}

migrate_legacy_volumes() {
  # Copy data from old project-scoped volumes to new external (fixed-name) volumes.
  # Only runs once — skipped if old volumes do not exist.
  local migrations=(
    "coder_coder-config|holicode-coder-config"
    "coder_db-data|holicode-coder-db"
    "vk-remote_remote-db-data|holicode-vk-remote-db"
    "vk-remote_electric-data|holicode-vk-electric"
  )

  for pair in "${migrations[@]}"; do
    local old_vol="${pair%%|*}"
    local new_vol="${pair##*|}"

    # Create the external volume if missing
    docker volume create "$new_vol" 2>/dev/null || true

    # Skip if old volume doesn't exist
    if ! docker volume inspect "$old_vol" >/dev/null 2>&1; then
      debug "Old volume $old_vol not found — skipping migration"
      continue
    fi

    # Skip if new volume already has data (migration already done)
    local new_has_data
    new_has_data=$(docker run --rm -v "${new_vol}:/vol" alpine sh -c 'ls -A /vol 2>/dev/null | head -1' 2>/dev/null || true)
    if [[ -n "$new_has_data" ]]; then
      debug "Volume $new_vol already has data — skipping migration"
      continue
    fi

    info "Migrating volume: ${old_vol} → ${new_vol}"
    docker run --rm \
      -v "${old_vol}:/src:ro" \
      -v "${new_vol}:/dst" \
      alpine sh -c 'cp -a /src/. /dst/' 2>/dev/null || {
      warn "Failed to migrate volume ${old_vol} → ${new_vol}"
    }
  done
}

build_dokploy_env_string() {
  # Build newline-separated KEY=VALUE string for Dokploy's Environment tab.
  # These vars are referenced as ${KEY} in compose templates.
  local service=$1
  local env_lines=""

  if [[ "$service" == "coder" ]]; then
    env_lines="CODER_DB_PASSWORD=${CODER_DB_PASSWORD}
DOCKER_GID=${DOCKER_GID}
GITHUB_OAUTH_CLIENT_ID=${GITHUB_OAUTH_CLIENT_ID:-}
GITHUB_OAUTH_CLIENT_SECRET=${GITHUB_OAUTH_CLIENT_SECRET:-}
GITHUB_ORG=${GITHUB_ORG:-}
GITHUB_EXT_CLIENT_ID=${GITHUB_EXT_CLIENT_ID:-}
GITHUB_EXT_CLIENT_SECRET=${GITHUB_EXT_CLIENT_SECRET:-}"
  elif [[ "$service" == "vk-remote" ]]; then
    env_lines="ELECTRIC_ROLE_PASSWORD=${VK_REMOTE_ELECTRIC_PW}
VIBEKANBAN_REMOTE_JWT_SECRET=${VK_REMOTE_JWT_SECRET}
SERVER_PUBLIC_BASE_URL=https://vk-remote.${DOMAIN}
GITHUB_OAUTH_CLIENT_ID=${GITHUB_OAUTH_CLIENT_ID:-}
GITHUB_OAUTH_CLIENT_SECRET=${GITHUB_OAUTH_CLIENT_SECRET:-}
GITHUB_APP_ID=${GITHUB_APP_ID:-}
GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_OAUTH_CLIENT_ID:-}
GOOGLE_OAUTH_CLIENT_SECRET=${GOOGLE_OAUTH_CLIENT_SECRET:-}
LOOPS_EMAIL_API_KEY=${LOOPS_EMAIL_API_KEY:-}"
  fi

  printf '%s' "$env_lines"
}

register_and_deploy_dokploy_compose() {
  local dokploy_url=$1 env_id=$2 name=$3 compose_path=$4
  local service_name=$5 service_port=$6 primary_domain=$7 wildcard_domain=${8:-}
  local dokploy_env=${9:-}

  # Check if already registered
  local existing_id
  existing_id=$(curl -s "${dokploy_url}/api/project.all" \
    -H "x-api-key: ${DOKPLOY_API_KEY}" 2>&1 \
    | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data:
    for env in p.get('environments', []):
        for c in env.get('compose', []):
            if c.get('name') == '${name}':
                print(c['composeId'])
                break
" 2>/dev/null || true)

  local compose_id="$existing_id"

  if [[ -n "$compose_id" ]]; then
    info "Compose service '${name}' already registered (id: ${compose_id})"
  else
    if [[ ! -f "$compose_path" ]]; then
      warn "Compose file not found: ${compose_path} — skipping ${name}"
      return 0
    fi

    info "Registering '${name}' as Dokploy compose service..."

    # Create compose service with appName hint
    local create_resp
    create_resp=$(curl -s -X POST "${dokploy_url}/api/compose.create" \
      -H "x-api-key: ${DOKPLOY_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$(python3 -c "
import json
print(json.dumps({
    'name': '${name}',
    'appName': '${name}',
    'environmentId': '${env_id}',
    'description': 'Managed by provision-server.sh',
    'composeType': 'docker-compose'
}))
")" 2>&1)

    compose_id=$(echo "$create_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('composeId',''))" 2>/dev/null || true)

    if [[ -z "$compose_id" ]]; then
      warn "Failed to create compose service '${name}': ${create_resp}"
      return 0
    fi
    info "Compose service created (id: ${compose_id})"
  fi

  # Set compose file content (raw source)
  curl -s -X POST "${dokploy_url}/api/compose.update" \
    -H "x-api-key: ${DOKPLOY_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c "
import json
with open('${compose_path}') as f:
    content = f.read()
print(json.dumps({
    'composeId': '${compose_id}',
    'composeFile': content,
    'sourceType': 'raw',
    'composeType': 'docker-compose'
}))
")" >/dev/null 2>&1

  # Set environment variables (Dokploy Environment tab)
  if [[ -n "$dokploy_env" ]]; then
    info "Setting environment variables for '${name}' via Dokploy..."
    curl -s -X POST "${dokploy_url}/api/compose.update" \
      -H "x-api-key: ${DOKPLOY_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$(python3 -c "
import json, sys
env_str = '''${dokploy_env}'''
print(json.dumps({
    'composeId': '${compose_id}',
    'env': env_str
}))
")" >/dev/null 2>&1
    info "Environment variables set for '${name}'"
  fi

  # ---- Create domains ----
  local existing_domains
  existing_domains=$(curl -s "${dokploy_url}/api/domain.byComposeId?composeId=${compose_id}" \
    -H "x-api-key: ${DOKPLOY_API_KEY}" 2>&1)

  # Primary domain
  if ! echo "$existing_domains" | grep -q "\"host\":\"${primary_domain}\""; then
    info "Creating domain: ${primary_domain} → ${service_name}:${service_port}"
    curl -s -X POST "${dokploy_url}/api/domain.create" \
      -H "x-api-key: ${DOKPLOY_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$(python3 -c "
import json
print(json.dumps({
    'composeId': '${compose_id}',
    'host': '${primary_domain}',
    'port': ${service_port},
    'https': True,
    'certificateType': 'letsencrypt',
    'customCertResolver': 'letsencrypt-dns',
    'serviceName': '${service_name}'
}))
")" >/dev/null 2>&1
  else
    info "Domain '${primary_domain}' already exists"
  fi

  # Wildcard domain (if specified)
  if [[ -n "$wildcard_domain" ]]; then
    if ! echo "$existing_domains" | grep -q "\"host\":\"${wildcard_domain}\""; then
      info "Creating domain: ${wildcard_domain} → ${service_name}:${service_port}"
      curl -s -X POST "${dokploy_url}/api/domain.create" \
        -H "x-api-key: ${DOKPLOY_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "$(python3 -c "
import json
print(json.dumps({
    'composeId': '${compose_id}',
    'host': '${wildcard_domain}',
    'port': ${service_port},
    'https': True,
    'certificateType': 'letsencrypt',
    'customCertResolver': 'letsencrypt-dns',
    'serviceName': '${service_name}'
}))
")" >/dev/null 2>&1
    else
      info "Domain '${wildcard_domain}' already exists"
    fi
  fi

  # ---- Deploy via Dokploy ----
  info "Deploying '${name}' via Dokploy..."
  local deploy_resp
  deploy_resp=$(curl -s -X POST "${dokploy_url}/api/compose.deploy" \
    -H "x-api-key: ${DOKPLOY_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"composeId\":\"${compose_id}\"}" 2>&1)

  if echo "$deploy_resp" | grep -q '"error"'; then
    warn "Deploy may have issues: ${deploy_resp}"
  else
    info "Compose service '${name}' deployment initiated"
  fi
}

post_setup_cf_persistence() {
  local dokploy_url=$1
  info "--- CF_DNS_API_TOKEN persistence ---"

  if [[ "$DRY_RUN" = true ]]; then
    info "[DRY RUN] Would persist CF_DNS_API_TOKEN via Dokploy API"
    return 0
  fi

  local http_code
  http_code=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "${dokploy_url}/api/settings.writeTraefikEnv" \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${DOKPLOY_API_KEY}" \
    -d "{\"env\": \"CF_DNS_API_TOKEN=${CF_DNS_API_TOKEN}\"}" 2>/dev/null || echo "000")

  if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
    info "CF_DNS_API_TOKEN persisted via Dokploy API (HTTP ${http_code})"
  else
    warn "Dokploy API returned HTTP ${http_code} for CF persistence"
    warn "Set manually in Dokploy UI -> Settings -> Server -> Traefik -> Environment"
  fi
}

# ============================================================================
# Full verification
# ============================================================================

verify_all() {
  CURRENT_PHASE="verify"
  info "================================================================"
  info "Running full verification"
  info "================================================================"

  local overall_ok=true

  verify_phase_1 || overall_ok=false
  verify_phase_3 || overall_ok=false
  verify_phase_4 || overall_ok=false
  verify_phase_5 || overall_ok=false

  info ""
  if [[ "$overall_ok" = true ]]; then
    info "All verifications passed"
    info ""
    info "  Dokploy:    https://dokploy.${DOMAIN}"
    info "  Coder:      https://coder.${DOMAIN}"
    info "  VK Remote:  https://vk-remote.${DOMAIN}"
    info ""
    info "Verify wildcard SSL:"
    info "  curl -I https://coder.${DOMAIN}"
    info "  curl -I https://test.coder.${DOMAIN}"
  else
    err "Some verifications failed — review output above"
    return 1
  fi
}

# ============================================================================
# Main
# ============================================================================

main() {
  info "${SCRIPT_NAME} v${SCRIPT_VERSION}"
  info ""

  require_root
  require_cmd curl
  require_cmd openssl

  load_config

  case "$PHASE" in
    1)
      phase_1_dokploy_install
      ;;
    3)
      phase_3_traefik_dns_challenge
      ;;
    4)
      phase_4_coder_deploy
      ;;
    5)
      phase_5_vk_remote_deploy
      ;;
    post-setup)
      phase_post_setup
      ;;
    all)
      phase_1_dokploy_install
      phase_2_dns_docs
      info ""
      info "Continuing with Phase 3 (assuming DNS is already configured)..."
      info "If DNS is not set up, press Ctrl+C now and set it up first."
      info ""
      sleep 3
      phase_3_traefik_dns_challenge
      phase_4_coder_deploy
      phase_5_vk_remote_deploy
      info ""
      info "================================================================"
      info "Preparation complete!"
      info "================================================================"
      info ""
      info "  Dokploy:  https://dokploy.${DOMAIN}  (running)"
      info "  Coder:    prepared — will be deployed via Dokploy in post-setup"
      info "  VK Remote: prepared — will be deployed via Dokploy in post-setup"
      info ""
      info "Next steps:"
      info "  1. Create Dokploy admin account at https://dokploy.${DOMAIN}"
      info "  2. Generate Dokploy API key: Settings > Profile"
      info "  3. Add DOKPLOY_API_KEY to your .env file"
      info "  4. Run: $0 --phase post-setup --env-file <your .env>"
      info "  5. After Coder starts, create admin account and generate CODER_TOKEN"
      info "  6. Add CODER_TOKEN and re-run post-setup for template upload"
      ;;
    verify)
      verify_all
      ;;
    *)
      err "Unknown phase: ${PHASE}"
      usage
      exit 1
      ;;
  esac
}

main
