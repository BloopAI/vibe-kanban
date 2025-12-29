#!/bin/bash
# Global script to start vibe-kanban from anywhere

VK_DIR="/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban"
PORT_FILE="${TMPDIR:-/tmp}vibe-kanban/vibe-kanban.port"
LOG_FILE="${TMPDIR:-/tmp}vibe-kanban/server.log"

# Check if already running
check_running() {
    if [ -f "$PORT_FILE" ]; then
        PORT=$(cat "$PORT_FILE")
        if curl -s "http://127.0.0.1:$PORT/api/projects" > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

case "${1:-start}" in
    start)
        if check_running; then
            PORT=$(cat "$PORT_FILE")
            echo "✅ Vibe Kanban already running on http://localhost:3000 (API: $PORT)"
            echo "   Open: open http://localhost:3000"
        else
            echo "🚀 Starting Vibe Kanban..."

            # Backup database first
            "$VK_DIR/scripts/backup-db.sh"

            # Start server in background
            mkdir -p "${TMPDIR:-/tmp}vibe-kanban"
            cd "$VK_DIR"
            nohup pnpm run dev > "$LOG_FILE" 2>&1 &

            # Wait for server to be ready
            echo -n "   Waiting for server"
            for i in {1..30}; do
                if check_running; then
                    echo ""
                    PORT=$(cat "$PORT_FILE")
                    echo "✅ Vibe Kanban started on http://localhost:3000 (API: $PORT)"
                    exit 0
                fi
                echo -n "."
                sleep 1
            done
            echo ""
            echo "❌ Timeout starting server. Check logs: $LOG_FILE"
            exit 1
        fi
        ;;
    stop)
        echo "🛑 Stopping Vibe Kanban..."
        pkill -f "vibe-kanban" 2>/dev/null
        pkill -f "cargo.*server" 2>/dev/null
        rm -f "$PORT_FILE"
        echo "✅ Stopped"
        ;;
    restart)
        "$0" stop
        sleep 2
        "$0" start
        ;;
    status)
        if check_running; then
            PORT=$(cat "$PORT_FILE")
            echo "✅ Vibe Kanban is running (API port: $PORT)"
            echo "   Frontend: http://localhost:3000"
            echo "   Backend:  http://127.0.0.1:$PORT"
        else
            echo "❌ Vibe Kanban is not running"
        fi
        ;;
    logs)
        tail -f "$LOG_FILE"
        ;;
    open)
        if check_running; then
            open "http://localhost:3000"
        else
            echo "❌ Server not running. Start with: vk start"
        fi
        ;;
    *)
        echo "Usage: vk {start|stop|restart|status|logs|open}"
        ;;
esac
