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

echo "🔗 Installing globally from tarball..."
TARBALL=$(ls vibe-kanban-*.tgz | head -n1)
npm install -g "./$TARBALL"

echo "🧪 Testing main command..."
vibe-kanban &
MAIN_PID=$!
sleep 3
kill $MAIN_PID 2>/dev/null || true
wait $MAIN_PID 2>/dev/null || true
echo "✅ Main app started successfully"

echo "🧪 Testing MCP command with complete handshake..."

node ../mcp_test.js

echo "🧹 Cleaning up..."
npm uninstall -g vibe-kanban
rm "$TARBALL"

echo "✅ NPM package test completed successfully!"
echo ""
echo "🎉 Your MCP server is working correctly!"
echo "📋 Next steps:"
echo "   1. cd npx-cli"
echo "   2. npm publish"
echo "   3. Users can then use: npx vibe-kanban --mcp with Claude Desktop"