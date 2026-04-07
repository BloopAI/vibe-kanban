#!/bin/bash
set -e

REMOTE_IMAGE="ghcr.io/harryy2510/vibe-kanban-remote:latest"
RELAY_IMAGE="ghcr.io/harryy2510/vibe-kanban-relay:latest"
VITE_RELAY_API_BASE_URL="${VITE_RELAY_API_BASE_URL:-https://relay-vibe.hariom.cc}"

git fetch origin main
git pull origin main

echo "Building remote server image..."
docker build \
  --build-arg VITE_RELAY_API_BASE_URL="$VITE_RELAY_API_BASE_URL" \
  -t "$REMOTE_IMAGE" \
  -f crates/remote/Dockerfile .

echo "Building relay server image..."
docker build \
  -t "$RELAY_IMAGE" \
  -f crates/relay-tunnel/Dockerfile .

echo "Pushing remote server image..."
docker push "$REMOTE_IMAGE"

echo "Pushing relay server image..."
docker push "$RELAY_IMAGE"

echo "Done! Redeploy from Dokploy."
