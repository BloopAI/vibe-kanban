#!/bin/bash
# Pre-commit quality checks for automagik-forge
# Auto-detects tech stack and runs appropriate quality tools

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_ROOT"

echo "🔍 Running quality checks for automagik-forge..."

# Python projects
if [ -f "pyproject.toml" ] || [ -f "requirements.txt" ]; then
    echo "📝 Python project detected"
    if command -v uv >/dev/null 2>&1; then
        echo "🔧 Running ruff format..."
        uv run ruff format .
        echo "🔍 Running ruff check..."
        uv run ruff check --fix .
        echo "🎯 Running mypy..."
        uv run mypy . || echo "⚠️  MyPy warnings found"
    elif command -v ruff >/dev/null 2>&1; then
        ruff format .
        ruff check --fix .
    fi

# Node.js projects  
elif [ -f "package.json" ]; then
    echo "📦 Node.js project detected"
    if [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ] || [ -f "eslint.config.js" ]; then
        echo "🔍 Running ESLint..."
        npx eslint . --fix || echo "⚠️  ESLint warnings found"
    fi
    if [ -f ".prettierrc" ] || [ -f "prettier.config.js" ]; then
        echo "🎨 Running Prettier..."
        npx prettier --write .
    fi

# Rust projects
elif [ -f "Cargo.toml" ]; then
    echo "🦀 Rust project detected"
    echo "🔧 Running rustfmt..."
    cargo fmt
    echo "🔍 Running clippy..."
    cargo clippy --fix --allow-dirty --allow-staged || echo "⚠️  Clippy warnings found"

# Go projects
elif [ -f "go.mod" ]; then
    echo "🐹 Go project detected"
    echo "🔧 Running gofmt..."
    gofmt -w .
    echo "🔍 Running go vet..."
    go vet ./... || echo "⚠️  Go vet warnings found"
    if command -v golint >/dev/null 2>&1; then
        echo "🔍 Running golint..."
        golint ./... || echo "⚠️  Golint warnings found"
    fi

# Java projects
elif [ -f "pom.xml" ]; then
    echo "☕ Maven Java project detected"
    if [ -f "checkstyle.xml" ] || [ -f ".checkstyle.xml" ]; then
        echo "🔍 Running Checkstyle..."
        mvn checkstyle:check || echo "⚠️  Checkstyle warnings found"
    fi

elif [ -f "build.gradle" ] || [ -f "build.gradle.kts" ]; then
    echo "☕ Gradle Java project detected"
    echo "🔍 Running Gradle check..."
    ./gradlew check || echo "⚠️  Gradle check warnings found"

else
    echo "❓ No recognized project type - skipping quality checks"
fi

echo "✅ Quality checks completed for automagik-forge!"