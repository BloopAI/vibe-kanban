//! Locate the `vibe-kanban-mcp` binary at runtime.
//!
//! Both the server (when generating the `~/.cursor/mcp.json` snippet) and
//! the executor framework (when spawning the placeholder process for a
//! `CURSOR_MCP` session) need to find `vibe-kanban-mcp`. The
//! `current_exe()` is the **server** binary, not mcp, so we have to look
//! around it.
//!
//! Resolution order:
//! 1. `VK_MCP_BINARY` env var (set by Tauri to the bundled sidecar absolute
//!    path).
//! 2. The directory of `current_exe()` — handles the packaged Tauri layout
//!    where mcp lives next to the server, and `cargo install` layouts.
//! 3. `target/<release|debug>/vibe-kanban-mcp` siblings — handles `cargo
//!    run --bin server` dev layouts where the user has built mcp in either
//!    profile.
//! 4. Bare `vibe-kanban-mcp` — last-resort fallback that relies on `$PATH`.

use std::path::PathBuf;

/// What we know about the result of [`resolve_mcp_binary`].
#[derive(Debug, Clone)]
pub struct McpBinaryResolution {
    pub path: PathBuf,
    /// `true` when the path was confirmed to exist on disk. `false` means
    /// we fell back to the bare binary name and we're hoping `$PATH` has
    /// it; the caller may want to surface a warning to the user.
    pub exists: bool,
    /// Free-form description of how we picked this path (good for logs and
    /// frontend warnings).
    pub source: &'static str,
}

/// See module docs for the search order.
pub fn resolve_mcp_binary() -> McpBinaryResolution {
    let exe_name = if cfg!(windows) {
        "vibe-kanban-mcp.exe"
    } else {
        "vibe-kanban-mcp"
    };

    // 1. Explicit env override from Tauri / packaging.
    if let Ok(env_path) = std::env::var("VK_MCP_BINARY")
        && !env_path.trim().is_empty()
    {
        let p = PathBuf::from(env_path);
        let exists = p.exists();
        return McpBinaryResolution {
            path: p,
            exists,
            source: "VK_MCP_BINARY",
        };
    }

    if let Ok(current_exe) = std::env::current_exe() {
        // 2. Same dir as the running binary.
        if let Some(dir) = current_exe.parent() {
            let candidate = dir.join(exe_name);
            if candidate.exists() {
                return McpBinaryResolution {
                    path: candidate,
                    exists: true,
                    source: "current_exe sibling",
                };
            }

            // 3. cargo workspace dev layout: server is at
            //    `target/<profile>/server`. Check the sibling profile dir
            //    (e.g. `target/release/vibe-kanban-mcp`) so a single
            //    `cargo build --release -p mcp` is enough even when the
            //    server is a debug build, and vice versa.
            if let Some(target_dir) = dir.parent() {
                for profile in ["release", "debug"] {
                    let alt = target_dir.join(profile).join(exe_name);
                    if alt.exists() {
                        return McpBinaryResolution {
                            path: alt,
                            exists: true,
                            source: "target/<profile> sibling",
                        };
                    }
                }
            }
        }
    }

    // 4. Last resort: bare name; hope $PATH has it.
    McpBinaryResolution {
        path: PathBuf::from(exe_name),
        exists: false,
        source: "PATH fallback",
    }
}
