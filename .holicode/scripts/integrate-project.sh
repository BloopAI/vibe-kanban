#!/bin/bash
# Integrate HoliCode into existing project

set -e

echo "🔗 Integrating HoliCode into current project..."

# Check if we're in a project directory
if [ ! -d ".git" ]; then
    echo "⚠️  Not in a Git repository. Continue anyway? (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
fi

# Check if HoliCode already exists
if [ -d ".holicode" ]; then
    echo "⚠️  HoliCode already exists in this project. Overwrite? (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Integration cancelled."
        exit 0
    fi
    rm -rf .holicode
fi

# Create complete HoliCode structure
mkdir -p .holicode/{state,handoff/{active,templates,archive},tasks/{active,backlog,archive},analysis/{research,decisions,meeting-notes,scratch},docs-cache/{apis,frameworks,dependencies}}

# Create documentation structure
mkdir -p docs/decisions

# Create .gitignore entries for HoliCode
cat >> .gitignore << 'EOF'

# HoliCode - Never commit
.holicode/docs-cache/
.holicode/analysis/scratch/
EOF

# Create .clinerules directory structure (framework rules + config)
mkdir -p .clinerules/config
echo "✅ Created .clinerules/ directory (framework rules + config)"

# Create canonical agent discovery paths
mkdir -p .github/agents .github/skills
echo "✅ Created .github/agents/ and .github/skills/ (canonical agent paths)"

echo "✅ HoliCode integration complete!"
echo ""
echo "Next steps:"
echo "1. Initialize state: /state-init"
echo "2. Validate setup: /state-health-check"
echo "3. Start development: run the task-init skill"
