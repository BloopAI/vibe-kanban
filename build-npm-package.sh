#!/bin/bash

set -e  # Exit on any error

echo "🧹 Cleaning previous builds..."
rm -rf npx-cli/dist
mkdir -p npx-cli/dist/macos-arm64

echo "🔨 Building frontend..."
(cd frontend && npm run build)

echo "🔨 Building Rust binaries..."
cargo build --release --manifest-path Cargo.toml
# cargo build --release --bin mcp_task_server --manifest-path Cargo.toml

echo "📦 Creating distribution package..."

# Copy the main binary
cp target/release/server vibe-kanban
# cp target/release/mcp_task_server vibe-kanban-mcp

zip vibe-kanban.zip vibe-kanban
# zip vibe-kanban-mcp.zip vibe-kanban-mcp

rm vibe-kanban #vibe-kanban-mcp

mv vibe-kanban.zip npx-cli/dist/macos-arm64/vibe-kanban.zip
# mv vibe-kanban-mcp.zip npx-cli/dist/macos-arm64/vibe-kanban-mcp.zip

echo "✅ NPM package ready!"
echo "📁 Files created:"
echo "   - npx-cli/dist/macos-arm64/vibe-kanban.zip"
# echo "   - npx-cli/dist/macos-arm64/vibe-kanban-mcp.zip"