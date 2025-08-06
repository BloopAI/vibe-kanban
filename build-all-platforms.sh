#!/bin/bash

set -e  # Exit on any error

echo "🧹 Cleaning previous builds..."
rm -rf npx-cli/dist
mkdir -p npx-cli/dist

echo "🔨 Building frontend..."
(cd frontend && npm run build)

# Define platform matrix
declare -A platforms=(
  ["linux-x64"]="x86_64-unknown-linux-gnu"
  ["linux-arm64"]="aarch64-unknown-linux-gnu"
  ["windows-x64"]="x86_64-pc-windows-msvc"
  ["windows-arm64"]="aarch64-pc-windows-msvc"
  ["macos-x64"]="x86_64-apple-darwin"
  ["macos-arm64"]="aarch64-apple-darwin"
)

# Get current platform for determining what we can actually build
CURRENT_PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
CURRENT_ARCH=$(uname -m)

case "$CURRENT_PLATFORM" in
    linux)
        case "$CURRENT_ARCH" in
            x86_64) CURRENT_PLATFORM_DIR="linux-x64" ;;
            aarch64) CURRENT_PLATFORM_DIR="linux-arm64" ;;
            *) echo "❌ Unsupported Linux architecture: $CURRENT_ARCH"; exit 1 ;;
        esac
        ;;
    darwin)
        case "$CURRENT_ARCH" in
            x86_64) CURRENT_PLATFORM_DIR="macos-x64" ;;
            arm64) CURRENT_PLATFORM_DIR="macos-arm64" ;;
            *) echo "❌ Unsupported macOS architecture: $CURRENT_ARCH"; exit 1 ;;
        esac
        ;;
    *)
        echo "❌ Unsupported platform: $CURRENT_PLATFORM"
        exit 1
        ;;
esac

echo "🔍 Detected current platform: $CURRENT_PLATFORM_DIR"
echo "⚠️  Note: This script can only build for the current platform."
echo "⚠️  For cross-platform builds, use the GitHub Actions workflow."
echo ""

# Build for current platform only
PLATFORM_DIR=$CURRENT_PLATFORM_DIR
TARGET=${platforms[$PLATFORM_DIR]}

if [ -z "$TARGET" ]; then
    echo "❌ Target not found for platform: $PLATFORM_DIR"
    exit 1
fi

echo "🔨 Building Rust binaries for $PLATFORM_DIR ($TARGET)..."
cargo build --release --target "$TARGET" --manifest-path backend/Cargo.toml
cargo build --release --target "$TARGET" --bin mcp_task_server --manifest-path backend/Cargo.toml

echo "📦 Creating distribution package for $PLATFORM_DIR..."
mkdir -p "npx-cli/dist/$PLATFORM_DIR"

# Determine binary extensions
if [[ "$PLATFORM_DIR" == windows-* ]]; then
    MAIN_BINARY="automagik-forge.exe"
    MCP_BINARY="automagik-forge-mcp.exe"
    MAIN_BINARY_PATH="target/$TARGET/release/automagik-forge.exe"
    MCP_BINARY_PATH="target/$TARGET/release/mcp_task_server.exe"
else
    MAIN_BINARY="automagik-forge"
    MCP_BINARY="automagik-forge-mcp"
    MAIN_BINARY_PATH="target/$TARGET/release/automagik-forge"
    MCP_BINARY_PATH="target/$TARGET/release/mcp_task_server"
fi

# Copy and zip binaries
cp "$MAIN_BINARY_PATH" "$MAIN_BINARY"
cp "$MCP_BINARY_PATH" "$MCP_BINARY"

node scripts/zip-helper.js "automagik-forge.zip" "$MAIN_BINARY"
node scripts/zip-helper.js "automagik-forge-mcp.zip" "$MCP_BINARY"

rm "$MAIN_BINARY" "$MCP_BINARY"

mv "automagik-forge.zip" "npx-cli/dist/$PLATFORM_DIR/"
mv "automagik-forge-mcp.zip" "npx-cli/dist/$PLATFORM_DIR/"

echo "✅ Platform package ready for $PLATFORM_DIR!"
echo "📁 Files created:"
echo "   - npx-cli/dist/$PLATFORM_DIR/automagik-forge.zip"
echo "   - npx-cli/dist/$PLATFORM_DIR/automagik-forge-mcp.zip"
echo ""
echo "🚨 IMPORTANT: To support all platforms (including macOS ARM64),"
echo "🚨           run the GitHub Actions pre-release workflow instead."
echo "🚨           This local build only supports your current platform."