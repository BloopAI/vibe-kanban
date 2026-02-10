# Electron vs Tauri: Architecture Analysis for Vibe Kanban

## Application Architecture (Facts)

| Layer | Technology | Details |
|------|-----------|--------|
| **Backend** | Rust (Axum + Tokio) | 11 crates, HTTP API + WebSocket, SQLite (sqlx), process spawning via `tokio::process::Command` and `command-group` |
| **Frontend** | React 18 + Vite + Tailwind | SPA, embedded into the binary via `rust-embed` |
| **PTY/Terminal** | `portable-pty` | Full terminal over WebSocket |
| **Process management** | `command-group` + `tokio` | Spawns Claude, Codex, Amp, Cursor and other agents as child processes |
| **Current distribution** | npx → downloads zip with binary → runs it | Single Rust binary (with embedded frontend), listens on a port, opens browser |
| **Frontend↔Backend protocol** | HTTP REST + WebSocket (via Axum) | Frontend communicates with backend over the network, not via IPC |

---

## Key Observation

The backend is a **full standalone HTTP server**. The frontend is embedded via `rust-embed` and served from the same server. Communication is standard HTTP/WebSocket. The backend actively spawns child processes (agents), works with PTY, filesystem, and git.

This is **not** a situation where "the Rust code is a set of functions that can be called via Tauri commands." This is a self-contained server.

---

## Electron vs Tauri: Objective Breakdown

### Option 1: Electron

**What needs to be done:**
- The Electron app is just a wrapper. The Rust binary launches as a sidecar process (child process)
- Electron starts → spawns `vibe-kanban` binary → waits for port → opens `BrowserWindow` at `http://127.0.0.1:{port}`
- Frontend is displayed via the bundled Chromium
- Essentially the same as now (npx + browser), except the browser is embedded

**Amount of work: minimal.** Practically zero changes to existing code. The Rust binary stays as-is. Electron is a thin wrapper with lifecycle management.

**Pros:**
- **No code changes needed whatsoever.** Backend remains a standalone HTTP server
- Electron handles sidecar binaries out of the box (or via `child_process.spawn`)
- Mature ecosystem — electron-builder/electron-forge solve packaging + auto-update
- Code signing, DMG/MSI/AppImage — well-established solutions
- If something goes wrong — mountains of StackOverflow answers, documentation, examples

**Cons:**
- +150–200 MB size due to the Chromium bundle
- Double RAM consumption: Chromium + Rust server
- But considering the app already ships a ~30–50 MB Rust binary + opens the system browser, the RAM difference isn't critical

---

### Option 2: Tauri

**Path A: Tauri as a wrapper (sidecar)**
- Same approach as Electron: sidecar binary, WebView points to localhost
- Tauri supports sidecars via `tauri-plugin-shell`
- WebView displays `http://127.0.0.1:{port}`

But: **why Tauri then?** The only real advantage is size (~10 MB instead of ~200 MB), because the WebView is system-native. But you lose:
- Cross-platform rendering consistency (WebView2 on Windows, WebKitGTK on Linux — different behavior)
- Linux: the user needs `libwebkit2gtk` installed
- WebView bugs across different OSes — exactly the kind of unexpected issues Tauri is known for

**Path B: Tauri "natively" (rewrite the backend)**
- Move Axum logic into Tauri commands
- Frontend calls `invoke("get_tasks")` instead of `fetch("/api/tasks")`
- Replace WebSocket with Tauri events

This is a **massive refactor**. The codebase has:
- ~7 WebSocket routes (tasks, projects, execution_processes, terminal, config, scratch, task_attempts)
- PTY over WebSocket
- Process spawning with stdout/stderr streaming
- The entire frontend written against a REST + WS API

Rewriting all of this to Tauri IPC would take **weeks of work**, and breaks the ability to run the backend independently (needed for remote mode).

---

## Objective Comparison Table

| Criterion | Electron (sidecar) | Tauri (sidecar) | Tauri (native) |
|----------|-------------------|-----------------|----------------|
| **Code changes required** | ~0 | ~0 | Weeks of refactoring |
| **App size** | +150–200 MB | +5–10 MB | +5–10 MB |
| **RAM** | Higher by ~100 MB | Lower | Lower |
| **Cross-platform UI** | Identical rendering | Different on every OS | Different on every OS |
| **Auto-update** | electron-updater (mature) | tauri-plugin-updater | tauri-plugin-updater |
| **Code signing/packaging** | Mature solutions | Works, but younger | Works, but younger |
| **Linux dependencies** | None (Chromium bundled) | Needs webkit2gtk | Needs webkit2gtk |
| **Remote mode compatibility** | Backend unchanged | Backend unchanged | Breaks remote mode |
| **WebView bug guarantees** | Chromium everywhere | WebView zoo | WebView zoo |
| **"Rust in the stack" synergy** | None (Rust as sidecar) | None (Rust as sidecar) | Yes, but at the cost of a refactor |

---

## Verdict: Electron

1. **The backend is a self-contained HTTP server.** It's not a set of functions that "naturally" map to Tauri commands. Tauri gives you an advantage when you build your backend logic *inside* Tauri from the start. That's not this case.

2. **Sidecar mode nullifies Tauri's main advantage** ("native Rust integration") — in both cases it's just a wrapper around a binary. And if it's a wrapper — Electron does it more reliably.

3. **The fact that the backend is in Rust is not an argument for Tauri.** Tauri is written in Rust. The backend is written in Rust. These are **two different** Rust applications. They don't share crates, don't share memory, don't share types. There's zero synergy unless you do a full refactor (Path B), which is not justified.

4. **The WebView zoo** — on Linux this is real pain. The app has a complex UI (CodeMirror, xterm.js, drag-and-drop, Lexical editor, diff viewer). The chance of hitting a WebView bug specifically on Linux is non-zero.

5. **Size doesn't matter here.** The Rust binary + frontend assets already weigh ~50+ MB. Adding another 150 MB of Chromium when this is a desktop app downloaded once — not a problem. This isn't a mobile app.

6. **Without Rust in the stack, Electron would be the obvious choice.** Having Rust in the backend doesn't change the equation, because there's no architectural integration with Tauri core, and building one isn't worthwhile.
