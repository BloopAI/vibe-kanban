#!/usr/bin/env bash
# setup.sh — configure a local self-hosted Vibe Kanban stack.
#
# Lives inside the repo at crates/remote/starter/, so the checkout you're
# running it from IS the Vibe Kanban it configures. Generates JWT + admin
# secrets, prompts for host ports + data dir, writes .env.remote at the
# repo root.
#
# Does NOT start docker — use `make start` for that.
#
# Flags:
#   -y, --yes    non-interactive; accept all defaults
#   -h, --help   this message

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VK_REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# ---- Flags -------------------------------------------------------------------
NONINTERACTIVE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes)    NONINTERACTIVE=1 ;;
    -h|--help)   sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^#[[:space:]]*//'; exit 0 ;;
    *)           echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

# ---- Defaults ----------------------------------------------------------------
DATA_DIR_DEFAULT="$HOME/vibe-kanban-data"
ADMIN_EMAIL_DEFAULT="admin@local"
# Default ports avoid low 3000s and 5433 because Windows / Hyper-V / WSL can
# reserve them at boot.
REMOTE_SERVER_PORT_DEFAULT="13000"
FRONTEND_PORT_DEFAULT="13333"
REMOTE_DB_PORT_DEFAULT="15433"

ask() {
  local prompt="$1" default="$2" var
  if [[ "$NONINTERACTIVE" == 1 ]]; then
    printf '%s\n' "$default"
    return
  fi
  read -rp "$prompt [$default]: " var
  printf '%s\n' "${var:-$default}"
}

env_value_or_default() {
  local path="$1" name="$2" default="$3"
  if [[ -f "$path" ]]; then
    grep "^${name}=" "$path" | tail -n 1 | cut -d= -f2- || printf '%s\n' "$default"
  else
    printf '%s\n' "$default"
  fi
}

upsert_env() {
  local path="$1" name="$2" value="$3"
  if grep -q "^${name}=" "$path"; then
    sed -i.bak "s|^${name}=.*|${name}=${value}|" "$path" && rm -f "$path.bak"
  else
    printf '%s=%s\n' "$name" "$value" >> "$path"
  fi
}

# ---- Prereqs -----------------------------------------------------------------
for cmd in docker git openssl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: '$cmd' is required but not installed" >&2
    exit 1
  fi
done
if ! docker info >/dev/null 2>&1; then
  echo "error: docker daemon is not running (start your Docker engine)" >&2
  exit 1
fi

# ---- Prompts -----------------------------------------------------------------
ENV_PATH="$VK_REPO_ROOT/.env.remote"

DATA_DIR_PREV="$(env_value_or_default "$ENV_PATH" SELFHOST_DATA_DIR "$DATA_DIR_DEFAULT")"
ADMIN_EMAIL_PREV="$(env_value_or_default "$ENV_PATH" SELF_HOST_LOCAL_AUTH_EMAIL "$ADMIN_EMAIL_DEFAULT")"
REMOTE_SERVER_PORT_PREV="$(env_value_or_default "$ENV_PATH" REMOTE_SERVER_PORT "$REMOTE_SERVER_PORT_DEFAULT")"
FRONTEND_PORT_PREV="$(env_value_or_default "$ENV_PATH" FRONTEND_PORT "$FRONTEND_PORT_DEFAULT")"
REMOTE_DB_PORT_PREV="$(env_value_or_default "$ENV_PATH" REMOTE_DB_PORT "$REMOTE_DB_PORT_DEFAULT")"

DATA_DIR="$(ask 'Persistent data dir' "$DATA_DIR_PREV")"
ADMIN_EMAIL="$(ask 'Admin email' "$ADMIN_EMAIL_PREV")"
REMOTE_SERVER_PORT="$(ask 'Backend host port' "$REMOTE_SERVER_PORT_PREV")"
FRONTEND_PORT="$(ask 'Frontend host port' "$FRONTEND_PORT_PREV")"
REMOTE_DB_PORT="$(ask 'Postgres host port' "$REMOTE_DB_PORT_PREV")"

# ---- Write .env.remote -------------------------------------------------------
if [[ -f "$ENV_PATH" ]]; then
  echo "[1/3] $ENV_PATH exists — preserving secrets, updating ports/dirs"
  ADMIN_PASSWORD=$(grep '^SELF_HOST_LOCAL_AUTH_PASSWORD=' "$ENV_PATH" | cut -d= -f2- || echo "<existing>")
  upsert_env "$ENV_PATH" SELFHOST_DATA_DIR "$DATA_DIR"
  upsert_env "$ENV_PATH" SELF_HOST_LOCAL_AUTH_EMAIL "$ADMIN_EMAIL"
  upsert_env "$ENV_PATH" REMOTE_SERVER_PORT "$REMOTE_SERVER_PORT"
  upsert_env "$ENV_PATH" FRONTEND_PORT "$FRONTEND_PORT"
  upsert_env "$ENV_PATH" REMOTE_DB_PORT "$REMOTE_DB_PORT"
  upsert_env "$ENV_PATH" PUBLIC_BASE_URL "http://localhost:$REMOTE_SERVER_PORT"
else
  JWT_SECRET="$(openssl rand -base64 48)"
  ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 24)"
  sed \
    -e "s|__JWT_SECRET__|$JWT_SECRET|" \
    -e "s|__REMOTE_SERVER_PORT__|$REMOTE_SERVER_PORT|" \
    -e "s|__FRONTEND_PORT__|$FRONTEND_PORT|" \
    -e "s|__REMOTE_DB_PORT__|$REMOTE_DB_PORT|" \
    -e "s|__ADMIN_EMAIL__|$ADMIN_EMAIL|" \
    -e "s|__ADMIN_PASSWORD__|$ADMIN_PASSWORD|" \
    -e "s|__DATA_DIR__|$DATA_DIR|" \
    "$SCRIPT_DIR/env.remote.template" > "$ENV_PATH"
  chmod 600 "$ENV_PATH"
  echo "[1/3] wrote $ENV_PATH"
fi

# ---- Create data dirs --------------------------------------------------------
mkdir -p "$DATA_DIR/postgres" "$DATA_DIR/electric"
echo "[2/3] ensured data dirs under $DATA_DIR"

# ---- Validate merged compose config -----------------------------------------
( cd "$VK_REPO_ROOT/crates/remote" && \
  docker compose \
    -f docker-compose.yml \
    -f "$SCRIPT_DIR/docker-compose.override.yml" \
    -f "$SCRIPT_DIR/docker-compose.ports.yml" \
    -f "$SCRIPT_DIR/docker-compose.no-ssh.yml" \
    --env-file "$ENV_PATH" \
    config >/dev/null )
echo "[3/3] docker compose config validated"

# ---- Next steps --------------------------------------------------------------
cat <<EOF

Setup complete.

  Start the stack:
    make start

  Backend/project-management UI: http://localhost:$REMOTE_SERVER_PORT
    email:    $ADMIN_EMAIL
    password: $ADMIN_PASSWORD
  (Both are in $ENV_PATH if you need them later.)

  Or launch the frontend app yourself:
    VK_SHARED_API_BASE=http://localhost:$REMOTE_SERVER_PORT \\
      PORT=$FRONTEND_PORT npx vibe-kanban@latest

  All ops:  make help
EOF
