use std::{
    fs,
    io::{self, Result},
    path::PathBuf,
};

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::assets::acp_servers_path;

/// How a server was installed.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerSource {
    /// Installed from ACP registry. Carries the original kebab-case registry ID
    /// for API lookups (e.g. "qwen-code", "github-copilot-cli").
    Registry { registry_id: String },
    /// User-defined server not from the registry.
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct InstalledAcpServer {
    pub name: String,
    pub source: ServerSource,
    #[serde(default)]
    pub is_builtin: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Populated at query time from registry, not persisted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

fn default_true() -> bool {
    true
}

/// Built-in ACP servers: (SCREAMING_SNAKE name, registry kebab-case ID).
const BUILTIN_SERVERS: &[(&str, &str)] = &[
    ("GEMINI", "gemini"),
    ("GITHUB_COPILOT_CLI", "github-copilot-cli"),
];

pub struct InstalledServers {
    servers: Vec<InstalledAcpServer>,
    path: PathBuf,
}

impl InstalledServers {
    /// Load from disk, seeding builtins on first run.
    pub fn load() -> Result<Self> {
        let path = Self::config_path()?;
        let servers: Vec<InstalledAcpServer> = if path.exists() {
            let content = fs::read_to_string(&path)?;
            serde_json::from_str(&content).unwrap_or_else(|e| {
                tracing::warn!("Corrupt acp_servers.json, using empty list: {e}");
                Vec::new()
            })
        } else {
            // First run — seed builtins
            BUILTIN_SERVERS
                .iter()
                .map(|&(name, registry_id)| InstalledAcpServer {
                    name: name.to_string(),
                    source: ServerSource::Registry {
                        registry_id: registry_id.to_string(),
                    },
                    is_builtin: true,
                    enabled: true,
                    icon: None,
                })
                .collect()
        };

        Ok(Self { servers, path })
    }

    pub fn save(&self) -> Result<()> {
        let content = serde_json::to_string_pretty(&self.servers).map_err(io::Error::other)?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&self.path, content)
    }

    pub fn list(&self) -> &[InstalledAcpServer] {
        &self.servers
    }

    pub fn install_from_registry(&mut self, registry_id: &str) -> Result<String> {
        let base_name = registry_id.replace('-', "_").to_ascii_uppercase();
        let name = if let Some(server) = self.servers.iter().find(|s| s.name == base_name) {
            if matches!(&server.source, ServerSource::Registry { registry_id: rid } if rid == registry_id)
            {
                self.enable(&base_name)?;
                return Ok(base_name);
            }
            let acp_name = format!("{base_name}_ACP");
            if self.servers.iter().any(|s| s.name == acp_name) {
                format!("{base_name}_REGISTRY")
            } else {
                acp_name
            }
        } else {
            base_name
        };
        self.servers.push(InstalledAcpServer {
            name: name.clone(),
            source: ServerSource::Registry {
                registry_id: registry_id.to_string(),
            },
            is_builtin: false,
            enabled: true,
            icon: None,
        });
        self.save()?;
        Ok(name)
    }

    pub fn install_custom(&mut self, name: &str) -> Result<()> {
        if name.is_empty()
            || name.len() > 40
            || !name
                .bytes()
                .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Name must be 1-40 chars, SCREAMING_SNAKE_CASE (A-Z, 0-9, _)",
            ));
        }
        if self.servers.iter().any(|s| s.name == name) {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                format!("Server '{name}' already exists"),
            ));
        }
        self.servers.push(InstalledAcpServer {
            name: name.to_string(),
            source: ServerSource::Custom,
            is_builtin: false,
            enabled: true,
            icon: None,
        });
        self.save()
    }

    pub fn uninstall(&mut self, name: &str) -> Result<()> {
        self.servers.retain(|s| s.name != name);
        self.save()
    }

    fn enable(&mut self, name: &str) -> Result<()> {
        if let Some(server) = self.servers.iter_mut().find(|s| s.name == name) {
            server.enabled = true;
            self.save()
        } else {
            Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("Server '{name}' not installed"),
            ))
        }
    }

    pub fn get(&self, name: &str) -> Option<&InstalledAcpServer> {
        self.servers.iter().find(|s| s.name == name)
    }

    pub fn get_by_registry_id(&self, registry_id: &str) -> Option<&InstalledAcpServer> {
        self.servers.iter().find(|s| {
            matches!(&s.source, ServerSource::Registry { registry_id: rid } if rid == registry_id)
        })
    }

    fn config_path() -> Result<PathBuf> {
        Ok(acp_servers_path())
    }
}
