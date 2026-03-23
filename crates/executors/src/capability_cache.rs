use std::{collections::HashMap, fs, io, path::PathBuf};

use serde::{Deserialize, Serialize};

use crate::{
    command::CommandBuilder,
    executors::acp::harness::check_followup_support,
    installed_servers::{InstalledServers, ServerSource},
    registry,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedCapabilities {
    pub version: String,
    pub supports_followup: bool,
    #[serde(default)]
    pub supports_fork: bool,
}

/// Load the capability cache from disk.
fn load_cache() -> HashMap<String, CachedCapabilities> {
    let path = cache_path();
    if !path.exists() {
        return HashMap::new();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Save the capability cache to disk.
fn save_cache(cache: &HashMap<String, CachedCapabilities>) -> io::Result<()> {
    let path = cache_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(cache).map_err(io::Error::other)?;
    fs::write(path, content)
}

/// Get cached capabilities for a registry entry.
/// Returns `None` if not cached or if the cached version doesn't match.
pub fn get(id: &str, version: &str) -> Option<bool> {
    let cache = load_cache();
    cache.get(id).and_then(|entry| {
        if entry.version == version {
            Some(entry.supports_followup)
        } else {
            None
        }
    })
}

/// Get full cached capabilities by registry id (ignoring version).
pub fn get_full(id: &str) -> Option<CachedCapabilities> {
    load_cache().get(id).cloned()
}

/// Look up cached capabilities for an installed server by its SCREAMING_SNAKE name.
pub fn get_for_server(name: &str) -> Option<CachedCapabilities> {
    let servers = InstalledServers::load().ok()?;
    let server = servers.get(name)?;
    let registry_id = match &server.source {
        ServerSource::Registry { registry_id } => registry_id,
        ServerSource::Custom => return None,
    };
    get_full(registry_id)
}

/// Cache the probe result for a registry entry. Overwrites any previous version.
pub fn set(id: &str, version: &str, supports_followup: bool, supports_fork: bool) {
    let mut cache = load_cache();
    cache.insert(
        id.to_string(),
        CachedCapabilities {
            version: version.to_string(),
            supports_followup,
            supports_fork,
        },
    );
    if let Err(e) = save_cache(&cache) {
        tracing::warn!("Failed to save capability cache: {e}");
    }
}

/// Get or probe: returns cached capabilities, probing on demand if not cached.
pub async fn get_or_probe(registry_id: &str) -> Option<CachedCapabilities> {
    let entry = registry::get_entry(registry_id)?;

    // Check cache first
    if let Some(cached) = get_full(registry_id)
        && cached.version == entry.version
    {
        return Some(cached);
    }

    // Probe on demand
    let (cmd_str, cmd_overrides) = registry::resolve_command_for_registry_id(registry_id).await?;
    let builder = CommandBuilder::new(&cmd_str);
    let parts = builder.build_initial().ok()?;
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    let (supports_followup, supports_fork) =
        check_followup_support(parts, &cwd, &cmd_overrides).await?;

    set(
        registry_id,
        &entry.version,
        supports_followup,
        supports_fork,
    );

    Some(CachedCapabilities {
        version: entry.version,
        supports_followup,
        supports_fork,
    })
}

fn cache_path() -> PathBuf {
    let mut dir = dirs::cache_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join(".cache"))
        .join("vibe-kanban");
    if cfg!(debug_assertions) {
        dir = dir.join("dev");
    }
    dir.join("acp_caps.json")
}
