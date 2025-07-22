#!/bin/bash

# TDD Test Runner for Cloud CommandRunner
# This script starts the cloud-runner server, runs all tests, and cleans up

set -e  # Exit on any error

echo "🚀 Starting TDD Test Suite for Cloud CommandRunner"
echo "=================================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
    if [ ! -z "$SERVER_PID" ]; then
        echo "Stopping cloud-runner server (PID: $SERVER_PID)"
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ Cleanup complete${NC}"
}

# Set trap to cleanup on script exit
trap cleanup EXIT

echo -e "${BLUE}📦 Building binaries...${NC}"
cargo build --bin cloud-runner --bin test-remote

echo -e "\n${BLUE}🌥️  Starting cloud-runner server...${NC}"
# Start cloud-runner in background
cargo run --bin cloud-runner > cloud-runner.log 2>&1 &
SERVER_PID=$!

echo "Cloud-runner server started (PID: $SERVER_PID)"

# Wait for server to start
echo -e "${YELLOW}⏳ Waiting for server to be ready...${NC}"
sleep 3

# Test server health
echo -e "${BLUE}🏥 Testing server health...${NC}"
if curl -s http://localhost:8000/health > /dev/null; then
    echo -e "${GREEN}✅ Server is healthy and ready${NC}"
else
    echo -e "${RED}❌ Server health check failed${NC}"
    echo "Server logs:"
    cat cloud-runner.log
    exit 1
fi

echo -e "\n${BLUE}🧪 Running TDD tests...${NC}"
echo "=============================="

# Run the tests
if cargo run --bin test-remote; then
    echo -e "\n${GREEN}🎉 Test suite completed!${NC}"
    echo -e "${YELLOW}💡 Check the output above for which features need implementation${NC}"
else
    echo -e "\n${RED}❌ Test suite failed${NC}"
    echo "This might be expected if server endpoints aren't implemented yet"
fi

# Show server logs if there were any errors
if [ -s cloud-runner.log ]; then
    echo -e "\n${BLUE}📋 Server logs:${NC}"
    echo "=================="
    cat cloud-runner.log
fi

echo -e "\n${BLUE}📊 TDD Summary:${NC}"
echo "================"
echo "✅ Tests that pass: Basic functionality works"
echo "❌ Tests that fail: Features to implement next"
echo "⚠️  Expected behavior: Some failures are normal in TDD"
echo ""
echo "🔧 Next steps:"
echo "1. Implement missing server endpoints (/status, /stream)"
echo "2. Update client methods to use real API calls"
echo "3. Re-run tests to see progress: ./test.sh"
echo ""
echo -e "${GREEN}🚀 Ready for Test-Driven Development!${NC}"

# Cleanup will happen automatically due to trap