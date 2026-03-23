use std::{
    collections::HashMap,
    fs, io,
    sync::RwLock,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

const REGISTRY_URL: &str = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
const CACHE_TTL: Duration = Duration::from_secs(3600);

/// Top-level registry response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Registry {
    pub version: String,
    pub agents: Vec<RegistryEntry>,
}

/// A single agent entry from the ACP registry.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RegistryEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repository: Option<String>,
    #[serde(default)]
    pub authors: Vec<String>,
    #[serde(default)]
    pub license: String,
    pub distribution: RegistryDistribution,
}

/// Distribution methods for an agent.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RegistryDistribution {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub npx: Option<NpxDistribution>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub binary: Option<HashMap<String, BinaryPlatformEntry>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uvx: Option<UvxDistribution>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct NpxDistribution {
    pub package: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct BinaryPlatformEntry {
    pub archive: String,
    pub cmd: String,
    #[serde(default)]
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UvxDistribution {
    pub package: String,
    #[serde(default)]
    pub args: Vec<String>,
}

/// In-memory cache with TTL.
pub static REGISTRY_CACHE: RwLock<Option<(Instant, Vec<RegistryEntry>)>> = RwLock::new(None);

fn vk_home_dir() -> std::path::PathBuf {
    let mut dir = dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".vibe-kanban");
    if cfg!(debug_assertions) {
        dir = dir.join("dev");
    }
    dir
}

fn registry_path() -> io::Result<std::path::PathBuf> {
    Ok(vk_home_dir().join("acp_registry.json"))
}

/// Read entries from disk file, or None if it doesn't exist / can't parse.
fn read_disk_registry() -> Option<Vec<RegistryEntry>> {
    let path = registry_path().ok()?;
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str::<Registry>(&content)
        .map(|r| r.agents)
        .ok()
}

/// Write fetched registry to disk for offline use.
fn write_disk_registry(entries: &[RegistryEntry]) {
    let Ok(path) = registry_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let registry = serde_json::json!({ "version": "1.0.0", "agents": entries });
    let _ = fs::write(
        path,
        serde_json::to_string_pretty(&registry).unwrap_or_default(),
    );
}

/// Look up a single registry entry by ID.
pub fn get_entry(id: &str) -> Option<RegistryEntry> {
    if let Ok(guard) = REGISTRY_CACHE.read()
        && let Some((_, entries)) = guard.as_ref()
        && let Some(entry) = entries.iter().find(|e| e.id == id)
    {
        return Some(entry.clone());
    }
    read_disk_registry().and_then(|e| e.into_iter().find(|e| e.id == id))
}

/// Get all registry entries (sync, no network).
pub fn get_all_entries() -> Vec<RegistryEntry> {
    if let Ok(guard) = REGISTRY_CACHE.read()
        && let Some((_, entries)) = guard.as_ref()
    {
        return entries.clone();
    }
    read_disk_registry().unwrap_or_default()
}

/// Fetch the full registry.
pub async fn fetch_registry() -> Vec<RegistryEntry> {
    if let Ok(guard) = REGISTRY_CACHE.read()
        && let Some((fetched_at, entries)) = guard.as_ref()
        && fetched_at.elapsed() < CACHE_TTL
    {
        return entries.clone();
    }

    let fetched = match reqwest::get(REGISTRY_URL).await {
        Ok(resp) => match resp.json::<Registry>().await {
            Ok(registry) => {
                write_disk_registry(&registry.agents);
                Some(registry.agents)
            }
            Err(e) => {
                tracing::warn!("Failed to parse ACP registry: {e}");
                None
            }
        },
        Err(e) => {
            tracing::warn!("Failed to fetch ACP registry: {e}");
            None
        }
    };

    let entries = fetched.or_else(read_disk_registry).unwrap_or_default();

    // Update in-memory cache
    if let Ok(mut guard) = REGISTRY_CACHE.write() {
        *guard = Some((Instant::now(), entries.clone()));
    }

    entries
}

/// Get the current platform key for binary distribution lookup.
pub fn current_platform_key() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return "darwin-aarch64";
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    return "darwin-x86_64";
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    return "linux-aarch64";
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    return "linux-x86_64";
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    return "windows-aarch64";
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    return "windows-x86_64";
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "aarch64"),
        all(target_os = "windows", target_arch = "x86_64"),
    )))]
    return "unknown";
}

/// Resolved command from a registry entry.
pub struct ResolvedCommand {
    pub cmd: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
}

impl ResolvedCommand {
    /// Build the full command string (cmd + args joined).
    pub fn command_string(&self) -> String {
        if self.args.is_empty() {
            self.cmd.clone()
        } else {
            format!("{} {}", self.cmd, self.args.join(" "))
        }
    }
}

/// Build command parts from a registry entry for the current platform.
pub fn build_command_for_entry(entry: &RegistryEntry) -> Option<ResolvedCommand> {
    if let Some(npx) = &entry.distribution.npx
        && workspace_utils::shell::resolve_executable_path_blocking("npx").is_some()
    {
        return Some(ResolvedCommand {
            cmd: format!("npx -y {}", npx.package),
            args: npx.args.clone(),
            env: npx.env.clone(),
        });
    }

    if let Some(binaries) = &entry.distribution.binary {
        let platform = current_platform_key();
        if let Some(binary) = binaries.get(platform) {
            let cache_dir = binary_cache_dir(&entry.id, &entry.version);
            let cmd_path = cache_dir.join(&binary.cmd);
            if cmd_path.exists() {
                symlink_binary(&cmd_path, &binary.cmd);
                return Some(ResolvedCommand {
                    cmd: cmd_path.to_string_lossy().to_string(),
                    args: binary.args.clone(),
                    env: HashMap::new(),
                });
            }
            return None;
        }
    }

    if let Some(uvx) = &entry.distribution.uvx
        && workspace_utils::shell::resolve_executable_path_blocking("uvx").is_some()
    {
        return Some(ResolvedCommand {
            cmd: format!("uvx {}", uvx.package),
            args: uvx.args.clone(),
            env: HashMap::new(),
        });
    }

    None
}

fn binary_cache_dir(id: &str, version: &str) -> std::path::PathBuf {
    vk_home_dir().join("acp-binaries").join(id).join(version)
}

fn bin_dir() -> std::path::PathBuf {
    vk_home_dir().join("bin")
}

/// Create a symlink in bin_dir for a cached binary.
#[cfg(unix)]
fn symlink_binary(cmd_path: &std::path::Path, binary_cmd: &str) {
    let dir = bin_dir();
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let link_name = std::path::Path::new(binary_cmd)
        .file_name()
        .unwrap_or_else(|| std::ffi::OsStr::new(binary_cmd));
    let link_path = dir.join(link_name);
    let _ = fs::remove_file(&link_path);
    if let Err(e) = std::os::unix::fs::symlink(cmd_path, &link_path) {
        tracing::debug!("Failed to symlink binary: {e}");
    }
}

#[cfg(not(unix))]
fn symlink_binary(_cmd_path: &std::path::Path, _binary_cmd: &str) {}

/// Ensure `~/.vibe-kanban/bin` is in the user's shell PATH.
/// Appends to `~/.zshrc` and `~/.bashrc` if not already present.
fn ensure_path_configured() {
    let dir = bin_dir();
    let dir_str = dir.to_string_lossy();
    let export_line = format!("export PATH=\"$PATH:{}\"", dir_str);

    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return,
    };

    for rc_file in &[".zshrc", ".bashrc"] {
        let path = home.join(rc_file);
        if !path.exists() {
            continue;
        }
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        if content.contains(&export_line) {
            continue;
        }
        let addition = format!("\n# Added by Vibe Kanban\n{export_line}\n");
        if let Err(e) = fs::write(&path, content + &addition) {
            tracing::warn!("Failed to update {}: {e}", path.display());
        } else {
            tracing::info!("Added {} to PATH in {}", dir_str, path.display());
        }
    }
}

/// Ensure a binary distribution is downloaded and extracted.
/// Returns the resolved command if successful.
pub async fn ensure_binary_installed(entry: &RegistryEntry) -> Option<ResolvedCommand> {
    let binaries = entry.distribution.binary.as_ref()?;
    let platform = current_platform_key();
    let binary = binaries.get(platform)?;

    let cache_dir = binary_cache_dir(&entry.id, &entry.version);
    let cmd_path = cache_dir.join(&binary.cmd);

    if cmd_path.exists() {
        symlink_binary(&cmd_path, &binary.cmd);
        return Some(ResolvedCommand {
            cmd: cmd_path.to_string_lossy().to_string(),
            args: binary.args.clone(),
            env: HashMap::new(),
        });
    }

    // Download and extract
    tracing::info!(
        "Downloading ACP binary for '{}' v{} ({})",
        entry.id,
        entry.version,
        platform
    );

    let archive_url = &binary.archive;
    let resp = reqwest::get(archive_url).await.ok()?;
    if !resp.status().is_success() {
        tracing::error!("Failed to download {}: HTTP {}", archive_url, resp.status());
        return None;
    }

    let bytes = resp.bytes().await.ok()?;
    fs::create_dir_all(&cache_dir).ok()?;

    // Detect archive format from URL and extract
    let url_lower = archive_url.to_lowercase();
    let extracted = if url_lower.ends_with(".tar.gz") || url_lower.ends_with(".tgz") {
        extract_tar_gz(&bytes, &cache_dir)
    } else if url_lower.ends_with(".tar.bz2") || url_lower.ends_with(".tbz2") {
        extract_tar_bz2(&bytes, &cache_dir)
    } else if url_lower.ends_with(".zip") {
        extract_zip(&bytes, &cache_dir)
    } else {
        // Raw binary — write directly
        let dest = cache_dir.join(
            std::path::Path::new(archive_url)
                .file_name()
                .unwrap_or_else(|| std::ffi::OsStr::new("binary")),
        );
        fs::write(&dest, &bytes).ok()?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&dest, fs::Permissions::from_mode(0o755));
        }
        true
    };

    if !extracted {
        tracing::error!("Failed to extract archive from {}", archive_url);
        let _ = fs::remove_dir_all(&cache_dir);
        return None;
    }

    // Make cmd executable on Unix
    #[cfg(unix)]
    if cmd_path.exists() {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&cmd_path, fs::Permissions::from_mode(0o755));
    }

    if cmd_path.exists() {
        symlink_binary(&cmd_path, &binary.cmd);
        ensure_path_configured();
        Some(ResolvedCommand {
            cmd: cmd_path.to_string_lossy().to_string(),
            args: binary.args.clone(),
            env: HashMap::new(),
        })
    } else {
        tracing::error!(
            "Binary cmd '{}' not found after extraction in {}",
            binary.cmd,
            cache_dir.display()
        );
        None
    }
}

/// Remove cached binary and symlink for a registry entry.
/// Best-effort — logs warnings on failure.
pub fn cleanup_binary(registry_id: &str) {
    let Some(entry) = get_entry(registry_id) else {
        return;
    };
    let cache_dir = binary_cache_dir(&entry.id, &entry.version);
    if cache_dir.exists()
        && let Err(e) = fs::remove_dir_all(&cache_dir)
    {
        tracing::warn!("Failed to remove binary cache {}: {e}", cache_dir.display());
    }
    if let Some(binaries) = &entry.distribution.binary {
        let platform = current_platform_key();
        if let Some(binary) = binaries.get(platform)
            && let Some(name) = std::path::Path::new(&binary.cmd).file_name()
        {
            let link = bin_dir().join(name);
            let _ = fs::remove_file(&link);
        }
    }
}

/// Resolve command + env for a registry entry by ID.
/// Downloads the binary if needed. Returns `(command_string, CmdOverrides)`.
pub async fn resolve_command_for_registry_id(
    registry_id: &str,
) -> Option<(String, crate::command::CmdOverrides)> {
    let entry = get_entry(registry_id)?;
    let mut env = HashMap::new();

    let cmd = if let Some(resolved) = build_command_for_entry(&entry) {
        let cmd = resolved.command_string();
        env.extend(resolved.env);
        cmd
    } else if entry.distribution.binary.is_some() {
        let resolved = ensure_binary_installed(&entry).await?;
        let cmd = resolved.command_string();
        env.extend(resolved.env);
        cmd
    } else {
        return None;
    };

    Some((
        cmd,
        crate::command::CmdOverrides {
            base_command_override: None,
            additional_params: None,
            env: if env.is_empty() { None } else { Some(env) },
        },
    ))
}

fn extract_tar_gz(data: &[u8], dest: &std::path::Path) -> bool {
    let gz = flate2::read::GzDecoder::new(data);
    let mut archive = tar::Archive::new(gz);
    archive.unpack(dest).is_ok()
}

fn extract_tar_bz2(data: &[u8], dest: &std::path::Path) -> bool {
    let bz = bzip2::read::BzDecoder::new(data);
    let mut archive = tar::Archive::new(bz);
    archive.unpack(dest).is_ok()
}

fn extract_zip(data: &[u8], dest: &std::path::Path) -> bool {
    let cursor = std::io::Cursor::new(data);
    let mut archive = match zip::ZipArchive::new(cursor) {
        Ok(a) => a,
        Err(_) => return false,
    };
    archive.extract(dest).is_ok()
}
