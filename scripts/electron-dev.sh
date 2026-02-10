#!/bin/bash
# One-command Electron dev launcher.
# Builds Rust binaries, copies them into electron/resources, and starts Electron.
#
# Usage:
#   pnpm run electron:dev:full          (from project root)
#   ./scripts/electron-dev.sh           (directly)
#   ./scripts/electron-dev.sh --release (use release build, slower but matches prod)

set -e

# ─── Options ──────────────────────────────────────────────────────────────────

CARGO_PROFILE="debug"
CARGO_FLAG=""
for arg in "$@"; do
  case "$arg" in
    --release)
      CARGO_PROFILE="release"
      CARGO_FLAG="--release"
      ;;
  esac
done

# ─── Detect platform ─────────────────────────────────────────────────────────

ARCH=$(uname -m)
case "$ARCH" in
  x86_64)       ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
esac

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$OS" in
  darwin) OS="macos" ;;
  linux)  OS="linux" ;;
esac

PLATFORM="${OS}-${ARCH}"
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-target}"

echo ""
echo "==> Platform: ${PLATFORM} (${CARGO_PROFILE} build)"
echo ""

# ─── Build frontend assets (embedded into Rust server binary) ───────────────

echo "==> Building frontend assets..."
(cd frontend && pnpm run build)

# ─── Build Rust binaries ─────────────────────────────────────────────────────

echo "==> Building Rust binaries (${CARGO_PROFILE})..."
cargo build ${CARGO_FLAG} -p server -p review --bin server --bin mcp_task_server --bin review

# ─── Copy binaries ───────────────────────────────────────────────────────────

RESOURCE_DIR="electron/resources/bin/${PLATFORM}"
mkdir -p "${RESOURCE_DIR}"

cp "${CARGO_TARGET_DIR}/${CARGO_PROFILE}/server"           "${RESOURCE_DIR}/vibe-kanban"
cp "${CARGO_TARGET_DIR}/${CARGO_PROFILE}/mcp_task_server"  "${RESOURCE_DIR}/vibe-kanban-mcp"
cp "${CARGO_TARGET_DIR}/${CARGO_PROFILE}/review"           "${RESOURCE_DIR}/vibe-kanban-review"
chmod +x "${RESOURCE_DIR}/"*

echo "==> Binaries copied to ${RESOURCE_DIR}"

# ─── Install Electron deps (if needed) ───────────────────────────────────────

if [ ! -d "electron/node_modules" ]; then
  echo "==> Installing Electron dependencies..."
  (cd electron && pnpm install)
fi

# ─── Launch ───────────────────────────────────────────────────────────────────

echo ""
echo "==> Starting Electron..."
echo ""
cd electron && npx electron .
