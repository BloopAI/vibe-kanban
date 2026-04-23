#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$ROOT_DIR/.vk-preview"
PID_FILE="$STATE_DIR/pid"
PORT_FILE="$STATE_DIR/port"
LOG_FILE="$STATE_DIR/preview.log"

HOST="${VK_PREVIEW_HOST:-127.0.0.1}"
BACKEND_PORT="${VK_PREVIEW_BACKEND_PORT:-4311}"
PORT_START="${VK_PREVIEW_PORT_START:-3002}"
REQUESTED_PORT="${VK_PREVIEW_PORT:-}"

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

preview_url() {
  local port="$1"
  echo "http://${HOST}:${port}"
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

  local existing_pid
  existing_pid="$(read_pid || true)"
  if is_running "$existing_pid"; then
    local existing_port="unknown"
    [[ -f "$PORT_FILE" ]] && existing_port="$(cat "$PORT_FILE")"
    echo "Lightweight preview is already running: $(preview_url "$existing_port")"
    echo "PID: ${existing_pid}"
    exit 0
  fi

  check_backend

  local port
  port="$(select_port)"

  : >"$LOG_FILE"
  cd "$ROOT_DIR"
  if command_exists setsid; then
    setsid env \
      VITE_OPEN=false \
      BROWSER=none \
      FRONTEND_PORT="$port" \
      BACKEND_PORT="$BACKEND_PORT" \
      pnpm --filter @vibe/local-web run dev -- \
      --host "$HOST" \
      --port "$port" \
      --strictPort >>"$LOG_FILE" 2>&1 &
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
  fi

  local pid="$!"
  echo "$pid" >"$PID_FILE"
  echo "$port" >"$PORT_FILE"

  if wait_for_preview "$port"; then
    echo "Vibe Kanban lightweight preview: $(preview_url "$port")"
    echo "PID: ${pid}"
    echo "Logs: ${LOG_FILE}"
  else
    stop_background >/dev/null 2>&1 || true
    tail -n 80 "$LOG_FILE" >&2 || true
    exit 1
  fi
}

stop_background() {
  local pid
  pid="$(read_pid || true)"

  if ! is_running "$pid"; then
    rm -f "$PID_FILE" "$PORT_FILE"
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
      rm -f "$PID_FILE" "$PORT_FILE"
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

  rm -f "$PID_FILE" "$PORT_FILE"
  echo "Stopped lightweight preview."
}

show_status() {
  local pid
  pid="$(read_pid || true)"

  if is_running "$pid"; then
    local port="unknown"
    [[ -f "$PORT_FILE" ]] && port="$(cat "$PORT_FILE")"
    echo "Lightweight preview is running: $(preview_url "$port")"
    echo "PID: ${pid}"
    echo "Logs: ${LOG_FILE}"
  else
    rm -f "$PID_FILE" "$PORT_FILE"
    echo "No lightweight preview is running."
  fi
}

show_logs() {
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
  VK_PREVIEW_HOST          Frontend bind host. Default: 127.0.0.1
EOF
    exit 2
    ;;
esac
