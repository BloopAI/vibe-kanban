#!/usr/bin/env bash
# manage-server.sh — Automated Hetzner+Cloudflare server lifecycle
#
# Spins up a Hetzner Cloud server, configures Cloudflare DNS, runs
# provision-server.sh, and verifies the stack. Works for both test
# and production environments — configure via env vars or --env-file.
#
# Prerequisites:
#   - Secrets file with HETZNER_API_KEY, CF_DNS_API_TOKEN
#   - SSH key pair (default: ~/.ssh/id_ed25519)
#   - curl, jq, ssh available
#   - provision-server.sh and templates/ in scripts/infra/
#
# Usage:
#   ./manage-server.sh                    # Create server → provision → verify (kept alive)
#   ./manage-server.sh --auto-teardown    # Full lifecycle with teardown on exit
#   ./manage-server.sh --teardown         # Teardown only (from saved state file)
#   ./manage-server.sh --post-setup       # Run post-setup on existing server
#   ./manage-server.sh --provision-only --ip <ip>  # Just provision existing server
set -Euo pipefail
IFS=$'\n\t'

# ============================================================================
# Constants
# ============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_NAME="manage-server"
readonly SCRIPT_VERSION="1.0.0"

# Defaults — all overridable via environment or --env-file
: "${SECRETS_FILE:=/home/coder/.env.holicode-cloud}"

readonly STATE_FILE="${HOME}/.holicode-server-state.json"
readonly HETZNER_API="https://api.hetzner.cloud/v1"
readonly CF_API="https://api.cloudflare.com/client/v4"
readonly POLL_INTERVAL=5
readonly MAX_WAIT=120

# These are set after load_secrets() so .env.holicode-cloud can override them
init_config() {
  : "${DOMAIN:=holagence.com}"
  : "${TEST_PREFIX:=test}"
  : "${SERVER_TYPE:=cax21}"
  : "${SERVER_IMAGE:=ubuntu-24.04}"
  : "${SERVER_LOCATION:=hel1}"
  : "${SSH_KEY_PATH:=/home/coder/.ssh/id_ed25519}"
  # Validate TEST_PREFIX: underscores are invalid in DNS labels (RFC 952)
  if [[ -n "$TEST_PREFIX" && "$TEST_PREFIX" == *_* ]]; then
    err "TEST_PREFIX='${TEST_PREFIX}' contains underscores — invalid in DNS hostnames"
    err "Use hyphens instead, e.g.: TEST_PREFIX=${TEST_PREFIX//_/-}"
    exit 1
  fi

  if [[ -n "$TEST_PREFIX" ]]; then
    TEST_DOMAIN="${TEST_PREFIX}.${DOMAIN}"
  else
    TEST_DOMAIN="${DOMAIN}"
  fi
  info "Config: DOMAIN=${DOMAIN}, TEST_DOMAIN=${TEST_DOMAIN}"
  info "Config: SERVER_TYPE=${SERVER_TYPE}, SERVER_LOCATION=${SERVER_LOCATION}"
}

# ============================================================================
# Logging (never log secrets)
# ============================================================================

_log() { local lvl=$1; shift; printf "[%s] [%s] %s\n" "$(date -Iseconds)" "$lvl" "$*" >&2; }
info()  { _log "INFO" "$*"; }
warn()  { _log "WARN" "$*"; }
err()   { _log "ERROR" "$*"; }

# ============================================================================
# CLI parsing
# ============================================================================

MODE="keep"       # keep | auto-teardown | teardown | provision-only | post-setup
PROVISION_IP=""

usage() {
  cat <<'EOF'
Usage: manage-server.sh [OPTIONS]

Automated Hetzner+Cloudflare server lifecycle for provision-server.sh.
Works for test, staging, and production environments.

Options:
  --auto-teardown     Create server → provision → verify → teardown on exit
  --teardown          Teardown only (using saved state file)
  --provision-only    Just provision an existing server
  --post-setup        Run post-setup phase on existing server (requires tokens)
  --ip IP             Server IP (optional if state file exists)
  --env-file FILE     Secrets file path (default: /home/coder/.env.holicode-cloud)
  -h, --help          Show this help

Modes:
  (default)           Create server → provision → verify (kept alive)
  --auto-teardown     Create server → provision → verify → teardown on exit
  --teardown          Teardown from /tmp/holicode-test-server.json
  --provision-only    Provision only (no Hetzner/DNS management)
  --post-setup        Upload updated files + run --phase post-setup (requires tokens)

Environment (set in env or in --env-file):
  HETZNER_API_KEY     Hetzner Cloud API token (required)
  CF_DNS_API_TOKEN    Cloudflare API token (required)
  DOMAIN              Base domain (default: holagence.com)
  TEST_PREFIX         Subdomain prefix (default: test; set "" for bare domain)
  SERVER_TYPE         Hetzner server type (default: cax21)
  SERVER_LOCATION     Hetzner location (default: hel1)
  SSH_KEY_PATH        Path to SSH private key (default: /home/coder/.ssh/id_ed25519)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --auto-teardown)   MODE="auto-teardown"; shift ;;
    --teardown)        MODE="teardown"; shift ;;
    --provision-only)  MODE="provision-only"; shift ;;
    --post-setup)      MODE="post-setup"; shift ;;
    --ip)              PROVISION_IP="$2"; shift 2 ;;
    --env-file)        SECRETS_FILE="$2"; shift 2 ;;
    -h|--help)         usage; exit 0 ;;
    *)                 err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Resolve IP: explicit --ip takes precedence, then state file fallback
resolve_ip() {
  if [[ -n "$PROVISION_IP" ]]; then
    return 0
  fi
  if [[ -f "$STATE_FILE" ]]; then
    PROVISION_IP=$(jq -r '.server_ip // empty' "$STATE_FILE")
    if [[ -n "$PROVISION_IP" ]]; then
      info "Using server IP from state file: ${PROVISION_IP}"
      return 0
    fi
  fi
  err "$1 requires --ip <ip> or a state file at ${STATE_FILE}"
  exit 1
}

if [[ "$MODE" == "provision-only" ]]; then
  resolve_ip "--provision-only"
fi
if [[ "$MODE" == "post-setup" ]]; then
  resolve_ip "--post-setup"
fi

# ============================================================================
# Secret loading
# ============================================================================

load_secrets() {
  if [[ ! -f "$SECRETS_FILE" ]]; then
    err "Secrets file not found: ${SECRETS_FILE}"
    exit 1
  fi

  # Source secrets but ensure they're never logged
  set +x
  # shellcheck source=/dev/null
  source "$SECRETS_FILE"
  set -Euo pipefail

  if [[ -z "${HETZNER_API_KEY:-}" ]]; then
    err "HETZNER_API_KEY not set in ${SECRETS_FILE}"
    exit 1
  fi
  if [[ -z "${CF_DNS_API_TOKEN:-}" ]]; then
    err "CF_DNS_API_TOKEN not set in ${SECRETS_FILE}"
    exit 1
  fi

  info "Secrets loaded from ${SECRETS_FILE}"
}

# ============================================================================
# Prerequisite checks
# ============================================================================

check_prerequisites() {
  local missing=()
  for cmd in curl jq ssh scp dig; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      missing+=("$cmd")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    err "Missing required commands: ${missing[*]}"
    exit 127
  fi

  if [[ ! -f "${SSH_KEY_PATH}.pub" ]]; then
    err "SSH public key not found: ${SSH_KEY_PATH}.pub"
    exit 1
  fi
  if [[ ! -f "$SSH_KEY_PATH" ]]; then
    err "SSH private key not found: ${SSH_KEY_PATH}"
    exit 1
  fi

  if [[ ! -f "${SCRIPT_DIR}/provision-server.sh" ]]; then
    err "provision-server.sh not found in ${SCRIPT_DIR}"
    exit 1
  fi

  info "Prerequisites OK"
}

# ============================================================================
# State file management
# ============================================================================

save_state() {
  local server_id="${1:-}" server_ip="${2:-}" ssh_key_id="${3:-}" zone_id="${4:-}"
  shift 4 || true
  local dns_ids=("$@")

  local dns_json="[]"
  if [[ ${#dns_ids[@]} -gt 0 ]]; then
    dns_json=$(printf '%s\n' "${dns_ids[@]}" | jq -R . | jq -s .)
  fi

  jq -n \
    --arg sid "$server_id" \
    --arg sip "$server_ip" \
    --arg skid "$ssh_key_id" \
    --arg zid "$zone_id" \
    --argjson dids "$dns_json" \
    --arg ts "$(date -Iseconds)" \
    '{
      server_id: $sid,
      server_ip: $sip,
      ssh_key_id: $skid,
      zone_id: $zid,
      dns_record_ids: $dids,
      created_at: $ts
    }' > "$STATE_FILE"

  info "State saved to ${STATE_FILE}"
}

load_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    err "State file not found: ${STATE_FILE}"
    err "Nothing to teardown."
    exit 1
  fi
  info "Loaded state from ${STATE_FILE}"
}

# ============================================================================
# Hetzner API helpers
# ============================================================================

hetzner_api() {
  local method=$1 path=$2
  shift 2
  set +x
  curl -sf -X "$method" \
    -H "Authorization: Bearer ${HETZNER_API_KEY}" \
    -H "Content-Type: application/json" \
    "${HETZNER_API}${path}" \
    "$@"
}

# ============================================================================
# Cloudflare API helpers
# ============================================================================

cf_api() {
  local method=$1 path=$2
  shift 2
  set +x
  curl -sf -X "$method" \
    -H "Authorization: Bearer ${CF_DNS_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "${CF_API}${path}" \
    "$@"
}

# ============================================================================
# Step 1: Upload SSH public key to Hetzner
# ============================================================================

step_upload_ssh_key() {
  info "================================================================"
  info "Step 1: Upload SSH public key to Hetzner"
  info "================================================================"

  local pub_key
  pub_key=$(cat "${SSH_KEY_PATH}.pub")

  # Check if key with same fingerprint already exists
  local existing_keys
  existing_keys=$(hetzner_api GET "/ssh_keys")

  local existing_id
  existing_id=$(echo "$existing_keys" | jq -r \
    --arg pk "$pub_key" \
    '.ssh_keys[] | select(.public_key == $pk) | .id // empty' | head -1)

  if [[ -n "$existing_id" ]]; then
    info "SSH key already exists in Hetzner (id: ${existing_id})"
    SSH_KEY_ID="$existing_id"
    return 0
  fi

  local key_name="holicode-test-$(date +%s)"
  local response
  response=$(hetzner_api POST "/ssh_keys" \
    -d "$(jq -n --arg name "$key_name" --arg pk "$pub_key" \
      '{name: $name, public_key: $pk}')")

  SSH_KEY_ID=$(echo "$response" | jq -r '.ssh_key.id')

  if [[ -z "$SSH_KEY_ID" || "$SSH_KEY_ID" == "null" ]]; then
    err "Failed to upload SSH key"
    err "Response: $(echo "$response" | jq -r '.error.message // "unknown error"')"
    exit 1
  fi

  info "SSH key uploaded (id: ${SSH_KEY_ID}, name: ${key_name})"

  # Brief pause to allow Hetzner to propagate the key before server creation
  sleep 5
}

# ============================================================================
# Step 2: Create Hetzner Cloud server
# ============================================================================

step_create_server() {
  info "================================================================"
  info "Step 2: Create Hetzner Cloud server"
  info "================================================================"

  local server_name="holicode-test-$(date +%s)"

  local response
  response=$(hetzner_api POST "/servers" \
    -d "$(jq -n \
      --arg name "$server_name" \
      --arg type "$SERVER_TYPE" \
      --arg image "$SERVER_IMAGE" \
      --arg loc "$SERVER_LOCATION" \
      --argjson keys "[$SSH_KEY_ID]" \
      '{
        name: $name,
        server_type: $type,
        image: $image,
        location: $loc,
        ssh_keys: $keys,
        start_after_create: true
      }')")

  SERVER_ID=$(echo "$response" | jq -r '.server.id')
  SERVER_IP=$(echo "$response" | jq -r '.server.public_net.ipv4.ip')

  if [[ -z "$SERVER_ID" || "$SERVER_ID" == "null" ]]; then
    err "Failed to create server"
    err "Response: $(echo "$response" | jq -r '.error.message // "unknown error"')"
    exit 1
  fi

  info "Server created: ${server_name} (id: ${SERVER_ID})"
  info "Waiting for server to become ready..."

  # Poll until status == running
  local elapsed=0
  while true; do
    local status
    status=$(hetzner_api GET "/servers/${SERVER_ID}" | jq -r '.server.status')

    if [[ "$status" == "running" ]]; then
      # Re-fetch IP (may not be available immediately)
      SERVER_IP=$(hetzner_api GET "/servers/${SERVER_ID}" | jq -r '.server.public_net.ipv4.ip')
      break
    fi

    elapsed=$((elapsed + POLL_INTERVAL))
    if [[ $elapsed -ge $MAX_WAIT ]]; then
      err "Server did not become ready within ${MAX_WAIT}s (status: ${status})"
      exit 1
    fi

    info "  Server status: ${status} (${elapsed}s elapsed)"
    sleep "$POLL_INTERVAL"
  done

  info "Server running at ${SERVER_IP}"

  # Save state immediately so teardown works even if later steps fail
  save_state "$SERVER_ID" "$SERVER_IP" "$SSH_KEY_ID" ""
}

# ============================================================================
# Step 3: Wait for SSH readiness
# ============================================================================

step_wait_ssh() {
  info "================================================================"
  info "Step 3: Wait for SSH readiness"
  info "================================================================"

  local elapsed=0
  while true; do
    if ssh -i "$SSH_KEY_PATH" \
         -o ConnectTimeout=5 \
         -o StrictHostKeyChecking=accept-new \
         -o BatchMode=yes \
         "root@${SERVER_IP}" "echo ready" >/dev/null 2>&1; then
      break
    fi

    elapsed=$((elapsed + POLL_INTERVAL))
    if [[ $elapsed -ge $MAX_WAIT ]]; then
      err "SSH not ready after ${MAX_WAIT}s"
      exit 1
    fi

    info "  Waiting for SSH... (${elapsed}s)"
    sleep "$POLL_INTERVAL"
  done

  info "SSH is ready"
}

# ============================================================================
# Step 4: Create Cloudflare DNS records
# ============================================================================

step_create_dns() {
  info "================================================================"
  info "Step 4: Create Cloudflare DNS records"
  info "================================================================"

  # Get zone ID
  local zones_response
  zones_response=$(cf_api GET "/zones?name=${DOMAIN}")

  ZONE_ID=$(echo "$zones_response" | jq -r '.result[0].id')

  if [[ -z "$ZONE_ID" || "$ZONE_ID" == "null" ]]; then
    err "Could not find Cloudflare zone for ${DOMAIN}"
    exit 1
  fi

  info "Found zone: ${DOMAIN} (id: ${ZONE_ID})"

  DNS_RECORD_IDS=()

  # Record definitions: type|name|content|proxied
  # All records unproxied — Traefik handles TLS end-to-end via letsencrypt-dns
  local records=(
    "A|${TEST_DOMAIN}|${SERVER_IP}|false"
    "A|dokploy.${TEST_DOMAIN}|${SERVER_IP}|false"
    "A|coder.${TEST_DOMAIN}|${SERVER_IP}|false"
    "A|*.coder.${TEST_DOMAIN}|${SERVER_IP}|false"
    "A|vk-remote.${TEST_DOMAIN}|${SERVER_IP}|false"
  )

  for rec in "${records[@]}"; do
    IFS='|' read -r rtype rname rcontent rproxied <<< "$rec"

    local response
    response=$(cf_api POST "/zones/${ZONE_ID}/dns_records" \
      -d "$(jq -n \
        --arg type "$rtype" \
        --arg name "$rname" \
        --arg content "$rcontent" \
        --argjson proxied "$rproxied" \
        '{type: $type, name: $name, content: $content, proxied: $proxied, ttl: 60}')")

    local record_id
    record_id=$(echo "$response" | jq -r '.result.id')

    if [[ -z "$record_id" || "$record_id" == "null" ]]; then
      # Check if record already exists (idempotency)
      local existing
      existing=$(cf_api GET "/zones/${ZONE_ID}/dns_records?type=${rtype}&name=${rname}" \
        | jq -r '.result[0].id // empty')

      if [[ -n "$existing" ]]; then
        info "  DNS record already exists: ${rtype} ${rname} (id: ${existing})"
        DNS_RECORD_IDS+=("$existing")
        continue
      fi

      err "Failed to create DNS record: ${rtype} ${rname}"
      err "Response: $(echo "$response" | jq -r '.errors[0].message // "unknown error"')"
      exit 1
    fi

    DNS_RECORD_IDS+=("$record_id")
    info "  Created: ${rtype} ${rname} → ${rcontent} (proxied: ${rproxied}, id: ${record_id})"
  done

  # Update state with DNS info
  save_state "$SERVER_ID" "$SERVER_IP" "$SSH_KEY_ID" "$ZONE_ID" "${DNS_RECORD_IDS[@]}"

  info "All DNS records created"
}

# ============================================================================
# Step 5: Wait for DNS propagation
# ============================================================================

step_wait_dns() {
  info "================================================================"
  info "Step 5: Wait for DNS propagation"
  info "================================================================"

  local elapsed=0
  while true; do
    local resolved
    resolved=$(dig +short "coder.${TEST_DOMAIN}" @1.1.1.1 2>/dev/null | head -1)

    if [[ "$resolved" == "$SERVER_IP" ]]; then
      break
    fi

    elapsed=$((elapsed + POLL_INTERVAL))
    if [[ $elapsed -ge $MAX_WAIT ]]; then
      err "DNS not propagated after ${MAX_WAIT}s (got: '${resolved}', expected: '${SERVER_IP}')"
      exit 1
    fi

    info "  Waiting for DNS... coder.${TEST_DOMAIN} → '${resolved}' (${elapsed}s)"
    sleep "$POLL_INTERVAL"
  done

  info "DNS propagated: coder.${TEST_DOMAIN} → ${SERVER_IP}"

  # Also verify wildcard
  local wildcard_resolved
  wildcard_resolved=$(dig +short "random-check.coder.${TEST_DOMAIN}" @1.1.1.1 2>/dev/null | head -1)
  if [[ "$wildcard_resolved" == "$SERVER_IP" ]]; then
    info "Wildcard DNS verified: *.coder.${TEST_DOMAIN} → ${SERVER_IP}"
  else
    warn "Wildcard DNS not yet resolving (got: '${wildcard_resolved}'). May need more time."
  fi
}

# ============================================================================
# Step 6: Prepare and upload provision files
# ============================================================================

step_prepare_and_upload() {
  info "================================================================"
  info "Step 6: Prepare .env and upload provision files"
  info "================================================================"

  local tmp_env
  tmp_env=$(mktemp)

  # Generate .env from template with test values
  # Use set +x to avoid leaking CF_DNS_API_TOKEN
  # Only include GitHub OAuth vars if actually set in .env.holicode-cloud
  set +x
  cat > "$tmp_env" <<ENVEOF
DOMAIN=${TEST_DOMAIN}
CF_DNS_API_TOKEN=${CF_DNS_API_TOKEN}
ACME_EMAIL=test@${DOMAIN}
ENVEOF
  # Append optional GitHub vars only if present
  if [[ -n "${GITHUB_OAUTH_CLIENT_ID:-}" ]]; then
    cat >> "$tmp_env" <<OPTEOF
GITHUB_OAUTH_CLIENT_ID=${GITHUB_OAUTH_CLIENT_ID}
GITHUB_OAUTH_CLIENT_SECRET=${GITHUB_OAUTH_CLIENT_SECRET}
OPTEOF
  fi
  if [[ -n "${GITHUB_EXT_CLIENT_ID:-}" ]]; then
    cat >> "$tmp_env" <<OPTEOF
GITHUB_EXT_CLIENT_ID=${GITHUB_EXT_CLIENT_ID}
GITHUB_EXT_CLIENT_SECRET=${GITHUB_EXT_CLIENT_SECRET}
OPTEOF
  fi
  if [[ -n "${GITHUB_ORG:-}" ]]; then
    echo "GITHUB_ORG=${GITHUB_ORG}" >> "$tmp_env"
  fi
  # Post-setup tokens (if admin has added them to .env.holicode-cloud)
  if [[ -n "${DOKPLOY_API_KEY:-}" ]]; then
    echo "DOKPLOY_API_KEY=${DOKPLOY_API_KEY}" >> "$tmp_env"
  fi
  if [[ -n "${CODER_TOKEN:-}" ]]; then
    echo "CODER_TOKEN=${CODER_TOKEN}" >> "$tmp_env"
  fi
  set -Euo pipefail

  local ssh_opts=(-i "$SSH_KEY_PATH" -o StrictHostKeyChecking=accept-new -o BatchMode=yes)

  info "Uploading provision-server.sh and templates to server..."
  scp "${ssh_opts[@]}" "${SCRIPT_DIR}/provision-server.sh" "root@${SERVER_IP}:/root/provision-server.sh"
  ssh "${ssh_opts[@]}" "root@${SERVER_IP}" "mkdir -p /root/templates"
  scp "${ssh_opts[@]}" "${SCRIPT_DIR}"/templates/*.yml "root@${SERVER_IP}:/root/templates/"

  info "Uploading .env to server..."
  scp "${ssh_opts[@]}" "$tmp_env" "root@${SERVER_IP}:/root/.env"
  rm -f "$tmp_env"

  # Upload Coder template as tar.gz (Coder CLI expects this format)
  if [[ -f "${SCRIPT_DIR}/coder-template/main.tf" ]]; then
    info "Uploading Coder template to server..."
    local tmp_tar
    tmp_tar=$(mktemp --suffix=.tar.gz)
    tar -czf "$tmp_tar" -C "${SCRIPT_DIR}/coder-template" main.tf
    scp "${ssh_opts[@]}" "$tmp_tar" "root@${SERVER_IP}:/root/coder-template.tar.gz"
    rm -f "$tmp_tar"
  fi

  # Set permissions
  ssh "${ssh_opts[@]}" "root@${SERVER_IP}" "chmod +x /root/provision-server.sh && chmod 600 /root/.env"

  info "Files uploaded and permissions set"
}

# ============================================================================
# Step 7: Run provision-server.sh on remote server
# ============================================================================

step_provision() {
  info "================================================================"
  info "Step 7: Run provision-server.sh on remote server"
  info "================================================================"

  local ssh_opts=(-i "$SSH_KEY_PATH" -o StrictHostKeyChecking=accept-new -o BatchMode=yes)

  info "Running provision-server.sh --phase all ..."
  info "(streaming remote output below)"
  info "----------------------------------------------------------------"

  # Stream output to local terminal; capture exit code
  local rc=0
  ssh "${ssh_opts[@]}" -t "root@${SERVER_IP}" \
    "/root/provision-server.sh --env-file /root/.env --phase all" \
    || rc=$?

  info "----------------------------------------------------------------"

  if [[ $rc -ne 0 ]]; then
    err "provision-server.sh exited with code ${rc}"
    return "$rc"
  fi

  info "provision-server.sh completed successfully"
}

# ============================================================================
# Step 8: Verify
# ============================================================================

step_verify() {
  info "================================================================"
  info "Step 8: Verify deployment"
  info "================================================================"

  local ssh_opts=(-i "$SSH_KEY_PATH" -o StrictHostKeyChecking=accept-new -o BatchMode=yes)
  local failures=()

  # Remote verify
  info "Running remote verification..."
  ssh "${ssh_opts[@]}" "root@${SERVER_IP}" \
    "/root/provision-server.sh --env-file /root/.env --phase verify" \
    || failures+=("Remote verify phase failed")

  # Local HTTP checks (with retry — SSL cert may still be issuing)
  info "Running local HTTP checks..."

  local max_ssl_wait=180
  local ssl_elapsed=0
  local ssl_ready=false

  while [[ $ssl_elapsed -lt $max_ssl_wait ]]; do
    if curl -sf "https://dokploy.${TEST_DOMAIN}" >/dev/null 2>&1; then
      ssl_ready=true
      break
    fi
    ssl_elapsed=$((ssl_elapsed + 10))
    info "  Waiting for SSL certificates... (${ssl_elapsed}s)"
    sleep 10
  done

  if [[ "$ssl_ready" != true ]]; then
    failures+=("Dokploy HTTPS not responding after ${max_ssl_wait}s")
  fi

  # Dokploy dashboard
  local http_code
  http_code=$(curl -so /dev/null -w '%{http_code}' "https://dokploy.${TEST_DOMAIN}" 2>/dev/null || echo "000")
  if [[ "$http_code" =~ ^(200|301|302|307)$ ]]; then
    info "  Dokploy HTTPS: OK (HTTP ${http_code})"
  else
    failures+=("Dokploy HTTPS returned HTTP ${http_code}")
  fi

  # Coder API (only runs after post-setup deploys via Dokploy)
  http_code=$(curl -so /dev/null -w '%{http_code}' "https://coder.${TEST_DOMAIN}" 2>/dev/null || echo "000")
  if [[ "$http_code" =~ ^(200|301|302|307)$ ]]; then
    info "  Coder HTTPS: OK (HTTP ${http_code})"
    # Also check buildinfo if Coder is responding
    local buildinfo
    buildinfo=$(curl -sf "https://coder.${TEST_DOMAIN}/api/v2/buildinfo" 2>/dev/null || echo "")
    if [[ -n "$buildinfo" ]]; then
      local version
      version=$(echo "$buildinfo" | jq -r '.version // "unknown"')
      info "  Coder API buildinfo: version=${version}"
    fi
  else
    warn "  Coder HTTPS returned HTTP ${http_code} (not deployed yet — run post-setup)"
  fi

  # VK Remote health (only runs after post-setup deploys via Dokploy)
  http_code=$(curl -so /dev/null -w '%{http_code}' "https://vk-remote.${TEST_DOMAIN}/health" 2>/dev/null || echo "000")
  if [[ "$http_code" == "200" ]]; then
    info "  VK Remote HTTPS: OK (HTTP ${http_code})"
  else
    warn "  VK Remote HTTPS returned HTTP ${http_code} (not deployed yet — run post-setup)"
  fi

  # Wildcard SSL check
  local san_output
  san_output=$(echo | openssl s_client \
    -servername "test-check.coder.${TEST_DOMAIN}" \
    -connect "${SERVER_IP}:443" 2>/dev/null \
    | openssl x509 -noout -text 2>/dev/null \
    | grep -A1 "Subject Alternative Name" || echo "")
  if echo "$san_output" | grep -q "coder.${TEST_DOMAIN}"; then
    info "  Wildcard SSL: OK"
  else
    warn "  Wildcard SSL: certificate may not include *.coder.${TEST_DOMAIN} yet"
    warn "  (Let's Encrypt DNS challenge can take a few minutes)"
  fi

  if [[ ${#failures[@]} -gt 0 ]]; then
    err "Verification had failures:"
    for f in "${failures[@]}"; do err "  - $f"; done
    return 1
  fi

  info "All verifications passed"
}

# ============================================================================
# Step 9: Test idempotency
# ============================================================================

step_test_idempotency() {
  info "================================================================"
  info "Step 9: Test idempotency"
  info "================================================================"

  local ssh_opts=(-i "$SSH_KEY_PATH" -o StrictHostKeyChecking=accept-new -o BatchMode=yes)

  info "Re-running provision-server.sh --phase all (should skip everything)..."
  local rc=0
  ssh "${ssh_opts[@]}" "root@${SERVER_IP}" \
    "/root/provision-server.sh --env-file /root/.env --phase all" \
    || rc=$?

  if [[ $rc -ne 0 ]]; then
    err "Idempotency test failed (exit code: ${rc})"
    return "$rc"
  fi

  info "Re-running provision-server.sh --phase 3 (should detect token already set)..."
  rc=0
  ssh "${ssh_opts[@]}" "root@${SERVER_IP}" \
    "/root/provision-server.sh --env-file /root/.env --phase 3" \
    || rc=$?

  if [[ $rc -ne 0 ]]; then
    err "Idempotency test for --phase 3 failed (exit code: ${rc})"
    return "$rc"
  fi

  info "Idempotency tests passed"
}

# ============================================================================
# Step 10: Teardown
# ============================================================================

teardown() {
  info "================================================================"
  info "Teardown: Cleaning up test resources"
  info "================================================================"

  if [[ ! -f "$STATE_FILE" ]]; then
    warn "No state file found at ${STATE_FILE}, nothing to teardown"
    return 0
  fi

  local state
  state=$(cat "$STATE_FILE")

  local srv_id zone_id ssh_kid srv_ip
  srv_id=$(echo "$state" | jq -r '.server_id // empty')
  srv_ip=$(echo "$state" | jq -r '.server_ip // empty')
  zone_id=$(echo "$state" | jq -r '.zone_id // empty')
  ssh_kid=$(echo "$state" | jq -r '.ssh_key_id // empty')

  # Delete DNS records
  if [[ -n "$zone_id" ]]; then
    local dns_ids
    mapfile -t dns_ids < <(echo "$state" | jq -r '.dns_record_ids[]? // empty')

    for rid in "${dns_ids[@]}"; do
      [[ -z "$rid" ]] && continue
      info "  Deleting DNS record: ${rid}"
      cf_api DELETE "/zones/${zone_id}/dns_records/${rid}" >/dev/null 2>&1 || \
        warn "  Failed to delete DNS record ${rid} (may already be gone)"
    done
    info "DNS records cleaned up"
  fi

  # Delete server
  if [[ -n "$srv_id" ]]; then
    info "  Deleting Hetzner server: ${srv_id}"
    hetzner_api DELETE "/servers/${srv_id}" >/dev/null 2>&1 || \
      warn "  Failed to delete server ${srv_id} (may already be gone)"
    info "Server deleted"
  fi

  # Delete SSH key (only if we created it — check if other servers might use it)
  if [[ -n "$ssh_kid" ]]; then
    info "  Deleting Hetzner SSH key: ${ssh_kid}"
    hetzner_api DELETE "/ssh_keys/${ssh_kid}" >/dev/null 2>&1 || \
      warn "  Failed to delete SSH key ${ssh_kid} (may already be gone)"
    info "SSH key deleted"
  fi

  # Remove server IP from SSH known_hosts
  if [[ -n "$srv_ip" ]]; then
    ssh-keygen -R "$srv_ip" 2>/dev/null || true
    info "Removed ${srv_ip} from SSH known_hosts"
  fi

  rm -f "$STATE_FILE"
  info "State file removed"
  info "Teardown complete"
}

# ============================================================================
# Main
# ============================================================================

main() {
  info "${SCRIPT_NAME} v${SCRIPT_VERSION}"
  info "Mode: ${MODE}"
  info ""

  load_secrets
  init_config
  check_prerequisites

  # Teardown-only mode
  if [[ "$MODE" == "teardown" ]]; then
    teardown
    exit 0
  fi

  # Provision-only mode (server already exists)
  if [[ "$MODE" == "provision-only" ]]; then
    SERVER_IP="$PROVISION_IP"
    step_prepare_and_upload
    step_provision
    step_verify
    exit 0
  fi

  # Post-setup mode (server running, admin accounts created, tokens available)
  if [[ "$MODE" == "post-setup" ]]; then
    SERVER_IP="$PROVISION_IP"
    if [[ -z "${DOKPLOY_API_KEY:-}" ]]; then
      err "Post-setup requires DOKPLOY_API_KEY in ${SECRETS_FILE}"
      exit 1
    fi
    if [[ -z "${CODER_TOKEN:-}" ]]; then
      warn "CODER_TOKEN not set — Coder template upload will be skipped"
      warn "After Coder starts, add CODER_TOKEN and re-run --post-setup"
    fi
    step_prepare_and_upload
    info "Running provision-server.sh --phase post-setup ..."
    local ssh_opts=(-i "$SSH_KEY_PATH" -o StrictHostKeyChecking=accept-new -o BatchMode=yes)
    ssh "${ssh_opts[@]}" -t "root@${SERVER_IP}" \
      "/root/provision-server.sh --env-file /root/.env --phase post-setup"
    info "Post-setup complete"
    exit 0
  fi

  # Auto-teardown mode: set up EXIT trap
  if [[ "$MODE" == "auto-teardown" ]]; then
    trap 'info ""; info "Caught exit — running teardown..."; teardown' EXIT
  fi

  # Initialize tracking vars
  SERVER_ID=""
  SERVER_IP=""
  SSH_KEY_ID=""
  ZONE_ID=""
  DNS_RECORD_IDS=()

  step_upload_ssh_key
  step_create_server
  step_wait_ssh
  step_create_dns
  step_wait_dns
  step_prepare_and_upload
  step_provision
  step_verify
  step_test_idempotency

  info ""
  info "================================================================"
  if [[ "$MODE" == "auto-teardown" ]]; then
    info "Lifecycle complete — teardown will run on exit"
  else
    info "Server provisioned — services prepared (not yet deployed)"
    info ""
    info "  Server IP:  ${SERVER_IP}"
    info "  SSH:        ssh -i ${SSH_KEY_PATH} root@${SERVER_IP}"
    info ""
    info "  Dokploy:    https://dokploy.${TEST_DOMAIN}  (running)"
    info "  Coder:      prepared — deploy via post-setup"
    info "  VK Remote:  prepared — deploy via post-setup"
    info ""
    info "  State file: ${STATE_FILE}"
    info ""
    info "Next steps:"
    info "  1. Create Dokploy admin at https://dokploy.${TEST_DOMAIN}"
    info "  2. Generate API key: Settings > Profile"
    info "  3. Add to ${SECRETS_FILE}: DOKPLOY_API_KEY=<key>"
    info "  4. $0 --post-setup"
    info "  5. After Coder starts, create admin + generate CODER_TOKEN"
    info "  6. Add CODER_TOKEN to ${SECRETS_FILE} and re-run: $0 --post-setup"
    info ""
    info "To teardown later:"
    info "  $0 --teardown"
  fi
  info "================================================================"

  # If auto-teardown mode, the EXIT trap handles cleanup
}

main
