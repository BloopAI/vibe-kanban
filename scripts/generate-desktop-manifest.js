#!/usr/bin/env node
//
// Generates a desktop-manifest.json for the NPX CLI auto-install flow.
// This manifest tells the CLI where to download the Tauri desktop app
// bundle for each platform, along with SHA256 checksums for verification.
//
// Usage:
//   node scripts/generate-desktop-manifest.js \
//     --version 0.2.0 \
//     --artifacts-dir ./tauri-artifacts \
//     --output desktop-manifest.json
//
// The artifacts-dir should contain Tauri bundle outputs per platform:
//   tauri-artifacts/
//     darwin-aarch64/  -> vibe-kanban.app.tar.gz
//     darwin-x86_64/   -> vibe-kanban.app.tar.gz
//     linux-x86_64/    -> vibe-kanban.AppImage.tar.gz
//     linux-aarch64/   -> vibe-kanban.AppImage.tar.gz
//     windows-x86_64/  -> vibe-kanban-setup.exe (NSIS)
//

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    parsed[key] = args[i + 1];
  }
  return parsed;
}

// Find the main bundle artifact for a platform (skip .sig and installer-only files)
function findBundleArtifact(dir) {
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir);

  // Look for updater artifacts in priority order
  // macOS: .app.tar.gz, Linux: .AppImage.tar.gz, Windows: *-setup.exe
  const tarGz = files.find(
    (f) =>
      (f.endsWith('.app.tar.gz') || f.endsWith('.AppImage.tar.gz')) &&
      !f.endsWith('.sig')
  );
  if (tarGz) {
    const type = tarGz.endsWith('.app.tar.gz')
      ? 'app-tar-gz'
      : 'appimage-tar-gz';
    return { file: tarGz, type };
  }

  // Windows NSIS installer
  const nsis = files.find(
    (f) => f.endsWith('-setup.exe') && !f.endsWith('.sig')
  );
  if (nsis) {
    return { file: nsis, type: 'nsis-exe' };
  }

  return null;
}

const args = parseArgs();
const version = args.version;
const artifactsDir = args['artifacts-dir'];
const output = args.output || 'desktop-manifest.json';

if (!version || !artifactsDir) {
  console.error('Required: --version, --artifacts-dir');
  process.exit(1);
}

const platformDirs = [
  'darwin-aarch64',
  'darwin-x86_64',
  'linux-x86_64',
  'linux-aarch64',
  'windows-x86_64',
  'windows-aarch64',
];

const platforms = {};

for (const platform of platformDirs) {
  const dir = path.join(artifactsDir, platform);
  const artifact = findBundleArtifact(dir);
  if (artifact) {
    const filePath = path.join(dir, artifact.file);
    const data = fs.readFileSync(filePath);
    platforms[platform] = {
      file: artifact.file,
      sha256: crypto.createHash('sha256').update(data).digest('hex'),
      size: data.length,
      type: artifact.type,
    };
    console.log(
      `Found ${artifact.type} for ${platform}: ${artifact.file} (${(data.length / 1024 / 1024).toFixed(1)}MB)`
    );
  } else {
    console.log(`No bundle artifact found for ${platform} in ${dir}`);
  }
}

const manifest = { version, platforms };

fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `\nWritten ${output} with ${Object.keys(platforms).length} platform(s)`
);
