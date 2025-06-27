#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
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

const platformDir = getPlatformDir();
const extractDir = path.join(__dirname, "..", "dist", platformDir);

const isMcpMode = process.argv.includes('--mcp');

if (isMcpMode) {
  const mcpServerPath = path.join(extractDir, "mcp-server");

  // Check if MCP server binary exists
  if (!fs.existsSync(mcpServerPath)) {
    console.error("❌ MCP server binary not found at:", mcpServerPath);
    console.error("💡 Make sure to run 'npx vibe-kanban' first to extract binaries");
    process.exit(1);
  }

  // Make sure it's executable
  try {
    fs.chmodSync(mcpServerPath, 0o755);
  } catch (error) {
    console.error("⚠️ Warning: Could not set executable permissions:", error.message);
  }

  // Launch MCP server
  console.error("🚀 Starting Vibe Kanban MCP server...");
  console.error("💡 This server shares the database with the main Vibe Kanban application");
  console.error("");

  const mcpProcess = spawn(mcpServerPath, [], {
    stdio: ['pipe', 'pipe', 'inherit'] // stdin/stdout for MCP, stderr for logs
  });

  // Forward stdin to MCP server
  process.stdin.pipe(mcpProcess.stdin);

  // Forward MCP server stdout to our stdout
  mcpProcess.stdout.pipe(process.stdout);

  // Handle process termination
  mcpProcess.on('exit', (code) => {
    process.exit(code || 0);
  });

  mcpProcess.on('error', (error) => {
    console.error("❌ MCP server error:", error.message);
    process.exit(1);
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.error("\n🛑 Shutting down MCP server...");
    mcpProcess.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    mcpProcess.kill('SIGTERM');
  });
} else {
  const zipName = "vibe-kanban.zip";
  const zipPath = path.join(extractDir, zipName);

  // Check if zip file exists
  if (!fs.existsSync(zipPath)) {
    console.error(`❌ vibe-kanban.zip not found at: ${zipPath}`);
    console.error(`Current platform: ${platform}-${arch} (${platformDir})`);
    process.exit(1);
  }

  // Check if already extracted
  const binaryName = getBinaryName();
  const binaryPath = path.join(extractDir, binaryName);
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

  try {
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