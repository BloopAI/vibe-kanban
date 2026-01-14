#!/bin/bash
# Development server startup script
# Ensures cargo is in PATH and starts both frontend and backend

set -e

# Source cargo environment
source "$HOME/.cargo/env" 2>/dev/null || true

# Get ports from setup script
export FRONTEND_PORT=$(node scripts/setup-dev-environment.js frontend)
export BACKEND_PORT=$(node scripts/setup-dev-environment.js backend)

echo "Starting dev server..."
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Backend: http://localhost:$BACKEND_PORT"

# Run both servers concurrently using npx
npx concurrently \
  "DISABLE_WORKTREE_ORPHAN_CLEANUP=1 RUST_LOG=info PORT=$BACKEND_PORT cargo run --bin server" \
  "cd frontend && BACKEND_PORT=$BACKEND_PORT npm run dev -- --port $FRONTEND_PORT --host"
