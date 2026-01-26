const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Replaced during npm pack by workflow
const GITHUB_REPO = "__GITHUB_REPO__"; // e.g., "moto-taka/vibe-kanban-pm"
const BINARY_TAG = "__BINARY_TAG__"; // e.g., v0.0.135-20251215122030
const CACHE_DIR = path.join(require("os").homedir(), ".vibe-kanban-pm", "bin");

// Local development mode: use binaries from npx-cli/dist/ instead of GitHub
// Only activate if running from source repo (local-build.sh exists) or env var is set
const LOCAL_DIST_DIR = path.join(__dirname, "..", "dist");
const IS_SOURCE_REPO = fs.existsSync(path.join(__dirname, "..", "..", "local-build.sh"));
const LOCAL_DEV_MODE = (IS_SOURCE_REPO && fs.existsSync(LOCAL_DIST_DIR)) || process.env.VIBE_KANBAN_LOCAL === "1";

function getGitHubDownloadUrl(binaryName, platform) {
  return `https://github.com/${GITHUB_REPO}/releases/download/${BINARY_TAG}/${binaryName}-${platform}.zip`;
}

async function downloadFile(url, destPath, onProgress) {
  const tempPath = destPath + ".tmp";
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tempPath);

    const cleanup = () => {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    };

    const doRequest = (requestUrl) => {
      https.get(requestUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          cleanup();
          // Follow redirect
          const redirectUrl = res.headers.location;
          const newFile = fs.createWriteStream(tempPath);
          doRequestFinal(redirectUrl, newFile);
          return;
        }

        if (res.statusCode !== 200) {
          file.close();
          cleanup();
          return reject(new Error(`HTTP ${res.statusCode} downloading ${requestUrl}`));
        }

        const totalSize = parseInt(res.headers["content-length"], 10);
        let downloadedSize = 0;

        res.on("data", (chunk) => {
          downloadedSize += chunk.length;
          if (onProgress) onProgress(downloadedSize, totalSize);
        });
        res.pipe(file);

        file.on("finish", () => {
          file.close();
          try {
            fs.renameSync(tempPath, destPath);
            resolve(destPath);
          } catch (err) {
            cleanup();
            reject(err);
          }
        });
      }).on("error", (err) => {
        file.close();
        cleanup();
        reject(err);
      });
    };

    const doRequestFinal = (requestUrl, fileStream) => {
      https.get(requestUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          fileStream.close();
          cleanup();
          // Follow another redirect
          return doRequestFinal(res.headers.location, fs.createWriteStream(tempPath));
        }

        if (res.statusCode !== 200) {
          fileStream.close();
          cleanup();
          return reject(new Error(`HTTP ${res.statusCode} downloading ${requestUrl}`));
        }

        const totalSize = parseInt(res.headers["content-length"], 10);
        let downloadedSize = 0;

        res.on("data", (chunk) => {
          downloadedSize += chunk.length;
          if (onProgress) onProgress(downloadedSize, totalSize);
        });
        res.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close();
          try {
            fs.renameSync(tempPath, destPath);
            resolve(destPath);
          } catch (err) {
            cleanup();
            reject(err);
          }
        });
      }).on("error", (err) => {
        fileStream.close();
        cleanup();
        reject(err);
      });
    };

    doRequest(url);
  });
}

async function ensureBinary(platform, binaryName, onProgress) {
  // In local dev mode, use binaries directly from npx-cli/dist/
  if (LOCAL_DEV_MODE) {
    const localZipPath = path.join(LOCAL_DIST_DIR, platform, `${binaryName}.zip`);
    if (fs.existsSync(localZipPath)) {
      return localZipPath;
    }
    throw new Error(
      `Local binary not found: ${localZipPath}\n` +
      `Run ./local-build.sh first to build the binaries.`
    );
  }

  // Check if GitHub repo is configured
  if (GITHUB_REPO.startsWith("__")) {
    // Not configured - check if bundled in package
    const bundledZipPath = path.join(LOCAL_DIST_DIR, platform, `${binaryName}.zip`);
    if (fs.existsSync(bundledZipPath)) {
      return bundledZipPath;
    }
    throw new Error(
      `Binary not available for ${platform}.\n` +
      `This package only includes Linux x64 binaries.\n` +
      `For other platforms, please build from source or wait for a proper release.`
    );
  }

  const cacheDir = path.join(CACHE_DIR, BINARY_TAG, platform);
  const zipPath = path.join(cacheDir, `${binaryName}.zip`);

  if (fs.existsSync(zipPath)) return zipPath;

  fs.mkdirSync(cacheDir, { recursive: true });

  const url = getGitHubDownloadUrl(binaryName, platform);
  await downloadFile(url, zipPath, onProgress);

  return zipPath;
}

async function getLatestVersion() {
  // For GitHub releases, we don't have a manifest
  // Return null to indicate version check is not available
  return null;
}

module.exports = { GITHUB_REPO, BINARY_TAG, CACHE_DIR, LOCAL_DEV_MODE, LOCAL_DIST_DIR, ensureBinary, getLatestVersion };
