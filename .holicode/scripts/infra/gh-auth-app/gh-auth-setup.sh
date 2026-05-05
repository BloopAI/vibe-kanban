#!/bin/bash
# gh-auth-setup.sh — Authenticate gh CLI in a Coder workspace
#
# Strategy (in order of preference):
#   1. Already authenticated? → skip
#   2. Coder external auth available? → bridge token to gh CLI
#   3. GH_TOKEN env var set? → use it
#   4. Fall back to device flow (interactive)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== gh CLI Auth Setup ==="
echo ""

# 1. Check if already authenticated
if gh auth status >/dev/null 2>&1; then
  echo "Already authenticated:"
  gh auth status
  echo ""
  echo "Nothing to do."
  exit 0
fi

echo "gh CLI not authenticated. Trying auto-auth strategies..."
echo ""

# 2. Try Coder external auth bridge
if [ "${CODER:-}" = "true" ] && command -v coder >/dev/null 2>&1; then
  echo "Strategy 2: Coder external auth..."
  TOKEN=$(coder external-auth access-token github 2>/dev/null) || TOKEN=""

  # Exit code 0 means token, exit code 1 means URL (needs auth)
  if [ -n "$TOKEN" ] && ! echo "$TOKEN" | grep -q '^http'; then
    echo "  Got token from Coder external auth."
    echo "$TOKEN" | gh auth login --with-token 2>/dev/null && {
      echo "  Success! gh CLI authenticated via Coder external auth."
      gh auth status
      exit 0
    }
    echo "  gh auth login failed, trying next strategy..."
  else
    echo "  External auth not completed. URL: ${TOKEN:-unknown}"
    echo "  Skipping — try the web UI or complete Coder auth first."
  fi
  echo ""
fi

# 3. Try GH_TOKEN environment variable
if [ -n "${GH_TOKEN:-}" ]; then
  echo "Strategy 3: GH_TOKEN environment variable..."
  echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null && {
    echo "  Success! gh CLI authenticated via GH_TOKEN."
    gh auth status
    exit 0
  }
  echo "  gh auth login with GH_TOKEN failed."
  echo ""
fi

# 4. Device flow (interactive — requires user action)
echo "Strategy 4: Device flow (interactive)..."
echo ""

# Check if node and dependencies are available
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Cannot run device flow."
  echo "Please install Node.js or authenticate manually: gh auth login"
  exit 1
fi

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  cd "$SCRIPT_DIR" && npm install --silent
fi

echo "Starting device flow..."
node "$SCRIPT_DIR/device-flow.mjs"
