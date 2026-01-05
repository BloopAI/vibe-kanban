# Vibe Kanban Development Makefile
# Starts frontend and backend services in background

FRONTEND_PORT ?= 3000
BACKEND_PORT ?= 3003
LOG_DIR = .logs

# Turso feature flag - DISABLED by default for local-first stability
# To enable Turso sync: make TURSO_ENABLED=1 start
TURSO_ENABLED ?=
CARGO_FEATURES := $(if $(TURSO_ENABLED),--features turso,)

.PHONY: all start stop restart status frontend backend logs clean help

# Default target
all: start

# Create log directory
$(LOG_DIR):
	@mkdir -p $(LOG_DIR)

# Start both frontend and backend
start: $(LOG_DIR) backend frontend
	@echo "Services started!"
	@echo "  Frontend: http://localhost:$(FRONTEND_PORT)"
	@echo "  Backend:  http://localhost:$(BACKEND_PORT)"
	@echo ""
	@echo "Use 'make logs' to view logs"
	@echo "Use 'make stop' to stop services"

# Load .env.local if it exists
-include .env.local
export

# Start backend in background
backend: $(LOG_DIR)
	@if lsof -i :$(BACKEND_PORT) > /dev/null 2>&1; then \
		echo "Backend already running on port $(BACKEND_PORT)"; \
	else \
		echo "Starting backend on port $(BACKEND_PORT)..."; \
		echo "Using pure local SQLite (db.sqlite)"; \
		bash -c 'set -a; \
			[ -f .env ] && export $$(grep "^GITHUB_" .env | xargs); \
			set +a; \
			DISABLE_WORKTREE_ORPHAN_CLEANUP=1 RUST_LOG=info PORT=$(BACKEND_PORT) \
			nohup cargo run $(CARGO_FEATURES) --bin server > $(LOG_DIR)/backend.log 2>&1 &'; \
		echo "Backend starting..."; \
		sleep 3; \
	fi

# Start frontend in background
frontend: $(LOG_DIR)
	@if lsof -i :$(FRONTEND_PORT) > /dev/null 2>&1; then \
		echo "Frontend already running on port $(FRONTEND_PORT)"; \
	else \
		echo "Starting frontend on port $(FRONTEND_PORT)..."; \
		cd frontend && BACKEND_PORT=$(BACKEND_PORT) \
			nohup npm run dev -- --port $(FRONTEND_PORT) --host > ../$(LOG_DIR)/frontend.log 2>&1 & \
		echo "Frontend starting... (PID: $$!)"; \
		sleep 2; \
	fi

# Stop all services
stop:
	@echo "Stopping services..."
	@-lsof -ti :$(FRONTEND_PORT) | xargs kill -9 2>/dev/null || true
	@-lsof -ti :$(BACKEND_PORT) | xargs kill -9 2>/dev/null || true
	@echo "Services stopped."

# Restart services
restart: stop start

# Show status of services
status:
	@echo "Service Status:"
	@echo "---------------"
	@if lsof -i :$(FRONTEND_PORT) > /dev/null 2>&1; then \
		echo "Frontend (port $(FRONTEND_PORT)): RUNNING"; \
		lsof -i :$(FRONTEND_PORT) | grep LISTEN | head -1; \
	else \
		echo "Frontend (port $(FRONTEND_PORT)): STOPPED"; \
	fi
	@echo ""
	@if lsof -i :$(BACKEND_PORT) > /dev/null 2>&1; then \
		echo "Backend (port $(BACKEND_PORT)): RUNNING"; \
		lsof -i :$(BACKEND_PORT) | grep LISTEN | head -1; \
	else \
		echo "Backend (port $(BACKEND_PORT)): STOPPED"; \
	fi

# View logs (tail both)
logs:
	@echo "=== Backend Logs ===" && tail -50 $(LOG_DIR)/backend.log 2>/dev/null || echo "No backend logs"
	@echo ""
	@echo "=== Frontend Logs ===" && tail -50 $(LOG_DIR)/frontend.log 2>/dev/null || echo "No frontend logs"

# Follow logs in real-time
logs-follow:
	@tail -f $(LOG_DIR)/backend.log $(LOG_DIR)/frontend.log

# Clean log files
clean:
	@rm -rf $(LOG_DIR)
	@echo "Logs cleaned."

# Sync local SQLite to Turso (push)
sync-to-turso:
	@echo "Syncing local db.sqlite to Turso..."
	@if [ -z "$(TURSO_DATABASE_URL)" ]; then \
		echo "Error: TURSO_DATABASE_URL not set. Run: source .env"; \
		exit 1; \
	fi
	@python3 ./mcp/turso_sync.py push

# Sync from Turso to local SQLite (pull)
sync-from-turso:
	@echo "Syncing from Turso to local db.sqlite..."
	@if [ -z "$(TURSO_DATABASE_URL)" ]; then \
		echo "Error: TURSO_DATABASE_URL not set. Run: source .env"; \
		exit 1; \
	fi
	@python3 ./mcp/turso_sync.py pull

# Check Turso sync status
sync-status:
	@python3 ./mcp/turso_sync.py status

# =============================================
# Per-Team Turso Sync (Multi-Tenant)
# =============================================
# Each team has its own .env.{slug} file with Turso credentials
# Example: .env.schild for team with slug "schild"

# Sync a specific team's database to/from Turso
# Usage: make sync-team TEAM=schild
sync-team:
ifndef TEAM
	@echo "Error: TEAM not specified"
	@echo "Usage: make sync-team TEAM=<team-slug>"
	@echo ""
	@echo "Available teams:"
	@sqlite3 dev_assets/registry.sqlite "SELECT slug, name FROM team_registry;" 2>/dev/null || echo "  No teams in registry"
	@exit 1
endif
	@echo "Syncing team: $(TEAM)"
	@if [ ! -f ".env.$(TEAM)" ]; then \
		echo "Error: .env.$(TEAM) not found"; \
		echo "Create .env.$(TEAM) with TURSO_DATABASE_URL and TURSO_AUTH_TOKEN"; \
		exit 1; \
	fi
	@echo "Loading config from .env.$(TEAM)..."
	@set -a && . ./.env.$(TEAM) && set +a && python3 ./mcp/turso_sync.py sync --team $(TEAM)

# Sync all teams that have Turso config
sync-all-teams:
	@echo "Syncing all teams with Turso config..."
	@for slug in $$(sqlite3 dev_assets/registry.sqlite "SELECT slug FROM team_registry;" 2>/dev/null); do \
		if [ -f ".env.$$slug" ]; then \
			echo "Syncing team: $$slug"; \
			set -a && . ./.env.$$slug && set +a && python3 ./mcp/turso_sync.py sync --team $$slug || true; \
		else \
			echo "Skipping $$slug (no .env.$$slug file)"; \
		fi; \
	done
	@echo "Done."

# Show sync status for all teams
team-sync-status:
	@echo "Team Sync Status"
	@echo "================"
	@echo ""
	@sqlite3 -header -column dev_assets/registry.sqlite \
		"SELECT slug, name, turso_db, COALESCE(last_synced_at, 'Never') as last_sync FROM team_registry;" 2>/dev/null \
		|| echo "No teams in registry"
	@echo ""
	@echo "Teams with Turso config (.env.{slug}):"
	@for slug in $$(sqlite3 dev_assets/registry.sqlite "SELECT slug FROM team_registry;" 2>/dev/null); do \
		if [ -f ".env.$$slug" ]; then \
			echo "  ✓ $$slug (.env.$$slug exists)"; \
		else \
			echo "  ✗ $$slug (no .env.$$slug)"; \
		fi; \
	done

# =============================================
# Production Deployment
# =============================================

# Deploy using local Docker build (faster than remote Depot builds)
deploy-local:
	@./scripts/deploy-local-build.sh

# Deploy with fresh build (no cache)
deploy-local-fresh:
	@./scripts/deploy-local-build.sh --no-cache

# Deploy using Fly.io remote builder (slower but no local Docker needed)
deploy-remote:
	@flyctl deploy --wait-timeout=1200

# Check deployment status
deploy-status:
	@flyctl status
	@echo ""
	@flyctl releases -n 5

# View production logs
deploy-logs:
	@flyctl logs

# Help
help:
	@echo "Vibe Kanban Development Commands"
	@echo "================================="
	@echo ""
	@echo "  make start      - Start frontend and backend (local SQLite)"
	@echo "  make stop       - Stop all services"
	@echo "  make restart    - Restart all services"
	@echo "  make status     - Show service status"
	@echo "  make frontend   - Start only frontend"
	@echo "  make backend    - Start only backend"
	@echo "  make logs       - View recent logs"
	@echo "  make logs-follow - Follow logs in real-time"
	@echo "  make clean      - Remove log files"
	@echo ""
	@echo "Database Sync (Local <-> Turso):"
	@echo "  make sync-to-turso      - Push local changes to Turso cloud"
	@echo "  make sync-from-turso    - Pull Turso changes to local"
	@echo "  make sync-status        - Check sync status"
	@echo ""
	@echo "Per-Team Turso Sync (Multi-Tenant):"
	@echo "  make sync-team TEAM=<slug> - Sync a specific team to Turso"
	@echo "  make sync-all-teams        - Sync all teams with Turso config"
	@echo "  make team-sync-status      - Show sync status for all teams"
	@echo ""
	@echo "Environment Variables:"
	@echo "  FRONTEND_PORT   - Frontend port (default: 3000)"
	@echo "  BACKEND_PORT    - Backend port (default: 3003)"
	@echo ""
	@echo "Production Deployment:"
	@echo "  make deploy-local        - Build locally & deploy to Fly.io (faster)"
	@echo "  make deploy-local-fresh  - Fresh build without cache"
	@echo "  make deploy-remote       - Use Fly.io remote builder (slower)"
	@echo "  make deploy-status       - Check deployment status"
	@echo "  make deploy-logs         - View production logs"
	@echo ""
	@echo "Architecture: Frontend -> Backend -> Local SQLite (db.sqlite)"
	@echo "              Sync to Turso via 'make sync-to-turso' or MCP"
	@echo ""
	@echo "Examples:"
	@echo "  make start                         # Start with defaults"
	@echo "  make deploy-local                  # Deploy to Fly.io"
	@echo "  BACKEND_PORT=4000 make start       # Custom backend port"
