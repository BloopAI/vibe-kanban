.PHONY: install dev build check test clean types

# Install all dependencies
install:
	pnpm i

# Run development server (backend + frontend)
dev:
	pnpm run dev

# Build everything from source (macOS)
build:
	./local-build.sh

# Run the locally built version
run:
	cd npx-cli && node bin/cli.js

# Check Rust code compiles
check:
	cargo check

# Build Rust in release mode
build-rust:
	cargo build --release

# Build frontend only
build-frontend:
	cd frontend && pnpm build

# Regenerate TypeScript types from Rust
types:
	cargo run --bin generate_types

# Run Rust tests
test:
	cargo test

# Clean build artifacts
clean:
	cargo clean
	rm -rf frontend/dist
	rm -rf npx-cli/bin/server

# Install Rust dev tools
setup-tools:
	cargo install cargo-watch
	cargo install sqlx-cli

# Watch and rebuild on changes
watch:
	cargo watch -x check

# Help
help:
	@echo "Available commands:"
	@echo "  make install        - Install all dependencies (pnpm)"
	@echo "  make dev            - Run development server"
	@echo "  make build          - Build from source (macOS)"
	@echo "  make run            - Run the locally built version"
	@echo "  make check          - Check Rust code compiles"
	@echo "  make build-rust     - Build Rust in release mode"
	@echo "  make build-frontend - Build frontend only"
	@echo "  make types          - Regenerate TypeScript types from Rust"
	@echo "  make test           - Run Rust tests"
	@echo "  make clean          - Clean build artifacts"
	@echo "  make setup-tools    - Install Rust dev tools"
	@echo "  make watch          - Watch and rebuild on changes"
