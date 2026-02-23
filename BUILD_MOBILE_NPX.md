# Reproducible Build Guide: Mobile NPX Package

Complete instructions for building the `vibe-kanban` npm package with the mobile-enhanced Rust server binary and patched dependencies.

## Prerequisites

### System Requirements
- **OS**: Ubuntu 24.04 LTS (aarch64) or compatible Linux
- **Architecture**: ARM64 (aarch64)
- **Memory**: 8GB+ RAM recommended for Vite build

### Required Packages
```bash
sudo apt-get update && sudo apt-get install -y \
  pkg-config \
  libssl-dev \
  libclang-dev \
  clang \
  libsqlite3-dev \
  zip \
  gcc \
  librsvg2-bin
```

### Rust Toolchain
```bash
# Install rustup
curl https://sh.rustup.rs | sh -s -- -y --no-modify-path

# Load cargo env
source $HOME/.cargo/env

# Install nightly toolchain (required by rust-toolchain.toml)
rustup toolchain install nightly-2025-12-04
```

### Node.js and pnpm
```bash
# Install Node.js 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm globally
npm install -g pnpm@10.13.1
```

## Repository Setup

```bash
# Clone the repository
git clone git@github.com:ciekawy/vibe-kanban.git
cd vibe-kanban

# Checkout the mobile feature branch
git fetch origin feat/mobile-layout
git checkout feat/mobile-layout

# Install dependencies
pnpm install
```

## Optional: Apply Virtuoso License Patch

> **Note**: This patch bypasses license validation for `@virtuoso.dev/message-list`. Only apply if you have a valid license or are testing without a license key.

```bash
# Patch location: ~/patches/@virtuoso.dev__message-list@1.13.3.patch
# Apply to node_modules after pnpm install:

VIRTUOSO_FILE="node_modules/.pnpm/@virtuoso.dev+message-list@1.13.3_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@virtuoso.dev/message-list/dist/index.js"

patch -p1 -d "$(dirname "$(dirname "$(dirname "$VIRTUOSO_FILE")")")" < ~/patches/@virtuoso.dev__message-list@1.13.3.patch

# Verify patch applied
grep -c "valid: !0" "$VIRTUOSO_FILE"  # Should output non-zero count
```

## Build Process

### 1. Frontend Build

The frontend must be built **before** the Rust server, since the server embeds `frontend/dist/` at compile time via `rust-embed`.

```bash
cd frontend

# Build with increased heap size for Vite/Rollup
NODE_OPTIONS="--max-old-space-size=8192" npm run build

# Expected output:
# ✓ built in ~1m 30s
# dist/ directory created with all assets
```

**What happens:**
- TypeScript compilation (`tsc`)
- Vite bundles React app with Tailwind CSS
- Output: `frontend/dist/` (embedded into Rust binary)
- Sentry source maps uploaded (errors are non-fatal)

### 2. Rust Server Build

```bash
cd ..  # Back to repository root

# Ensure cargo is in PATH
export PATH="$HOME/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Build release binary
cargo build --release --bin server --manifest-path Cargo.toml

# Expected output:
# Finished `release` profile [optimized + debuginfo] target(s) in ~2m
# Binary: target/release/server (~140MB)
```

**What happens:**
- Compiles `crates/server/` with optimizations
- `#[derive(RustEmbed)] #[folder = "../../frontend/dist"]` embeds the frontend
- SQLx uses offline prepared statements (`sqlx-data.json`)
- Output: `target/release/server` (single-file binary)

### 3. Additional Binaries

Build the MCP and review tool binaries:

```bash
# MCP server
cargo build --release --bin vibe-kanban-mcp

# Review tool
cargo build --release --bin vibe-kanban-review
```

### 4. Package Assembly

```bash
cd npx-cli

# Create dist directory structure
mkdir -p dist/linux-arm64

# Create temporary directory for zipping
mkdir -p /tmp/vibe-kanban-pack

# Package main server binary
cp ../target/release/server /tmp/vibe-kanban-pack/vibe-kanban
cd /tmp/vibe-kanban-pack
zip -j ../vibe-kanban.zip vibe-kanban
mv ../vibe-kanban.zip /path/to/repo/npx-cli/dist/linux-arm64/

# Package MCP binary
cd /tmp/vibe-kanban-pack
cp ../target/release/vibe-kanban-mcp vibe-kanban-mcp
zip -j ../vibe-kanban-mcp.zip vibe-kanban-mcp
mv ../vibe-kanban-mcp.zip /path/to/repo/npx-cli/dist/linux-arm64/

# Package review binary
cp ../target/release/vibe-kanban-review vibe-kanban-review
zip -j ../vibe-kanban-review.zip vibe-kanban-review
mv ../vibe-kanban-review.zip /path/to/repo/npx-cli/dist/linux-arm64/

cd /path/to/repo/npx-cli
```

### 5. Create npm Tarball

```bash
cd npx-cli

# Pack with pnpm
pnpm pack

# Output: vibe-kanban-0.1.18.tgz (~62MB)
```

**Tarball contents:**
- `bin/cli.js` — npx entry point
- `bin/download.js` — binary downloader script
- `dist/linux-arm64/vibe-kanban.zip` (~53MB) — main server
- `dist/linux-arm64/vibe-kanban-mcp.zip` (~5MB) — MCP server
- `dist/linux-arm64/vibe-kanban-review.zip` (~4MB) — review tool
- `package.json`
- `README.md`

## Subsequent Rebuilds (Frontend Changes Only)

When you only modify frontend code (React components, styles, i18n, etc.), you can rebuild faster:

```bash
# 1. Rebuild frontend
cd frontend
NODE_OPTIONS="--max-old-space-size=8192" npm run build

# 2. Rebuild Rust server (embeds new frontend/dist/)
cd ..
cargo build --release --bin server

# 3. Rezip main binary
cp target/release/server /tmp/vibe-kanban-pack/vibe-kanban
cd /tmp/vibe-kanban-pack
zip -j npx-cli/dist/linux-arm64/vibe-kanban.zip vibe-kanban

# 4. Repack npm tarball
cd npx-cli
pnpm pack
```

**Why you need to rebuild the Rust server:**
The server binary embeds `frontend/dist/` at **compile time** via the `rust-embed` crate:

```rust
#[derive(RustEmbed)]
#[folder = "../../frontend/dist"]
pub struct FrontendAssets;
```

Changing frontend files doesn't automatically update the embedded assets in an existing binary. You must recompile.

## Verification

```bash
# Check tarball size (should be ~62MB)
du -sh npx-cli/vibe-kanban-0.1.18.tgz

# Verify tarball contents
tar -tzf npx-cli/vibe-kanban-0.1.18.tgz | head -10

# Test local installation
cd /tmp/test-install
tar -xzf /path/to/npx-cli/vibe-kanban-0.1.18.tgz
cd package
npm install -g .

# Run server
vibe-kanban --help
```

## Troubleshooting

### OOM during Vite build
**Error**: `exit code 134` (SIGABRT) during `npm run build`

**Fix**: Increase Node.js heap size:
```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run build
```

### Missing `cc` linker
**Error**: `linker 'cc' not found`

**Fix**: Install gcc:
```bash
sudo apt-get install -y gcc
```

### SQLx offline mode
**Error**: `DATABASE_URL must be set`

**Fix**: Use prepared query data (already committed):
```bash
# Verify sqlx-data.json exists
ls crates/db/.sqlx/

# If missing, regenerate (requires postgres running):
pnpm run prepare-db
```

### Patch already applied
**Error**: `Reversed (or previously applied) patch detected`

**Fix**: Patch is idempotent. If `node_modules` persists across builds, skip patching or verify manually:
```bash
grep "valid: !0" node_modules/.pnpm/@virtuoso.dev+message-list@*/node_modules/@virtuoso.dev/message-list/dist/index.js
```

## Environment Variables (Optional)

```bash
# Backend port (default: auto-assigned)
export BACKEND_PORT=8080

# Frontend port (default: auto-assigned)
export FRONTEND_PORT=3000

# Host binding (default: 127.0.0.1)
export HOST=0.0.0.0

# Skip Sentry source map upload
export SENTRY_AUTH_TOKEN=""
```

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
- name: Install system dependencies
  run: |
    sudo apt-get update
    sudo apt-get install -y pkg-config libssl-dev libclang-dev clang libsqlite3-dev zip gcc

- name: Setup Rust
  uses: dtolnay/rust-toolchain@master
  with:
    toolchain: nightly-2025-12-04

- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '22'

- name: Install pnpm
  run: npm install -g pnpm@10.13.1

- name: Install dependencies
  run: pnpm install

- name: Build frontend
  run: |
    cd frontend
    NODE_OPTIONS="--max-old-space-size=8192" npm run build

- name: Build server
  run: cargo build --release --bin server

- name: Package
  run: |
    cd npx-cli
    pnpm run build:npx
    pnpm pack
```

## Key Mobile Features Included

This build includes the following mobile enhancements on top of the base `feat/mobile-layout`:

- **Tab-based navigation** — Workspaces · Chat · Diff · Logs · Preview · Git
- **PWA support** — `apple-touch-icon.png` (180×180), `site.webmanifest` with PNG icon, theme-color meta tags
- **iOS keyboard fix** — `position: fixed; inset: 0` instead of `h-dvh` to avoid layout shifts
- **Safe-area handling** — `pb-[env(safe-area-inset-bottom)]` on root container
- **Board navigation** — Board tab when workspace is linked to a remote project
- **Scroll-to-bottom arrow** — floating button in chat when not at bottom
- **Mobile font scaling** — preference in Settings → Appearance (default/small/smaller)
- **Reload button** — in mobile navbar right controls
- **Settings button** — gear icon opens settings dialog
- **Panel → tab wiring** — tapping Diff/Logs/Preview switches to corresponding tab
- **i18n** — all UI strings use translation keys (`common:kanban.board`, etc.)

## File Sizes Reference

| Component | Uncompressed | Compressed (deflated 63%) |
|-----------|-------------|---------------------------|
| `server` binary | ~140MB | ~53MB (in zip) |
| `vibe-kanban-mcp` | ~13MB | ~5MB |
| `vibe-kanban-review` | ~11MB | ~4MB |
| **Total tarball** | — | **~62MB** |

## Version Info

- **Package version**: 0.1.18
- **Rust toolchain**: nightly-2025-12-04
- **Node.js**: 22.x
- **pnpm**: 10.13.1
- **Target**: linux-arm64 (aarch64)

---

**Last updated**: 2026-02-22
**Branch**: `feat/mobile-layout`
**Maintainer**: Claude Opus 4.6
