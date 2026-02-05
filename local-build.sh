#!/bin/bash

set -e  # Exit on any error

# Detect OS and architecture
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

# Set API base URL for remote features
export VK_SHARED_API_BASE="https://api.vibekanban.com"
export VITE_VK_SHARED_API_BASE="https://api.vibekanban.com"

echo "🧹 Cleaning previous builds..."
rm -rf npx-cli/dist
mkdir -p npx-cli/dist/$PLATFORM

echo "🔨 Building frontend..."
(cd frontend && npm run build)

echo "🔨 Building Rust binaries..."
cargo build --release --manifest-path Cargo.toml
cargo build --release --bin mcp_task_server --manifest-path Cargo.toml

echo "📦 Creating distribution package..."

# Copy the main binary
cp ${CARGO_TARGET_DIR}/release/server vibe-kanban
zip -q vibe-kanban.zip vibe-kanban
rm -f vibe-kanban 
mv vibe-kanban.zip npx-cli/dist/$PLATFORM/vibe-kanban.zip

# Copy the MCP binary
cp ${CARGO_TARGET_DIR}/release/mcp_task_server vibe-kanban-mcp
zip -q vibe-kanban-mcp.zip vibe-kanban-mcp
rm -f vibe-kanban-mcp
mv vibe-kanban-mcp.zip npx-cli/dist/$PLATFORM/vibe-kanban-mcp.zip

# Copy the Review CLI binary
cp ${CARGO_TARGET_DIR}/release/review vibe-kanban-review
zip -q vibe-kanban-review.zip vibe-kanban-review
rm -f vibe-kanban-review
mv vibe-kanban-review.zip npx-cli/dist/$PLATFORM/vibe-kanban-review.zip

echo "✅ Build complete!"
echo "📁 Files created:"
echo "   - npx-cli/dist/$PLATFORM/vibe-kanban.zip"
echo "   - npx-cli/dist/$PLATFORM/vibe-kanban-mcp.zip"
echo "   - npx-cli/dist/$PLATFORM/vibe-kanban-review.zip"
echo ""
echo "🚀 To test locally, run:"
echo "   cd npx-cli && node bin/cli.js"
