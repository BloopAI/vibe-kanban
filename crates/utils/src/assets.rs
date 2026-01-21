use directories::ProjectDirs;
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};

const PROJECT_ROOT: &str = env!("CARGO_MANIFEST_DIR");

/// Custom path configuration file path
pub fn custom_path_config_file() -> std::path::PathBuf {
    if cfg!(debug_assertions) {
        std::path::PathBuf::from(PROJECT_ROOT)
            .join("../../dev_assets/custom_path.json")
    } else {
        ProjectDirs::from("ai", "bloop", "vibe-kanban")
            .expect("OS didn't give us a home directory")
            .config_dir() // Use config_dir to avoid circular dependency
            .join("custom_path.json")
    }
}

/// Custom path configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomPathConfig {
    pub custom_asset_dir: Option<std::path::PathBuf>,
}

/// Load custom path configuration from file
pub fn load_custom_path_config() -> CustomPathConfig {
    let config_file = custom_path_config_file();

    if !config_file.exists() {
        return CustomPathConfig {
            custom_asset_dir: None,
        };
    }

    match std::fs::read_to_string(&config_file) {
        Ok(content) => serde_json::from_str(&content)
            .unwrap_or_else(|e| {
                tracing::warn!("Failed to parse custom_path.json: {:?}, using default", e);
                CustomPathConfig { custom_asset_dir: None }
            }),
        Err(_) => CustomPathConfig { custom_asset_dir: None },
    }
}

pub fn asset_dir() -> std::path::PathBuf {
    // Check for custom path first
    let custom_config = load_custom_path_config();

    if let Some(custom_dir) = custom_config.custom_asset_dir {
        // Validate custom path exists
        if custom_dir.exists() {
            return custom_dir;
        } else {
            tracing::warn!(
                "Custom asset directory does not exist: {:?}, falling back to default",
                custom_dir
            );
        }
    }

    // Fallback to default path
    let path = if cfg!(debug_assertions) {
        std::path::PathBuf::from(PROJECT_ROOT).join("../../dev_assets")
    } else {
        ProjectDirs::from("ai", "bloop", "vibe-kanban")
            .expect("OS didn't give us a home directory")
            .data_dir()
            .to_path_buf()
    };

    // Ensure the directory exists
    if !path.exists() {
        std::fs::create_dir_all(&path).expect("Failed to create asset directory");
    }

    path
    // ✔ macOS → ~/Library/Application Support/MyApp
    // ✔ Linux → ~/.local/share/myapp   (respects XDG_DATA_HOME)
    // ✔ Windows → %APPDATA%\Example\MyApp
}

pub fn config_path() -> std::path::PathBuf {
    asset_dir().join("config.json")
}

pub fn profiles_path() -> std::path::PathBuf {
    asset_dir().join("profiles.json")
}

pub fn credentials_path() -> std::path::PathBuf {
    asset_dir().join("credentials.json")
}

#[derive(RustEmbed)]
#[folder = "../../assets/sounds"]
pub struct SoundAssets;

#[derive(RustEmbed)]
#[folder = "../../assets/scripts"]
pub struct ScriptAssets;
