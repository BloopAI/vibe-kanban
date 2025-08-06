#!/bin/bash
# TDD Hook wrapper for automagik-forge
# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_ROOT"

# Detect package manager and run tests accordingly
if [ -f "pyproject.toml" ] || [ -f "requirements.txt" ]; then
    # Python project - use uv if available, otherwise pip
    if command -v uv >/dev/null 2>&1; then
        uv run python "$SCRIPT_DIR/tdd-validator.py"
    else
        python "$SCRIPT_DIR/tdd-validator.py"
    fi
elif [ -f "package.json" ]; then
    # Node.js project
    if [ -f "package-lock.json" ]; then
        npm test
    elif [ -f "yarn.lock" ]; then
        yarn test
    elif [ -f "pnpm-lock.yaml" ]; then
        pnpm test
    else
        npm test
    fi
elif [ -f "Cargo.toml" ]; then
    # Rust project
    cargo test
elif [ -f "go.mod" ]; then
    # Go project
    go test ./...
elif [ -f "pom.xml" ]; then
    # Maven Java project
    mvn test -q
elif [ -f "build.gradle" ] || [ -f "build.gradle.kts" ]; then
    # Gradle project
    ./gradlew test -q
else
    echo "✅ No test configuration detected - skipping TDD validation"
    exit 0
fi