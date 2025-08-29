use directories::ProjectDirs;
use rust_embed::RustEmbed;

const PROJECT_ROOT: &str = env!("CARGO_MANIFEST_DIR");

pub fn asset_dir() -> std::path::PathBuf {
    let path = if cfg!(debug_assertions) {
        std::path::PathBuf::from(PROJECT_ROOT).join("../../dev_assets")
    } else if cfg!(target_os = "linux") {
        // Linux: Use ~/.automagik-forge directly
        dirs::home_dir()
            .expect("OS didn't give us a home directory")
            .join(".automagik-forge")
    } else if cfg!(target_os = "windows") {
        // Windows: Use %APPDATA%\automagik-forge (without organization folder)
        dirs::data_dir()
            .expect("OS didn't give us a data directory")
            .join("automagik-forge")
    } else {
        // macOS: Use OS-specific directory
        ProjectDirs::from("ai", "namastex", "automagik-forge")
            .expect("OS didn't give us a home directory")
            .data_dir()
            .to_path_buf()
    };

    // Ensure the directory exists
    if !path.exists() {
        std::fs::create_dir_all(&path).expect("Failed to create asset directory");
    }

    path
    // ✔ Linux → ~/.automagik-forge
    // ✔ Windows → %APPDATA%\automagik-forge
    // ✔ macOS → ~/Library/Application Support/automagik-forge
}

pub fn config_path() -> std::path::PathBuf {
    asset_dir().join("config.json")
}

pub fn profiles_path() -> std::path::PathBuf {
    asset_dir().join("profiles.json")
}

#[derive(RustEmbed)]
#[folder = "../../assets/sounds"]
pub struct SoundAssets;

#[derive(RustEmbed)]
#[folder = "../../assets/scripts"]
pub struct ScriptAssets;
