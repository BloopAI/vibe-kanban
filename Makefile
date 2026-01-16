# Good Taste: explicit is better than implicit.
# Vibe Kanban Makefile

.PHONY: help install db dev backend frontend clean check

# Default target
help:
	@echo "Vibe Kanban Development"
	@echo "======================="
	@echo "Usage:"
	@echo "  make install    - Install dependencies (Rust & Node)"
	@echo "  make db         - Prepare SQLite database and migrations"
	@echo "  make dev        - Start BOTH Backend and Frontend (Recommended)"
	@echo "  make backend    - Start Backend only (cargo run)"
	@echo "  make frontend   - Start Frontend only (vite)"
	@echo "  make check      - Run type checks and linters"
	@echo "  make clean      - Clean build artifacts"

# 1. Installation
install:
	@echo "Installing Node dependencies..."
	@pnpm install
	@echo "Checking Rust toolchain..."
	@cargo --version
	@echo "Ensuring sqlx-cli is installed..."
	@which cargo-sqlx || cargo install sqlx-cli --no-default-features --features native-tls,sqlite

# 2. Database
db:
	@echo "Preparing Database..."
	@pnpm run prepare-db

# 3. Development (The Main Event)
# We delegate to the pnpm script because it handles dynamic port assignment nicely via setup-dev-environment.js
dev:
	@echo "Starting Development Environment..."
	@pnpm run dev

# 4. Granular Control
# Note: specific ports are hardcoded here for manual running ease, 
# typically backend=3001, frontend=3000
backend:
	@echo "Starting Backend (Port 3001)..."
	@export BACKEND_PORT=3001 && cargo run --bin server

frontend:
	@echo "Starting Frontend (Port 3000)..."
	@echo "Note: Ensure Backend is running on port 3001"
	@export FRONTEND_PORT=3000 && cd frontend && pnpm run dev --port 3000 --host

# 5. Maintenance
check:
	@pnpm run check

clean:
	@echo "Cleaning artifacts..."
	@rm -rf target
	@rm -rf frontend/node_modules
	@rm -rf node_modules
	@echo "Clean complete."
