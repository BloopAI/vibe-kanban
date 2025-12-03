#!/usr/bin/env node

/**
 * Post-install script that runs after npm/pnpm install
 * Ensures all development dependencies are set up correctly
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Check if a command exists on the system
 */
function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a command and display output
 */
function run(cmd, options = {}) {
  console.log(`\n> ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', ...options });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if cargo-watch is installed
 */
function hasCargoWatch() {
  try {
    execSync('cargo watch --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // Prevent recursive execution - if already running postinstall, skip
  if (process.env.VIBE_KANBAN_POSTINSTALL_RUNNING === '1') {
    return;
  }

  // Skip postinstall during npm pack/publish
  if (process.env.npm_command === 'pack' || process.env.npm_command === 'publish') {
    console.log('Skipping postinstall during pack/publish');
    return;
  }

  // Check if being run from npm (not pnpm) - only then do we need to run pnpm install
  // When run via pnpm, pnpm handles workspace dependencies automatically
  const isNpmInstall = process.env.npm_execpath && !process.env.npm_execpath.includes('pnpm');

  console.log('Running postinstall setup...\n');

  // Check for pnpm and run install if we're coming from npm
  if (!commandExists('pnpm')) {
    console.log('\n⚠️  pnpm is not installed.');
    console.log('   Install it with: npm install -g pnpm');
    console.log('   Or see: https://pnpm.io/installation\n');
  } else if (isNpmInstall) {
    // Only run pnpm install if user ran npm install (not pnpm install)
    // This installs workspace dependencies that npm doesn't know about
    console.log('Installing pnpm workspace dependencies...');
    const env = { ...process.env, VIBE_KANBAN_POSTINSTALL_RUNNING: '1' };
    if (!run('pnpm install', { cwd: ROOT_DIR, env })) {
      console.error('Failed to install pnpm workspace dependencies');
    }
  }

  // Check for Rust/Cargo
  if (!commandExists('cargo')) {
    console.log('\n⚠️  Rust/Cargo is not installed.');
    console.log('   Install it from: https://rustup.rs/\n');
  } else {
    // Check for cargo-watch
    if (!hasCargoWatch()) {
      console.log('\nInstalling cargo-watch (required for development)...');
      if (!run('cargo install cargo-watch')) {
        console.error('Failed to install cargo-watch');
        console.log('   You can install it manually with: cargo install cargo-watch\n');
      }
    } else {
      console.log('cargo-watch is already installed');
    }
  }

  console.log('\n✅ Postinstall complete!\n');
}

main().catch(console.error);
