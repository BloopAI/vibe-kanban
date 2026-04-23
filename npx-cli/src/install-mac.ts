import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const APP_NAME = 'Vibe Kanban';
const BUNDLE_ID = 'com.vibekanban.app';
const BUNDLED_ICON = path.join(__dirname, '..', 'assets', 'AppIcon.png');

function buildIconset(pngPath: string, iconsetDir: string): void {
  fs.mkdirSync(iconsetDir, { recursive: true });

  const entries: Array<[number, string]> = [
    [16,   'icon_16x16.png'],
    [32,   'icon_16x16@2x.png'],
    [32,   'icon_32x32.png'],
    [64,   'icon_32x32@2x.png'],
    [128,  'icon_128x128.png'],
    [256,  'icon_128x128@2x.png'],
    [256,  'icon_256x256.png'],
    [512,  'icon_256x256@2x.png'],
    [512,  'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ];

  for (const [size, name] of entries) {
    execSync(`sips -z ${size} ${size} "${pngPath}" --out "${iconsetDir}/${name}"`, {
      stdio: 'pipe',
    });
  }
}

function getLauncherScript(): string {
  return `#!/usr/bin/env bash
# Vibe Kanban macOS launcher

LOG="/tmp/vibe-kanban.log"

# Build PATH from common Node.js install locations so npx is found
for d in \\
  "$HOME/.nvm/versions/node/"*/bin \\
  "$HOME/.volta/bin" \\
  "/opt/homebrew/bin" \\
  "/usr/local/bin" \\
  "/usr/bin"; do
  [ -d "$d" ] && export PATH="$d:$PATH"
done

NPX=$(command -v npx 2>/dev/null)

if [ -z "$NPX" ]; then
  osascript -e 'display alert "Vibe Kanban" message "Could not find npx. Please make sure Node.js is installed."'
  exit 1
fi

# Reuse existing session if the server port is still listening
if [ -f "$LOG" ]; then
  PORT=$(grep -o 'Main server on :[0-9]*' "$LOG" 2>/dev/null | tail -1 | grep -o '[0-9]*$')
  if [ -n "$PORT" ] && nc -z 127.0.0.1 "$PORT" 2>/dev/null; then
    open "http://127.0.0.1:$PORT"
    exit 0
  fi
fi

# Start the server — it opens the browser on its own
rm -f "$LOG"
"$NPX" vibe-kanban >"$LOG" 2>&1 &
`;
}

function getInfoPlist(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>vibe-kanban</string>
  <key>LSUIElement</key>
  <false/>
</dict>
</plist>
`;
}

export async function installMacApp(): Promise<void> {
  if (process.platform !== 'darwin') {
    console.error('install-mac is only supported on macOS.');
    process.exit(1);
  }

  const appDir = `/Applications/${APP_NAME}.app`;
  const contentsDir = path.join(appDir, 'Contents');
  const macosDir = path.join(contentsDir, 'MacOS');
  const resourcesDir = path.join(contentsDir, 'Resources');

  console.log(`Installing ${APP_NAME} to ${appDir}...`);

  // Create bundle structure
  fs.mkdirSync(macosDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });

  // Write Info.plist
  fs.writeFileSync(path.join(contentsDir, 'Info.plist'), getInfoPlist());

  // Write launcher script
  const launcherPath = path.join(macosDir, 'vibe-kanban');
  fs.writeFileSync(launcherPath, getLauncherScript());
  fs.chmodSync(launcherPath, 0o755);

  // Use bundled icon to build .icns
  try {
    const iconsetDir = path.join(os.tmpdir(), 'vibe-kanban-install.iconset');
    buildIconset(BUNDLED_ICON, iconsetDir);

    const icnsPath = path.join(resourcesDir, 'AppIcon.icns');
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, {
      stdio: 'pipe',
    });

    fs.rmSync(iconsetDir, { recursive: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`\nWarning: Could not install icon: ${msg}`);
  }

  // Register with Launch Services so Spotlight and Dock pick it up
  try {
    execSync(
      `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${appDir}"`,
      { stdio: 'pipe' }
    );
  } catch {
    // Non-critical — app still works without this
  }

  console.log(`\n✅ ${APP_NAME} installed to ${appDir}`);
  console.log('Launching...');
  execSync(`open "${appDir}"`, { stdio: 'ignore' });
}
