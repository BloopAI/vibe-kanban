#!/usr/bin/env bash
# Common bootstrap for all entrypoint scripts
set -Eeuo pipefail
IFS=$'\n\t'

# Globals
: "${HC_NON_INTERACTIVE:=1}"
: "${HC_DEBUG:=0}"
: "${EMITTED_JSON:=0}"

# Paths
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/../.." && pwd )"

# Logging to stderr
_log() { local lvl=$1; shift; printf "[%s] %s\n" "$lvl" "$*" >&2; }
debug() { if [[ "$HC_DEBUG" = "1" ]]; then _log "DEBUG" "$*"; fi }
info()  { _log "INFO" "$*"; }
warn()  { _log "WARN" "$*"; }
err()   { _log "ERROR" "$*"; }

# Require a command or emit machine-parsable JSON error and exit
require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    # json.sh not yet sourced? emit minimal JSON directly
    if [[ "${EMITTED_JSON:-0}" -eq 0 ]]; then
      echo "{\"ok\":false,\"error\":{\"code\":\"CMD_MISSING\",\"message\":\"Missing command: $1\",\"details\":{}}}"
    fi
    exit 127
  fi
}

# Source libraries (order matters)
# shellcheck source=compat.sh
source "$SCRIPT_DIR/compat.sh"
# shellcheck source=json.sh
source "$SCRIPT_DIR/json.sh"
# shellcheck source=retry.sh
source "$SCRIPT_DIR/retry.sh"
# shellcheck source=git.sh
source "$SCRIPT_DIR/git.sh"
# shellcheck source=github.sh
source "$SCRIPT_DIR/github.sh"
# shellcheck source=ci.sh
source "$SCRIPT_DIR/ci.sh"

# Error trapping: ensure exactly one JSON object is emitted on failure
on_err() {
  local lineno=$1 code=${2:-1}
  if [[ "${EMITTED_JSON:-0}" -eq 0 ]]; then
    json_err "UNEXPECTED_ERROR" "Unexpected error at line ${lineno}" "{\"exitCode\":${code}}"
  fi
}
on_exit() { :; }

trap 'on_err ${LINENO} $?' ERR
trap on_exit EXIT
