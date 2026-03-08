const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Map NPX-style platform names to Tauri-style platform names
function getTauriPlatform(npxPlatformDir) {
  const map = {
    'macos-arm64': 'darwin-aarch64',
    'macos-x64': 'darwin-x86_64',
    'linux-x64': 'linux-x86_64',
    'linux-arm64': 'linux-aarch64',
    'windows-x64': 'windows-x86_64',
  };
  return map[npxPlatformDir] || null;
}

// Extract .tar.gz using system tar (available on macOS, Linux, and Windows 10+)
function extractTarGz(archivePath, destDir) {
  execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, { stdio: 'pipe' });
}

function writeSentinel(dir, meta) {
  fs.writeFileSync(path.join(dir, '.installed'), JSON.stringify(meta));
}

function readSentinel(dir) {
  const sentinelPath = path.join(dir, '.installed');
  if (!fs.existsSync(sentinelPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(sentinelPath, 'utf-8'));
  } catch {
    return null;
  }
}

// macOS: extract .app.tar.gz, remove quarantine, launch with `open`
async function installAndLaunchMacOS(bundleInfo) {
  const { archivePath, dir } = bundleInfo;

  const sentinel = readSentinel(dir);
  if (sentinel && sentinel.appPath && fs.existsSync(sentinel.appPath)) {
    return launchMacOSApp(sentinel.appPath);
  }

  if (!archivePath || !fs.existsSync(archivePath)) {
    throw new Error('No archive to extract for macOS desktop app');
  }

  extractTarGz(archivePath, dir);

  const appName = fs.readdirSync(dir).find((f) => f.endsWith('.app'));
  if (!appName) {
    throw new Error(`No .app bundle found in ${dir} after extraction`);
  }

  const appPath = path.join(dir, appName);

  // Remove quarantine attribute (app is already signed and notarized in CI)
  try {
    execSync(`xattr -rd com.apple.quarantine "${appPath}"`, { stdio: 'pipe' });
  } catch {}

  writeSentinel(dir, { type: 'app-tar-gz', appPath });

  return launchMacOSApp(appPath);
}

function launchMacOSApp(appPath) {
  const appName = path.basename(appPath);
  console.error(`Launching ${appName}...`);
  const proc = spawn('open', ['--wait-apps', appPath], { stdio: 'inherit' });
  return new Promise((resolve) => {
    proc.on('exit', (code) => resolve(code || 0));
  });
}

// Linux: extract AppImage.tar.gz, chmod +x, run
async function installAndLaunchLinux(bundleInfo) {
  const { archivePath, dir } = bundleInfo;

  const sentinel = readSentinel(dir);
  if (sentinel && sentinel.appPath && fs.existsSync(sentinel.appPath)) {
    return launchLinuxAppImage(sentinel.appPath);
  }

  if (!archivePath || !fs.existsSync(archivePath)) {
    throw new Error('No archive to extract for Linux desktop app');
  }

  extractTarGz(archivePath, dir);

  const appImage = fs.readdirSync(dir).find((f) => f.endsWith('.AppImage'));
  if (!appImage) {
    throw new Error(`No .AppImage found in ${dir} after extraction`);
  }

  const appImagePath = path.join(dir, appImage);
  fs.chmodSync(appImagePath, 0o755);

  writeSentinel(dir, { type: 'appimage-tar-gz', appPath: appImagePath });

  return launchLinuxAppImage(appImagePath);
}

function launchLinuxAppImage(appImagePath) {
  const appImage = path.basename(appImagePath);
  console.error(`Launching ${appImage}...`);
  const proc = spawn(appImagePath, [], { stdio: 'inherit', detached: false });
  return new Promise((resolve) => {
    proc.on('exit', (code) => resolve(code || 0));
  });
}

// Windows: run NSIS setup.exe silently, then launch installed app
async function installAndLaunchWindows(bundleInfo) {
  const { dir } = bundleInfo;

  const sentinel = readSentinel(dir);
  if (sentinel && sentinel.appPath) {
    const appExe = path.join(sentinel.appPath, 'Vibe Kanban.exe');
    if (fs.existsSync(appExe)) {
      return launchWindowsApp(appExe);
    }
  }

  // Find the NSIS installer
  const files = fs.readdirSync(dir);
  const installer = files.find(
    (f) => f.endsWith('-setup.exe') || (f.endsWith('.exe') && f !== '.installed')
  );
  if (!installer) {
    throw new Error(`No installer found in ${dir}`);
  }

  const installerPath = path.join(dir, installer);
  const installDir = path.join(dir, 'app');

  console.error('Installing Vibe Kanban...');
  try {
    // NSIS supports /S for silent install and /D= for install directory
    execSync(`"${installerPath}" /S /D="${installDir}"`, {
      stdio: 'inherit',
      timeout: 120000,
    });
  } catch {
    // If silent install fails (e.g. UAC denied), try interactive
    console.error('Silent install failed, launching interactive installer...');
    execSync(`"${installerPath}"`, { stdio: 'inherit' });
    // For interactive install, the default location is used
    const defaultDir = path.join(
      process.env.LOCALAPPDATA || '',
      'vibe-kanban'
    );
    if (fs.existsSync(path.join(defaultDir, 'Vibe Kanban.exe'))) {
      writeSentinel(dir, { type: 'nsis-exe', appPath: defaultDir });
      return launchWindowsApp(path.join(defaultDir, 'Vibe Kanban.exe'));
    }
    console.error(
      'Installation complete. Please launch Vibe Kanban from your Start menu.'
    );
    return 0;
  }

  writeSentinel(dir, { type: 'nsis-exe', appPath: installDir });

  const appExe = path.join(installDir, 'Vibe Kanban.exe');
  if (fs.existsSync(appExe)) {
    return launchWindowsApp(appExe);
  }

  console.error(
    'Installation complete. Please launch Vibe Kanban from your Start menu.'
  );
  return 0;
}

function launchWindowsApp(appExe) {
  console.error('Launching Vibe Kanban...');
  spawn(appExe, [], { detached: true, stdio: 'ignore' }).unref();
  return 0;
}

async function installAndLaunch(bundleInfo, osPlatform) {
  if (osPlatform === 'darwin') {
    return installAndLaunchMacOS(bundleInfo);
  } else if (osPlatform === 'linux') {
    return installAndLaunchLinux(bundleInfo);
  } else if (osPlatform === 'win32') {
    return installAndLaunchWindows(bundleInfo);
  }
  throw new Error(`Desktop app not supported on platform: ${osPlatform}`);
}

function cleanOldDesktopVersions(desktopBaseDir, currentTag) {
  try {
    const entries = fs.readdirSync(desktopBaseDir, { withFileTypes: true });
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

module.exports = {
  getTauriPlatform,
  installAndLaunch,
  cleanOldDesktopVersions,
};
