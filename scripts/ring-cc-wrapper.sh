#!/usr/bin/env bash
set -euo pipefail

# Uses clang for ring (clang-cl rejects ring's build) and clang-cl elsewhere.
# See https://github.com/briansmith/ring/issues/2117

ring_cc="${RING_CC:-clang}"
default_cc="${DEFAULT_CC:-clang-cl}"

if [[ "${CARGO_PKG_NAME:-}" != "ring" && "${CARGO_MANIFEST_DIR:-}" != *"/ring-"* ]]; then
  exec "$default_cc" "$@"
fi

args=()
while (( $# )); do
  arg="$1"
  shift
  case "$arg" in
    /imsvc) [[ $# -gt 0 ]] && { args+=(-isystem "$1"); shift; } || args+=("$arg") ;;
    /imsvc*) args+=(-isystem "${arg#/imsvc}") ;;
    /I) [[ $# -gt 0 ]] && { args+=(-I "$1"); shift; } || args+=("$arg") ;;
    /I*) args+=(-I "${arg#/I}") ;;
    *) args+=("$arg") ;;
  esac
done

exec "$ring_cc" "${args[@]}"
