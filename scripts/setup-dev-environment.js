#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const net = require("net");

const PORTS_FILE = path.join(__dirname, "..", ".dev-ports.json");
const DEV_ASSETS_SEED = path.join(__dirname, "..", "dev_assets_seed");
const DEV_ASSETS = path.join(__dirname, "..", "dev_assets");

/**
 * Check if a port is available (i.e. nothing is listening on it).
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
 * Detect a leftover vibe-kanban backend process holding a port.
 *
 * Returns the listener PID if `http://localhost:<port>/api/health` responds
 * with the vibe-kanban-shaped JSON envelope (`{ success, data: "OK", ... }`),
 * `null` otherwise (port held by something else, or no HTTP server at all).
 *
 * Used so `findFreePort()` can print a loud, actionable warning instead of
 * silently advancing to the next port — a stale `target/debug/server` left
 * behind by an unclean shutdown will otherwise reliably collide with whatever
 * BACKEND_PORT we hand back, panicking the next `cargo watch` iteration with
 * `Address already in use` (see also: `pnpm run tauri:dev` first-run bug).
 */
async function detectStaleVibeKanbanBackend(port) {
  let body;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 500);
    const res = await fetch(`http://localhost:${port}/api/health`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    body = await res.json();
  } catch {
    return null;
  }
  if (!body || body.success !== true || body.data !== "OK") return null;

  // Resolve the listener PID via lsof so the warning is actionable.
  let pid = null;
  try {
    const { execSync } = require("child_process");
    pid = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: "utf8" })
      .trim()
      .split(/\s+/)[0]
      || null;
  } catch {
    /* lsof not available or no listener — best-effort */
  }
  return pid;
}

/**
 * Find a free port starting from a given port. If a candidate port is held by
 * a stale vibe-kanban backend, advance past it and print a kill hint so the
 * caller can clean up.
 */
async function findFreePort(startPort = 3000) {
  let port = startPort;
  while (!(await isPortAvailable(port))) {
    const stalePid = await detectStaleVibeKanbanBackend(port);
    if (stalePid) {
      console.warn(
        `[setup-dev] port ${port} is held by a leftover vibe-kanban backend (pid ${stalePid}). ` +
          `Skipping. To reclaim it: kill -9 ${stalePid}`
      );
    }
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
  const previewProxyAvailable = await isPortAvailable(ports.preview_proxy);

  if (process.argv[2] === "get" && (!frontendAvailable || !backendAvailable || !previewProxyAvailable)) {
    console.log(
      `Port availability check failed: frontend:${ports.frontend}=${frontendAvailable}, backend:${ports.backend}=${backendAvailable}, preview_proxy:${ports.preview_proxy}=${previewProxyAvailable}`
    );
  }

  return frontendAvailable && backendAvailable && previewProxyAvailable;
}

/**
 * Allocate ports for development
 */
async function allocatePorts() {
  // If PORT env is set, use it for frontend and PORT+1 for backend
  if (process.env.PORT) {
    const frontendPort = parseInt(process.env.PORT, 10);
    const backendPort = frontendPort + 1;
    const previewProxyPort = backendPort + 1;

    const ports = {
      frontend: frontendPort,
      backend: backendPort,
      preview_proxy: previewProxyPort,
      timestamp: new Date().toISOString(),
    };

    if (process.argv[2] === "get") {
      console.log("Using PORT environment variable:");
      console.log(`Frontend: ${ports.frontend}`);
      console.log(`Backend: ${ports.backend}`);
      console.log(`Preview Proxy: ${ports.preview_proxy}`);
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
        console.log(`Preview Proxy: ${existingPorts.preview_proxy}`);
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
  const previewProxyPort = await findFreePort(backendPort + 1);

  const ports = {
    frontend: frontendPort,
    backend: backendPort,
    preview_proxy: previewProxyPort,
    timestamp: new Date().toISOString(),
  };

  savePorts(ports);

  if (process.argv[2] === "get") {
    console.log("Allocated new dev ports:");
    console.log(`Frontend: ${ports.frontend}`);
    console.log(`Backend: ${ports.backend}`);
    console.log(`Preview Proxy: ${ports.preview_proxy}`);
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

    case "preview_proxy":
      getPorts()
        .then((ports) => {
          console.log(JSON.stringify(ports.preview_proxy, null, 2));
        })
        .catch(console.error);
      break;

    default:
      console.log("Usage:");
      console.log(
        "  node setup-dev-environment.js get           - Setup dev environment (ports + assets)"
      );
      console.log(
        "  node setup-dev-environment.js frontend      - Get frontend port only"
      );
      console.log(
        "  node setup-dev-environment.js backend       - Get backend port only"
      );
      console.log(
        "  node setup-dev-environment.js preview_proxy - Get preview proxy port only"
      );
      console.log(
        "  node setup-dev-environment.js clear         - Clear saved ports"
      );
      break;
  }
}

module.exports = { getPorts, clearPorts, findFreePort };
