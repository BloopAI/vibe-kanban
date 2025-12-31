---
name: update-app
description: Update dependencies, fix deprecations and warnings
---

# Dependency Update & Deprecation Fix

## Step 1: Check for Updates
```bash
# Frontend dependencies
pnpm outdated

# Rust dependencies
cargo outdated
```

## Step 2: Update Dependencies
```bash
# Frontend
pnpm update

# Rust
cargo update
```

## Step 3: Check for Deprecations & Warnings
```bash
# Clean install frontend
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Check Rust
cargo check
```

Read ALL output carefully for:
- Deprecation warnings
- Security vulnerabilities
- Peer dependency warnings
- Breaking changes

## Step 4: Fix Issues

For each warning/deprecation:
1. Research the recommended replacement or fix
2. Update code/dependencies accordingly
3. Re-run installation
4. Verify no warnings remain

## Step 5: Run Quality Checks
```bash
npm run check
npm run lint
```

Fix all errors before completing.

## Step 6: Verify Clean Install

Ensure a fresh install works:
1. Delete `node_modules/`, `pnpm-lock.yaml`, and `target/`
2. Run clean install: `pnpm install`
3. Verify ZERO warnings/errors
4. Confirm all dependencies resolve correctly
