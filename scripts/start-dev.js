#!/usr/bin/env node
/**
 * Wrapper script for starting dev servers with concurrently.
 * Tracks the concurrently process PID for clean shutdown.
 *
 * This script:
 * 1. Gets ports from setup-dev-environment.js
 * 2. Spawns concurrently to run frontend and backend in parallel
 * 3. Writes concurrently PID to /tmp/vibe-kanban/instances/.dev_root_pid
 * 4. Forwards signals (SIGTERM, SIGINT) to concurrently
 * 5. Cleans up PID file on exit
 *
 * The PID file is read by the backend during instance registration,
 * allowing stop-server.js to kill all dev processes (not just the backend).
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const INSTANCES_DIR = path.join(os.tmpdir(), 'vibe-kanban', 'instances');
const PID_FILE = path.join(INSTANCES_DIR, '.dev_root_pid');

/**
 * Get a port value from setup-dev-environment.js
 */
function getPort(type) {
  try {
    const result = execSync(`node scripts/setup-dev-environment.js ${type}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch (e) {
    console.error(`Failed to get ${type} port:`, e.message);
    process.exit(1);
  }
}

/**
 * Write the dev root PID to temp file for backend to read during registration.
 */
function writePidFile(pid) {
  try {
    fs.mkdirSync(INSTANCES_DIR, { recursive: true });
    fs.writeFileSync(PID_FILE, pid.toString());
    console.log(`Dev root PID ${pid} written to ${PID_FILE}`);
  } catch (e) {
    console.warn(`Warning: Could not write dev root PID file: ${e.message}`);
  }
}

/**
 * Clean up the PID file.
 */
function cleanupPidFile() {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
      console.log('Cleaned up dev root PID file');
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Ensure vks-mcp-server binary exists in the dev target dir.
 * Builds it if missing so the backend can spawn it on startup.
 */
function ensureMcpBinary() {
  const cargoTargetDir = process.env.CARGO_TARGET_DIR || path.join(__dirname, '..', 'target');
  const mcpBinary = path.join(cargoTargetDir, 'debug', 'vks-mcp-server');
  if (fs.existsSync(mcpBinary)) return;

  console.log('vks-mcp-server not found, building...');
  try {
    execSync('cargo build --bin vks-mcp-server', {
      stdio: 'inherit',
      env: { ...process.env, CARGO_TARGET_DIR: cargoTargetDir },
    });
    console.log('vks-mcp-server built successfully');
  } catch (e) {
    console.warn('Warning: Failed to build vks-mcp-server:', e.message);
  }
}

ensureMcpBinary();

// Get ports from setup script
const frontendPort = getPort('frontend');
const backendPort = getPort('backend');
const host = getPort('host');

console.log(`Starting dev servers: frontend=${frontendPort}, backend=${backendPort}, host=${host}`);

// Environment variables for child processes
const env = {
  ...process.env,
  FRONTEND_PORT: frontendPort,
  BACKEND_PORT: backendPort,
  HOST: host,
};

// Spawn concurrently with frontend and backend commands
// Note: Using a single command string with shell: true to avoid DEP0190 warning
// (Node.js deprecates passing array args with shell: true as they get concatenated unsafely)
const child = spawn(
  'npx concurrently --kill-others --names backend,frontend "pnpm run backend:dev:watch" "pnpm run frontend:dev"',
  [],
  {
    env,
    stdio: 'inherit',
    shell: true,
  }
);

// Track whether spawn succeeded
let spawnSucceeded = false;

// Write PID file only after spawn succeeds (not immediately)
// This prevents writing invalid PIDs if the spawn fails
child.on('spawn', () => {
  spawnSucceeded = true;
  writePidFile(child.pid);
});

// Forward SIGTERM to concurrently for clean shutdown
process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, forwarding to concurrently...');
  child.kill('SIGTERM');
});

// Forward SIGINT (Ctrl+C) to concurrently
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT (Ctrl+C), forwarding to concurrently...');
  child.kill('SIGINT');
});

// Handle concurrently exit
child.on('exit', (code, signal) => {
  cleanupPidFile();

  if (signal) {
    console.log(`Concurrently exited with signal ${signal}`);
    // Exit with 128 + signal number for signal-based exits
    process.exit(128);
  } else {
    console.log(`Concurrently exited with code ${code}`);
    process.exit(code || 0);
  }
});

// Handle spawn errors (e.g., concurrently not found)
child.on('error', (err) => {
  if (!spawnSucceeded) {
    console.error('Failed to start concurrently:', err.message);
    console.error('Make sure concurrently is installed: npm install -g concurrently');
  } else {
    console.error('Process error:', err.message);
  }
  cleanupPidFile();
  process.exit(1);
});
