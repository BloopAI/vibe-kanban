#!/bin/bash

set -e  # Exit on any error

# Detect platform and architecture
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map to platform directory names used by the CLI
case "$PLATFORM" in
    linux)
        case "$ARCH" in
            x86_64) PLATFORM_DIR="linux-x64" ;;
            aarch64) PLATFORM_DIR="linux-arm64" ;;
            *) echo "❌ Unsupported Linux architecture: $ARCH"; exit 1 ;;
        esac
        ;;
    darwin)
        case "$ARCH" in
            x86_64) PLATFORM_DIR="macos-x64" ;;
            arm64) PLATFORM_DIR="macos-arm64" ;;
            *) echo "❌ Unsupported macOS architecture: $ARCH"; exit 1 ;;
        esac
        ;;
    *)
        echo "❌ Unsupported platform: $PLATFORM"
        exit 1
        ;;
esac

echo "🔍 Detected platform: $PLATFORM_DIR"

echo "🧹 Cleaning previous builds..."
rm -rf npx-cli/dist
mkdir -p "npx-cli/dist/$PLATFORM_DIR"

echo "🔨 Building frontend..."
(cd frontend && npm run build)

echo "🔨 Building Rust binaries..."
SQLX_OFFLINE=true cargo build --release --manifest-path backend/Cargo.toml
SQLX_OFFLINE=true cargo build --release --bin mcp_task_server --manifest-path backend/Cargo.toml

echo "📦 Creating distribution package..."

# Copy the main binary
cp target/release/automagik-forge automagik-forge
cp target/release/mcp_task_server automagik-forge-mcp

zip automagik-forge.zip automagik-forge
zip automagik-forge-mcp.zip automagik-forge-mcp

rm automagik-forge automagik-forge-mcp

mv automagik-forge.zip "npx-cli/dist/$PLATFORM_DIR/automagik-forge.zip"
mv automagik-forge-mcp.zip "npx-cli/dist/$PLATFORM_DIR/automagik-forge-mcp.zip"

echo "✅ NPM package ready for $PLATFORM_DIR!"
echo "📁 Files created:"
echo "   - npx-cli/dist/$PLATFORM_DIR/automagik-forge.zip"
echo "   - npx-cli/dist/$PLATFORM_DIR/automagik-forge-mcp.zip"
echo ""
echo "🚨 IMPORTANT: This script only builds for the current platform ($PLATFORM_DIR)."
echo "🚨           To support all platforms including macOS ARM64, use:"
echo "🚨           ./build-all-platforms.sh (for current platform only)"
echo "🚨           OR run the GitHub Actions pre-release workflow for all platforms."
