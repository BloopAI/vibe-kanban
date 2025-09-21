#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="$ROOT_DIR/dev_assets_seed/forge-snapshot/from_home"
SOURCE_DIR="${1:-$HOME/.automagik-forge}"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Source directory '$SOURCE_DIR' does not exist" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"

rsync -a --delete --exclude 'logs/' --exclude '*.lock' "$SOURCE_DIR/" "$DEST_DIR/"

cat <<MSG
Copied snapshot from '$SOURCE_DIR' into '$DEST_DIR'.
Sensitive data stays local; this directory is ignored by git.
MSG
