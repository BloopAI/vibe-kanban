const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// GitHub Releases configuration
// Replaced during npm pack by workflow
const GITHUB_OWNER = "__GITHUB_OWNER__";  // e.g., "rupeshpanwar"
const GITHUB_REPO = "__GITHUB_REPO__";    // e.g., "ikanban"
const BINARY_TAG = "__BINARY_TAG__";      // e.g., v0.0.142
const CACHE_DIR = path.join(require("os").homedir(), ".ikanban", "bin");

function getGitHubReleaseUrl(tag, filename) {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tag}/${filename}`;
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { "User-Agent": "ikanban-cli" }
    };

    https.get(url, options, (res) => {
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
    const options = {
      headers: { "User-Agent": "ikanban-cli" }
    };

    const makeRequest = (reqUrl) => {
      https.get(reqUrl, options, (res) => {
        // Follow redirects (GitHub releases redirect to CDN)
        if (res.statusCode === 301 || res.statusCode === 302) {
          return makeRequest(res.headers.location);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} downloading ${reqUrl}`));
        }

        const file = fs.createWriteStream(tempPath);
        const hash = crypto.createHash("sha256");

        const cleanup = () => {
          try { fs.unlinkSync(tempPath); } catch {}
        };

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

        file.on("error", (err) => {
          cleanup();
          reject(err);
        });
      }).on("error", reject);
    };

    makeRequest(url);
  });
}

async function ensureBinary(platform, binaryName, onProgress) {
  const cacheDir = path.join(CACHE_DIR, BINARY_TAG, platform);
  const zipPath = path.join(cacheDir, `${binaryName}.zip`);

  if (fs.existsSync(zipPath)) return zipPath;

  fs.mkdirSync(cacheDir, { recursive: true });

  // Try to fetch manifest for checksums (optional)
  let expectedSha256 = null;
  try {
    const manifestUrl = getGitHubReleaseUrl(BINARY_TAG, "manifest.json");
    const manifest = await fetchJson(manifestUrl);
    expectedSha256 = manifest.platforms?.[platform]?.[binaryName]?.sha256;
  } catch {
    // Manifest not found, proceed without checksum verification
  }

  const url = getGitHubReleaseUrl(BINARY_TAG, `${binaryName}-${platform}.zip`);
  await downloadFile(url, zipPath, expectedSha256, onProgress);

  return zipPath;
}

async function getLatestVersion() {
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    const release = await fetchJson(url);
    // Extract version from tag (e.g., "v0.0.142" -> "0.0.142")
    return release.tag_name?.replace(/^v/, "") || null;
  } catch {
    return null;
  }
}

module.exports = { BINARY_TAG, CACHE_DIR, ensureBinary, getLatestVersion };
