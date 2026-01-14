.PHONY: dev dev-qa install check lint format test build clean kill-dev

# Kill any existing dev server instances
kill-dev:
	@pkill -9 -f "target/debug/server" 2>/dev/null || true
	@pkill -9 -f "vite" 2>/dev/null || true
	@sleep 1

# Start development server (frontend + backend)
# Kills existing instances first to prevent multiple servers running
dev: kill-dev
	@./scripts/dev.sh

# Start development server in QA mode (uses cargo watch for hot reload)
dev-qa: kill-dev
	@bash -lc 'source "$$HOME/.cargo/env" && pnpm run dev'

# Install dependencies
install:
	pnpm i

# Run type checks (frontend + backend)
check:
	pnpm run check

# Run linting
lint:
	pnpm run lint

# Format code
format:
	pnpm run format

# Run Rust tests
test:
	cargo test --workspace

# Generate TypeScript types from Rust
types:
	pnpm run generate-types

# Prepare SQLx offline queries
prepare-db:
	pnpm run prepare-db

# Build NPX package
build:
	pnpm run build:npx

# Backend only (with watch)
backend:
	pnpm run backend:dev

# Frontend only
frontend:
	pnpm run frontend:dev
