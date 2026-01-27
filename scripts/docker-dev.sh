#!/bin/bash
set -e

COMPOSE_FILE="docker-compose.dev.yml"
cd "$(dirname "$0")/.."

command="${1:-start}"

case "$command" in
  start)
    echo "Starting vibe-kanban development environment..."
    echo "Frontend: http://localhost:3000"
    echo "Backend:  http://localhost:3001"
    docker compose -f "$COMPOSE_FILE" up --build
    ;;
  preview)
    echo "Starting vibe-kanban in preview mode (bundled assets for fast remote access)..."
    echo "Frontend: http://localhost:3000"
    echo "Backend:  http://localhost:3001"
    VITE_MODE=preview docker compose -f "$COMPOSE_FILE" up --build
    ;;
  stop)
    docker compose -f "$COMPOSE_FILE" down
    ;;
  build)
    docker compose -f "$COMPOSE_FILE" build --no-cache
    ;;
  shell)
    docker compose -f "$COMPOSE_FILE" exec dev /bin/bash
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" logs -f
    ;;
  clean)
    docker compose -f "$COMPOSE_FILE" down -v
    docker volume rm vibe-kanban-dev-assets 2>/dev/null || true
    rm -rf .docker-cache
    ;;
  status)
    docker compose -f "$COMPOSE_FILE" ps
    ;;
  *)
    echo "Usage: ./scripts/docker-dev.sh [start|preview|stop|build|shell|logs|clean|status]"
    echo ""
    echo "Commands:"
    echo "  start   - Start dev server with HMR (local development)"
    echo "  preview - Start with bundled assets (fast for remote/network access)"
    echo "  stop    - Stop the containers"
    echo "  build   - Rebuild containers without cache"
    echo "  shell   - Open a shell in the container"
    echo "  logs    - Follow container logs"
    echo "  clean   - Remove containers and volumes"
    echo "  status  - Show container status"
    exit 1
    ;;
esac
