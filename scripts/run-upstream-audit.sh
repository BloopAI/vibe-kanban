#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SUMMARY_PATH="docs/upstream-diff-latest.txt"
FULL_DIFF_PATH="docs/upstream-diff-full.patch"
LOG_PATH="docs/upstream-diff-fetch.log"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

mkdir -p docs

echo "# Upstream Diff Audit" > "$SUMMARY_PATH"
echo "Generated: $TIMESTAMP" >> "$SUMMARY_PATH"
echo >> "$SUMMARY_PATH"

{
  echo "# Upstream Diff Audit Fetch Log"
  echo "Generated: $TIMESTAMP"
  echo
} > "$LOG_PATH"

echo "Fetching remotes..." | tee -a "$LOG_PATH"

if git fetch upstream 2>&1 | tee -a "$LOG_PATH"; then
  echo >> "$LOG_PATH"
else
  echo "ERROR: git fetch upstream failed. See $LOG_PATH for details." | tee -a "$SUMMARY_PATH"
  exit 1
fi

if git fetch origin 2>&1 | tee -a "$LOG_PATH"; then
  echo >> "$LOG_PATH"
else
  echo "ERROR: git fetch origin failed. See $LOG_PATH for details." | tee -a "$SUMMARY_PATH"
  exit 1
fi

echo "Using refs upstream/main and origin/main" >> "$SUMMARY_PATH"
echo >> "$SUMMARY_PATH"

echo "## Diff Stat" >> "$SUMMARY_PATH"
if git diff upstream/main...origin/main --stat >> "$SUMMARY_PATH"; then
  echo >> "$SUMMARY_PATH"
else
  echo "ERROR: git diff --stat failed." >> "$SUMMARY_PATH"
  exit 1
fi

echo "## Name-Status" >> "$SUMMARY_PATH"
if git diff upstream/main...origin/main --name-status >> "$SUMMARY_PATH"; then
  echo >> "$SUMMARY_PATH"
else
  echo "ERROR: git diff --name-status failed." >> "$SUMMARY_PATH"
  exit 1
fi

echo "Writing full diff to $FULL_DIFF_PATH" | tee -a "$LOG_PATH"
if git diff upstream/main...origin/main > "$FULL_DIFF_PATH"; then
  echo "Full diff written to $FULL_DIFF_PATH" | tee -a "$LOG_PATH"
else
  echo "ERROR: git diff full output failed." | tee -a "$SUMMARY_PATH"
  exit 1
fi

echo "Audit complete." | tee -a "$LOG_PATH"

echo "### Output Files" >> "$SUMMARY_PATH"
echo "- Diff summary: $SUMMARY_PATH" >> "$SUMMARY_PATH"
echo "- Full diff: $FULL_DIFF_PATH" >> "$SUMMARY_PATH"
echo "- Fetch log: $LOG_PATH" >> "$SUMMARY_PATH"
echo >> "$SUMMARY_PATH"

echo "Done. Summary written to $SUMMARY_PATH"
