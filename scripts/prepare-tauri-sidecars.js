#!/usr/bin/env node
/**
 * Prepare external sidecar binaries for Tauri bundling.
 *
 * Tauri's `bundle.externalBin` mechanism expects each sidecar binary to be
 * present at `<tauri-app>/binaries/<name>-<target-triple>(.exe)` *before*
 * `cargo tauri build` runs. This script:
 *
 *   1. Detects (or accepts via --target) the Rust target triple.
 *   2. Builds `vibe-kanban-mcp` for that target (unless --skip-build).
 *   3. Copies the produced binary into
 *      `crates/tauri-app/binaries/vibe-kanban-mcp-<triple>(.exe)`.
 *
 * Used by `pnpm run tauri:build`, `pnpm run tauri:dev`, and the CI
 * `build-tauri` job.
 *
 * Usage:
 *   node scripts/prepare-tauri-sidecars.js
 *   node scripts/prepare-tauri-sidecars.js --target aarch64-apple-darwin
 *   node scripts/prepare-tauri-sidecars.js --target x86_64-pc-windows-msvc --skip-build
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const projectRoot = path.resolve(__dirname, '..');
const tauriBinariesDir = path.join(projectRoot, 'crates', 'tauri-app', 'binaries');
const skipBuild = hasFlag('skip-build');

// rustc -vV exposes "host: <triple>" — the canonical way to detect the host
// target without depending on `process.arch`/`process.platform` heuristics.
function detectHostTarget() {
  const out = execSync('rustc -vV', { encoding: 'utf8' });
  const match = out.match(/^host:\s*(.+)$/m);
  if (!match) {
    throw new Error('Could not parse host target from `rustc -vV` output');
  }
  return match[1].trim();
}

const target = getArg('target') || detectHostTarget();
const isWindows = target.includes('windows');
const exeSuffix = isWindows ? '.exe' : '';

const sidecars = [
  {
    bin: 'vibe-kanban-mcp',
    package: 'mcp',
  },
];

function buildSidecar(sidecar) {
  if (skipBuild) {
    console.log(`[prepare-sidecars] --skip-build set, not rebuilding ${sidecar.bin}`);
    return;
  }
  const cargoArgs = [
    'build',
    '--release',
    '-p',
    sidecar.package,
    '--bin',
    sidecar.bin,
    '--target',
    target,
  ];
  console.log(`[prepare-sidecars] cargo ${cargoArgs.join(' ')}`);
  const result = spawnSync('cargo', cargoArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`cargo build failed for ${sidecar.bin} (exit ${result.status})`);
  }
}

function copySidecar(sidecar) {
  const sourcePath = path.join(
    projectRoot,
    'target',
    target,
    'release',
    `${sidecar.bin}${exeSuffix}`
  );
  if (!fs.existsSync(sourcePath)) {
    throw new Error(
      `Sidecar binary not found at ${sourcePath}. ` +
        `Run without --skip-build, or build it first with: cargo build --release --target ${target} -p ${sidecar.package} --bin ${sidecar.bin}`
    );
  }
  fs.mkdirSync(tauriBinariesDir, { recursive: true });
  const destName = `${sidecar.bin}-${target}${exeSuffix}`;
  const destPath = path.join(tauriBinariesDir, destName);
  fs.copyFileSync(sourcePath, destPath);
  // Preserve executable bit on Unix — fs.copyFileSync respects source mode,
  // but be explicit since cross-FS copies sometimes drop it.
  if (!isWindows) {
    fs.chmodSync(destPath, 0o755);
  }
  const size = (fs.statSync(destPath).size / (1024 * 1024)).toFixed(1);
  console.log(`[prepare-sidecars] -> ${destPath} (${size} MB)`);
}

console.log(`[prepare-sidecars] target = ${target}`);
console.log(`[prepare-sidecars] output = ${tauriBinariesDir}`);

for (const sidecar of sidecars) {
  buildSidecar(sidecar);
  copySidecar(sidecar);
}

console.log('[prepare-sidecars] done');
