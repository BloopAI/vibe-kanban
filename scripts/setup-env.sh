#!/bin/bash
# Vibe Kanban Environment Setup Script
# This script helps you quickly set up environment files from examples

set -e

echo "🚀 Vibe Kanban Environment Setup"
echo "================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to copy env file if it doesn't exist
setup_env_file() {
    local example_file=$1
    local target_file=$2
    local description=$3

    if [ -f "$target_file" ]; then
        echo -e "${YELLOW}⚠️  $description already exists - skipping${NC}"
        echo "   Location: $target_file"
    else
        if [ -f "$example_file" ]; then
            cp "$example_file" "$target_file"
            echo -e "${GREEN}✅ Created $description${NC}"
            echo "   Location: $target_file"
        else
            echo -e "${YELLOW}⚠️  Example file not found: $example_file${NC}"
        fi
    fi
    echo ""
}

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

cd "$PROJECT_ROOT"

echo "📁 Project root: $PROJECT_ROOT"
echo ""

# Setup root .env for backend
echo "🔧 Setting up backend environment..."
setup_env_file ".env.example" ".env" "Backend .env file"

# Setup frontend .env
echo "🎨 Setting up frontend environment..."
setup_env_file "frontend/.env.example" "frontend/.env" "Frontend .env file"

echo "================================="
echo -e "${GREEN}✨ Environment setup complete!${NC}"
echo ""
echo "ℹ️  Next steps:"
echo "   1. (Optional) Edit .env files to configure features:"
echo "      - Root .env: Backend build-time variables"
echo "      - frontend/.env: Frontend variables"
echo "   2. Run: pnpm run dev"
echo ""
echo "📖 For detailed configuration, see:"
echo "   - API_KEY_REQUIREMENTS.md"
echo "   - README.md"
echo ""
echo "💡 Remember: All environment variables are OPTIONAL!"
echo "   The app works perfectly without any configuration."
