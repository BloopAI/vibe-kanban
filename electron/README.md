# Vibe Kanban Desktop (Electron)

## Overview

This directory contains the Electron wrapper that packages Vibe Kanban as a native desktop application. Instead of running `npx vibe-kanban` and opening a browser tab, users install a `.dmg`, `.exe`, or `.AppImage` and get a dedicated window with the full Vibe Kanban experience.

The Electron shell is intentionally thin — it spawns the same Rust backend binary used by the npx distribution, waits for it to be healthy, then loads the UI in a `BrowserWindow`. Zero frontend changes are needed; all relative API paths work because the frontend is served from `http://127.0.0.1:{port}`.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Electron (main process)                    │
│                                             │
│  1. Spawns Rust binary (sidecar)            │
│     └─ SKIP_BROWSER_OPEN=1                  │
│  2. Discovers port                          │
│     └─ parse stdout or read port file       │
│  3. Polls /api/health until 200             │
│  4. Opens BrowserWindow → 127.0.0.1:{port}  │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  Rust Backend (vibe-kanban binary)          │
│  Axum + Tokio · SQLite · 11 workspace crates│
│  Serves API + embedded frontend assets      │
└─────────────────────────────────────────────┘
```

**Key details:**

- **Sidecar pattern** — Electron spawns `vibe-kanban` as a child process with `SKIP_BROWSER_OPEN=1` so the binary doesn't open a browser tab.
- **Port discovery** — The backend auto-assigns a port (port 0). Electron reads the port from stdout (`Server running on http://127.0.0.1:{port}`) or from the port file at `<temp_dir>/vibe-kanban/vibe-kanban.port`.
- **Health check** — Electron polls `GET /api/health` until it receives a `200 OK` before loading the window.
- **Bundled binaries** — Three binaries are included in the app resources:
  - `vibe-kanban` — main server (spawned by Electron)
  - `vibe-kanban-mcp` — MCP server for editors (bundled but **not** spawned by Electron; editors launch it directly)
  - `vibe-kanban-review` — review CLI tool
- **Shutdown** — On macOS/Linux, the child process receives `SIGTERM`. On Windows, `process.kill('SIGINT')` is used instead of stdin-based Ctrl+C.

## Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (>=24)
- [pnpm](https://pnpm.io/) (>=8)

Install Electron dependencies:

```bash
cd electron
npm install
```

## Development

### 1. Build the Rust binary

From the project root:

```bash
cargo build --release
```

This produces `target/release/server` (the main backend binary).

### 2. Copy the binary to resources

The Electron app expects binaries in `electron/resources/bin/{platform}/`. Create the directory and copy the binary:

**macOS (Apple Silicon):**
```bash
mkdir -p electron/resources/bin/macos-arm64
cp target/release/server electron/resources/bin/macos-arm64/vibe-kanban
```

**macOS (Intel):**
```bash
mkdir -p electron/resources/bin/macos-x64
cp target/release/server electron/resources/bin/macos-x64/vibe-kanban
```

**Linux (x64):**
```bash
mkdir -p electron/resources/bin/linux-x64
cp target/release/server electron/resources/bin/linux-x64/vibe-kanban
```

**Windows (x64):**
```bash
mkdir -p electron/resources/bin/windows-x64
cp target/release/server.exe electron/resources/bin/windows-x64/vibe-kanban.exe
```

> **Tip:** You only need to copy the binary for your current platform during development.

### 3. Start Electron in dev mode

From the project root:

```bash
pnpm run electron:dev
```

Or directly from the `electron/` directory:

```bash
cd electron && npx electron .
```

The app will spawn the Rust backend, wait for it to become healthy, and open a window.

## Building

### Build for current platform

```bash
pnpm run electron:build
```

This runs `electron-builder` for the current platform and outputs distributable files to `electron/dist/`.

### Platform-specific builds

From the `electron/` directory:

```bash
# macOS → .dmg + .zip
npm run build:mac

# Windows → NSIS installer
npm run build:win

# Linux → AppImage + .deb
npm run build:linux
```

### Manual build

If an `electron-build.sh` script exists at the project root, you can use it for manual builds:

```bash
./electron-build.sh
```

Output goes to `electron/dist/`.

## Code Signing

Distributable builds should be code-signed for a smooth user experience. Set the following environment variables before running `electron:build`.

### macOS

| Variable | Description |
|----------|-------------|
| `APPLE_CERTIFICATE_BASE64` | Base64-encoded `.p12` Developer ID certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` certificate |
| `APPLE_ID` | Apple ID email used for notarization |
| `APPLE_ID_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | 10-character Apple Developer Team ID |

The build uses `hardenedRuntime: true` and custom entitlements (`entitlements.mac.plist`) for notarization compatibility.

### Windows

| Variable | Description |
|----------|-------------|
| `WIN_CERT_BASE64` | Base64-encoded code signing certificate |

### Skipping signing for local dev

For local development and testing, you can skip code signing:

```bash
# macOS — allow unsigned app in System Settings → Privacy & Security
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm run electron:build
```

Or pass `--skip-sign` if supported by your build script.

## Distribution

Vibe Kanban ships through two independent channels that coexist without conflict:

| | npx | Electron |
|---|---|---|
| **Install** | `npx vibe-kanban` | Download `.dmg` / `.exe` / `.AppImage` |
| **Binary delivery** | Downloaded on first run | Bundled inside the app |
| **UI** | Opens default browser tab | Opens native `BrowserWindow` |
| **Auto-update** | npm handles versioning | `electron-updater` checks for updates |
| **Use case** | Quick start, CI, remote servers | Daily desktop use |

Both distributions use the **same Rust backend binary**. The frontend is embedded in the binary at build time, so there is no separate frontend deployment step. Neither distribution interferes with the other — they can even run simultaneously on different ports.

## Platform Targets

| Platform | Architecture | Binary name | Package format |
|----------|-------------|-------------|----------------|
| macOS | arm64 | `vibe-kanban` | `.dmg`, `.zip` |
| macOS | x64 | `vibe-kanban` | `.dmg`, `.zip` |
| Windows | x64 | `vibe-kanban.exe` | `.exe` (NSIS) |
| Windows | arm64 | `vibe-kanban.exe` | `.exe` (NSIS) |
| Linux | x64 | `vibe-kanban` | `.AppImage`, `.deb` |
| Linux | arm64 | `vibe-kanban` | `.AppImage`, `.deb` |

Binary paths in the packaged app follow the pattern:
```
resources/bin/{platform}-{arch}/vibe-kanban[.exe]
```

During development, place binaries in `electron/resources/bin/{platform}-{arch}/`.

## Troubleshooting

### Binary not found

The Electron app looks for the backend binary in `resources/bin/` relative to the app resources path. During development, make sure you've copied the binary to the correct `electron/resources/bin/{platform}-{arch}/` directory (see [Development](#development) above).

### Port conflict

The backend uses port `0` (auto-assign) by default, so port conflicts are rare. If you need a specific port, set the `PORT` environment variable before launching:

```bash
PORT=9876 pnpm run electron:dev
```

### macOS security warning on first launch

Unsigned builds will trigger a macOS Gatekeeper warning. To allow the app:

1. Open **System Settings → Privacy & Security**
2. Scroll to the "Security" section
3. Click **Open Anyway** next to the blocked app message

Alternatively, remove the quarantine attribute:

```bash
xattr -cr /Applications/Vibe\ Kanban.app
```

### Window shows blank page

If the window loads but shows a blank page, the backend likely hasn't started. Check:

1. The binary exists at the expected path
2. The binary has execute permissions (`chmod +x`)
3. Console logs for port discovery or health check failures (open DevTools with `Cmd+Option+I` / `Ctrl+Shift+I`)

### Auto-update not working

Auto-update via `electron-updater` requires properly signed builds and a configured update server. During local development, auto-update is not available.
