#!/bin/bash
# Install HoliCode framework for user

set -e

HOLICODE_VERSION="v0.0.1"
INSTALL_DIR="$HOME/.holicode"
AGENTS_DIR="$HOME/.github/agents"   # Canonical path; agents symlink here
SKILLS_DIR="$HOME/.github/skills"   # Canonical path; skills symlink here
GLOBAL_RULES_DIR="$HOME/Documents/Cline/Rules"  # Adjust based on agent

echo "🚀 Installing HoliCode Framework ${HOLICODE_VERSION} for user..."

# Create directories
mkdir -p "$INSTALL_DIR" "$AGENTS_DIR" "$SKILLS_DIR" "$GLOBAL_RULES_DIR"

# Copy workflows (assuming we're in framework repo)
if [ -d "workflows" ]; then
    cp -r workflows/* "$AGENTS_DIR/"
    echo "✅ Workflows installed to $AGENTS_DIR"
else
    echo "❌ No workflows directory found. Are you in the framework repository?"
    exit 1
fi

# Copy skills
if [ -d "skills" ]; then
    cp -r skills/* "$SKILLS_DIR/"
    echo "✅ Skills installed to $SKILLS_DIR"
fi

# Copy templates (they go with workflows)
if [ -d "templates" ]; then
    cp -r templates "$AGENTS_DIR/"
    echo "✅ Templates installed to $AGENTS_DIR/templates"
fi

# Install global rules
if [ -f "holicode.md" ]; then
    cp holicode.md "$GLOBAL_RULES_DIR/"
    echo "✅ Global instructions installed to $GLOBAL_RULES_DIR/holicode.md"
fi

# Create environment setup
echo "export HOLICODE_WORKFLOWS_PATH=\"$AGENTS_DIR\"" >> "$HOME/.bashrc"

echo "✅ HoliCode Framework installed successfully!"
echo ""
echo "📝 Workflows available at: $AGENTS_DIR"
echo "📝 Skills available at: $SKILLS_DIR"
echo "📖 Global instructions at: $GLOBAL_RULES_DIR/holicode.md"
echo ""
echo "Next steps:"
echo "1. Restart your terminal or run: source ~/.bashrc"
echo "2. Initialize a project: /state-init"
echo "3. Test installation: /state-health-check"
