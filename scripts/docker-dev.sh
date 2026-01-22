#!/bin/bash
# Helper script for running the containerized development environment
# Usage: ./scripts/docker-dev.sh [command]
#
# Commands:
#   start   - Start the development container (default)
#   stop    - Stop the development container
#   build   - Rebuild the development image
#   shell   - Open a shell in the running container
#   logs    - Follow container logs
#   clean   - Stop container and remove volumes (fresh start)
#   status  - Show container status

set -e

COMPOSE_FILE="docker-compose.dev.yml"
CONTAINER_NAME="vibe-kanban-dev"

# Change to project root directory
cd "$(dirname "$0")/.."

command="${1:-start}"

case "$command" in
  start)
    echo "Starting vibe-kanban development environment..."
    echo "Frontend will be available at: http://localhost:3001"
    echo "Backend API will be available at: http://localhost:3000"
    echo ""
    docker compose -f "$COMPOSE_FILE" up --build
    ;;

  stop)
    echo "Stopping vibe-kanban development environment..."
    docker compose -f "$COMPOSE_FILE" down
    ;;

  build)
    echo "Rebuilding development image..."
    docker compose -f "$COMPOSE_FILE" build --no-cache
    ;;

  shell)
    echo "Opening shell in development container..."
    docker compose -f "$COMPOSE_FILE" exec dev /bin/bash
    ;;

  logs)
    echo "Following container logs..."
    docker compose -f "$COMPOSE_FILE" logs -f
    ;;

  clean)
    echo "Stopping container and removing volumes..."
    docker compose -f "$COMPOSE_FILE" down -v
    echo "Removing named volumes..."
    docker volume rm vibe-kanban-cargo-cache vibe-kanban-cargo-git vibe-kanban-target-cache \
      vibe-kanban-node-modules vibe-kanban-frontend-node-modules vibe-kanban-dev-assets 2>/dev/null || true
    echo "Clean complete. Run './scripts/docker-dev.sh start' for a fresh environment."
    ;;

  status)
    echo "Container status:"
    docker compose -f "$COMPOSE_FILE" ps
    ;;

  *)
    echo "Unknown command: $command"
    echo ""
    echo "Usage: ./scripts/docker-dev.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start   - Start the development container (default)"
    echo "  stop    - Stop the development container"
    echo "  build   - Rebuild the development image"
    echo "  shell   - Open a shell in the running container"
    echo "  logs    - Follow container logs"
    echo "  clean   - Stop container and remove volumes (fresh start)"
    echo "  status  - Show container status"
    exit 1
    ;;
esac
