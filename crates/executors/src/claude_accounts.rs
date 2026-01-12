use std::{
    path::PathBuf,
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
    pub fn get_next_available_account(&self, current_index: &AtomicUsize) -> Option<&ClaudeAccount> {
        if self.accounts.is_empty() {
            return None;
        }

        let len = self.accounts.len();
        let start = current_index.load(Ordering::Relaxed) % len;

        // Try each account starting from current index
        for i in 0..len {
            let idx = (start + i) % len;
            let account = &self.accounts[idx];
            if account.is_logged_in() && !account.is_rate_limited() {
                current_index.store(idx, Ordering::Relaxed);
                return Some(account);
            }
        }

        // If all accounts are rate limited, return the first logged-in one
        self.accounts.iter().find(|a| a.is_logged_in())
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
