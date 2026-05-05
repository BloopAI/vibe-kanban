#!/usr/bin/env bash
# Cross-platform helpers (macOS/Linux)
set -Eeuo pipefail
IFS=$'\n\t'

have_cmd() { command -v "$1" >/dev/null 2>&1; }

# Prefer GNU tools when available
_sed_bin="sed"
_date_bin="date"
_timeout_bin=""
_readlink_bin="readlink"
_bc_bin="bc"

if have_cmd gsed; then _sed_bin="gsed"; fi
if have_cmd gdate; then _date_bin="gdate"; fi
if have_cmd gtimeout; then _timeout_bin="gtimeout"; elif have_cmd timeout; then _timeout_bin="timeout"; fi
if have_cmd greadlink; then _readlink_bin="greadlink"; fi
if ! have_cmd bc; then _bc_bin=""; fi

# sed -i compatibility (BSD vs GNU)
# Usage: sed_i FILE EXPRESSION...
sed_i() {
  local file=$1; shift
  if [[ "$_sed_bin" = "sed" && "$(sed --version 2>/dev/null | head -1 || true)" = "" ]]; then
    # BSD sed
    sed -i "" "$@" "$file"
  else
    "$_sed_bin" -i "$@" "$file"
  fi
}

# portable timeout: timeout_f DURATION CMD...
# Supports suffixes: Ns, Nm, Nh
timeout_f() {
  local duration=$1; shift
  if [[ -n "$_timeout_bin" ]]; then
    "$_timeout_bin" "$duration" "$@"
  else
    # Fallback naive timeout using background + sleep
    ( "$@" ) & local pid=$!
    # convert e.g. "5m" -> seconds
    local s=${duration}
    s="${s//h/*3600}"; s="${s//m/*60}"; s="${s//s/}"
    if have_cmd node; then
      node -e "setTimeout(()=>process.exit(0), (${s}));"
    else
      # shellcheck disable=SC2001
      local secs
      secs=$(echo "$s" | sed 's/*/ /g'); secs=$((secs))
      sleep "$secs" || true
    fi
    if kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null || true; fi
  fi
}

# readlink -f compatibility
readlink_f() {
  if "$_readlink_bin" -f "$1" 2>/dev/null; then
    return 0
  fi
  # Fallback: resolve via python/node if possible
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<PY
import os,sys
print(os.path.realpath(sys.argv[1]))
PY
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    node -e 'console.log(require("path").resolve(process.argv[1]))' "$1"
    return 0
  fi
  # last resort
  echo "$1"
}

# parse ISO date to epoch seconds (best effort)
date_parse_ts() {
  local input=$1
  if [[ "$_date_bin" = "gdate" ]] || "$_date_bin" -d "@0" >/dev/null 2>&1; then
    "$_date_bin" -d "$input" +%s
  elif command -v python3 >/dev/null 2>&1; then
    python3 - <<PY
import sys,datetime
try:
  from dateutil import parser as p
  print(int(p.parse(sys.argv[1]).timestamp()))
except Exception:
  try:
    print(int(datetime.datetime.fromisoformat(sys.argv[1]).timestamp()))
  except Exception:
    print(0)
PY
  elif command -v node >/dev/null 2>&1; then
    node -e 'let d=new Date(process.argv[1]); console.log(isNaN(d)?0:Math.floor(d.getTime()/1000))' "$input"
  else
    echo 0
  fi
}
