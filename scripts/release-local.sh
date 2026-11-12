#!/usr/bin/env bash
# Build and publish an npx-only release from a Mac, without GitHub Actions or
# R2. Binaries go to the GitHub Release for the tag; the npm package goes to
# the `next` dist-tag first and is promoted to `latest` once tested.
# See RELEASING.md for the full walkthrough.
#
# Usage:
#   scripts/release-local.sh build [platform...]  build binaries + npm package
#   scripts/release-local.sh smoke                test the package on this Mac
#   scripts/release-local.sh publish              GitHub pre-release, smoke test
#                                                 against it, then npm @next
#   scripts/release-local.sh promote              make it @latest
#   scripts/release-local.sh rollback <version>   point @latest at <version>
#
# Commands work on the v* tag at HEAD (created by ./bump-version.sh). Without
# one, build and smoke do a dry run as v<version>-dryrun.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REPO="BloopAI/vibe-kanban"
NPM_PACKAGE="vibe-kanban"
OUT_ROOT="$ROOT/release-out"
# Build-time values are looked up in the environment, then .env.release, then
# .env. The Rust build.rs scripts read .env on their own as well.
ENV_FILES=("$ROOT/.env.release" "$ROOT/.env")
IMAGE="vibe-kanban-release-cross"
PLATFORMS=(macos-arm64 macos-x64 linux-x64 linux-arm64 windows-x64 windows-arm64)
BINARIES=(vibe-kanban vibe-kanban-mcp vibe-kanban-review)
REQUIRED_ENV=(VK_SHARED_API_BASE VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY)
# Relay is sunset along with the other remote features; builds without it
# just report relay as unavailable.
OPTIONAL_ENV=(VITE_VK_SHARED_API_BASE VK_SHARED_RELAY_API_BASE)
# Releases never include analytics or crash reporting. These are cleared
# before every build so nothing from .env or the shell can switch them on.
ANALYTICS_ENV=(POSTHOG_API_KEY POSTHOG_API_ENDPOINT SENTRY_DSN SENTRY_DSN_REMOTE
  VITE_POSTHOG_API_KEY VITE_POSTHOG_API_ENDPOINT VITE_SENTRY_DSN SENTRY_AUTH_TOKEN)

die() { echo "error: $*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }
confirm() {
  local answer
  read -r -p "$1 [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]]
}

contains() {
  local needle="$1"; shift
  local item
  for item in "$@"; do [[ "$item" == "$needle" ]] && return 0; done
  return 1
}

# --- release identity -------------------------------------------------------

TAG=""
VERSION=""
OUT=""
ASSETS=""
TGZ=""

# With --allow-dry-run (build and smoke only), an untagged HEAD builds as
# v<version>-dryrun, so the whole pipeline can be tried before bumping.
DRY_RUN=""
load_release() {
  VERSION="$(node -p "require('./npx-cli/package.json').version")"
  DRY_RUN=""
  if ! TAG="$(git describe --tags --exact-match --match 'v*' HEAD 2>/dev/null)"; then
    [[ "${1:-}" == "--allow-dry-run" ]] \
      || die "HEAD has no v* tag. Run ./bump-version.sh first."
    TAG="v$VERSION-dryrun"
    DRY_RUN=1
    echo "HEAD has no v* tag: dry run as $TAG (cannot be published)"
  fi
  [[ "$TAG" == "v$VERSION" || "$TAG" == "v$VERSION."* || "$TAG" == "v$VERSION-"* ]] \
    || die "tag $TAG does not match npx-cli version $VERSION"
  OUT="$OUT_ROOT/$TAG"
  ASSETS="$OUT/assets"
  TGZ="$ASSETS/$NPM_PACKAGE-$VERSION.tgz"
}

require_all_assets() {
  local platform bin
  [[ -f "$ASSETS/manifest.json" ]] || die "missing $ASSETS/manifest.json; run build"
  [[ -f "$TGZ" ]] || die "missing $TGZ; run build"
  for platform in "${PLATFORMS[@]}"; do
    for bin in "${BINARIES[@]}"; do
      [[ -f "$ASSETS/$platform-$bin.zip" ]] \
        || die "missing $platform-$bin.zip; run build for all platforms"
    done
  done
}

# Prints NAME's value from a dotenv file (last assignment wins). Reads just
# that line rather than sourcing the file, which also holds unrelated secrets.
dotenv_value() {
  local file="$1" name="$2"
  [[ -f "$file" ]] || return 0
  sed -n -E "s/^(export[[:space:]]+)?$name=//p" "$file" | tail -1 | tr -d '\r' \
    | sed -E "s/^\"(.*)\"\$/\\1/; s/^'(.*)'\$/\\1/"
}

# Exports NAME from the first source that has it; unsets it otherwise, since
# an empty value would still be compiled in as "configured".
resolve_env() {
  local name="$1" value file
  value="${!name:-}"
  for file in "${ENV_FILES[@]}"; do
    [[ -n "$value" ]] && break
    value="$(dotenv_value "$file" "$name")"
  done
  if [[ -n "$value" ]]; then
    export "$name=$value"
  else
    unset "$name"
  fi
}

load_env() {
  local name
  for name in "${REQUIRED_ENV[@]}" "${OPTIONAL_ENV[@]}"; do
    resolve_env "$name"
  done
  for name in "${REQUIRED_ENV[@]}"; do
    [[ -n "${!name:-}" ]] || die "$name is not set (environment, .env.release or .env)"
  done
  export VITE_VK_SHARED_API_BASE="${VITE_VK_SHARED_API_BASE:-$VK_SHARED_API_BASE}"
  for name in "${ANALYTICS_ENV[@]}"; do
    unset "$name"
  done
  export SQLX_OFFLINE=true

  echo "Build settings:"
  echo "  VK_SHARED_API_BASE=$VK_SHARED_API_BASE"
  for name in VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY VK_SHARED_RELAY_API_BASE; do
    if [[ -n "${!name:-}" ]]; then
      echo "  $name: set"
    else
      echo "  $name: not set"
    fi
  done
  echo "  analytics and crash reporting: off (always, for releases)"
}

# --- build -------------------------------------------------------------------

build_frontend() {
  step "Building frontend"
  pnpm install --frozen-lockfile
  (cd packages/local-web && npm run build)
}

build_macos() {
  local platform="$1" target deployment
  case "$platform" in
    macos-arm64) target=aarch64-apple-darwin; deployment=11.0 ;;
    macos-x64) target=x86_64-apple-darwin; deployment=10.12 ;;
  esac
  step "Building $platform"
  rustup target add "$target" >/dev/null
  MACOSX_DEPLOYMENT_TARGET="$deployment" cargo build --release --target "$target" \
    -p server -p mcp -p review --bin server --bin vibe-kanban-mcp --bin review
  local src="target/$target/release" dest="$OUT/build/$platform"
  mkdir -p "$dest"
  cp "$src/server" "$dest/vibe-kanban"
  cp "$src/vibe-kanban-mcp" "$dest/vibe-kanban-mcp"
  cp "$src/review" "$dest/vibe-kanban-review"
}

build_cross() {
  step "Building ${*} in Docker"
  docker info >/dev/null 2>&1 \
    || die "Docker is not running (try: colima start --cpu 8 --memory 16)"
  local toolchain
  toolchain="$(sed -n 's/^channel = "\(.*\)"/\1/p' rust-toolchain.toml)"
  docker build -t "$IMAGE" --build-arg RUST_TOOLCHAIN="$toolchain" scripts/release
  mkdir -p "$OUT/build"
  local env_args=() name
  for name in "${REQUIRED_ENV[@]}" "${OPTIONAL_ENV[@]}"; do
    env_args+=(-e "$name")
  done
  docker run --rm \
    -v "$ROOT:/src" \
    -v "$OUT/build:/out" \
    -v vibe-kanban-release-target:/target \
    -v vibe-kanban-release-cargo-registry:/opt/cargo/registry \
    -v vibe-kanban-release-cargo-git:/opt/cargo/git \
    -v vibe-kanban-release-xwin:/xwin-cache \
    "${env_args[@]}" \
    "$IMAGE" bash /src/scripts/release/build-cross.sh "$@"
}

# Belt and braces for "releases ship no analytics": a PostHog project key or a
# Sentry DSN could still arrive from a file Vite reads on its own
# (packages/local-web/.env*). Source maps are skipped: @sentry/browser's carry
# a disabled example DSN in a comment.
verify_no_analytics() {
  step "Checking that no analytics keys were built in"
  local pattern='phc_[A-Za-z0-9]{20,}|https://[0-9a-f]{32}@[a-z0-9.-]+'
  local hits
  hits="$(grep -rlE --exclude='*.map' "$pattern" packages/local-web/dist "$OUT/build" 2>/dev/null || true)"
  [[ -z "$hits" ]] || die "found a PostHog key or Sentry DSN in: $hits"
  echo "  none found"
}

package_binaries() {
  step "Packaging binaries"
  mkdir -p "$ASSETS"
  local platform bin ext file
  for platform in "$@"; do
    ext=""
    [[ "$platform" == windows-* ]] && ext=".exe"
    for bin in "${BINARIES[@]}"; do
      file="$OUT/build/$platform/$bin$ext"
      [[ -f "$file" ]] || die "build output missing: $file"
      rm -f "$ASSETS/$platform-$bin.zip"
      zip -q -j -X "$ASSETS/$platform-$bin.zip" "$file"
      printf '  %-34s %s\n' "$platform-$bin.zip" "$(file -b "$file" | cut -c1-70)"
    done
  done
}

write_manifest() {
  step "Writing manifest.json"
  node - "$ASSETS" "$TAG" <<'EOF'
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const [dir, tag] = process.argv.slice(2);
const manifest = { version: tag, platforms: {} };
for (const name of fs.readdirSync(dir).sort()) {
  const m = name.match(/^((?:macos|linux|windows)-(?:x64|arm64))-(.+)\.zip$/);
  if (!m) continue;
  const data = fs.readFileSync(path.join(dir, name));
  manifest.platforms[m[1]] ??= {};
  manifest.platforms[m[1]][m[2]] = {
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    size: data.length,
  };
}
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`  ${Object.keys(manifest.platforms).length} platform(s)`);
EOF
}

# Pack from a staging copy: a dist/ folder inside the published package would
# switch every user's CLI into local-dev mode.
pack_npm() {
  step "Packing npm package"
  (cd npx-cli && npm ci && npm run build)
  local staging="$OUT/npm"
  rm -rf "$staging"
  mkdir -p "$staging"
  cp -R npx-cli/bin "$staging/bin"
  cp npx-cli/package.json npx-cli/README.md "$staging/"
  sed -i '' "s|__BINARY_TAG__|$TAG|g" "$staging/bin/cli.js"
  ! grep -q "__BINARY_TAG__" "$staging/bin/cli.js" || die "BINARY_TAG placeholder left in cli.js"
  (cd "$staging" && npm pack --silent --pack-destination "$ASSETS" >/dev/null)
  [[ -f "$TGZ" ]] || die "npm pack did not produce $TGZ"
  if tar -tzf "$TGZ" | grep -q '^package/dist/'; then
    die "package contains dist/; refusing to continue"
  fi
  echo "  $(basename "$TGZ"): $(tar -tzf "$TGZ" | tr '\n' ' ')"
}

cmd_build() {
  load_release --allow-dry-run
  local selected=("$@")
  [[ ${#selected[@]} -gt 0 ]] || selected=("${PLATFORMS[@]}")
  local platform
  for platform in "${selected[@]}"; do
    contains "$platform" "${PLATFORMS[@]}" || die "unknown platform: $platform"
  done
  if [[ -n "$(git status --porcelain)" && "${ALLOW_DIRTY:-}" != "1" ]]; then
    die "working tree is not clean (set ALLOW_DIRTY=1 to build anyway)"
  fi
  load_env
  echo "Release $TAG (npm $VERSION) -> $OUT"

  build_frontend
  local cross=()
  for platform in "${selected[@]}"; do
    case "$platform" in
      macos-*) build_macos "$platform" ;;
      *) cross+=("$platform") ;;
    esac
  done
  [[ ${#cross[@]} -eq 0 ]] || build_cross "${cross[@]}"

  verify_no_analytics
  package_binaries "${selected[@]}"
  write_manifest
  pack_npm
  step "Built $TAG. Next: scripts/release-local.sh smoke"
}

# --- smoke test ----------------------------------------------------------------

host_platform() {
  case "$(uname -m)" in
    arm64) echo macos-arm64 ;;
    *) echo macos-x64 ;;
  esac
}

cmd_smoke() {
  load_release --allow-dry-run
  run_smoke
}

# Expects TAG/VERSION/ASSETS/TGZ set. Options:
#   --no-app      skip starting the server
#   --published   download from the real GitHub release instead of a local mirror
run_smoke() {
  local start_app=1 published=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --no-app) start_app="" ;;
      --published) published=1 ;;
      *) die "run_smoke: unknown option $1" ;;
    esac
    shift
  done
  [[ -f "$TGZ" && -f "$ASSETS/manifest.json" ]] || die "nothing built for $TAG; run build"
  local platform
  platform="$(host_platform)"
  [[ -f "$ASSETS/$platform-vibe-kanban-review.zip" ]] || die "no $platform build to test"

  # Serve the assets the way GitHub does (<base>/<tag>/<asset>) and run the
  # packed CLI against them with a scratch HOME, so the real ~/.vibe-kanban
  # cache and database are never touched.
  SMOKE_TMP="$(mktemp -d)"
  local tmp="$SMOKE_TMP"
  mkdir -p "$tmp/serve" "$tmp/home" "$tmp/app"
  local app_port=$((30000 + RANDOM % 10000))
  SMOKE_PIDS=()
  trap smoke_cleanup EXIT
  local i
  # env(1) takes -u before any NAME=value.
  local run_env=(-u VIBE_KANBAN_DOWNLOAD_BASE_URL HOME="$tmp/home")
  if [[ -n "$published" ]]; then
    # No override: the CLI uses its built-in GitHub Releases URL, exactly as
    # users will once the package is on npm.
    :
  else
    ln -s "$ASSETS" "$tmp/serve/$TAG"
    local mirror_port=$((20000 + RANDOM % 10000))
    python3 -m http.server "$mirror_port" --bind 127.0.0.1 --directory "$tmp/serve" \
      >"$tmp/mirror.log" 2>&1 &
    SMOKE_PIDS+=("$!")
    for i in $(seq 1 20); do
      curl -fs -o /dev/null "http://127.0.0.1:$mirror_port/$TAG/manifest.json" && break
      sleep 0.5
    done
    curl -fs -o /dev/null "http://127.0.0.1:$mirror_port/$TAG/manifest.json" \
      || { cat "$tmp/mirror.log" >&2; die "local mirror did not start"; }
    run_env+=(VIBE_KANBAN_DOWNLOAD_BASE_URL="http://127.0.0.1:$mirror_port")
  fi

  step "Installing $(basename "$TGZ") into a scratch prefix"
  npm install --silent --no-audit --no-fund --prefix "$tmp/app" "$TGZ"
  local cli="$tmp/app/node_modules/$NPM_PACKAGE/bin/cli.js"

  # Flags after `review` are swallowed by the wrapper's own parser, so run it
  # bare: clap then exits with a missing-argument error, which proves it ran.
  step "Review CLI: download, checksum, extract, run"
  local review_out
  review_out="$(env "${run_env[@]}" node "$cli" review 2>&1 || true)"
  echo "$review_out" | tail -3
  echo "$review_out" | grep -q "PR_URL" || die "review binary did not run"
  [[ -x "$tmp/home/.vibe-kanban/bin/$TAG/$platform/vibe-kanban-review" ]] \
    || die "review binary was not extracted into the cache"

  if [[ -z "$start_app" ]]; then
    step "Smoke test passed for $platform (app start skipped)"
    return
  fi

  step "App: start through the wrapper and wait for /api/health (a browser tab may open)"
  env "${run_env[@]}" BACKEND_PORT="$app_port" node "$cli" >"$tmp/app.log" 2>&1 &
  SMOKE_PIDS+=("$!")
  local ok=""
  for i in $(seq 1 120); do
    if curl -fs "http://127.0.0.1:$app_port/api/health" >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 1
  done
  if [[ -z "$ok" ]]; then
    tail -20 "$tmp/app.log" >&2
    die "app did not answer on /api/health within 120s"
  fi
  step "Smoke test passed for $platform"
}

SMOKE_TMP=""
SMOKE_PIDS=()
smoke_cleanup() {
  local pid
  for pid in ${SMOKE_PIDS[@]+"${SMOKE_PIDS[@]}"}; do kill "$pid" 2>/dev/null || true; done
  # The wrapper runs the app with execSync, so stop the binary itself too.
  [[ -n "$SMOKE_TMP" ]] && pkill -f "$SMOKE_TMP/home/.vibe-kanban/bin" 2>/dev/null || true
  [[ -n "$SMOKE_TMP" ]] && rm -rf "$SMOKE_TMP"
}

# --- publish ---------------------------------------------------------------------

cmd_publish() {
  load_release
  require_all_assets
  command -v gh >/dev/null || die "gh is not installed"
  gh auth status >/dev/null 2>&1 || die "run: gh auth login"
  npm whoami >/dev/null 2>&1 || die "run: npm login"

  if npm view "$NPM_PACKAGE@$VERSION" version >/dev/null 2>&1; then
    die "$NPM_PACKAGE@$VERSION is already on npm; bump the version"
  fi

  git fetch --quiet origin main
  if ! git merge-base --is-ancestor HEAD origin/main; then
    echo "note: $TAG is not on origin/main (fine when releasing from a PR branch)."
    confirm "Release it anyway?" || exit 1
  fi

  # Stage 1: GitHub pre-release. Rerunning publish after an interrupted run
  # reuses the release if its manifest matches this build.
  local manifest_url="https://github.com/$REPO/releases/download/$TAG/manifest.json"
  if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
    echo "GitHub release $TAG already exists; checking it matches this build"
    curl -fsSL "$manifest_url" | cmp -s - "$ASSETS/manifest.json" \
      || die "release $TAG has different assets. Delete it (gh release delete $TAG -R $REPO) or bump the version"
  else
    if ! git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null; then
      confirm "Push tag $TAG to origin?" || exit 1
      git push origin "refs/tags/$TAG"
    fi
    echo
    echo "About to create GitHub pre-release $TAG on $REPO with $(find "$ASSETS" -type f | wc -l | tr -d ' ') assets."
    echo "Nothing reaches npm yet."
    confirm "Continue?" || exit 1
    step "Creating GitHub pre-release"
    gh release create "$TAG" -R "$REPO" --verify-tag --prerelease \
      --title "Pre-release $TAG" --generate-notes "$ASSETS"/*
  fi

  step "Checking the public download URL"
  curl -fsSL "$manifest_url" | cmp -s - "$ASSETS/manifest.json" \
    || die "manifest.json from the release does not match this build"

  # Stage 2: the packed CLI against the real release, before npm sees it.
  step "Smoke test against the GitHub release"
  run_smoke --published
  trap - EXIT
  smoke_cleanup

  # Stage 3: npm @next. This is the only step that cannot be undone: the
  # version number is used up even if it is deprecated later.
  echo
  echo "About to publish $NPM_PACKAGE@$VERSION to npm under 'next' (latest stays $(npm view "$NPM_PACKAGE" dist-tags.latest))."
  echo "npm never lets a version number be reused."
  confirm "Publish to npm?" || { echo "Stopped before npm. Rerun publish to continue."; exit 1; }
  step "Publishing to npm (@next)"
  npm publish "$TGZ" --tag next --access public

  step "Published. Test with: npx $NPM_PACKAGE@next"
  echo "When happy: scripts/release-local.sh promote"
}

cmd_promote() {
  load_release
  npm view "$NPM_PACKAGE@$VERSION" version >/dev/null 2>&1 \
    || die "$NPM_PACKAGE@$VERSION is not on npm; run publish"
  local current
  current="$(npm view "$NPM_PACKAGE" dist-tags.latest)"
  echo "npm latest: $current -> $VERSION"
  confirm "Promote $TAG to latest?" || exit 1
  npm dist-tag add "$NPM_PACKAGE@$VERSION" latest
  gh release edit "$TAG" -R "$REPO" --prerelease=false --latest --title "$TAG"
  step "$NPM_PACKAGE@$VERSION is now latest. Roll back with: scripts/release-local.sh rollback $current"
}

cmd_rollback() {
  local version="${1:-}"
  [[ -n "$version" ]] || die "usage: scripts/release-local.sh rollback <version>"
  npm view "$NPM_PACKAGE@$version" version >/dev/null 2>&1 \
    || die "$NPM_PACKAGE@$version is not on npm"
  confirm "Point $NPM_PACKAGE@latest at $version?" || exit 1
  npm dist-tag add "$NPM_PACKAGE@$version" latest
}

main() {
  case "${1:-}" in
    build) shift; cmd_build "$@" ;;
    smoke) cmd_smoke ;;
    publish) cmd_publish ;;
    promote) cmd_promote ;;
    rollback) shift; cmd_rollback "$@" ;;
    *) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
  esac
}

# Sourcing the script (for testing) defines the functions without running.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
