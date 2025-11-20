#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const AdmZip = require("adm-zip");
const path = require("path");
const fs = require("fs");

// Resolve effective arch for our published 64-bit binaries only.
// Any ARM → arm64; anything else → x64. On macOS, handle Rosetta.
function getEffectiveArch() {
  const platform = process.platform;
  const nodeArch = process.arch;

  if (platform === "darwin") {
    // If Node itself is arm64, we’re natively on Apple silicon
    if (nodeArch === "arm64") return "arm64";

    // Otherwise check for Rosetta translation
    try {
      const translated = execSync("sysctl -in sysctl.proc_translated", {
        encoding: "utf8",
      }).trim();
      if (translated === "1") return "arm64";
    } catch {
      // sysctl key not present → assume true Intel
    }
    return "x64";
  }

  // Non-macOS: coerce to broad families we support
  if (/arm/i.test(nodeArch)) return "arm64";

  // On Windows with 32-bit Node (ia32), detect OS arch via env
  if (platform === "win32") {
    const pa = process.env.PROCESSOR_ARCHITECTURE || "";
    const paw = process.env.PROCESSOR_ARCHITEW6432 || "";
    if (/arm/i.test(pa) || /arm/i.test(paw)) return "arm64";
  }

  return "x64";
}

const platform = process.platform;
const arch = getEffectiveArch();

// Map to our build target names
function getPlatformDir() {
  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "linux" && arch === "arm64") return "linux-arm64";
  if (platform === "win32" && arch === "x64") return "windows-x64";
  if (platform === "win32" && arch === "arm64") return "windows-arm64";
  if (platform === "darwin" && arch === "x64") return "macos-x64";
  if (platform === "darwin" && arch === "arm64") return "macos-arm64";

  console.error(`❌ Unsupported platform: ${platform}-${arch}`);
  console.error("Supported platforms:");
  console.error("  - Linux x64");
  console.error("  - Linux ARM64");
  console.error("  - Windows x64");
  console.error("  - Windows ARM64");
  console.error("  - macOS x64 (Intel)");
  console.error("  - macOS ARM64 (Apple Silicon)");
  process.exit(1);
}

function getBinaryName(base) {
  return platform === "win32" ? `${base}.exe` : base;
}

const platformDir = getPlatformDir();
const extractDir = path.join(__dirname, "..", "dist", platformDir);
const isMcpMode = process.argv.includes("--mcp");

// ensure output dir
fs.mkdirSync(extractDir, { recursive: true });

function extractAndRun(baseName, launch) {
  const binName = getBinaryName(baseName);
  const binPath = path.join(extractDir, binName);
  const zipName = `${baseName}.zip`;
  const zipPath = path.join(extractDir, zipName);

  // clean old binary
  try {
    if (fs.existsSync(binPath)) {
      fs.unlinkSync(binPath);
    }
  } catch (err) {
    // If the binary is in use, we can't delete it.
    // We'll skip extraction and try to use the existing one.
    if (process.env.VIBE_KANBAN_DEBUG) {
      console.warn(`⚠️  Could not delete existing binary (likely in use): ${err.message}`);
    }
  }
  
  if (!fs.existsSync(zipPath)) {
    console.error(`❌ ${zipName} not found at: ${zipPath}`);
    console.error(`Current platform: ${platform}-${arch} (${platformDir})`);
    process.exit(1);
  }

  // extract
  try {
    if (!fs.existsSync(binPath)) {
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractDir, true);
    }
  } catch (err) {
    console.error("❌ Failed to extract vibe-kanban archive:", err.message);
    if (process.env.VIBE_KANBAN_DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }

  if (!fs.existsSync(binPath)) {
    console.error(`❌ Extracted binary not found at: ${binPath}`);
    console.error("This usually indicates a corrupt download. Please reinstall the package.");
    process.exit(1);
  }

  // perms & launch
  if (platform !== "win32") {
    try {
      fs.chmodSync(binPath, 0o755);
    } catch { }
  }
  return launch(binPath);
}

if (isMcpMode) {
  extractAndRun("vibe-kanban-mcp", (bin) => {
    const proc = spawn(bin, [], { stdio: "inherit" });
    proc.on("exit", (c) => process.exit(c || 0));
    proc.on("error", (e) => {
      console.error("❌ MCP server error:", e.message);
      process.exit(1);
    });
    process.on("SIGINT", () => {
      console.error("\n🛑 Shutting down MCP server...");
      proc.kill("SIGINT");
    });
    process.on("SIGTERM", () => proc.kill("SIGTERM"));
  });
} else {
  console.log(`📦 Extracting vibe-kanban...`);
  extractAndRun("vibe-kanban", (bin) => {
    console.log(`🚀 Launching vibe-kanban...`);
    if (platform === "win32") {
      execSync(`"${bin}"`, { stdio: "inherit" });
    } else {
      execSync(`"${bin}"`, { stdio: "inherit" });
    }
  });
}
