const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Replaced during npm pack by workflow
const R2_BASE_URL = "__R2_PUBLIC_URL__";
const BINARY_TAG = "__BINARY_TAG__"; // e.g., v0.0.135-20251215122030
const CACHE_DIR = path.join(require("os").homedir(), ".vibe-kanban", "bin");

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}`));
        }
      });
    }).on("error", reject);
  });
}

async function downloadFile(url, destPath, expectedSha256, onProgress) {
  const tempPath = destPath + ".tmp";
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tempPath);
    const hash = crypto.createHash("sha256");

    const cleanup = () => {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    };

    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        cleanup();
        return downloadFile(res.headers.location, destPath, expectedSha256, onProgress)
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        file.close();
        cleanup();
        return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
      }

      const totalSize = parseInt(res.headers["content-length"], 10);
      let downloadedSize = 0;

      res.on("data", (chunk) => {
        downloadedSize += chunk.length;
        hash.update(chunk);
        if (onProgress) onProgress(downloadedSize, totalSize);
      });
      res.pipe(file);

      file.on("finish", () => {
        file.close();
        const actualSha256 = hash.digest("hex");
        if (expectedSha256 && actualSha256 !== expectedSha256) {
          cleanup();
          reject(new Error(`Checksum mismatch: expected ${expectedSha256}, got ${actualSha256}`));
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
    }).on("error", (err) => {
      file.close();
      cleanup();
      reject(err);
    });
  });
}

async function ensureBinary(platform, binaryName, onProgress) {
  const cacheDir = path.join(CACHE_DIR, BINARY_TAG, platform);
  const zipPath = path.join(cacheDir, `${binaryName}.zip`);

  if (fs.existsSync(zipPath)) return zipPath;

  fs.mkdirSync(cacheDir, { recursive: true });

  const manifest = await fetchJson(`${R2_BASE_URL}/binaries/${BINARY_TAG}/manifest.json`);
  const binaryInfo = manifest.platforms?.[platform]?.[binaryName];

  if (!binaryInfo) {
    throw new Error(`Binary ${binaryName} not available for ${platform}`);
  }

  const url = `${R2_BASE_URL}/binaries/${BINARY_TAG}/${platform}/${binaryName}.zip`;
  await downloadFile(url, zipPath, binaryInfo.sha256, onProgress);

  return zipPath;
}

async function getLatestVersion() {
  const manifest = await fetchJson(`${R2_BASE_URL}/binaries/manifest.json`);
  return manifest.latest;
}

module.exports = { R2_BASE_URL, BINARY_TAG, CACHE_DIR, ensureBinary, getLatestVersion };
