#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { getPorts } = require("./setup-dev-environment.js");

console.log("[dev] launcher boot");

const REPO_ROOT = path.resolve(__dirname, "..");
const LIBCLANG_FALLBACK = "G:\\libclang\\clang\\native";
const IS_WINDOWS = process.platform === "win32";

function hasLibclang(nativeDir) {
  if (!nativeDir) return false;
  return fs.existsSync(path.join(nativeDir, "libclang.dll"));
}

function resolveLibclangPath(envPath) {
  if (hasLibclang(envPath)) return envPath;
  if (hasLibclang(LIBCLANG_FALLBACK)) return LIBCLANG_FALLBACK;
  return null;
}

function getPathKey(env) {
  if (!IS_WINDOWS) return "PATH";
  return Object.keys(env).find((key) => key.toLowerCase() === "path") || "Path";
}

function prependToPath(env, entry) {
  const pathKey = getPathKey(env);
  const currentPath = env[pathKey] || "";

  if (IS_WINDOWS) {
    for (const key of Object.keys(env)) {
      if (key !== pathKey && key.toLowerCase() === "path") {
        delete env[key];
      }
    }
  }

  env[pathKey] = currentPath
    ? `${entry}${path.delimiter}${currentPath}`
    : entry;
}

function buildEnv(ports) {
  const env = { ...process.env };
  env.FRONTEND_PORT = String(ports.frontend);
  env.BACKEND_PORT = String(ports.backend);
  env.PREVIEW_PROXY_PORT = String(ports.preview_proxy);
  env.VK_ALLOWED_ORIGINS = `http://localhost:${ports.frontend}`;
  env.VITE_VK_SHARED_API_BASE = env.VITE_VK_SHARED_API_BASE || "";
  env.DISABLE_WORKTREE_CLEANUP = env.DISABLE_WORKTREE_CLEANUP || "1";
  env.RUST_LOG = env.RUST_LOG || "debug";

  const libclangPath = resolveLibclangPath(env.LIBCLANG_PATH);
  if (libclangPath) {
    env.LIBCLANG_PATH = libclangPath;
    prependToPath(env, libclangPath);
  }

  return env;
}

function spawnProcess(command, options) {
  return spawn(command, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    shell: true,
    ...options,
  });
}

async function main() {
  const ports = await getPorts();
  const env = buildEnv(ports);

  const libclangStatus = hasLibclang(env.LIBCLANG_PATH)
    ? env.LIBCLANG_PATH
    : "not found";

  console.log(`[dev] frontend=${ports.frontend} backend=${ports.backend}`);
  console.log(`[dev] LIBCLANG_PATH=${libclangStatus}`);

  const backend = spawnProcess(`cargo watch -w crates -x "run --bin server"`, {
    env,
  });
  const frontend = spawnProcess(
    `pnpm --filter @vibe/local-web run dev -- --port ${ports.frontend}`,
    { env }
  );

  const children = [backend, frontend];
  let shuttingDown = false;

  backend.on("error", (error) => {
    if (shuttingDown) return;
    console.error("[dev] backend spawn error:", error);
    shutdown(1);
  });

  frontend.on("error", (error) => {
    if (shuttingDown) return;
    console.error("[dev] frontend spawn error:", error);
    shutdown(1);
  });

  const terminateChildren = () => {
    for (const child of children) {
      if (!child.killed) {
        try {
          child.kill("SIGTERM");
        } catch {
          // no-op
        }
      }
    }
  };

  const shutdown = (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    terminateChildren();
    setTimeout(() => {
      for (const child of children) {
        if (!child.killed) {
          try {
            child.kill("SIGKILL");
          } catch {
            // no-op
          }
        }
      }
      process.exit(code);
    }, 1200);
  };

  process.on("SIGINT", () => shutdown(130));
  process.on("SIGTERM", () => shutdown(143));

  backend.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (signal) {
      console.error(`[dev] backend exited by signal: ${signal}`);
      shutdown(1);
      return;
    }
    if (code !== 0) {
      console.error(`[dev] backend exited with code: ${code}`);
      shutdown(code || 1);
    }
  });

  frontend.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (signal) {
      console.error(`[dev] frontend exited by signal: ${signal}`);
      shutdown(1);
      return;
    }
    if (code !== 0) {
      console.error(`[dev] frontend exited with code: ${code}`);
      shutdown(code || 1);
    }
  });
}

process.on("uncaughtException", (error) => {
  console.error("[dev] uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("[dev] unhandled rejection:", error);
  process.exit(1);
});

main().catch((error) => {
  console.error("[dev] failed to start:", error);
  process.exit(1);
});
