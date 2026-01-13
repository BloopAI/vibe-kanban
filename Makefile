.PHONY: dev dev-qa install check lint format test build clean

# Start development server (frontend + backend)
dev:
	pnpm run dev

# Start development server in QA mode
dev-qa:
	pnpm run dev:qa

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
