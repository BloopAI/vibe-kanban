#!/usr/bin/env node
/**
 * Build MSI installer for Windows using wixl (from msitools).
 *
 * Processes the WiX template (crates/tauri-app/msi-template.wxs),
 * replaces template variables with actual values, and invokes wixl
 * to produce an MSI file.
 *
 * Usage:
 *   node scripts/build-tauri-msi.js --target <target> [--version <version>]
 *
 * Example:
 *   node scripts/build-tauri-msi.js --target x86_64-pc-windows-msvc
 *   node scripts/build-tauri-msi.js --target aarch64-pc-windows-msvc --version 0.1.27
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

const target = getArg('target');
if (!target) {
  console.error('Usage: node scripts/build-tauri-msi.js --target <target> [--version <version>]');
  process.exit(1);
}

// Paths
const projectRoot = path.resolve(__dirname, '..');
const tauriAppDir = path.join(projectRoot, 'crates', 'tauri-app');
const templatePath = path.join(tauriAppDir, 'msi-template.wxs');
const confPath = path.join(tauriAppDir, 'tauri.conf.json');
const iconPath = path.join(tauriAppDir, 'icons', 'icon.ico');


// Read tauri.conf.json for product metadata
const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
const productName = conf.productName || 'Agent Kanban';
const confVersion = conf.version || '0.0.0';

// Version from CLI or config
let version = getArg('version') || confVersion;
// MSI requires exactly 3-part version (major.minor.patch), strip prerelease
version = version.replace(/-.*$/, '');
const parts = version.split('.');
while (parts.length < 3) parts.push('0');
version = parts.slice(0, 3).join('.');

// Manufacturer from identifier (reverse domain → organization)
const manufacturer = 'Bloop';

// Stable upgrade code (UUID v5-style, derived from identifier — must never change)
const upgradeCode = 'E8C15B4D-5F9A-4B3E-8C1A-7D2F6E9A3B8C';

// Path component GUID (stable per product)
const pathComponentGuid = 'A7B3D1E9-6F2C-4A8B-9E5D-1C3F7B2A8D6E';

// Architecture mapping
// Note: wixl only supports x86/x64/ia64. For arm64 targets we use x64 MSI
// format which is standard — the arm64 binary is embedded inside an x64 MSI
// package. Windows on ARM runs x64 MSIs natively.
const archMap = {
  'x86_64-pc-windows-msvc': 'x64',
  'aarch64-pc-windows-msvc': 'x64',
};
const wixArch = archMap[target];
if (!wixArch) {
  console.error(`Unsupported target: ${target}`);
  process.exit(1);
}

// Binary path
const binaryName = 'vibe-kanban-tauri.exe';
const mainBinaryPath = path.join(projectRoot, 'target', target, 'release', binaryName);

if (!fs.existsSync(mainBinaryPath)) {
  console.error(`Binary not found: ${mainBinaryPath}`);
  console.error('Build the Tauri app first with: cargo tauri build --runner cargo-xwin --target ' + target + ' --ci');
  process.exit(1);
}

if (!fs.existsSync(iconPath)) {
  console.error(`Icon not found: ${iconPath}`);
  process.exit(1);
}

// Read and process template
console.log(`Processing WiX template for ${target} (${wixArch})...`);
let template = fs.readFileSync(templatePath, 'utf8');

const replacements = {
  '{{product_name}}': productName,
  '{{version}}': version,
  '{{manufacturer}}': manufacturer,
  '{{upgrade_code}}': upgradeCode,
  '{{path_component_guid}}': pathComponentGuid,
  '{{icon_path}}': iconPath,
  '{{main_binary_path}}': mainBinaryPath,
};

for (const [placeholder, value] of Object.entries(replacements)) {
  template = template.split(placeholder).join(value);
}

// Write processed template to temp file
const bundleDir = path.join(projectRoot, 'target', target, 'release', 'bundle', 'msi');
fs.mkdirSync(bundleDir, { recursive: true });

const processedWxs = path.join(bundleDir, 'processed.wxs');

// Platform-appropriate filename (use target arch, not MSI package arch)
const archSuffix = target.startsWith('aarch64') ? 'aarch64' : 'x86_64';
const msiOutput = path.join(bundleDir, `${productName.replace(/\s+/g, '-')}-${version}-${archSuffix}.msi`);

fs.writeFileSync(processedWxs, template);


console.log(`  Product: ${productName}`);
console.log(`  Version: ${version}`);
console.log(`  Arch:    ${wixArch}`);
console.log(`  Binary:  ${mainBinaryPath}`);
console.log(`  Output:  ${msiOutput}`);

// Run wixl
const cmd = `wixl -v --arch ${wixArch} --ext ui "${processedWxs}" -o "${msiOutput}"`;
console.log(`\nRunning: ${cmd}`);

try {
  execSync(cmd, { stdio: 'inherit', cwd: projectRoot });
  console.log(`\nMSI built successfully: ${msiOutput}`);

  const stats = fs.statSync(msiOutput);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
  console.log(`Size: ${sizeMB} MB`);
} catch (err) {
  console.error('\nwixl failed. Ensure msitools is installed (apt-get install msitools).');
  process.exit(1);
}
