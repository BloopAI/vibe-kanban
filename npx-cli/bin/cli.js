#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// Detect platform and architecture
const platform = process.platform;
const arch = process.arch;

// Map to our build target names
function getPlatformDir() {
  if (platform === "linux" && arch === "x64") {
    return "linux-x64";
  } else if (platform === "win32" && arch === "x64") {
    return "windows-x64";
  } else if (platform === "darwin" && arch === "x64") {
    return "macos-x64";
  } else if (platform === "darwin" && arch === "arm64") {
    return "macos-arm64";
  } else {
    console.error(
      `❌ Unsupported platform: ${platform}-${arch}`
    );
    console.error("Supported platforms:");
    console.error("  - Linux x64");
    console.error("  - Windows x64");
    console.error("  - macOS x64 (Intel)");
    console.error("  - macOS ARM64 (Apple Silicon)");
    process.exit(1);
  }
}

function getBinaryName() {
  return platform === "win32" ? "vibe-kanban.exe" : "vibe-kanban";
}

function getExtractDir() {
  const platformDir = getPlatformDir();
  return path.join(__dirname, "..", "dist", platformDir);
}

function setupBinaries() {
  const extractDir = getExtractDir();
  const zipName = "vibe-kanban.zip";
  const zipPath = path.join(extractDir, zipName);

  // Check if zip file exists
  if (!fs.existsSync(zipPath)) {
    console.error(`❌ vibe-kanban.zip not found at: ${zipPath}`);
    console.error(`Current platform: ${platform}-${arch} (${platformDir})`);
    process.exit(1);
  }

  // Check if already extracted
  const binaryPath = path.join(extractDir, "vibe-kanban");
  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  // Clean out any previous extraction (but keep the zip and mcp-server)
  console.log("🧹 Cleaning up old files…");
  if (fs.existsSync(extractDir)) {
    fs.readdirSync(extractDir).forEach((name) => {
      if (name !== zipName && name !== "mcp-server") {
        fs.rmSync(path.join(extractDir, name), { recursive: true, force: true });
      }
    });
  }

  // Unzip the file
  console.log("📦 Extracting vibe-kanban...");
  if (platform === "win32") {
    // Use PowerShell on Windows
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: "inherit" });
  } else {
    // Use unzip on Unix-like systems
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "inherit" });
  }

  // Find the extracted directory (should match the zip structure)
  const extractedDirs = fs.readdirSync(extractDir).filter(name =>
    name !== zipName && fs.statSync(path.join(extractDir, name)).isDirectory()
  );

  if (extractedDirs.length === 0) {
    console.error("❌ No extracted directory found");
    process.exit(1);
  }

  return binaryPath;
}

function main() {
  try {
    const binaryPath = setupBinaries();
    const binaryName = getBinaryName();

    if (!fs.existsSync(binaryPath)) {
      console.error(`❌ Binary not found at: ${binaryPath}`);
      process.exit(1);
    }

    console.log("🚀 Launching vibe-kanban...");
    console.log("💡 After starting, you can use MCP integration with:");
    console.log("   npx vibe-kanban-mcp");
    console.log("");

    if (platform === "win32") {
      execSync(`"${binaryPath}"`, { stdio: "inherit" });
    } else {
      // Make sure binary is executable on Unix-like systems
      execSync(`chmod +x "${binaryPath}"`);
      execSync(`"${binaryPath}"`, { stdio: "inherit" });
    }
  } catch (error) {
    console.error("❌ Error running vibe-kanban:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { getExtractDir, setupBinaries };