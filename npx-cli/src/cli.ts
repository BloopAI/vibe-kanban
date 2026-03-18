import { execSync, spawn } from "child_process";
import path from "path";
import fs from "fs";
import { cac } from "cac";
import {
  ensureBinary,
  ensureDesktopBundle,
  BINARY_TAG,
  CACHE_DIR,
  DESKTOP_CACHE_DIR,
  LOCAL_DEV_MODE,
  LOCAL_DIST_DIR,
  R2_BASE_URL,
  getLatestVersion,
} from "./download";
import {
  getTauriPlatform,
  installAndLaunch,
  cleanOldDesktopVersions,
} from "./desktop";

const CLI_VERSION: string = require("../package.json").version;

type RootOptions = {
  desktop?: boolean;
};

// Resolve effective arch for our published 64-bit binaries only.
// Any ARM → arm64; anything else → x64. On macOS, handle Rosetta.
function getEffectiveArch(): "arm64" | "x64" {
  const platform = process.platform;
  const nodeArch = process.arch;

  if (platform === "darwin") {
    // If Node itself is arm64, we're natively on Apple silicon
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
function getPlatformDir(): string {
  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "linux" && arch === "arm64") return "linux-arm64";
  if (platform === "win32" && arch === "x64") return "windows-x64";
  if (platform === "win32" && arch === "arm64") return "windows-arm64";
  if (platform === "darwin" && arch === "x64") return "macos-x64";
  if (platform === "darwin" && arch === "arm64") return "macos-arm64";

  console.error(`Unsupported platform: ${platform}-${arch}`);
  console.error("Supported platforms:");
  console.error("  - Linux x64");
  console.error("  - Linux ARM64");
  console.error("  - Windows x64");
  console.error("  - Windows ARM64");
  console.error("  - macOS x64 (Intel)");
  console.error("  - macOS ARM64 (Apple Silicon)");
  process.exit(1);
}

function getBinaryName(base: string): string {
  return platform === "win32" ? `${base}.exe` : base;
}

const platformDir = getPlatformDir();
// In local dev mode, extract directly to dist directory; otherwise use global cache
const versionCacheDir = LOCAL_DEV_MODE
  ? path.join(LOCAL_DIST_DIR, platformDir)
  : path.join(CACHE_DIR, BINARY_TAG, platformDir);

// Remove old version directories from the binary cache
function cleanOldVersions(): void {
  try {
    const entries = fs.readdirSync(CACHE_DIR, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== BINARY_TAG) {
        const oldDir = path.join(CACHE_DIR, entry.name);
        fs.rmSync(oldDir, { recursive: true, force: true });
      }
    }
  } catch {
    // Ignore cleanup errors — not critical
  }
}

function showProgress(downloaded: number, total: number): void {
  const percent = total ? Math.round((downloaded / total) * 100) : 0;
  const mb = (downloaded / (1024 * 1024)).toFixed(1);
  const totalMb = total ? (total / (1024 * 1024)).toFixed(1) : "?";
  process.stderr.write(
    `\r   Downloading: ${mb}MB / ${totalMb}MB (${percent}%)`,
  );
}

function buildMcpArgs(args: string[]): string[] {
  return args.length > 0 ? args : ["--mode", "global"];
}

async function extractAndRun(
  baseName: string,
  launch: (binPath: string) => void,
): Promise<void> {
  const binName = getBinaryName(baseName);
  const binPath = path.join(versionCacheDir, binName);
  const zipPath = path.join(versionCacheDir, `${baseName}.zip`);

  // Clean old binary if exists
  try {
    if (fs.existsSync(binPath)) {
      fs.unlinkSync(binPath);
    }
  } catch (err: unknown) {
    if (process.env.VIBE_KANBAN_DEBUG) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Warning: Could not delete existing binary: ${msg}`);
    }
  }

  // Download if not cached
  if (!fs.existsSync(zipPath)) {
    console.error(`Downloading ${baseName}...`);
    try {
      await ensureBinary(platformDir, baseName, showProgress);
      console.error(""); // newline after progress
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\nDownload failed: ${msg}`);
      process.exit(1);
    }
  }

  // Extract
  if (!fs.existsSync(binPath)) {
    try {
      const { default: AdmZip } = await import("adm-zip");
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(versionCacheDir, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Extraction failed:", msg);
      try {
        fs.unlinkSync(zipPath);
      } catch {}
      process.exit(1);
    }
  }

  if (!fs.existsSync(binPath)) {
    console.error(`Extracted binary not found at: ${binPath}`);
    console.error(
      "This usually indicates a corrupt download. Please try again.",
    );
    process.exit(1);
  }

  // Clean up old cached versions only after current version is fully ready
  if (!LOCAL_DEV_MODE) {
    cleanOldVersions();
  }

  // Set permissions (non-Windows)
  if (platform !== "win32") {
    try {
      fs.chmodSync(binPath, 0o755);
    } catch {}
  }

  return launch(binPath);
}

function checkForUpdates(): void {
  const hasValidR2Url = !R2_BASE_URL.startsWith("__");
  if (LOCAL_DEV_MODE || !hasValidR2Url) {
    return;
  }

  getLatestVersion()
    .then((latest) => {
      if (latest && latest !== CLI_VERSION) {
        setTimeout(() => {
          console.log(`\nUpdate available: ${CLI_VERSION} -> ${latest}`);
          console.log(`Run: npx vibe-kanban@latest`);
        }, 2000);
      }
    })
    .catch(() => {});
}

async function runMcp(args: string[]): Promise<void> {
  await extractAndRun("vibe-kanban-mcp", (bin) => {
    const proc = spawn(bin, buildMcpArgs(args), {
      stdio: "inherit",
    });
    proc.on("exit", (c) => process.exit(c || 0));
    proc.on("error", (e) => {
      console.error("MCP server error:", e.message);
      process.exit(1);
    });
    process.on("SIGINT", () => {
      proc.kill("SIGINT");
    });
    process.on("SIGTERM", () => proc.kill("SIGTERM"));
  });
}

async function runReview(args: string[]): Promise<void> {
  await extractAndRun("vibe-kanban-review", (bin) => {
    const proc = spawn(bin, args, { stdio: "inherit" });
    proc.on("exit", (c) => process.exit(c || 0));
    proc.on("error", (e) => {
      console.error("Review CLI error:", e.message);
      process.exit(1);
    });
  });
}

async function runMain(desktopMode: boolean): Promise<void> {
  checkForUpdates();

  const modeLabel = LOCAL_DEV_MODE ? " (local dev)" : "";
  const tauriPlatform = getTauriPlatform(platformDir);

  // Default: browser mode (headless server + opens browser).
  // Use --desktop to launch the desktop app instead.
  if (desktopMode && tauriPlatform) {
    try {
      console.log(
        `Starting vibe-kanban desktop v${CLI_VERSION}${modeLabel}...`,
      );
      const bundleInfo = await ensureDesktopBundle(tauriPlatform, showProgress);
      console.error(""); // newline after progress

      // Clean old desktop versions after successful download
      if (!LOCAL_DEV_MODE) {
        cleanOldDesktopVersions(DESKTOP_CACHE_DIR, BINARY_TAG);
      }

      const exitCode = await installAndLaunch(bundleInfo, platform);
      process.exit(exitCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Desktop app not available: ${msg}`);
      console.error("Falling back to browser mode...");
    }
  }

  // Browser mode (default — headless server + opens browser)
  console.log(`Starting vibe-kanban v${CLI_VERSION}${modeLabel}...`);
  await extractAndRun("vibe-kanban", (bin) => {
    execSync(`"${bin}"`, { stdio: "inherit" });
  });
}

function normalizeArgv(argv: string[]): string[] {
  const args = argv.slice(2);
  const mcpFlagIndex = args.indexOf("--mcp");
  if (mcpFlagIndex === -1) {
    return argv;
  }

  const normalizedArgs = [
    ...args.slice(0, mcpFlagIndex),
    "mcp",
    ...args.slice(mcpFlagIndex + 1),
  ];

  return [...argv.slice(0, 2), ...normalizedArgs];
}

function runOrExit(task: Promise<void>): void {
  void task.catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Fatal error:", msg);
    if (process.env.VIBE_KANBAN_DEBUG && err instanceof Error) {
      console.error(err.stack);
    }
    process.exit(1);
  });
}

async function main(): Promise<void> {
  fs.mkdirSync(versionCacheDir, { recursive: true });
  const cli = cac("vibe-kanban");

  cli
    .command("[...args]", "Launch the local vibe-kanban app")
    .option("--desktop", "Launch the desktop app instead of browser mode")
    .allowUnknownOptions()
    .action((_args: string[], options: RootOptions) => {
      runOrExit(runMain(Boolean(options.desktop)));
    });

  cli
    .command("review [...args]", "Run the review CLI")
    .allowUnknownOptions()
    .action((args: string[]) => {
      runOrExit(runReview(args));
    });

  cli
    .command("mcp [...args]", "Run the MCP server")
    .allowUnknownOptions()
    .action((args: string[]) => {
      runOrExit(runMcp(args));
    });

  cli.help();
  cli.version(CLI_VERSION);
  cli.parse(normalizeArgv(process.argv));
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Fatal error:", msg);
  if (process.env.VIBE_KANBAN_DEBUG && err instanceof Error) {
    console.error(err.stack);
  }
  process.exit(1);
});
