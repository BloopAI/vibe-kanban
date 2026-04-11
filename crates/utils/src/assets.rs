use directories::ProjectDirs;
use rust_embed::RustEmbed;

const PROJECT_ROOT: &str = env!("CARGO_MANIFEST_DIR");

pub fn asset_dir() -> std::path::PathBuf {
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

/// Get the database file path.
///
/// Respects the `VK_DATABASE_PATH` environment variable for custom locations.
/// Supports tilde expansion (e.g., `~/vibe-kanban/db.sqlite`).
///
/// Default: `{asset_dir}/db.sqlite`
///
/// When a custom path is configured via `VK_DATABASE_PATH`, the parent directory
/// is created automatically if it does not exist.
pub fn database_path() -> std::path::PathBuf {
    if let Ok(path) = std::env::var("VK_DATABASE_PATH") {
        let expanded = crate::path::expand_tilde(&path);
        if let Some(parent) = expanded.parent() {
            if !parent.as_os_str().is_empty() && !parent.exists() {
                std::fs::create_dir_all(parent)
                    .expect("Failed to create parent directory for VK_DATABASE_PATH");
            }
        }
        return expanded;
    }
    asset_dir().join("db.sqlite")
}

/// Get the backup directory path.
///
/// Respects the `VK_BACKUP_DIR` environment variable for custom locations.
/// Supports tilde expansion (e.g., `~/vibe-kanban/backups`).
///
/// Default: `{asset_dir}/backups`
///
/// When a custom path is configured via `VK_BACKUP_DIR`, the directory is
/// created automatically if it does not exist.
pub fn backup_dir() -> std::path::PathBuf {
    if let Ok(path) = std::env::var("VK_BACKUP_DIR") {
        let expanded = crate::path::expand_tilde(&path);
        if !expanded.exists() {
            std::fs::create_dir_all(&expanded)
                .expect("Failed to create directory for VK_BACKUP_DIR");
        }
        return expanded;
    }
    asset_dir().join("backups")
}

#[derive(RustEmbed)]
#[folder = "../../assets/sounds"]
pub struct SoundAssets;

#[derive(RustEmbed)]
#[folder = "../../assets/scripts"]
pub struct ScriptAssets;

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::env;

    #[test]
    #[serial]
    fn test_database_path_default() {
        // SAFETY: Tests run serially via #[serial] attribute
        unsafe { env::remove_var("VK_DATABASE_PATH") };
        let path = database_path();
        assert!(path.ends_with("db.sqlite"));
    }

    #[test]
    #[serial]
    fn test_database_path_env_override() {
        // SAFETY: Tests run serially via #[serial] attribute
        unsafe { env::set_var("VK_DATABASE_PATH", "/custom/path/test.db") };
        let path = database_path();
        unsafe { env::remove_var("VK_DATABASE_PATH") };
        assert_eq!(path, std::path::PathBuf::from("/custom/path/test.db"));
    }

    #[test]
    #[serial]
    fn test_database_path_tilde_expansion() {
        // SAFETY: Tests run serially via #[serial] attribute
        unsafe { env::set_var("VK_DATABASE_PATH", "~/vibe-kanban/db.sqlite") };
        let path = database_path();
        unsafe { env::remove_var("VK_DATABASE_PATH") };
        assert!(!path.to_string_lossy().contains('~'));
        assert!(path.is_absolute());
    }

    #[test]
    #[serial]
    fn test_backup_dir_default() {
        // SAFETY: Tests run serially via #[serial] attribute
        unsafe { env::remove_var("VK_BACKUP_DIR") };
        let dir = backup_dir();
        assert!(dir.ends_with("backups"));
    }

    #[test]
    #[serial]
    fn test_backup_dir_env_override() {
        // SAFETY: Tests run serially via #[serial] attribute
        unsafe { env::set_var("VK_BACKUP_DIR", "/custom/backups") };
        let dir = backup_dir();
        unsafe { env::remove_var("VK_BACKUP_DIR") };
        assert_eq!(dir, std::path::PathBuf::from("/custom/backups"));
    }

    #[test]
    #[serial]
    fn test_backup_dir_tilde_expansion() {
        // SAFETY: Tests run serially via #[serial] attribute
        unsafe { env::set_var("VK_BACKUP_DIR", "~/my-backups") };
        let dir = backup_dir();
        unsafe { env::remove_var("VK_BACKUP_DIR") };
        assert!(!dir.to_string_lossy().contains('~'));
        assert!(dir.is_absolute());
    }
}
