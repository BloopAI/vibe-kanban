#!/bin/bash

set -e  # Exit on any error

# ─── Parse arguments ────────────────────────────────────────────────────────

SKIP_SIGN=0
for arg in "$@"; do
  case "$arg" in
    --skip-sign) SKIP_SIGN=1 ;;
    *)
      echo "⚠️  Unknown argument: $arg"
      echo "Usage: $0 [--skip-sign]"
      exit 1
      ;;
  esac
done

# ─── Detect OS and architecture ─────────────────────────────────────────────

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map architecture names
case "$ARCH" in
  x86_64)
    ARCH="x64"
    ;;
  arm64|aarch64)
    ARCH="arm64"
    ;;
  *)
    echo "⚠️  Warning: Unknown architecture $ARCH, using as-is"
    ;;
esac

# Map OS names
case "$OS" in
  linux)
    OS="linux"
    ;;
  darwin)
    OS="macos"
    ;;
  mingw*|msys*|cygwin*)
    OS="windows"
    ;;
  *)
    echo "⚠️  Warning: Unknown OS $OS, using as-is"
    ;;
esac

PLATFORM="${OS}-${ARCH}"

# Set CARGO_TARGET_DIR if not defined
if [ -z "$CARGO_TARGET_DIR" ]; then
  CARGO_TARGET_DIR="target"
fi

echo "🔍 Detected platform: $PLATFORM"
echo "🔧 Using target directory: $CARGO_TARGET_DIR"
if [ "$SKIP_SIGN" = "1" ]; then
  echo "🔓 Code signing disabled (--skip-sign)"
fi

# ─── Build frontend ─────────────────────────────────────────────────────────

echo ""
echo "🔨 Building frontend..."
(cd frontend && pnpm build)

# ─── Build Rust binaries ────────────────────────────────────────────────────

echo ""
echo "🔨 Building Rust binaries..."
cargo build --release --manifest-path Cargo.toml

# ─── Copy binaries to Electron resources ────────────────────────────────────

RESOURCE_DIR="electron/resources/bin/${PLATFORM}"

echo ""
echo "📦 Copying binaries to ${RESOURCE_DIR}..."
mkdir -p "${RESOURCE_DIR}"

# Determine binary extension
BIN_EXT=""
if [ "$OS" = "windows" ]; then
  BIN_EXT=".exe"
fi

# Main server binary
cp "${CARGO_TARGET_DIR}/release/server${BIN_EXT}" "${RESOURCE_DIR}/vibe-kanban${BIN_EXT}"

# MCP binary (bundled for editors, not spawned by Electron)
cp "${CARGO_TARGET_DIR}/release/mcp_task_server${BIN_EXT}" "${RESOURCE_DIR}/vibe-kanban-mcp${BIN_EXT}"

# Review CLI binary
cp "${CARGO_TARGET_DIR}/release/review${BIN_EXT}" "${RESOURCE_DIR}/vibe-kanban-review${BIN_EXT}"

# Ensure binaries are executable on Unix
if [ "$OS" != "windows" ]; then
  chmod +x "${RESOURCE_DIR}/vibe-kanban${BIN_EXT}"
  chmod +x "${RESOURCE_DIR}/vibe-kanban-mcp${BIN_EXT}"
  chmod +x "${RESOURCE_DIR}/vibe-kanban-review${BIN_EXT}"
fi

echo "   ✓ vibe-kanban${BIN_EXT}"
echo "   ✓ vibe-kanban-mcp${BIN_EXT}"
echo "   ✓ vibe-kanban-review${BIN_EXT}"

# ─── Install Electron dependencies ──────────────────────────────────────────

echo ""
echo "📦 Installing Electron dependencies..."
(cd electron && pnpm install)

# ─── Run electron-builder ───────────────────────────────────────────────────

echo ""
echo "🏗️  Running electron-builder..."

# Map OS to electron-builder platform flag
EB_PLATFORM=""
case "$OS" in
  macos)  EB_PLATFORM="--mac" ;;
  linux)  EB_PLATFORM="--linux" ;;
  windows) EB_PLATFORM="--win" ;;
esac

cd electron

if [ "$SKIP_SIGN" = "1" ]; then
  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --config electron-builder.yml ${EB_PLATFORM}
else
  npx electron-builder --config electron-builder.yml ${EB_PLATFORM}
fi

cd ..

# ─── Done ────────────────────────────────────────────────────────────────────

echo ""
echo "✅ Electron build complete!"
echo "📁 Output: electron/dist/"
echo ""
echo "🚀 To test the built app:"
case "$OS" in
  macos)
    echo "   open electron/dist/mac-${ARCH}/Vibe\\ Kanban.app"
    ;;
  linux)
    echo "   ./electron/dist/Vibe\\ Kanban*.AppImage"
    ;;
  windows)
    echo "   electron/dist/Vibe\\ Kanban\\ Setup*.exe"
    ;;
esac
