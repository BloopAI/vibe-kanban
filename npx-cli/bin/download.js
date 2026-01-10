const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ProxyAgent = require("proxy-agent");

// Replaced during npm publish by workflow
const RELEASE_REPO = "__RELEASE_REPO__"; // e.g., mxyhi/vibe-kanban
const BINARY_TAG = "__BINARY_TAG__"; // e.g., v0.0.135
const RELEASE_BASE_URL = `https://github.com/${RELEASE_REPO}/releases/download`;
const CACHE_DIR = path.join(require("os").homedir(), ".vibe-kanban", "bin");

// Local development mode: use binaries from npx-cli/dist/<platform>/ instead of GitHub Releases
// Only activate if dist/ exists (i.e., running from source after local-build.sh)
const LOCAL_DIST_DIR = path.join(__dirname, "..", "dist");
const LOCAL_DEV_MODE = fs.existsSync(LOCAL_DIST_DIR) || process.env.VIBE_KANBAN_LOCAL === "1";
// ProxyAgent will pick HTTP/HTTPS/SOCKS proxy from env (HTTP(S)_PROXY/NO_PROXY).
const proxyAgent = new ProxyAgent();

function withProxyAgent(options = {}) {
  if (options.agent) return options;
  return { ...options, agent: proxyAgent };
}

async function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, withProxyAgent(options), (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJson(res.headers.location, options).then(resolve).catch(reject);
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

    https.get(url, withProxyAgent(), (res) => {
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

function getAssetName(platform, binaryName) {
  return `${binaryName}-${platform}.zip`;
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

  const cacheDir = path.join(CACHE_DIR, BINARY_TAG, platform);
  const zipPath = path.join(cacheDir, `${binaryName}.zip`);

  if (fs.existsSync(zipPath)) return zipPath;

  fs.mkdirSync(cacheDir, { recursive: true });

  const manifest = await fetchJson(`${RELEASE_BASE_URL}/${BINARY_TAG}/manifest.json`);
  const binaryInfo = manifest.platforms?.[platform]?.[binaryName];

  if (!binaryInfo) {
    throw new Error(`Binary ${binaryName} not available for ${platform}`);
  }

  const assetName = getAssetName(platform, binaryName);
  const url = `${RELEASE_BASE_URL}/${BINARY_TAG}/${assetName}`;
  await downloadFile(url, zipPath, binaryInfo.sha256, onProgress);

  return zipPath;
}

async function getLatestVersion() {
  const headers = { "User-Agent": "vibe-kanban-cli" };
  const apiUrl = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;
  const release = await fetchJson(apiUrl, { headers });
  const tag = release.tag_name || "";
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

module.exports = {
  RELEASE_REPO,
  BINARY_TAG,
  CACHE_DIR,
  LOCAL_DEV_MODE,
  LOCAL_DIST_DIR,
  ensureBinary,
  getLatestVersion
};
