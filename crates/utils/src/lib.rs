use std::{env, sync::OnceLock};

use directories::ProjectDirs;

pub mod api;
pub mod approvals;
pub mod assets;
pub mod browser;
pub mod diff;
pub mod git;
pub mod jwt;
pub mod log_msg;
pub mod msg_store;
pub mod path;
pub mod port_file;
pub mod response;
pub mod sentry;
pub mod shell;
pub mod stream_ext;
pub mod stream_lines;
pub mod text;
pub mod tokio;
pub mod version;
pub mod ws;

/// Cache for WSL2 detection result
static WSL2_CACHE: OnceLock<bool> = OnceLock::new();

/// Check if running in WSL2 (cached)
pub fn is_wsl2() -> bool {
    *WSL2_CACHE.get_or_init(|| {
        // Check for WSL environment variables
        if std::env::var("WSL_DISTRO_NAME").is_ok() || std::env::var("WSLENV").is_ok() {
            tracing::debug!("WSL2 detected via environment variables");
            return true;
        }

        // Check /proc/version for WSL2 signature
        if let Ok(version) = std::fs::read_to_string("/proc/version")
            && (version.contains("WSL2") || version.contains("microsoft"))
        {
            tracing::debug!("WSL2 detected via /proc/version");
            return true;
        }

        tracing::debug!("WSL2 not detected");
        false
    })
}

pub fn cache_dir() -> std::path::PathBuf {
    let proj = if cfg!(debug_assertions) {
        ProjectDirs::from("ai", "bloop-dev", env!("CARGO_PKG_NAME"))
            .expect("OS didn't give us a home directory")
    } else {
        ProjectDirs::from("ai", "bloop", env!("CARGO_PKG_NAME"))
            .expect("OS didn't give us a home directory")
    };

    // ✔ macOS → ~/Library/Caches/MyApp
    // ✔ Linux → ~/.cache/myapp (respects XDG_CACHE_HOME)
    // ✔ Windows → %LOCALAPPDATA%\Example\MyApp
    proj.cache_dir().to_path_buf()
}

// Get or create cached PowerShell script file
pub async fn get_powershell_script()
-> Result<std::path::PathBuf, Box<dyn std::error::Error + Send + Sync>> {
    use std::io::Write;

    let cache_dir = cache_dir();
    let script_path = cache_dir.join("toast-notification.ps1");

    // Check if cached file already exists and is valid
    if script_path.exists() {
        // Verify file has content (basic validation)
        if let Ok(metadata) = std::fs::metadata(&script_path)
            && metadata.len() > 0
        {
            return Ok(script_path);
        }
    }

    // File doesn't exist or is invalid, create it
    let script_content = assets::ScriptAssets::get("toast-notification.ps1")
        .ok_or("Embedded PowerShell script not found: toast-notification.ps1")?
        .data;

    // Ensure cache directory exists
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache directory: {e}"))?;

    let mut file = std::fs::File::create(&script_path)
        .map_err(|e| format!("Failed to create PowerShell script file: {e}"))?;

    file.write_all(&script_content)
        .map_err(|e| format!("Failed to write PowerShell script data: {e}"))?;

    drop(file); // Ensure file is closed

    Ok(script_path)
}
