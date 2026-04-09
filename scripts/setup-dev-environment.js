#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const net = require("net");

const PORTS_FILE = path.join(__dirname, "..", ".dev-ports.json");
const DEV_ASSETS_SEED = path.join(__dirname, "..", "dev_assets_seed");
const DEV_ASSETS = path.join(__dirname, "..", "dev_assets");
const ENV_FILE = path.join(__dirname, "..", ".env");

/**
 * Load environment variables from .env file
 */
function loadEnvFile() {
  try {
    if (fs.existsSync(ENV_FILE)) {
      const content = fs.readFileSync(ENV_FILE, "utf8");
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith("#")) continue;

        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) continue;

        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();

        // Remove surrounding quotes if present
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        // Only set if not already defined in environment
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }

      return true;
    }
  } catch (error) {
    console.warn("Failed to load .env file:", error.message);
  }
  return false;
}

// Load .env file before anything else
loadEnvFile();

/**
 * Check if a port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host: "localhost" });
    sock.on("connect", () => {
      sock.destroy();
      resolve(false);
    });
    sock.on("error", () => resolve(true));
  });
}

/**
 * Find a free port starting from a given port
 */
async function findFreePort(startPort = 3000) {
  let port = startPort;
  while (!(await isPortAvailable(port))) {
    port++;
    if (port > 65535) {
      throw new Error("No available ports found");
    }
  }
  return port;
}

/**
 * Load existing ports from file
 */
function loadPorts() {
  try {
    if (fs.existsSync(PORTS_FILE)) {
      const data = fs.readFileSync(PORTS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn("Failed to load existing ports:", error.message);
  }
  return null;
}

/**
 * Save ports to file
 */
function savePorts(ports) {
  try {
    fs.writeFileSync(PORTS_FILE, JSON.stringify(ports, null, 2));
  } catch (error) {
    console.error("Failed to save ports:", error.message);
    throw error;
  }
}

/**
 * Verify that saved ports are still available
 */
async function verifyPorts(ports) {
  const frontendAvailable = await isPortAvailable(ports.frontend);
  const backendAvailable = await isPortAvailable(ports.backend);

  if (process.argv[2] === "get" && (!frontendAvailable || !backendAvailable)) {
    console.log(
      `Port availability check failed: frontend:${ports.frontend}=${frontendAvailable}, backend:${ports.backend}=${backendAvailable}`
    );
  }

  return frontendAvailable && backendAvailable;
}

/**
 * Allocate ports for development
 */
async function allocatePorts() {
  // If FRONTEND_PORT and BACKEND_PORT are set, use them directly
  if (process.env.FRONTEND_PORT && process.env.BACKEND_PORT) {
    const frontendPort = parseInt(process.env.FRONTEND_PORT, 10);
    const backendPort = parseInt(process.env.BACKEND_PORT, 10);

    const ports = {
      frontend: frontendPort,
      backend: backendPort,
      timestamp: new Date().toISOString(),
    };

    if (process.argv[2] === "get") {
      console.log("Using FRONTEND_PORT and BACKEND_PORT from environment:");
      console.log(`Frontend: ${ports.frontend}`);
      console.log(`Backend: ${ports.backend}`);
    }

    return ports;
  }

  // If PORT env is set, use it for frontend and PORT+1 for backend
  if (process.env.PORT) {
    const frontendPort = parseInt(process.env.PORT, 10);
    const backendPort = frontendPort + 1;

    const ports = {
      frontend: frontendPort,
      backend: backendPort,
      timestamp: new Date().toISOString(),
    };

    if (process.argv[2] === "get") {
      console.log("Using PORT environment variable:");
      console.log(`Frontend: ${ports.frontend}`);
      console.log(`Backend: ${ports.backend}`);
    }

    return ports;
  }

  // Try to load existing ports first
  const existingPorts = loadPorts();

  if (existingPorts) {
    // Verify existing ports are still available
    if (await verifyPorts(existingPorts)) {
      if (process.argv[2] === "get") {
        console.log("Reusing existing dev ports:");
        console.log(`Frontend: ${existingPorts.frontend}`);
        console.log(`Backend: ${existingPorts.backend}`);
      }
      return existingPorts;
    } else {
      if (process.argv[2] === "get") {
        console.log(
          "Existing ports are no longer available, finding new ones..."
        );
      }
    }
  }

  // Find new free ports
  const frontendPort = await findFreePort(3000);
  const backendPort = await findFreePort(frontendPort + 1);

  const ports = {
    frontend: frontendPort,
    backend: backendPort,
    timestamp: new Date().toISOString(),
  };

  savePorts(ports);

  if (process.argv[2] === "get") {
    console.log("Allocated new dev ports:");
    console.log(`Frontend: ${ports.frontend}`);
    console.log(`Backend: ${ports.backend}`);
  }

  return ports;
}

/**
 * Get ports (allocate if needed)
 */
async function getPorts() {
  const ports = await allocatePorts();
  copyDevAssets();
  return ports;
}

/**
 * Copy dev_assets_seed to dev_assets
 */
function copyDevAssets() {
  try {
    if (!fs.existsSync(DEV_ASSETS)) {
      // Copy dev_assets_seed to dev_assets
      fs.cpSync(DEV_ASSETS_SEED, DEV_ASSETS, { recursive: true });

      if (process.argv[2] === "get") {
        console.log("Copied dev_assets_seed to dev_assets");
      }
    }
  } catch (error) {
    console.error("Failed to copy dev assets:", error.message);
  }
}

/**
 * Clear saved ports
 */
function clearPorts() {
  try {
    if (fs.existsSync(PORTS_FILE)) {
      fs.unlinkSync(PORTS_FILE);
      console.log("Cleared saved dev ports");
    } else {
      console.log("No saved ports to clear");
    }
  } catch (error) {
    console.error("Failed to clear ports:", error.message);
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];

  switch (command) {
    case "get":
      getPorts()
        .then((ports) => {
          console.log(JSON.stringify(ports));
        })
        .catch(console.error);
      break;

    case "clear":
      clearPorts();
      break;

    case "frontend":
      getPorts()
        .then((ports) => {
          console.log(JSON.stringify(ports.frontend, null, 2));
        })
        .catch(console.error);
      break;

    case "backend":
      getPorts()
        .then((ports) => {
          console.log(JSON.stringify(ports.backend, null, 2));
        })
        .catch(console.error);
      break;

    case "host":
      // Load .env if not already loaded (getPorts does this via loadEnvFile at top)
      console.log(process.env.HOST || "127.0.0.1");
      break;

    case "env":
      // Output env vars for backend dev server
      // Unsets production-specific vars and sets dev-safe defaults
      {
        const rustLog = process.env.RUST_LOG ?? "debug";
        // SQLX_OFFLINE=true uses cached .sqlx folders instead of live database queries
        // This is required because the workspace has both SQLite (db crate) and PostgreSQL (remote crate)
        // and a single DATABASE_URL cannot satisfy both during compile-time checking
        // Output in format suitable for shell eval
        console.log(`export RUST_LOG=${rustLog}`);
        console.log(`export SQLX_OFFLINE=true`);

        // CRITICAL: Unset production-specific env vars for dev mode
        // When executors spawn worktree dev servers, they inherit production env vars.
        // Dev servers should use their local dev_assets/ paths and NOT connect to hive/shared services.
        // These vars are inherited from parent processes and must be explicitly unset.
        const productionOnlyVars = [
          // Storage paths - dev uses local dev_assets/
          'VK_DATABASE_PATH',
          'VK_LOG_DIR',
          'VK_BACKUP_DIR',
          'VK_WORKTREE_DIR',
          // Hive/node identity - dev shouldn't connect to hive or identify as a node
          'VK_HIVE_URL',
          'VK_NODE_API_KEY',
          'VK_NODE_NAME',
          'VK_NODE_PUBLIC_URL',
          'VK_CONNECTION_TOKEN_SECRET',
          // Shared API - dev shouldn't use shared services
          'VK_SHARED_API_BASE',
          // Process kill setting - dev has its own default (disabled)
          'VK_DISABLE_PROCESS_KILL_ON_SHUTDOWN',
          // Worktree cleanup - dev shouldn't clean up worktrees (production's job)
          'DISABLE_WORKTREE_ORPHAN_CLEANUP',
          'DISABLE_WORKTREE_EXPIRED_CLEANUP',
        ];
        for (const varName of productionOnlyVars) {
          console.log(`unset ${varName}`);
        }

        // Now set dev mode defaults (after unsetting inherited values)
        console.log(`export VK_DISABLE_PROCESS_KILL_ON_SHUTDOWN=1`);
        console.log(`export DISABLE_WORKTREE_ORPHAN_CLEANUP=1`);
        console.log(`export DISABLE_WORKTREE_EXPIRED_CLEANUP=1`);

        // Pass through all OTHER VK_* environment variables from .env
        // (config/tuning vars like VK_SQLITE_MAX_CONNECTIONS are safe to inherit)
        for (const [key, value] of Object.entries(process.env)) {
          if (key.startsWith('VK_') && !productionOnlyVars.includes(key)) {
            // Escape value for shell safety (handle quotes and special chars)
            const escapedValue = value.replace(/'/g, "'\\''");
            console.log(`export ${key}='${escapedValue}'`);
          }
        }
      }
      break;

    default:
      console.log("Usage:");
      console.log(
        "  node setup-dev-environment.js get      - Setup dev environment (ports + assets)"
      );
      console.log(
        "  node setup-dev-environment.js frontend - Get frontend port only"
      );
      console.log(
        "  node setup-dev-environment.js backend  - Get backend port only"
      );
      console.log(
        "  node setup-dev-environment.js host     - Get host binding (from .env or default)"
      );
      console.log(
        "  node setup-dev-environment.js env      - Get backend env vars (for shell eval)"
      );
      console.log(
        "  node setup-dev-environment.js clear    - Clear saved ports"
      );
      break;
  }
}

module.exports = { getPorts, clearPorts, findFreePort };
