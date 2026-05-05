#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: $0 [-s series] [-i iteration]

  -s SERIES     PoC series number (01–99). Env: \$SDD_POC_SERIES
  -i ITERATION  PoC iteration number (01–99). Env: \$SDD_POC_ITERATION
EOF
  exit 1
}

# 1) Hard-coded defaults
DEFAULT_SERIES="02"
DEFAULT_ITERATION="01"

# 2) Seed from env if set, else leave empty
SDD_POC_SERIES="${SDD_POC_SERIES:-}"
SDD_POC_ITERATION="${SDD_POC_ITERATION:-}"

# 3) Parse CLI args (highest precedence)
while getopts ":s:i:h" opt; do
  case "${opt}" in
    s) SDD_POC_SERIES="${OPTARG}" ;;
    i) SDD_POC_ITERATION="${OPTARG}" ;;
    h|*) usage ;;
  esac
done
shift $((OPTIND -1))

# 4) If still unset, prompt the user (showing default)
if [[ -z "$SDD_POC_SERIES" ]]; then
  read -p "Enter series [${DEFAULT_SERIES}]: " input_series
  SDD_POC_SERIES="${input_series:-$DEFAULT_SERIES}"
fi

if [[ -z "$SDD_POC_ITERATION" ]]; then
  read -p "Enter iteration [${DEFAULT_ITERATION}]: " input_iter
  SDD_POC_ITERATION="${input_iter:-$DEFAULT_ITERATION}"
fi

# 5) Validate numeric and range
for var_name in SDD_POC_SERIES SDD_POC_ITERATION; do
  val="${!var_name}"
  if ! [[ "$val" =~ ^[0-9]+$ ]] || (( val < 1 || val > 99 )); then
    echo "Error: $var_name must be an integer between 1 and 99 (got \"$val\")." >&2
    exit 1
  fi
done

# 6) Zero-pad to two digits
printf -v SDD_POC_SERIES    "%02d" "$SDD_POC_SERIES"
printf -v SDD_POC_ITERATION "%02d" "$SDD_POC_ITERATION"

# 7) Other defaults
HOLICODE_TEST_ROOT="${HOLICODE_TEST_ROOT:-/tmp/holicode-test}"

# 8) Build output path
sdd_poc_iteration_path=".holicode/analysis/scratch/sdd-poc-s${SDD_POC_SERIES}-i${SDD_POC_ITERATION}"
OUTPUT_DIR="$sdd_poc_iteration_path"

# 9) Summary
echo "Collecting data for SDD PoC Series: $SDD_POC_SERIES, Iteration: $SDD_POC_ITERATION"
echo "Output directory: $OUTPUT_DIR"
echo "HoliCode Test Root: $HOLICODE_TEST_ROOT"

# Create the target directory
mkdir -p "$OUTPUT_DIR/reports"

# Copy reports from the test execution environment
echo "Copying conversation reports..."
# Use shopt -s nullglob to handle cases where no files match the pattern, preventing errors
shopt -s nullglob
REPORT_FILES=("$HOLICODE_TEST_ROOT/.holicode/analysis/reports/"*.md)
if [ ${#REPORT_FILES[@]} -gt 0 ]; then
    cp -v "${REPORT_FILES[@]}" "$OUTPUT_DIR/reports/"
else
    echo "No reports found to copy."
fi
shopt -u nullglob # Turn off nullglob

# Collect .holicode/specs/ content
echo "Collecting .holicode/specs/ content..."
{
    find "$HOLICODE_TEST_ROOT/.holicode/specs/" -type f ! -path '*/.holicode/specs/SCHEMA.md' -print0 | while IFS= read -r -d $'\0' i; do
        echo "~~~~ $i ~~~~"
        cat "$i"
        echo
        echo
    done
} > "$OUTPUT_DIR/holicode-specs.txt" 2>&1 || echo "No specs found or an error occurred."

# Collect .holicode/state/ content
echo "Collecting .holicode/state/ content..."
{
    find "$HOLICODE_TEST_ROOT/.holicode/state/" -type f -print0 | while IFS= read -r -d $'\0' i; do
        echo "~~~~ $i ~~~~"
        cat "$i"
        echo
        echo
    done
} > "$OUTPUT_DIR/holicode-state.txt" 2>&1 || echo "No state files found or an error occurred."

# Collect codebase content (excluding hidden dirs and .holicode, .clinerules)
echo "Collecting codebase content..."

# Use find with proper exclusion syntax
find "$HOLICODE_TEST_ROOT" -type f \
    \( -path "*/.holicode/*" -o \
       -path "*/.clinerules/*" -o \
       -path "*/.github/agents/*" -o \
       -path "*/.github/skills/*" -o \
       -path "*/.git/*" -o \
       -path "*/.vscode/*" -o \
       -path "*/package-lock.json" -o \
       -path "*/node_modules/*" -o \
       -name ".*" \) -prune -o \
    -type f -print0 | while IFS= read -r -d $'\0' i; do
        echo "~~~~ $i ~~~~"
        cat "$i"
        echo
        echo
    done > "$OUTPUT_DIR/codebase.txt" 2>&1 || echo "No codebase files found or an error occurred."

echo "Data collection complete. Artifacts are in $OUTPUT_DIR"

# Export the iteration number for subsequent steps in the workflow
export sdd_poc_iteration_number="${SDD_POC_ITERATION}"
