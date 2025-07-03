#!/usr/bin/env node
/**
 * Drop-in replacement for the `cargo` binary.
 * If CARGO_TARGET_DIR is already set we leave it alone.
 * Otherwise we compute a path that is the same for every git-worktree:
 *   <main-clone-root>/target
 *
 * Usage   :  node scripts/cargo.js <cargo-subcommand> […]
 * NPM     :  "backend:build": "node scripts/cargo.js build --release …"
 */
const { spawnSync, execSync } = require('node:child_process');
const path = require('node:path');

function sharedTarget() {
  try {
    // Works in any work-tree folder
    const common = execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim();
    return path.resolve(common, '..', 'target');
  } catch {
    return undefined;                 // not a git repo? -> let Cargo use ./target
  }
}

const env = { ...process.env };
if (!env.CARGO_TARGET_DIR) {
  const dir = sharedTarget();
  if (dir) env.CARGO_TARGET_DIR = dir;
}

const result = spawnSync('cargo', process.argv.slice(2), { stdio: 'inherit', env });
process.exitCode = result.status;
