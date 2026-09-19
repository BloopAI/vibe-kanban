import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import launcherScript from './launcher.sh';
import infoPlist from './Info.plist';

const APP_NAME = 'Vibe Kanban';
const BUNDLED_ICON = path.join(__dirname, '../../assets', 'AppIcon.png');

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

export async function installMacApp(): Promise<void> {
  if (process.platform !== 'darwin') {
    console.error('--mac is only supported on macOS.');
    process.exit(1);
  }

  const appDir = `/Applications/${APP_NAME}.app`;
  const contentsDir = path.join(appDir, 'Contents');
  const macosDir = path.join(contentsDir, 'MacOS');
  const resourcesDir = path.join(contentsDir, 'Resources');

  console.log(`Installing ${APP_NAME} to ${appDir}...`);

  fs.mkdirSync(macosDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });

  fs.writeFileSync(path.join(contentsDir, 'Info.plist'), infoPlist);

  const launcherPath = path.join(macosDir, 'vibe-kanban');
  fs.writeFileSync(launcherPath, launcherScript);
  fs.chmodSync(launcherPath, 0o755);

  try {
    const iconsetDir = path.join(os.tmpdir(), 'vibe-kanban-install.iconset');
    buildIconset(BUNDLED_ICON, iconsetDir);
    const icnsPath = path.join(resourcesDir, 'AppIcon.icns');
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'pipe' });
    fs.rmSync(iconsetDir, { recursive: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: Could not install icon: ${msg}`);
  }

  try {
    execSync(
      `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${appDir}"`,
      { stdio: 'pipe' }
    );
  } catch {
    // Non-critical
  }

  console.log(`\n✅ ${APP_NAME} installed to ${appDir}`);
  console.log('Launching...');
  execSync(`open "${appDir}"`, { stdio: 'ignore' });
}
