use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub email: Option<String>,
}

impl Config {
    /// Get the path to the config file (~/.config/vibe-kanban/review.toml)
    fn config_path() -> Option<PathBuf> {
        dirs::config_dir().map(|p| p.join("vibe-kanban").join("review.toml"))
    }

    /// Load config from disk, returning default if file doesn't exist
    pub fn load() -> Self {
        let Some(path) = Self::config_path() else {
            return Self::default();
        };

        if !path.exists() {
            return Self::default();
        }

        match std::fs::read_to_string(&path) {
            Ok(contents) => toml::from_str(&contents).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    /// Save config to disk
    pub fn save(&self) -> std::io::Result<()> {
        let Some(path) = Self::config_path() else {
            return Ok(());
        };

        // Create parent directories if needed
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let contents = toml::to_string_pretty(self).unwrap_or_default();
        std::fs::write(&path, contents)
    }
}
