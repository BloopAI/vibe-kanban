# Vibe Kanban Development Makefile
# Starts frontend and backend services in background

FRONTEND_PORT ?= 3000
BACKEND_PORT ?= 3003
LOG_DIR = .logs

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
		if [ -f .env.local ]; then set -a && . ./.env.local && set +a; fi && \
		DISABLE_WORKTREE_ORPHAN_CLEANUP=1 RUST_LOG=info PORT=$(BACKEND_PORT) \
			nohup cargo run --bin server > $(LOG_DIR)/backend.log 2>&1 & \
		echo "Backend starting... (PID: $$!)"; \
		sleep 2; \
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

# Help
help:
	@echo "Vibe Kanban Development Commands"
	@echo "================================="
	@echo ""
	@echo "  make start      - Start frontend and backend in background"
	@echo "  make stop       - Stop all services"
	@echo "  make restart    - Restart all services"
	@echo "  make status     - Show service status"
	@echo "  make frontend   - Start only frontend"
	@echo "  make backend    - Start only backend"
	@echo "  make logs       - View recent logs"
	@echo "  make logs-follow - Follow logs in real-time"
	@echo "  make clean      - Remove log files"
	@echo ""
	@echo "Environment Variables:"
	@echo "  FRONTEND_PORT   - Frontend port (default: 3000)"
	@echo "  BACKEND_PORT    - Backend port (default: 3003)"
	@echo ""
	@echo "Examples:"
	@echo "  make start                         # Start with defaults"
	@echo "  BACKEND_PORT=4000 make start       # Custom backend port"
