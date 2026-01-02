#!/bin/bash
# Wrapper script that ensures vibe-kanban backend is running before starting MCP

# macOS uses $TMPDIR (user-specific), Linux uses /tmp
if [ -n "$TMPDIR" ]; then
    TEMP_DIR="$TMPDIR"
else
    TEMP_DIR="/tmp"
fi

PORT_FILE="${TEMP_DIR}vibe-kanban/vibe-kanban.port"
LOG_FILE="${TEMP_DIR}vibe-kanban/backend.log"
MAX_WAIT=30

# Check if backend is already running by testing the port file
check_backend() {
    if [ -f "$PORT_FILE" ]; then
        PORT=$(cat "$PORT_FILE")
        if curl -s "http://127.0.0.1:$PORT/api/projects" > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

# Start backend if not running
if ! check_backend; then
    mkdir -p "${TEMP_DIR}vibe-kanban"

    # Start vibe-kanban in background
    nohup npx -y vibe-kanban@latest > "$LOG_FILE" 2>&1 &
    BACKEND_PID=$!

    # Wait for backend to be ready
    echo "Starting vibe-kanban backend..." >&2
    WAITED=0
    while [ $WAITED -lt $MAX_WAIT ]; do
        if check_backend; then
            echo "Backend ready on port $(cat $PORT_FILE)" >&2
            break
        fi
        sleep 1
        WAITED=$((WAITED + 1))
    done

    if [ $WAITED -ge $MAX_WAIT ]; then
        echo "Timeout waiting for backend to start. Check $LOG_FILE" >&2
        exit 1
    fi
fi

# Export the port for the MCP server
export BACKEND_PORT=$(cat "$PORT_FILE")
export PORT=$BACKEND_PORT
export VIBE_BACKEND_URL="http://127.0.0.1:$BACKEND_PORT"
echo "Using backend port: $BACKEND_PORT" >&2
echo "Using backend URL: $VIBE_BACKEND_URL" >&2

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Run the local MCP server binary if available, otherwise use npx
if [ -f "$PROJECT_DIR/target/debug/mcp_task_server" ]; then
    echo "Using local MCP server binary" >&2
    exec "$PROJECT_DIR/target/debug/mcp_task_server"
else
    echo "Using npx MCP server" >&2
    exec npx -y vibe-kanban@latest --mcp
fi
