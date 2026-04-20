import { spawnSync } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

import {
  LAUNCHD_LABEL,
  LAUNCHD_PLIST_PATH,
  generateLaunchdPlist,
} from './templates/launchd';
import {
  SYSTEMD_SERVICE_NAME,
  SYSTEMD_UNIT_PATH,
  generateSystemdUnit,
} from './templates/systemd';

// Stable directory where the daemon binary is copied so service files
// don't break when the CLI cache is updated.
const DAEMON_DIR = path.join(os.homedir(), '.vibe-kanban', 'daemon');
const DAEMON_BIN = path.join(
  DAEMON_DIR,
  process.platform === 'win32' ? 'vibe-kanban.exe' : 'vibe-kanban',
);
const DAEMON_LOG = path.join(os.homedir(), '.vibe-kanban', 'daemon.log');

export interface DaemonOptions {
  port: string;
  host: string;
  force?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

function run(cmd: string): { ok: boolean; output: string } {
  try {
    const result = spawnSync(cmd, { shell: true, encoding: 'utf8' });
    return {
      ok: result.status === 0,
      output: (result.stdout || '') + (result.stderr || ''),
    };
  } catch {
    return { ok: false, output: '' };
  }
}

function ensureDaemonDir(): void {
  fs.mkdirSync(DAEMON_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Platform-specific implementations
// ---------------------------------------------------------------------------

// ---- macOS / launchd -------------------------------------------------------

function isMacOSDaemonInstalled(): boolean {
  return fs.existsSync(LAUNCHD_PLIST_PATH);
}

function getMacOSDaemonStatus(): 'running' | 'stopped' | 'not-installed' {
  if (!isMacOSDaemonInstalled()) return 'not-installed';
  const { ok, output } = run(`launchctl list ${LAUNCHD_LABEL} 2>/dev/null`);
  if (!ok || output.includes('Could not find service')) return 'stopped';
  // launchctl list outputs a JSON-like structure; if PID is present it's running
  if (/"PID"\s*=\s*\d+/.test(output) || /^\d+\s+\d+/.test(output.trim()))
    return 'running';
  // macOS Ventura+ uses a different format; check exit status line
  if (output.includes('"LastExitStatus" = 0') || output.match(/"PID"/))
    return 'running';
  return 'stopped';
}

async function installMacOS(
  cachedBinPath: string,
  host: string,
  port: string,
  force: boolean,
): Promise<void> {
  if (isMacOSDaemonInstalled() && !force) {
    console.error(
      'Agent Kanban daemon is already installed. Use --force to reinstall.',
    );
    process.exit(1);
  }

  const portNum = parseInt(port, 10);
  if (await isPortInUse(portNum)) {
    console.error(
      `Port ${port} is already in use. Choose a different port with --port.`,
    );
    process.exit(1);
  }

  // If already installed and force, unload first
  if (isMacOSDaemonInstalled()) {
    run(`launchctl unload -w "${LAUNCHD_PLIST_PATH}" 2>/dev/null`);
  }

  ensureDaemonDir();
  fs.copyFileSync(cachedBinPath, DAEMON_BIN);
  fs.chmodSync(DAEMON_BIN, 0o755);

  // Ensure LaunchAgents directory exists
  const launchAgentsDir = path.dirname(LAUNCHD_PLIST_PATH);
  fs.mkdirSync(launchAgentsDir, { recursive: true });

  const plist = generateLaunchdPlist(DAEMON_BIN, host, port, DAEMON_LOG);
  fs.writeFileSync(LAUNCHD_PLIST_PATH, plist, 'utf8');

  const { ok, output } = run(`launchctl load -w "${LAUNCHD_PLIST_PATH}"`);
  if (!ok) {
    console.error('Failed to register daemon with launchd:');
    console.error(output);
    process.exit(1);
  }

  console.log('Agent Kanban daemon installed and started.');
  console.log(`  URL:  http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
  console.log(`  Logs: ${DAEMON_LOG}`);
  console.log('');
  console.log('The daemon will start automatically on login.');
}

async function uninstallMacOS(): Promise<void> {
  if (!isMacOSDaemonInstalled()) {
    console.log('Agent Kanban daemon is not installed.');
    return;
  }
  run(`launchctl unload -w "${LAUNCHD_PLIST_PATH}" 2>/dev/null`);
  fs.unlinkSync(LAUNCHD_PLIST_PATH);
  console.log('Agent Kanban daemon stopped and removed.');
}

function statusMacOS(): void {
  const state = getMacOSDaemonStatus();
  if (state === 'not-installed') {
    console.log('Status: not installed');
    return;
  }
  if (state === 'running') {
    console.log('Status: running');
    try {
      const content = fs.readFileSync(LAUNCHD_PLIST_PATH, 'utf8');
      const portMatch = content.match(
        /<key>BACKEND_PORT<\/key>\s*<string>(\d+)<\/string>/,
      );
      const hostMatch = content.match(
        /<key>HOST<\/key>\s*<string>([^<]+)<\/string>/,
      );
      const port = portMatch?.[1] ?? '?';
      const host = hostMatch?.[1] ?? '127.0.0.1';
      console.log(
        `  URL:  http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`,
      );
    } catch {
      // ignore
    }
  } else {
    console.log('Status: stopped (installed but not running)');
  }
  console.log(`  Logs: ${DAEMON_LOG}`);
}

// ---- Linux / systemd -------------------------------------------------------

function isSystemdAvailable(): boolean {
  return run('systemctl --user --version 2>/dev/null').ok;
}

function isLinuxDaemonInstalled(): boolean {
  return fs.existsSync(SYSTEMD_UNIT_PATH);
}

function getLinuxDaemonStatus(): 'running' | 'stopped' | 'not-installed' {
  if (!isLinuxDaemonInstalled()) return 'not-installed';
  const { output } = run(
    `systemctl --user is-active ${SYSTEMD_SERVICE_NAME} 2>/dev/null`,
  );
  return output.trim() === 'active' ? 'running' : 'stopped';
}

function checkLinger(): void {
  const user = process.env.USER || os.userInfo().username;
  const { output } = run(
    `loginctl show-user "${user}" -p Linger 2>/dev/null`,
  );
  if (!output.includes('Linger=yes')) {
    console.log('');
    console.log(
      'Note: To keep the daemon running after you log out (e.g. on a remote server), run:',
    );
    console.log(`  loginctl enable-linger ${user}`);
    console.log(
      '(This requires sudo on some systems. Without it, the daemon stops when your session ends.)',
    );
  }
}

async function installLinux(
  cachedBinPath: string,
  host: string,
  port: string,
  force: boolean,
): Promise<void> {
  if (!isSystemdAvailable()) {
    console.error(
      'systemd is not available. Use Docker or run Agent Kanban manually.',
    );
    process.exit(1);
  }

  if (isLinuxDaemonInstalled() && !force) {
    console.error(
      'Agent Kanban daemon is already installed. Use --force to reinstall.',
    );
    process.exit(1);
  }

  const portNum = parseInt(port, 10);
  if (await isPortInUse(portNum)) {
    console.error(
      `Port ${port} is already in use. Choose a different port with --port.`,
    );
    process.exit(1);
  }

  // Stop existing service if reinstalling
  if (isLinuxDaemonInstalled()) {
    run(`systemctl --user stop ${SYSTEMD_SERVICE_NAME} 2>/dev/null`);
    run(`systemctl --user disable ${SYSTEMD_SERVICE_NAME} 2>/dev/null`);
  }

  ensureDaemonDir();
  fs.copyFileSync(cachedBinPath, DAEMON_BIN);
  fs.chmodSync(DAEMON_BIN, 0o755);

  // Ensure systemd user unit directory exists
  const unitDir = path.dirname(SYSTEMD_UNIT_PATH);
  fs.mkdirSync(unitDir, { recursive: true });

  const unit = generateSystemdUnit(DAEMON_BIN, host, port, DAEMON_LOG);
  fs.writeFileSync(SYSTEMD_UNIT_PATH, unit, 'utf8');

  const reload = run('systemctl --user daemon-reload');
  if (!reload.ok) {
    console.error('Failed to reload systemd:');
    console.error(reload.output);
    process.exit(1);
  }

  const enable = run(
    `systemctl --user enable --now ${SYSTEMD_SERVICE_NAME}`,
  );
  if (!enable.ok) {
    console.error('Failed to enable/start daemon:');
    console.error(enable.output);
    process.exit(1);
  }

  console.log('Agent Kanban daemon installed and started.');
  console.log(`  URL:  http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
  console.log(`  Logs: ${DAEMON_LOG}`);

  checkLinger();

  console.log('');
  console.log('The daemon will start automatically on login/boot.');
}

async function uninstallLinux(): Promise<void> {
  if (!isLinuxDaemonInstalled()) {
    console.log('Agent Kanban daemon is not installed.');
    return;
  }
  run(`systemctl --user stop ${SYSTEMD_SERVICE_NAME} 2>/dev/null`);
  run(`systemctl --user disable ${SYSTEMD_SERVICE_NAME} 2>/dev/null`);
  fs.unlinkSync(SYSTEMD_UNIT_PATH);
  run('systemctl --user daemon-reload 2>/dev/null');
  console.log('Agent Kanban daemon stopped and removed.');
}

function statusLinux(): void {
  const state = getLinuxDaemonStatus();
  if (state === 'not-installed') {
    console.log('Status: not installed');
    return;
  }
  if (state === 'running') {
    console.log('Status: running');
    try {
      const content = fs.readFileSync(SYSTEMD_UNIT_PATH, 'utf8');
      const portMatch = content.match(/Environment=BACKEND_PORT=(\d+)/);
      const hostMatch = content.match(/Environment=HOST=([^\s]+)/);
      const port = portMatch?.[1] ?? '?';
      const host = hostMatch?.[1] ?? '127.0.0.1';
      console.log(
        `  URL:  http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`,
      );
    } catch {
      // ignore
    }
  } else {
    console.log('Status: stopped (installed but not running)');
  }
  console.log(`  Logs: ${DAEMON_LOG}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function installDaemon(
  cachedBinPath: string,
  options: DaemonOptions,
): Promise<void> {
  const { host, port, force = false } = options;

  if (process.platform === 'darwin') {
    await installMacOS(cachedBinPath, host, port, force);
  } else if (process.platform === 'linux') {
    await installLinux(cachedBinPath, host, port, force);
  } else {
    console.error(
      'Daemon mode is not supported on Windows. Use WSL or Docker instead.',
    );
    process.exit(1);
  }
}

export async function uninstallDaemon(): Promise<void> {
  if (process.platform === 'darwin') {
    await uninstallMacOS();
  } else if (process.platform === 'linux') {
    await uninstallLinux();
  } else {
    console.error('Daemon mode is not supported on Windows.');
    process.exit(1);
  }
}

export function getDaemonStatus(): void {
  if (process.platform === 'darwin') {
    statusMacOS();
  } else if (process.platform === 'linux') {
    statusLinux();
  } else {
    console.error('Daemon mode is not supported on Windows.');
    process.exit(1);
  }
}

export function getDaemonLogs(lines: number = 100): void {
  if (!fs.existsSync(DAEMON_LOG)) {
    console.log('No daemon log file found. Has the daemon been started?');
    return;
  }
  try {
    // Use tail for efficiency on large log files
    const { output } = run(`tail -n ${lines} "${DAEMON_LOG}"`);
    process.stdout.write(output);
  } catch {
    // Fallback: read whole file
    const content = fs.readFileSync(DAEMON_LOG, 'utf8');
    const logLines = content.split('\n');
    console.log(logLines.slice(-lines).join('\n'));
  }
}

export function stopDaemon(): void {
  if (process.platform === 'darwin') {
    if (!isMacOSDaemonInstalled()) {
      console.log('Agent Kanban daemon is not installed.');
      return;
    }
    const { ok } = run(
      `launchctl unload "${LAUNCHD_PLIST_PATH}" 2>/dev/null`,
    );
    if (ok) {
      // Re-load so it stays registered for auto-start but is stopped
      run(`launchctl load "${LAUNCHD_PLIST_PATH}" 2>/dev/null`);
    }
    // Simpler: just stop the process via launchctl stop
    run(`launchctl stop ${LAUNCHD_LABEL} 2>/dev/null`);
    console.log('Agent Kanban daemon stopped.');
  } else if (process.platform === 'linux') {
    if (!isLinuxDaemonInstalled()) {
      console.log('Agent Kanban daemon is not installed.');
      return;
    }
    run(`systemctl --user stop ${SYSTEMD_SERVICE_NAME}`);
    console.log('Agent Kanban daemon stopped.');
  } else {
    console.error('Daemon mode is not supported on Windows.');
    process.exit(1);
  }
}

export function startDaemon(): void {
  if (process.platform === 'darwin') {
    if (!isMacOSDaemonInstalled()) {
      console.log(
        'Agent Kanban daemon is not installed. Run: npx vibe-kanban daemon install',
      );
      return;
    }
    run(`launchctl start ${LAUNCHD_LABEL}`);
    console.log('Agent Kanban daemon started.');
  } else if (process.platform === 'linux') {
    if (!isLinuxDaemonInstalled()) {
      console.log(
        'Agent Kanban daemon is not installed. Run: npx vibe-kanban daemon install',
      );
      return;
    }
    run(`systemctl --user start ${SYSTEMD_SERVICE_NAME}`);
    console.log('Agent Kanban daemon started.');
  } else {
    console.error('Daemon mode is not supported on Windows.');
    process.exit(1);
  }
}

// Re-export for use in cli.ts to copy binary from versioned cache
export function getDaemonBinPath(): string {
  return DAEMON_BIN;
}

export { DAEMON_LOG };
