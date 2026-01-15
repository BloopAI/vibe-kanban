use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::fs;
use ts_rs::TS;
use uuid::Uuid;
use workspace_utils::assets::{claude_accounts_config_path, claude_accounts_dir};

/// Represents a single Claude account with its home directory
#[derive(Debug, Clone, Serialize, Deserialize, TS, JsonSchema)]
pub struct ClaudeAccount {
    /// Unique identifier for the account
    pub id: String,
    /// User-friendly name for the account
    pub name: String,
    /// Path to the account's home directory (contains .claude/.credentials.json)
    pub home_path: String,
    /// Unix timestamp when the account was created
    pub created_at: i64,
    /// Unix timestamp until which the account is rate limited (None if not limited)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rate_limited_until: Option<i64>,
}

impl ClaudeAccount {
    /// Check if the account has valid credentials
    pub fn is_logged_in(&self) -> bool {
        let credentials_path =
            PathBuf::from(&self.home_path).join(".claude/.credentials.json");
        credentials_path.exists()
    }

    /// Check if the account is currently rate limited
    pub fn is_rate_limited(&self) -> bool {
        if let Some(until) = self.rate_limited_until {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            now < until
        } else {
            false
        }
    }
}

/// Configuration for multiple Claude accounts
#[derive(Debug, Clone, Serialize, Deserialize, TS, JsonSchema, Default)]
pub struct ClaudeAccountsConfig {
    /// List of configured accounts
    #[serde(default)]
    pub accounts: Vec<ClaudeAccount>,
    /// Whether to automatically rotate accounts on rate limit
    #[serde(default)]
    pub rotation_enabled: bool,
    /// Current account index for rotation (persisted)
    #[serde(default)]
    pub current_account_index: usize,
}

impl ClaudeAccountsConfig {
    /// Load the accounts configuration from disk
    pub async fn load() -> Self {
        let config_path = claude_accounts_config_path();
        if config_path.exists() {
            match fs::read_to_string(&config_path).await {
                Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
                Err(e) => {
                    tracing::warn!("Failed to read claude accounts config: {}", e);
                    Self::default()
                }
            }
        } else {
            Self::default()
        }
    }

    /// Load the accounts configuration from disk (sync version)
    pub fn load_sync() -> Self {
        let config_path = claude_accounts_config_path();
        if config_path.exists() {
            match std::fs::read_to_string(&config_path) {
                Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
                Err(e) => {
                    tracing::warn!("Failed to read claude accounts config: {}", e);
                    Self::default()
                }
            }
        } else {
            Self::default()
        }
    }

    /// Save the accounts configuration to disk
    pub async fn save(&self) -> Result<(), std::io::Error> {
        let config_path = claude_accounts_config_path();
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        fs::write(&config_path, content).await
    }

    /// Save the accounts configuration to disk (sync version)
    pub fn save_sync(&self) -> Result<(), std::io::Error> {
        let config_path = claude_accounts_config_path();
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        std::fs::write(&config_path, content)
    }

    /// Add a new account
    pub fn add_account(&mut self, name: String) -> ClaudeAccount {
        let id = Uuid::new_v4().to_string();
        let accounts_dir = claude_accounts_dir();
        let home_path = accounts_dir.join(&id);

        // Create the account directory structure
        let claude_dir = home_path.join(".claude");
        std::fs::create_dir_all(&claude_dir).expect("Failed to create account directory");

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let account = ClaudeAccount {
            id,
            name,
            home_path: home_path.to_string_lossy().to_string(),
            created_at: now,
            rate_limited_until: None,
        };

        self.accounts.push(account.clone());
        account
    }

    /// Remove an account by ID
    pub fn remove_account(&mut self, id: &str) -> Option<ClaudeAccount> {
        if let Some(pos) = self.accounts.iter().position(|a| a.id == id) {
            let account = self.accounts.remove(pos);
            // Remove the account directory
            let home_path = PathBuf::from(&account.home_path);
            if home_path.exists() {
                let _ = std::fs::remove_dir_all(&home_path);
            }
            Some(account)
        } else {
            None
        }
    }

    /// Get an account by ID
    pub fn get_account(&self, id: &str) -> Option<&ClaudeAccount> {
        self.accounts.iter().find(|a| a.id == id)
    }

    /// Get a mutable account by ID
    pub fn get_account_mut(&mut self, id: &str) -> Option<&mut ClaudeAccount> {
        self.accounts.iter_mut().find(|a| a.id == id)
    }

    /// Get the next available account for rotation (skips rate-limited accounts)
    /// Uses the persisted current_account_index from config
    pub fn get_next_available_account(&self, current_index: &AtomicUsize) -> Option<&ClaudeAccount> {
        if self.accounts.is_empty() {
            return None;
        }

        let len = self.accounts.len();
        // Use the persisted index from config as the source of truth
        let start = self.current_account_index % len;
        // Also sync the AtomicUsize for consistency
        current_index.store(start, Ordering::Relaxed);

        // Try each account starting from current index
        for i in 0..len {
            let idx = (start + i) % len;
            let account = &self.accounts[idx];
            if account.is_logged_in() && !account.is_rate_limited() {
                return Some(account);
            }
        }

        // If all accounts are rate limited, return the first logged-in one
        self.accounts.iter().find(|a| a.is_logged_in())
    }

    /// Get the current account based on persisted index
    pub fn get_current_account(&self) -> Option<&ClaudeAccount> {
        if self.accounts.is_empty() {
            return None;
        }
        let idx = self.current_account_index % self.accounts.len();
        Some(&self.accounts[idx])
    }

    /// Mark an account as rate limited
    pub fn mark_rate_limited(&mut self, id: &str, duration_secs: i64) {
        if let Some(account) = self.get_account_mut(id) {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            account.rate_limited_until = Some(now + duration_secs);
        }
    }

    /// Advance to the next account (for rotation)
    pub fn advance_index(&self, current_index: &AtomicUsize) {
        if !self.accounts.is_empty() {
            let current = current_index.load(Ordering::Relaxed);
            current_index.store((current + 1) % self.accounts.len(), Ordering::Relaxed);
        }
    }

    /// Sync Claude sessions bidirectionally between all accounts
    /// This ensures all accounts have access to all session files
    /// Keeps the newest version when conflicts occur
    pub fn sync_all_sessions(&self) -> Result<(), String> {
        if self.accounts.len() < 2 {
            return Ok(());
        }

        // Collect all unique session files from all accounts with their modification times
        let mut all_sessions: std::collections::HashMap<String, (PathBuf, std::time::SystemTime)> =
            std::collections::HashMap::new();

        // First pass: collect all sessions with their modification times
        for account in &self.accounts {
            let projects_dir = PathBuf::from(&account.home_path).join(".claude/projects");
            if !projects_dir.exists() {
                continue;
            }

            Self::collect_sessions(&projects_dir, &mut all_sessions)?;
        }

        tracing::info!(
            "Found {} unique session files across all accounts",
            all_sessions.len()
        );

        // Second pass: copy sessions to all accounts (keeping newest versions)
        for account in &self.accounts {
            let projects_dir = PathBuf::from(&account.home_path).join(".claude/projects");

            // Create projects directory if it doesn't exist
            std::fs::create_dir_all(&projects_dir)
                .map_err(|e| format!("Failed to create projects dir for {}: {}", account.name, e))?;

            for (relative_path, (src_path, _)) in &all_sessions {
                let dst_path = projects_dir.join(relative_path);

                // Skip if source and destination are the same file
                if src_path == &dst_path {
                    continue;
                }

                // Create parent directory if needed
                if let Some(parent) = dst_path.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create dir: {}", e))?;
                }

                // Copy the file (overwrite if exists)
                std::fs::copy(src_path, &dst_path)
                    .map_err(|e| format!("Failed to copy session file: {}", e))?;
            }
        }

        tracing::info!(
            "Synced all sessions across {} accounts",
            self.accounts.len()
        );
        Ok(())
    }

    /// Collect all session files from a projects directory
    fn collect_sessions(
        projects_dir: &Path,
        sessions: &mut std::collections::HashMap<String, (PathBuf, std::time::SystemTime)>,
    ) -> Result<(), String> {
        if !projects_dir.exists() {
            return Ok(());
        }

        for project_entry in std::fs::read_dir(projects_dir)
            .map_err(|e| format!("Failed to read projects dir: {}", e))?
        {
            let project_entry =
                project_entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let project_path = project_entry.path();

            if !project_path.is_dir() {
                continue;
            }

            let project_name = project_entry.file_name();

            for session_entry in std::fs::read_dir(&project_path)
                .map_err(|e| format!("Failed to read project dir: {}", e))?
            {
                let session_entry =
                    session_entry.map_err(|e| format!("Failed to read entry: {}", e))?;
                let session_path = session_entry.path();

                // Only process .jsonl files (session files)
                if session_path
                    .extension()
                    .map(|e| e == "jsonl")
                    .unwrap_or(false)
                {
                    let relative_path = format!(
                        "{}/{}",
                        project_name.to_string_lossy(),
                        session_entry.file_name().to_string_lossy()
                    );

                    let modified = session_path
                        .metadata()
                        .and_then(|m| m.modified())
                        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);

                    // Keep the newest version of each session
                    if let Some((_, existing_modified)) = sessions.get(&relative_path) {
                        if modified > *existing_modified {
                            sessions.insert(relative_path, (session_path, modified));
                        }
                    } else {
                        sessions.insert(relative_path, (session_path, modified));
                    }
                }
            }
        }

        Ok(())
    }
}

/// Get the terminal command for the current platform
pub fn get_terminal_command() -> Option<(&'static str, Vec<&'static str>)> {
    if cfg!(target_os = "linux") {
        // Try common Linux terminals in order of preference
        if std::process::Command::new("which")
            .arg("gnome-terminal")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some(("gnome-terminal", vec!["--"]));
        }
        if std::process::Command::new("which")
            .arg("konsole")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some(("konsole", vec!["-e"]));
        }
        if std::process::Command::new("which")
            .arg("xterm")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some(("xterm", vec!["-e"]));
        }
        if std::process::Command::new("which")
            .arg("kitty")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some(("kitty", vec![]));
        }
        None
    } else if cfg!(target_os = "macos") {
        // Use osascript to open Terminal.app
        Some(("open", vec!["-a", "Terminal"]))
    } else if cfg!(target_os = "windows") {
        Some(("cmd", vec!["/c", "start", "cmd", "/k"]))
    } else {
        None
    }
}

/// Spawn a terminal for Claude Code login with the specified HOME directory
pub fn spawn_login_terminal(account: &ClaudeAccount) -> Result<(), std::io::Error> {
    let home_path = &account.home_path;

    if cfg!(target_os = "macos") {
        // macOS: Use osascript to open Terminal with the command
        let script = format!(
            r#"tell application "Terminal"
    activate
    do script "export HOME='{}' && echo 'Logging in to Claude account: {}' && echo 'HOME is set to: {}' && npx -y @anthropic-ai/claude-code && echo '' && echo 'Login complete! You can close this terminal.' && read"
end tell"#,
            home_path, account.name, home_path
        );

        std::process::Command::new("osascript")
            .args(["-e", &script])
            .spawn()?;
    } else if cfg!(target_os = "linux") {
        // Linux: Try various terminal emulators
        let bash_cmd = format!(
            "export HOME='{}' && echo 'Logging in to Claude account: {}' && echo 'HOME is set to: {}' && npx -y @anthropic-ai/claude-code; echo ''; echo 'Login complete! You can close this terminal.'; read",
            home_path, account.name, home_path
        );

        // Try terminals in order of preference
        let terminals = [
            ("gnome-terminal", vec!["--", "bash", "-c"]),
            ("konsole", vec!["-e", "bash", "-c"]),
            ("xfce4-terminal", vec!["-e", "bash -c"]),
            ("kitty", vec!["bash", "-c"]),
            ("xterm", vec!["-e", "bash", "-c"]),
        ];

        for (terminal, args) in terminals {
            if std::process::Command::new("which")
                .arg(terminal)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
            {
                let mut cmd = std::process::Command::new(terminal);
                for arg in &args {
                    cmd.arg(arg);
                }
                cmd.arg(&bash_cmd);
                cmd.spawn()?;
                return Ok(());
            }
        }

        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "No supported terminal emulator found",
        ));
    } else if cfg!(target_os = "windows") {
        // Windows: Use cmd to open a new window
        let cmd = format!(
            "set HOME={} && echo Logging in to Claude account: {} && echo HOME is set to: {} && npx -y @anthropic-ai/claude-code && echo. && echo Login complete! You can close this terminal. && pause",
            home_path, account.name, home_path
        );

        std::process::Command::new("cmd")
            .args(["/c", "start", "cmd", "/k", &cmd])
            .spawn()?;
    } else {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "Unsupported platform",
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_account_rate_limited() {
        let mut account = ClaudeAccount {
            id: "test".to_string(),
            name: "Test".to_string(),
            home_path: "/tmp/test".to_string(),
            created_at: 0,
            rate_limited_until: None,
        };

        assert!(!account.is_rate_limited());

        // Set rate limit in the future
        let future = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
            + 3600;
        account.rate_limited_until = Some(future);
        assert!(account.is_rate_limited());

        // Set rate limit in the past
        account.rate_limited_until = Some(0);
        assert!(!account.is_rate_limited());
    }
}
