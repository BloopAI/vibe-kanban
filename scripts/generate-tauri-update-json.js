#!/usr/bin/env node
//
// Generates a Tauri v2 updater `latest.json` from build artifacts.
//
// Usage:
//   node scripts/generate-tauri-update-json.js \
//     --version 0.2.0 \
//     --notes "Bug fixes" \
//     --artifacts-dir ./tauri-artifacts \
//     --download-base "https://github.com/BloopAI/vibe-kanban/releases/download/v0.2.0" \
//     --output latest.json
//
// The artifacts-dir should contain Tauri bundle outputs with .sig files:
//   tauri-artifacts/
//     darwin-aarch64/  -> vibe-kanban.app.tar.gz, vibe-kanban.app.tar.gz.sig
//     darwin-x86_64/   -> vibe-kanban.app.tar.gz, vibe-kanban.app.tar.gz.sig
//     linux-x86_64/    -> vibe-kanban.AppImage.tar.gz, vibe-kanban.AppImage.tar.gz.sig
//     windows-x86_64/  -> vibe-kanban-setup.exe, vibe-kanban-setup.exe.sig (NSIS)
//

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    parsed[key] = args[i + 1];
  }
  return parsed;
}

function findArtifact(dir) {
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir);
  // Look for .sig files to find the updater artifacts
  const sigFiles = files.filter(f => f.endsWith('.sig'));

  if (sigFiles.length === 0) return null;

  // Prefer .tar.gz (macOS/Linux) over .exe (Windows)
  // Tauri generates: .app.tar.gz + .sig on macOS, .AppImage.tar.gz + .sig on Linux, .exe + .sig on Windows
  const sigFile = sigFiles[0];
  const artifactFile = sigFile.replace(/\.sig$/, '');

  if (!files.includes(artifactFile)) {
    console.error(`Warning: Found ${sigFile} but missing ${artifactFile} in ${dir}`);
    return null;
  }

  return {
    file: artifactFile,
    signature: fs.readFileSync(path.join(dir, sigFile), 'utf-8').trim(),
  };
}

const args = parseArgs();
const version = args.version;
const notes = args.notes || '';
const artifactsDir = args['artifacts-dir'];
const downloadBase = args['download-base'];
const output = args.output || 'latest.json';

if (!version || !artifactsDir || !downloadBase) {
  console.error('Required: --version, --artifacts-dir, --download-base');
  process.exit(1);
}

// Map of Tauri platform keys to artifact subdirectories
const platformMap = {
  'darwin-aarch64': 'darwin-aarch64',
  'darwin-x86_64': 'darwin-x86_64',
  'linux-x86_64': 'linux-x86_64',
  'windows-x86_64': 'windows-x86_64',
};

const platforms = {};

for (const [platformKey, subdir] of Object.entries(platformMap)) {
  const dir = path.join(artifactsDir, subdir);
  const artifact = findArtifact(dir);
  if (artifact) {
    platforms[platformKey] = {
      url: `${downloadBase}/${artifact.file}`,
      signature: artifact.signature,
    };
    console.log(`Found artifact for ${platformKey}: ${artifact.file}`);
  } else {
    console.log(`No artifact found for ${platformKey} in ${dir}`);
  }
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nWritten ${output} with ${Object.keys(platforms).length} platform(s)`);
