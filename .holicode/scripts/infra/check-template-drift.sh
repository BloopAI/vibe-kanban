#!/usr/bin/env bash
# check-template-drift.sh — Verify ARM and x86 Coder templates stay in sync.
#
# main.tf must be IDENTICAL between both templates. Architecture-specific values
# live in terraform.tfvars; the Docker provider lives in provider.tf.
#
# The expected-diff.baseline should be empty (no diff expected). It exists so
# any future intentional divergence can be explicitly recorded rather than silently accepted.
#
# Usage:
#   ./scripts/infra/check-template-drift.sh          # exits 0 if clean, 1 if drift found
#   ./scripts/infra/check-template-drift.sh --update  # record current diff as new baseline

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARM_FILE="$SCRIPT_DIR/coder-template/main.tf"
X86_FILE="$SCRIPT_DIR/coder-template-x86/main.tf"
BASELINE_FILE="$SCRIPT_DIR/coder-template-x86/expected-diff.baseline"

if [ ! -f "$ARM_FILE" ]; then
  echo "ERROR: ARM template not found at $ARM_FILE"
  exit 1
fi

if [ ! -f "$X86_FILE" ]; then
  echo "ERROR: x86 template not found at $X86_FILE"
  exit 1
fi

# Also verify variables.tf is identical (both should be in sync)
ARM_VARS="$SCRIPT_DIR/coder-template/variables.tf"
X86_VARS="$SCRIPT_DIR/coder-template-x86/variables.tf"
if ! diff -q "$ARM_VARS" "$X86_VARS" > /dev/null 2>&1; then
  echo "DRIFT DETECTED: variables.tf files differ between ARM and x86 templates"
  diff "$ARM_VARS" "$X86_VARS" || true
  exit 1
fi

CURRENT_DIFF=$(diff "$ARM_FILE" "$X86_FILE" 2>/dev/null || true)

if [ "${1:-}" = "--update" ]; then
  echo "$CURRENT_DIFF" > "$BASELINE_FILE"
  echo "Baseline updated at $BASELINE_FILE"
  exit 0
fi

if [ ! -f "$BASELINE_FILE" ]; then
  echo "ERROR: No baseline file found at $BASELINE_FILE"
  echo "Run with --update to generate it: $0 --update"
  exit 1
fi

BASELINE_DIFF=$(cat "$BASELINE_FILE")

if [ "$CURRENT_DIFF" = "$BASELINE_DIFF" ]; then
  if [ -z "$CURRENT_DIFF" ]; then
    echo "OK: main.tf files are identical"
  else
    echo "OK: main.tf diff matches recorded baseline"
  fi
  exit 0
else
  echo "DRIFT DETECTED: main.tf files have diverged from baseline"
  echo ""
  echo "Expected diff (baseline) vs actual diff:"
  echo "==========================================="
  diff <(echo "$BASELINE_DIFF") <(echo "$CURRENT_DIFF") || true
  echo "==========================================="
  echo ""
  echo "To fix:"
  echo "  1. Port the change to the other template's main.tf"
  echo "  2. Architecture-specific values belong in terraform.tfvars, not main.tf"
  echo "  3. Run '$0 --update' only to explicitly record an intentional divergence"
  exit 1
fi
