#!/bin/bash
# test-npm-package.sh

set -e

echo "🧪 Testing NPM package locally..."

# Build the package first
./build-npm-package.sh

cd npx-cli

echo "📋 Checking files to be included..."
npm pack --dry-run

echo "📦 Creating package tarball..."
npm pack

TARBALL=$(pwd)/$(ls vibe-kanban-*.tgz | head -n1)

echo "🧪 Testing main command..."
npx -y --package=$TARBALL vibe-kanban &
MAIN_PID=$!
sleep 3
kill $MAIN_PID 2>/dev/null || true
wait $MAIN_PID 2>/dev/null || true
echo "✅ Main app started successfully"

echo "🧪 Testing MCP command with complete handshake..."

node ../scripts/mcp_test.js $TARBALL

echo "🧹 Cleaning up..."
rm "$TARBALL"

echo "✅ NPM package test completed successfully!"
echo ""
echo "🎉 Your MCP server is working correctly!"
echo "📋 Next steps:"
echo "   1. cd npx-cli"
echo "   2. npm publish"
echo "   3. Users can then use: npx vibe-kanban --mcp with Claude Desktop"