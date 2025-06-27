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
    console.error(`❌ Unsupported platform: ${platform}-${arch}`);
    console.error("Supported platforms:");
    console.error("  - Linux x64");
    console.error("  - Windows x64");
    console.error("  - macOS x64 (Intel)");
    console.error("  - macOS ARM64 (Apple Silicon)");
    process.exit(1);
  }
}

function getBinaryName(base_name) {
  return platform === "win32" ? `${base_name}.exe` : base_name;
}

const platformDir = getPlatformDir();
const extractDir = path.join(__dirname, "..", "dist", platformDir);

const isMcpMode = process.argv.includes("--mcp");

if (!fs.existsSync(extractDir)) {
  fs.mkdirSync(extractDir, { recursive: true });
}

if (isMcpMode) {
  const baseName = "vibe-kanban-mcp";
  const binaryName = getBinaryName(baseName);
  const binaryPath = path.join(extractDir, binaryName);
  const zipName = `${baseName}.zip`;
  const zipPath = path.join(extractDir, zipName);

  // Check if binary exists, delete if it does
  if (fs.existsSync(binaryPath)) {
    fs.unlinkSync(binaryPath);
  }

  // Check if zip file exists
  if (!fs.existsSync(zipPath)) {
    // console.error(`❌ ${zipName} not found at: ${zipPath}`);
    // console.error(`Current platform: ${platform}-${arch} (${platformDir})`);
    process.exit(1);
  }

  // Unzip the file
  // console.log(`📦 Extracting ${baseName}...`);
  if (platform === "win32") {
    // Use PowerShell on Windows
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`,
      { stdio: "inherit" }
    );
  } else {
    // Use unzip on Unix-like systems
    execSync(`unzip -qq -o "${zipPath}" -d "${extractDir}"`, {
      stdio: "inherit",
    });
  }

  // Make sure it's executable
  try {
    fs.chmodSync(binaryPath, 0o755);
  } catch (error) {
    // console.error(
    //   "⚠️ Warning: Could not set executable permissions:",
    //   error.message
    // );
  }

  // Launch MCP server
  // console.error(`🚀 Starting ${baseName}...`);

  const mcpProcess = spawn(binaryPath, [], {
    stdio: ["pipe", "pipe", "inherit"], // stdin/stdout for MCP, stderr for logs
  });

  // Forward stdin to MCP server
  process.stdin.pipe(mcpProcess.stdin);

  // Forward MCP server stdout to our stdout
  mcpProcess.stdout.pipe(process.stdout);

  // Handle process termination
  mcpProcess.on("exit", (code) => {
    process.exit(code || 0);
  });

  mcpProcess.on("error", (error) => {
    console.error("❌ MCP server error:", error.message);
    process.exit(1);
  });

  // Handle Ctrl+C
  process.on("SIGINT", () => {
    console.error("\n🛑 Shutting down MCP server...");
    mcpProcess.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    mcpProcess.kill("SIGTERM");
  });
} else {
  const baseName = "vibe-kanban";
  const binaryName = getBinaryName(baseName);
  const binaryPath = path.join(extractDir, binaryName);
  const zipName = `${baseName}.zip`;
  const zipPath = path.join(extractDir, zipName);

  // Check if binary exists, delete if it does
  if (fs.existsSync(binaryPath)) {
    fs.unlinkSync(binaryPath);
  }

  // Check if zip file exists
  if (!fs.existsSync(zipPath)) {
    console.error(`❌ ${zipName} not found at: ${zipPath}`);
    console.error(`Current platform: ${platform}-${arch} (${platformDir})`);
    process.exit(1);
  }

  // Unzip the file
  console.log(`📦 Extracting ${baseName}...`);
  if (platform === "win32") {
    // Use PowerShell on Windows
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`,
      { stdio: "inherit" }
    );
  } else {
    // Use unzip on Unix-like systems
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "inherit" });
  }

  console.log(`🚀 Launching ${baseName}...`);
  if (platform === "win32") {
    execSync(`"${binaryPath}"`, { stdio: "inherit" });
  } else {
    // Make sure binary is executable on Unix-like systems
    execSync(`chmod +x "${binaryPath}"`);
    execSync(`"${binaryPath}"`, { stdio: "inherit" });
  }
}
