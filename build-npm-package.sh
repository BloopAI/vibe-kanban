#!/bin/bash

set -e  # Exit on any error

echo "🧹 Cleaning previous builds..."
rm -rf npx-cli/dist
mkdir -p npx-cli/dist/app-darwin-arm64

echo "🔨 Building frontend..."
npm run frontend:build

echo "🔨 Building Rust binaries..."
cargo build --release --manifest-path backend/Cargo.toml
cargo build --release --bin mcp_task_server --manifest-path backend/Cargo.toml

echo "📦 Creating distribution package..."

# Copy the main binary
cp target/release/vibe-kanban vibe-kanban-binary

# Copy the MCP server binary
cp target/release/mcp_task_server npx-cli/dist/app-darwin-arm64/mcp-server

# The main binary expects frontend files to be at ../frontend/dist relative to its location
# So we need to create the right directory structure in the zip
mkdir -p package-temp/frontend
cp -r frontend/dist package-temp/frontend/
cp vibe-kanban-binary package-temp/vibe-kanban

echo "🗜️ Creating vibe-kanban.zip..."
cd package-temp
zip -r ../npx-cli/dist/app-darwin-arm64/vibe-kanban.zip .
cd ..

echo "🧹 Cleaning up temp files..."
rm -rf package-temp
rm vibe-kanban-binary

echo "✅ NPM package ready!"
echo "📁 Files created:"
echo "   - npx-cli/dist/app-darwin-arm64/vibe-kanban.zip"
echo "   - npx-cli/dist/app-darwin-arm64/mcp-server"