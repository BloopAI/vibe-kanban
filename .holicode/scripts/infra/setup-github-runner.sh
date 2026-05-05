#!/bin/bash
# Setup GitHub Actions self-hosted ARM64 runner on Dokploy host
#
# Usage:
#   1. Get registration token: gh api repos/holagence/holicode/actions/runners/registration-token --jq .token
#   2. Run on Dokploy host: GITHUB_RUNNER_TOKEN=<token> ./setup-github-runner.sh

set -e

# Configuration
RUNNER_VERSION="${RUNNER_VERSION:-2.321.0}"  # Update to latest from https://github.com/actions/runner/releases
REPO="${REPO:-holagence/holicode}"
RUNNER_NAME="${RUNNER_NAME:-dokploy-arm64}"
INSTALL_DIR="${INSTALL_DIR:-/opt/actions-runner}"

# Validate required environment
if [ -z "$GITHUB_RUNNER_TOKEN" ]; then
  echo "Error: GITHUB_RUNNER_TOKEN environment variable is required"
  echo "Get token with: gh api repos/${REPO}/actions/runners/registration-token --jq .token"
  exit 1
fi

# Create dedicated runner user (config.sh must NOT run as root)
RUNNER_USER="${RUNNER_USER:-runner}"
if ! id "$RUNNER_USER" &>/dev/null; then
  echo "Creating runner user: ${RUNNER_USER}"
  sudo useradd -m -s /bin/bash "$RUNNER_USER"
  echo "${RUNNER_USER} ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/"$RUNNER_USER" >/dev/null
fi

# Create installation directory owned by runner user
echo "Creating installation directory: ${INSTALL_DIR}"
sudo mkdir -p "${INSTALL_DIR}"
sudo chown -R "${RUNNER_USER}:${RUNNER_USER}" "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

# Download runner package
echo "Downloading GitHub Actions runner v${RUNNER_VERSION} for ARM64..."
sudo -u "$RUNNER_USER" curl -o actions-runner-linux-arm64.tar.gz -L \
  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz"

# Extract
echo "Extracting..."
sudo -u "$RUNNER_USER" tar xzf actions-runner-linux-arm64.tar.gz
rm actions-runner-linux-arm64.tar.gz

# Configure runner (MUST run as non-root user)
echo "Configuring runner..."
sudo -u "$RUNNER_USER" ./config.sh \
  --url "https://github.com/${REPO}" \
  --token "${GITHUB_RUNNER_TOKEN}" \
  --name "${RUNNER_NAME}" \
  --labels self-hosted,linux,arm64 \
  --work _work \
  --unattended \
  --replace

# Install and start as service (svc.sh install needs root, runs service as RUNNER_USER)
echo "Installing as systemd service..."
sudo ./svc.sh install "$RUNNER_USER"
sudo ./svc.sh start

# Verify status
echo ""
echo "Runner installed successfully (runs as ${RUNNER_USER})!"
sudo ./svc.sh status

echo ""
echo "Verify in GitHub: https://github.com/${REPO}/settings/actions/runners"
