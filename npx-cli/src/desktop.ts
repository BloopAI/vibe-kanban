import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type { DesktopBundleInfo } from './download';

type TauriPlatform = string | null;

interface SentinelMeta {
  type: string;
  appPath: string;
}

const PLATFORM_MAP: Record<string, string> = {
  'macos-arm64': 'darwin-aarch64',
  'macos-x64': 'darwin-x86_64',
  'linux-x64': 'linux-x86_64',
  'linux-arm64': 'linux-aarch64',
  'windows-x64': 'windows-x86_64',
  'windows-arm64': 'windows-aarch64',
};

// Map NPX-style platform names to Tauri-style platform names
export function getTauriPlatform(
  npxPlatformDir: string
): TauriPlatform {
  return PLATFORM_MAP[npxPlatformDir] || null;
}

// Extract .tar.gz using system tar (available on macOS, Linux, and Windows 10+)
function extractTarGz(archivePath: string, destDir: string): void {
  execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, {
    stdio: 'pipe',
  });
}

function writeSentinel(dir: string, meta: SentinelMeta): void {
  fs.writeFileSync(
    path.join(dir, '.installed'),
    JSON.stringify(meta)
  );
}

function readSentinel(dir: string): SentinelMeta | null {
  const sentinelPath = path.join(dir, '.installed');
  if (!fs.existsSync(sentinelPath)) return null;
  try {
    return JSON.parse(
      fs.readFileSync(sentinelPath, 'utf-8')
    ) as SentinelMeta;
  } catch {
    return null;
  }
}

// Try to copy the .app to a destination directory, returning the final path on success
function tryCopyApp(
  srcAppPath: string,
  destDir: string
): string | null {
  try {
    const appName = path.basename(srcAppPath);
    const destAppPath = path.join(destDir, appName);

    // Ensure destination directory exists
    fs.mkdirSync(destDir, { recursive: true });

    // Remove existing app at destination if present
    if (fs.existsSync(destAppPath)) {
      fs.rmSync(destAppPath, { recursive: true, force: true });
    }

    // Use cp -R for macOS .app bundles (preserves symlinks and metadata)
    execSync(`cp -R "${srcAppPath}" "${destAppPath}"`, {
      stdio: 'pipe',
    });

    return destAppPath;
  } catch {
    return null;
  }
}

// macOS: extract .app.tar.gz, copy to /Applications, remove quarantine, launch with `open`
async function installAndLaunchMacOS(
  bundleInfo: DesktopBundleInfo
): Promise<number> {
  const { archivePath, dir } = bundleInfo;

  const sentinel = readSentinel(dir);
  if (sentinel?.appPath && fs.existsSync(sentinel.appPath)) {
    return launchMacOSApp(sentinel.appPath);
  }

  if (!archivePath || !fs.existsSync(archivePath)) {
    throw new Error('No archive to extract for macOS desktop app');
  }

  extractTarGz(archivePath, dir);

  const appName = fs.readdirSync(dir).find((f) => f.endsWith('.app'));
  if (!appName) {
    throw new Error(
      `No .app bundle found in ${dir} after extraction`
    );
  }

  const extractedAppPath = path.join(dir, appName);

  // Try to install to /Applications, then ~/Applications, then fall back to cache dir
  const userApplications = path.join(os.homedir(), 'Applications');
  const finalAppPath =
    tryCopyApp(extractedAppPath, '/Applications') ??
    tryCopyApp(extractedAppPath, userApplications) ??
    extractedAppPath;

  // Clean up extracted copy if we successfully copied elsewhere
  if (finalAppPath !== extractedAppPath) {
    try {
      fs.rmSync(extractedAppPath, { recursive: true, force: true });
    } catch {}
  }

  // Remove quarantine attribute (app is already signed and notarized in CI)
  try {
    execSync(`xattr -rd com.apple.quarantine "${finalAppPath}"`, {
      stdio: 'pipe',
    });
  } catch {}

  writeSentinel(dir, { type: 'app-tar-gz', appPath: finalAppPath });

  return launchMacOSApp(finalAppPath);
}

function launchMacOSApp(appPath: string): Promise<number> {
  const appName = path.basename(appPath);
  console.error(`Launching ${appName}...`);
  const proc = spawn('open', ['--wait-apps', appPath], {
    stdio: 'inherit',
  });
  return new Promise((resolve) => {
    proc.on('exit', (code) => resolve(code || 0));
  });
}

// Linux: extract AppImage.tar.gz, chmod +x, run
async function installAndLaunchLinux(
  bundleInfo: DesktopBundleInfo
): Promise<number> {
  const { archivePath, dir } = bundleInfo;

  const sentinel = readSentinel(dir);
  if (sentinel?.appPath && fs.existsSync(sentinel.appPath)) {
    return launchLinuxAppImage(sentinel.appPath);
  }

  if (!archivePath || !fs.existsSync(archivePath)) {
    throw new Error('No archive to extract for Linux desktop app');
  }

  extractTarGz(archivePath, dir);

  const appImage = fs
    .readdirSync(dir)
    .find((f) => f.endsWith('.AppImage'));
  if (!appImage) {
    throw new Error(`No .AppImage found in ${dir} after extraction`);
  }

  const appImagePath = path.join(dir, appImage);
  fs.chmodSync(appImagePath, 0o755);

  writeSentinel(dir, {
    type: 'appimage-tar-gz',
    appPath: appImagePath,
  });

  return launchLinuxAppImage(appImagePath);
}

function launchLinuxAppImage(appImagePath: string): Promise<number> {
  const appImage = path.basename(appImagePath);
  console.error(`Launching ${appImage}...`);
  const proc = spawn(appImagePath, [], {
    stdio: 'inherit',
    detached: false,
  });
  return new Promise((resolve) => {
    proc.on('exit', (code) => resolve(code || 0));
  });
}

// Windows: run NSIS setup.exe silently, then launch installed app
async function installAndLaunchWindows(
  bundleInfo: DesktopBundleInfo
): Promise<number> {
  const { dir } = bundleInfo;

  const sentinel = readSentinel(dir);
  if (sentinel?.appPath) {
    const appExe = path.join(sentinel.appPath, 'Agent Kanban.exe');
    if (fs.existsSync(appExe)) {
      return launchWindowsApp(appExe);
    }
  }

  // Find the NSIS installer
  const files = fs.readdirSync(dir);
  const installer = files.find(
    (f) =>
      f.endsWith('-setup.exe') ||
      (f.endsWith('.exe') && f !== '.installed')
  );
  if (!installer) {
    throw new Error(`No installer found in ${dir}`);
  }

  const installerPath = path.join(dir, installer);
  const installDir = path.join(dir, 'app');

  console.error('Installing Agent Kanban...');
  try {
    // NSIS supports /S for silent install and /D= for install directory
    execSync(`"${installerPath}" /S /D="${installDir}"`, {
      stdio: 'inherit',
      timeout: 120000,
    });
  } catch {
    // If silent install fails (e.g. UAC denied), try interactive
    console.error(
      'Silent install failed, launching interactive installer...'
    );
    execSync(`"${installerPath}"`, { stdio: 'inherit' });
    // For interactive install, the default location is used
    const defaultDir = path.join(
      process.env.LOCALAPPDATA || '',
      'vibe-kanban'
    );
    if (fs.existsSync(path.join(defaultDir, 'Agent Kanban.exe'))) {
      writeSentinel(dir, {
        type: 'nsis-exe',
        appPath: defaultDir,
      });
      return launchWindowsApp(
        path.join(defaultDir, 'Agent Kanban.exe')
      );
    }
    console.error(
      'Installation complete. Please launch Agent Kanban from your Start menu.'
    );
    return 0;
  }

  writeSentinel(dir, { type: 'nsis-exe', appPath: installDir });

  const appExe = path.join(installDir, 'Agent Kanban.exe');
  if (fs.existsSync(appExe)) {
    return launchWindowsApp(appExe);
  }

  console.error(
    'Installation complete. Please launch Agent Kanban from your Start menu.'
  );
  return 0;
}

function launchWindowsApp(appExe: string): number {
  console.error('Launching Agent Kanban...');
  spawn(appExe, [], { detached: true, stdio: 'ignore' }).unref();
  return 0;
}

export async function installAndLaunch(
  bundleInfo: DesktopBundleInfo,
  osPlatform: NodeJS.Platform
): Promise<number> {
  if (osPlatform === 'darwin') {
    return installAndLaunchMacOS(bundleInfo);
  } else if (osPlatform === 'linux') {
    return installAndLaunchLinux(bundleInfo);
  } else if (osPlatform === 'win32') {
    return installAndLaunchWindows(bundleInfo);
  }
  throw new Error(
    `Desktop app not supported on platform: ${osPlatform}`
  );
}

export function cleanOldDesktopVersions(
  desktopBaseDir: string,
  currentTag: string
): void {
  try {
    const entries = fs.readdirSync(desktopBaseDir, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== currentTag) {
        const oldDir = path.join(desktopBaseDir, entry.name);
        try {
          fs.rmSync(oldDir, { recursive: true, force: true });
        } catch {
          // Ignore errors (e.g. EBUSY on Windows if app is running)
        }
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}
