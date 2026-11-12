#!/usr/bin/env bash
# Runs inside the image from scripts/release/Dockerfile (see
# scripts/release-local.sh). Builds the server, MCP and review binaries for
# each platform given and copies them to /out/<platform>/ under the names the
# npx CLI expects.
#
# Usage: build-cross.sh <platform>...   (linux-x64 linux-arm64 windows-x64 windows-arm64)
set -euo pipefail

cd /src
export SQLX_OFFLINE=true
export CARGO_INCREMENTAL=0

BINS=(-p server -p mcp -p review --bin server --bin vibe-kanban-mcp --bin review)

copy_out() {
  local platform="$1" target="$2" ext="$3"
  local src="$CARGO_TARGET_DIR/$target/release" dest="/out/$platform"
  mkdir -p "$dest"
  cp "$src/server$ext" "$dest/vibe-kanban$ext"
  cp "$src/vibe-kanban-mcp$ext" "$dest/vibe-kanban-mcp$ext"
  cp "$src/review$ext" "$dest/vibe-kanban-review$ext"
}

build_windows() (
  local target="$1"
  export PATH="/usr/lib/llvm-19/bin:$PATH"
  # Avoid aws-lc-sys CMake failures when the release profile has debug info.
  export CARGO_PROFILE_RELEASE_DEBUG=0
  if [[ "$target" == "aarch64-pc-windows-msvc" ]]; then
    # ring needs clang, not clang-cl, on arm64 Windows.
    # See https://github.com/briansmith/ring/issues/2117
    export PATH="/src/scripts:$PATH"
    export RING_CC=/usr/lib/llvm-19/bin/clang
    export DEFAULT_CC=clang-cl
    export CC_aarch64_pc_windows_msvc=/src/scripts/ring-cc-wrapper.sh
  fi
  cargo xwin build --cross-compiler clang-cl --release --target "$target" "${BINS[@]}"
)

for platform in "$@"; do
  echo "==> Building $platform"
  case "$platform" in
    linux-x64)
      cargo zigbuild --release --target x86_64-unknown-linux-musl "${BINS[@]}"
      copy_out "$platform" x86_64-unknown-linux-musl ""
      ;;
    linux-arm64)
      cargo zigbuild --release --target aarch64-unknown-linux-musl "${BINS[@]}"
      copy_out "$platform" aarch64-unknown-linux-musl ""
      ;;
    windows-x64)
      build_windows x86_64-pc-windows-msvc
      copy_out "$platform" x86_64-pc-windows-msvc ".exe"
      ;;
    windows-arm64)
      build_windows aarch64-pc-windows-msvc
      copy_out "$platform" aarch64-pc-windows-msvc ".exe"
      ;;
    *)
      echo "Unknown platform: $platform" >&2
      exit 1
      ;;
  esac
done
