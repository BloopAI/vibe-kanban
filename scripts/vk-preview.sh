#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$ROOT_DIR/.vk-preview"
PID_FILE="$STATE_DIR/pid"
PORT_FILE="$STATE_DIR/port"
LOG_FILE="$STATE_DIR/preview.log"
UNIT_FILE="$STATE_DIR/unit"
TAILNET_PORT_FILE="$STATE_DIR/tailnet-port"

HOST="${VK_PREVIEW_HOST:-127.0.0.1}"
BACKEND_PORT="${VK_PREVIEW_BACKEND_PORT:-4311}"
PORT_START="${VK_PREVIEW_PORT_START:-3002}"
REQUESTED_PORT="${VK_PREVIEW_PORT:-}"
TAILNET_PORT_START="${VK_PREVIEW_TAILNET_PORT_START:-18446}"
REQUESTED_TAILNET_PORT="${VK_PREVIEW_TAILNET_PORT:-}"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

ensure_dependencies() {
  if ! command_exists pnpm; then
    echo "pnpm is required to run the lightweight preview." >&2
    exit 1
  fi

  if ! command_exists python3; then
    echo "python3 is required to allocate a preview port." >&2
    exit 1
  fi
}

is_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

read_pid() {
  if [[ -f "$PID_FILE" ]]; then
    cat "$PID_FILE"
  fi
}

read_unit() {
  if [[ -f "$UNIT_FILE" ]]; then
    cat "$UNIT_FILE"
  fi
}

read_port() {
  if [[ -f "$PORT_FILE" ]]; then
    cat "$PORT_FILE"
  fi
}

read_tailnet_port() {
  if [[ -f "$TAILNET_PORT_FILE" ]]; then
    cat "$TAILNET_PORT_FILE"
  fi
}

service_unit_name() {
  python3 - "$ROOT_DIR" <<'PY'
import hashlib
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1]).resolve()
slug = re.sub(r"[^a-z0-9]+", "-", root.name.lower()).strip("-") or "preview"
digest = hashlib.sha1(str(root).encode()).hexdigest()[:10]
print(f"vk-preview-{slug}-{digest}")
PY
}

tailscale_dns_name() {
  if ! command_exists tailscale; then
    return 1
  fi

  python3 - <<'PY'
import json
import subprocess
import sys

try:
    out = subprocess.check_output(
        ["tailscale", "status", "--json"],
        stderr=subprocess.DEVNULL,
        timeout=3,
        text=True,
    )
    data = json.loads(out)
    name = (data.get("Self") or {}).get("DNSName") or ""
    name = name.rstrip(".")
    if name:
        print(name)
        sys.exit(0)
except Exception:
    pass

sys.exit(1)
PY
}

preview_url() {
  local port="$1"
  local tailnet_port="${2:-}"

  if [[ -n "$tailnet_port" ]]; then
    local dns_name
    if dns_name="$(tailscale_dns_name)"; then
      echo "https://${dns_name}:${tailnet_port}/"
      return 0
    fi
  fi

  echo "http://${HOST}:${port}"
}

select_tailnet_port() {
  python3 - "$REQUESTED_TAILNET_PORT" "$TAILNET_PORT_START" <<'PY'
import socket
import sys

requested = sys.argv[1]
start = int(sys.argv[2])


def available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("0.0.0.0", port))
        except OSError:
            return False
    return True


if requested:
    port = int(requested)
    if available(port):
        print(port)
        sys.exit(0)
    print(f"Requested tailnet preview port {port} is already in use.", file=sys.stderr)
    sys.exit(1)

for port in range(start, start + 200):
    if available(port):
        print(port)
        sys.exit(0)

print(f"No free tailnet preview port found from {start} to {start + 199}.", file=sys.stderr)
sys.exit(1)
PY
}

tailnet_available() {
  if ! command_exists tailscale; then
    return 1
  fi

  tailscale status --json >/dev/null 2>&1
}

ensure_tailnet_route() {
  local port="$1"
  local tailnet_port="$2"

  if ! tailnet_available; then
    return 1
  fi

  tailscale serve --bg --https "$tailnet_port" "$port" >/dev/null
}

disable_tailnet_route() {
  local tailnet_port="$1"

  if [[ -z "$tailnet_port" ]] || ! tailnet_available; then
    return 0
  fi

  tailscale serve --bg --https "$tailnet_port" off >/dev/null 2>&1 || true
}

is_unit_active() {
  local unit="${1:-}"
  [[ -n "$unit" ]] && systemctl --user is-active --quiet "$unit"
}

stop_unit() {
  local unit="${1:-}"
  if [[ -n "$unit" ]]; then
    systemctl --user stop "$unit" >/dev/null 2>&1 || true
    systemctl --user reset-failed "$unit" >/dev/null 2>&1 || true
  fi
}

check_backend() {
  local url="http://127.0.0.1:${BACKEND_PORT}/api/info"

  if command_exists curl; then
    if curl --silent --fail --max-time 2 "$url" >/dev/null; then
      return 0
    fi
  else
    if python3 - "$url" <<'PY'
import sys
import urllib.request

try:
    with urllib.request.urlopen(sys.argv[1], timeout=2) as response:
        if 200 <= response.status < 500:
            sys.exit(0)
except Exception:
    pass

sys.exit(1)
PY
    then
      return 0
    fi
  fi

  cat >&2 <<EOF
No Vibe Kanban backend responded at ${url}.
Start the main local Vibe Kanban instance first, or set VK_PREVIEW_BACKEND_PORT.
EOF
  exit 1
}

select_port() {
  python3 - "$HOST" "$REQUESTED_PORT" "$PORT_START" <<'PY'
import socket
import sys

host = sys.argv[1]
requested = sys.argv[2]
start = int(sys.argv[3])


def available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


if requested:
    port = int(requested)
    if available(port):
        print(port)
        sys.exit(0)
    print(f"Requested preview port {port} is already in use.", file=sys.stderr)
    sys.exit(1)

for port in range(start, start + 200):
    if available(port):
        print(port)
        sys.exit(0)

print(f"No free preview port found from {start} to {start + 199}.", file=sys.stderr)
sys.exit(1)
PY
}

wait_for_preview() {
  local port="$1"
  python3 - "$HOST" "$port" <<'PY'
import sys
import time
import urllib.request

host = sys.argv[1]
port = sys.argv[2]
url = f"http://{host}:{port}/"
deadline = time.monotonic() + 25

while time.monotonic() < deadline:
    try:
        with urllib.request.urlopen(url, timeout=1) as response:
            if 200 <= response.status < 500:
                sys.exit(0)
    except Exception:
        time.sleep(0.5)

print(f"Preview did not become ready at {url}.", file=sys.stderr)
sys.exit(1)
PY
}

run_foreground() {
  ensure_dependencies
  check_backend

  local port
  port="$(select_port)"

  echo "Vibe Kanban lightweight preview: $(preview_url "$port")"
  echo "Proxying API and websocket traffic to http://127.0.0.1:${BACKEND_PORT}"

  cd "$ROOT_DIR"
  exec env \
    VITE_OPEN=false \
    BROWSER=none \
    FRONTEND_PORT="$port" \
    BACKEND_PORT="$BACKEND_PORT" \
    pnpm --filter @vibe/local-web run dev -- \
    --host "$HOST" \
    --port "$port" \
    --strictPort
}

start_background() {
  ensure_dependencies
  mkdir -p "$STATE_DIR"

  local existing_unit
  existing_unit="$(read_unit || true)"
  if is_unit_active "$existing_unit"; then
    local existing_port="unknown"
    local existing_tailnet_port=""
    [[ -f "$PORT_FILE" ]] && existing_port="$(cat "$PORT_FILE")"
    [[ -f "$TAILNET_PORT_FILE" ]] && existing_tailnet_port="$(cat "$TAILNET_PORT_FILE")"
    echo "Lightweight preview is already running: $(preview_url "$existing_port" "$existing_tailnet_port")"
    echo "Unit: ${existing_unit}"
    return 0
  fi

  local unit
  unit="$(service_unit_name)"
  echo "$unit" >"$UNIT_FILE"

  local existing_pid
  existing_pid="$(read_pid || true)"
  if is_running "$existing_pid"; then
    local existing_port="unknown"
    [[ -f "$PORT_FILE" ]] && existing_port="$(cat "$PORT_FILE")"
    echo "Lightweight preview is already running: $(preview_url "$existing_port")"
    echo "PID: ${existing_pid}"
    return 0
  fi

  check_backend

  local port
  port="$(select_port)"
  echo "$port" >"$PORT_FILE"

  local tailnet_port=""
  if tailnet_available; then
    tailnet_port="$(select_tailnet_port)"
    echo "$tailnet_port" >"$TAILNET_PORT_FILE"
  else
    rm -f "$TAILNET_PORT_FILE"
  fi

  : >"$LOG_FILE"
  cd "$ROOT_DIR"
  if command_exists systemd-run; then
    systemd-run \
      --user \
      --unit "$unit" \
      --same-dir \
      --working-directory="$ROOT_DIR" \
      --property=MemoryHigh=1500M \
      --property=MemoryMax=2G \
      --setenv=PATH="/usr/bin:/bin:/home/mcp/.local/bin" \
      --setenv=VITE_OPEN=false \
      --setenv=BROWSER=none \
      --setenv=FRONTEND_PORT="$port" \
      --setenv=BACKEND_PORT="$BACKEND_PORT" \
      /home/mcp/.local/bin/pnpm \
      --filter @vibe/local-web run dev -- \
      --host "$HOST" \
      --port "$port" \
      --strictPort >/dev/null
  elif command_exists setsid; then
    setsid env \
      VITE_OPEN=false \
      BROWSER=none \
      FRONTEND_PORT="$port" \
      BACKEND_PORT="$BACKEND_PORT" \
      pnpm --filter @vibe/local-web run dev -- \
      --host "$HOST" \
      --port "$port" \
      --strictPort >>"$LOG_FILE" 2>&1 &
    echo "$!" >"$PID_FILE"
  else
    env \
      VITE_OPEN=false \
      BROWSER=none \
      FRONTEND_PORT="$port" \
      BACKEND_PORT="$BACKEND_PORT" \
      pnpm --filter @vibe/local-web run dev -- \
      --host "$HOST" \
      --port "$port" \
      --strictPort >>"$LOG_FILE" 2>&1 &
    echo "$!" >"$PID_FILE"
  fi

  if wait_for_preview "$port"; then
    if [[ -n "$tailnet_port" ]]; then
      ensure_tailnet_route "$port" "$tailnet_port"
    fi
    echo "Vibe Kanban lightweight preview: $(preview_url "$port" "$tailnet_port")"
    if is_unit_active "$unit"; then
      echo "Unit: ${unit}"
      echo "Logs: journalctl --user -u ${unit}"
    else
      local pid
      pid="$(read_pid || true)"
      echo "PID: ${pid}"
      echo "Logs: ${LOG_FILE}"
    fi
  else
    stop_background >/dev/null 2>&1 || true
    if is_unit_active "$unit"; then
      journalctl --user -u "$unit" -n 80 --no-pager >&2 || true
    else
      tail -n 80 "$LOG_FILE" >&2 || true
    fi
    exit 1
  fi
}

stop_background() {
  local tailnet_port
  tailnet_port="$(read_tailnet_port || true)"
  disable_tailnet_route "$tailnet_port"

  local unit
  unit="$(read_unit || true)"
  if is_unit_active "$unit"; then
    stop_unit "$unit"
    rm -f "$PID_FILE" "$PORT_FILE" "$UNIT_FILE" "$TAILNET_PORT_FILE"
    echo "Stopped lightweight preview."
    return 0
  fi

  local pid
  pid="$(read_pid || true)"

  if ! is_running "$pid"; then
    rm -f "$PID_FILE" "$PORT_FILE" "$UNIT_FILE" "$TAILNET_PORT_FILE"
    echo "No lightweight preview is running."
    return 0
  fi

  if kill -0 -- "-$pid" >/dev/null 2>&1; then
    kill -- "-$pid" >/dev/null 2>&1 || true
  else
    kill "$pid" >/dev/null 2>&1 || true
  fi

  for _ in {1..25}; do
    if ! is_running "$pid"; then
      rm -f "$PID_FILE" "$PORT_FILE" "$UNIT_FILE" "$TAILNET_PORT_FILE"
      echo "Stopped lightweight preview."
      return 0
    fi
    sleep 0.2
  done

  if kill -0 -- "-$pid" >/dev/null 2>&1; then
    kill -9 -- "-$pid" >/dev/null 2>&1 || true
  else
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi

  rm -f "$PID_FILE" "$PORT_FILE" "$UNIT_FILE" "$TAILNET_PORT_FILE"
  echo "Stopped lightweight preview."
}

show_status() {
  local unit
  unit="$(read_unit || true)"
  local port
  port="$(read_port || true)"
  local tailnet_port
  tailnet_port="$(read_tailnet_port || true)"

  if is_unit_active "$unit"; then
    echo "Lightweight preview is running: $(preview_url "$port" "$tailnet_port")"
    echo "Unit: ${unit}"
    echo "Logs: journalctl --user -u ${unit}"
    return 0
  fi

  local pid
  pid="$(read_pid || true)"

  if is_running "$pid"; then
    [[ -n "$port" ]] || port="unknown"
    echo "Lightweight preview is running: $(preview_url "$port" "$tailnet_port")"
    echo "PID: ${pid}"
    echo "Logs: ${LOG_FILE}"
  else
    rm -f "$PID_FILE" "$PORT_FILE" "$UNIT_FILE" "$TAILNET_PORT_FILE"
    echo "No lightweight preview is running."
  fi
}

show_logs() {
  local unit
  unit="$(read_unit || true)"
  if is_unit_active "$unit"; then
    journalctl --user -u "$unit" -n "${VK_PREVIEW_LOG_LINES:-120}" --no-pager
    return 0
  fi

  if [[ ! -f "$LOG_FILE" ]]; then
    echo "No lightweight preview log exists yet."
    exit 0
  fi

  tail -n "${VK_PREVIEW_LOG_LINES:-120}" "$LOG_FILE"
}

case "${1:-start}" in
  run)
    run_foreground
    ;;
  start)
    start_background
    ;;
  restart)
    stop_background >/dev/null 2>&1 || true
    start_background
    ;;
  stop)
    stop_background
    ;;
  status)
    show_status
    ;;
  logs)
    show_logs
    ;;
  *)
    cat >&2 <<'EOF'
Usage: bash scripts/vk-preview.sh [run|start|restart|stop|status|logs]

Environment:
  VK_PREVIEW_BACKEND_PORT  Existing Vibe Kanban backend port. Default: 4311
  VK_PREVIEW_PORT          Exact frontend preview port to use.
  VK_PREVIEW_PORT_START    First frontend port to try. Default: 3002
  VK_PREVIEW_TAILNET_PORT  Exact Tailscale HTTPS port to expose.
  VK_PREVIEW_TAILNET_PORT_START  First Tailscale HTTPS port to try. Default: 18446
  VK_PREVIEW_HOST          Frontend bind host. Default: 127.0.0.1
EOF
    exit 2
    ;;
esac
