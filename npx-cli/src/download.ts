import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

// Replaced during npm pack by scripts/release-local.sh
export const BINARY_TAG = '__BINARY_TAG__'; // e.g., v0.1.46.1778000000

// Binaries are GitHub Release assets of the BINARY_TAG release, stored flat:
//   <base>/<tag>/manifest.json
//   <base>/<tag>/<platform>-<binary>.zip
// VIBE_KANBAN_DOWNLOAD_BASE_URL points at a mirror with the same layout
// (a corporate proxy, or a local server when testing a release).
const DEFAULT_DOWNLOAD_BASE_URL =
  'https://github.com/BloopAI/vibe-kanban/releases/download';
export const DOWNLOAD_BASE_URL = (
  process.env.VIBE_KANBAN_DOWNLOAD_BASE_URL || DEFAULT_DOWNLOAD_BASE_URL
).replace(/\/+$/, '');
const NPM_LATEST_URL = 'https://registry.npmjs.org/vibe-kanban/latest';
const MAX_REDIRECTS = 5;
export const CACHE_DIR = path.join(os.homedir(), '.vibe-kanban', 'bin');

// Local development mode: use binaries from npx-cli/dist/ instead of downloading
// Only activate if dist/ exists (i.e., running from source after local-build.sh)
export const LOCAL_DIST_DIR = path.join(__dirname, '..', 'dist');
export const LOCAL_DEV_MODE =
  fs.existsSync(LOCAL_DIST_DIR) || process.env.VIBE_KANBAN_LOCAL === '1';

export interface BinaryInfo {
  sha256: string;
  size: number;
}

export interface BinaryManifest {
  platforms: Record<string, Record<string, BinaryInfo>>;
}

export interface DesktopPlatformInfo {
  file: string;
  sha256: string;
  type: string | null;
}

export interface DesktopManifest {
  platforms: Record<string, DesktopPlatformInfo>;
}

export interface DesktopBundleInfo {
  archivePath: string | null;
  dir: string;
  type: string | null;
}

type ProgressCallback = (downloaded: number, total: number) => void;

export class HttpError extends Error {
  constructor(
    readonly statusCode: number | undefined,
    readonly url: string,
    action: string
  ) {
    super(`HTTP ${statusCode} ${action} ${url}`);
  }
}

export function assetUrl(name: string): string {
  return `${DOWNLOAD_BASE_URL}/${BINARY_TAG}/${name}`;
}

export function binaryAssetName(platform: string, binaryName: string): string {
  return `${platform}-${binaryName}.zip`;
}

function httpGet(url: string, onResponse: (res: http.IncomingMessage) => void) {
  const client = url.startsWith('http:') ? http : https;
  return client.get(
    url,
    { headers: { 'User-Agent': 'vibe-kanban-cli' } },
    onResponse
  );
}

// GitHub release downloads answer with a 302 to a signed CDN URL.
function redirectTarget(res: http.IncomingMessage, url: string): string | null {
  const status = res.statusCode ?? 0;
  if (status < 300 || status >= 400 || !res.headers.location) return null;
  res.resume();
  return new URL(res.headers.location, url).toString();
}

function fetchJson<T>(url: string, redirects = 0): Promise<T> {
  return new Promise((resolve, reject) => {
    httpGet(url, (res) => {
      const next = redirectTarget(res, url);
      if (next) {
        if (redirects >= MAX_REDIRECTS) {
          return reject(new Error(`Too many redirects fetching ${url}`));
        }
        return fetchJson<T>(next, redirects + 1)
          .then(resolve)
          .catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new HttpError(res.statusCode, url, 'fetching'));
      }
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch {
          reject(new Error(`Failed to parse JSON from ${url}`));
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(
  url: string,
  destPath: string,
  expectedSha256: string | undefined,
  onProgress?: ProgressCallback,
  redirects = 0
): Promise<string> {
  const tempPath = destPath + '.tmp';
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tempPath);
    const hash = crypto.createHash('sha256');

    const cleanup = () => {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    };

    httpGet(url, (res) => {
      const next = redirectTarget(res, url);
      if (next) {
        file.close();
        cleanup();
        if (redirects >= MAX_REDIRECTS) {
          return reject(new Error(`Too many redirects downloading ${url}`));
        }
        return downloadFile(
          next,
          destPath,
          expectedSha256,
          onProgress,
          redirects + 1
        )
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        file.close();
        cleanup();
        return reject(new HttpError(res.statusCode, url, 'downloading'));
      }

      const totalSize = parseInt(res.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      res.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        hash.update(chunk);
        if (onProgress) onProgress(downloadedSize, totalSize);
      });
      res.pipe(file);

      file.on('finish', () => {
        file.close();
        const actualSha256 = hash.digest('hex');
        if (expectedSha256 && actualSha256 !== expectedSha256) {
          cleanup();
          reject(
            new Error(
              `Checksum mismatch: expected ${expectedSha256}, got ${actualSha256}`
            )
          );
        } else {
          try {
            fs.renameSync(tempPath, destPath);
            resolve(destPath);
          } catch (err) {
            cleanup();
            reject(err);
          }
        }
      });
    }).on('error', (err) => {
      file.close();
      cleanup();
      reject(err);
    });
  });
}

export async function ensureBinary(
  platform: string,
  binaryName: string,
  onProgress?: ProgressCallback
): Promise<string> {
  // In local dev mode, use binaries directly from npx-cli/dist/
  if (LOCAL_DEV_MODE) {
    const localZipPath = path.join(
      LOCAL_DIST_DIR,
      platform,
      `${binaryName}.zip`
    );
    if (fs.existsSync(localZipPath)) {
      return localZipPath;
    }
    throw new Error(
      `Local binary not found: ${localZipPath}\n` +
        `Run ./local-build.sh first to build the binaries.`
    );
  }

  const cacheDir = path.join(CACHE_DIR, BINARY_TAG, platform);
  const zipPath = path.join(cacheDir, `${binaryName}.zip`);

  if (fs.existsSync(zipPath)) return zipPath;

  fs.mkdirSync(cacheDir, { recursive: true });

  const manifest = await fetchJson<BinaryManifest>(assetUrl('manifest.json'));
  const binaryInfo = manifest.platforms?.[platform]?.[binaryName];

  if (!binaryInfo) {
    throw new Error(`Binary ${binaryName} not available for ${platform}`);
  }

  const url = assetUrl(binaryAssetName(platform, binaryName));
  await downloadFile(url, zipPath, binaryInfo.sha256, onProgress);

  return zipPath;
}

export const DESKTOP_CACHE_DIR = path.join(
  os.homedir(),
  '.vibe-kanban',
  'desktop'
);

export async function ensureDesktopBundle(
  tauriPlatform: string,
  onProgress?: ProgressCallback
): Promise<DesktopBundleInfo> {
  // In local dev mode, use Tauri bundle from npx-cli/dist/tauri/<platform>/
  if (LOCAL_DEV_MODE) {
    const localDir = path.join(LOCAL_DIST_DIR, 'tauri', tauriPlatform);
    if (fs.existsSync(localDir)) {
      const files = fs.readdirSync(localDir);
      const archive = files.find(
        (f) => f.endsWith('.tar.gz') || f.endsWith('-setup.exe')
      );
      return {
        dir: localDir,
        archivePath: archive ? path.join(localDir, archive) : null,
        type: null,
      };
    }
    throw new Error(
      `Local desktop bundle not found: ${localDir}\n` +
        `Run './local-build.sh --desktop' first to build the Tauri app.`
    );
  }

  const cacheDir = path.join(DESKTOP_CACHE_DIR, BINARY_TAG, tauriPlatform);

  // Check if already installed (sentinel file from previous run)
  const sentinelPath = path.join(cacheDir, '.installed');
  if (fs.existsSync(sentinelPath)) {
    return { dir: cacheDir, archivePath: null, type: null };
  }

  fs.mkdirSync(cacheDir, { recursive: true });

  // Fetch the desktop manifest. Releases built without a signing
  // certificate ship no desktop app, so there is no manifest to find.
  let manifest: DesktopManifest;
  try {
    manifest = await fetchJson<DesktopManifest>(
      assetUrl('desktop-manifest.json')
    );
  } catch (err) {
    if (err instanceof HttpError && err.statusCode === 404) {
      throw new Error(`this release (${BINARY_TAG}) has no desktop app`);
    }
    throw err;
  }
  const platformInfo = manifest.platforms?.[tauriPlatform];
  if (!platformInfo) {
    throw new Error(`Desktop app not available for platform: ${tauriPlatform}`);
  }

  const destPath = path.join(cacheDir, platformInfo.file);

  // Skip download if file already exists (e.g. previous failed install)
  if (!fs.existsSync(destPath)) {
    const url = assetUrl(`desktop-${tauriPlatform}-${platformInfo.file}`);
    await downloadFile(url, destPath, platformInfo.sha256, onProgress);
  }

  return {
    archivePath: destPath,
    dir: cacheDir,
    type: platformInfo.type,
  };
}

// The version the npm `latest` dist-tag points at.
export async function getLatestVersion(): Promise<string | undefined> {
  const pkg = await fetchJson<{ version?: string }>(NPM_LATEST_URL);
  return pkg.version;
}
