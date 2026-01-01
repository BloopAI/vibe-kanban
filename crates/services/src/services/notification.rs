use std::{
    collections::HashMap,
    sync::{Arc, OnceLock},
};

use tokio::sync::RwLock;
use utils::{self, msg_store::MsgStore};

use crate::services::{
    config::{Config, SoundFile},
    events::browser_notification_patch::{self, BrowserNotification},
};

/// Event types for script notifications
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotificationEvent {
    TaskCompleted,
    TaskFailed,
    ApprovalNeeded,
}

impl NotificationEvent {
    pub fn as_str(&self) -> &'static str {
        match self {
            NotificationEvent::TaskCompleted => "task_completed",
            NotificationEvent::TaskFailed => "task_failed",
            NotificationEvent::ApprovalNeeded => "approval_needed",
        }
    }
}

/// Context variables for script notifications
#[derive(Debug, Clone, Default)]
pub struct NotificationContext {
    pub event: Option<NotificationEvent>,
    pub task_title: Option<String>,
    pub task_branch: Option<String>,
    pub executor: Option<String>,
    pub tool_name: Option<String>,
}

/// Service for handling cross-platform notifications including sound alerts and push notifications
#[derive(Clone)]
pub struct NotificationService {
    config: Arc<RwLock<Config>>,
    /// Optional events MsgStore for pushing browser notifications via SSE
    events_msg_store: Option<Arc<MsgStore>>,
}

impl std::fmt::Debug for NotificationService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NotificationService")
            .field("config", &"<config>")
            .field(
                "events_msg_store",
                &self.events_msg_store.as_ref().map(|_| "<MsgStore>"),
            )
            .finish()
    }
}

/// Cache for WSL root path from PowerShell
static WSL_ROOT_PATH_CACHE: OnceLock<Option<String>> = OnceLock::new();

impl NotificationService {
    pub fn new(config: Arc<RwLock<Config>>) -> Self {
        Self {
            config,
            events_msg_store: None,
        }
    }

    pub fn with_events_msg_store(mut self, events_msg_store: Arc<MsgStore>) -> Self {
        self.events_msg_store = Some(events_msg_store);
        self
    }

    /// Send both sound and push notifications if enabled
    pub async fn notify(&self, title: &str, message: &str) {
        self.notify_with_context(title, message, NotificationContext::default())
            .await;
    }

    /// Send notifications with additional context for script variable substitution
    pub async fn notify_with_context(
        &self,
        title: &str,
        message: &str,
        context: NotificationContext,
    ) {
        let config = self.config.read().await.notifications.clone();

        if config.sound_enabled {
            Self::play_sound_notification(&config.sound_file).await;
        }

        if config.push_enabled {
            Self::send_push_notification(title, message).await;
        }

        if config.script_enabled
            && let Some(ref script_command) = config.script_command
        {
            Self::execute_script_notification(script_command, title, message, &context).await;
        }

        if config.browser_enabled {
            self.send_browser_notification(title, message, &context);
        }
    }

    /// Send a browser notification via SSE to the frontend
    fn send_browser_notification(&self, title: &str, message: &str, context: &NotificationContext) {
        if let Some(ref msg_store) = self.events_msg_store {
            let notification = BrowserNotification {
                title: title.to_string(),
                message: message.to_string(),
                event: context
                    .event
                    .map(|e| e.as_str().to_string())
                    .unwrap_or_default(),
                task_title: context.task_title.clone(),
                task_branch: context.task_branch.clone(),
                executor: context.executor.clone(),
                tool_name: context.tool_name.clone(),
            };
            let patch = browser_notification_patch::send(notification);
            msg_store.push_patch(patch);
        } else {
            tracing::debug!("Browser notification skipped: events_msg_store not configured");
        }
    }

    /// Execute a user-configured script with variable substitution
    async fn execute_script_notification(
        script_command: &str,
        title: &str,
        message: &str,
        context: &NotificationContext,
    ) {
        // Build variable substitutions
        let mut vars: HashMap<&str, String> = HashMap::new();
        vars.insert("{{title}}", title.to_string());
        vars.insert("{{message}}", message.to_string());

        if let Some(ref event) = context.event {
            vars.insert("{{event}}", event.as_str().to_string());
        } else {
            vars.insert("{{event}}", String::new());
        }

        if let Some(ref task_title) = context.task_title {
            vars.insert("{{task_title}}", task_title.clone());
        } else {
            vars.insert("{{task_title}}", String::new());
        }

        if let Some(ref task_branch) = context.task_branch {
            vars.insert("{{task_branch}}", task_branch.clone());
        } else {
            vars.insert("{{task_branch}}", String::new());
        }

        if let Some(ref executor) = context.executor {
            vars.insert("{{executor}}", executor.clone());
        } else {
            vars.insert("{{executor}}", String::new());
        }

        if let Some(ref tool_name) = context.tool_name {
            vars.insert("{{tool_name}}", tool_name.clone());
        } else {
            vars.insert("{{tool_name}}", String::new());
        }

        // Shell-escape a value to prevent injection attacks
        fn escape_for_shell(value: &str) -> String {
            fn is_safe_for_shell(s: &str) -> bool {
                s.chars().all(|c| {
                    c.is_ascii_alphanumeric()
                        || c == '_'
                        || c == '-'
                        || c == '.'
                        || c == '/'
                        || (cfg!(target_os = "windows") && c == '\\')
                })
            }

            if is_safe_for_shell(value) {
                return value.to_string();
            }

            if cfg!(target_os = "windows") {
                // For cmd.exe, wrap in double quotes and escape existing double quotes
                let mut escaped = String::from("\"");
                for ch in value.chars() {
                    if ch == '"' {
                        escaped.push('"');
                    }
                    escaped.push(ch);
                }
                escaped.push('"');
                escaped
            } else {
                // For POSIX sh, use single quotes and escape existing single quotes
                if value.is_empty() {
                    "''".to_string()
                } else {
                    let mut escaped = String::from("'");
                    for ch in value.chars() {
                        if ch == '\'' {
                            escaped.push_str("'\"'\"'");
                        } else {
                            escaped.push(ch);
                        }
                    }
                    escaped.push('\'');
                    escaped
                }
            }
        }

        // Perform variable substitution with shell-escaped values to prevent injection
        let mut command = script_command.to_string();
        for (var, value) in &vars {
            let escaped_value = escape_for_shell(value);
            command = command.replace(var, &escaped_value);
        }

        tracing::debug!("Executing notification script: {}", command);

        // Execute the script using the appropriate shell
        let shell = if cfg!(target_os = "windows") {
            "cmd"
        } else {
            "sh"
        };
        let shell_arg = if cfg!(target_os = "windows") {
            "/C"
        } else {
            "-c"
        };

        // Fire-and-forget execution (don't await the result)
        let _ = tokio::process::Command::new(shell)
            .arg(shell_arg)
            .arg(&command)
            .spawn()
            .map_err(|e| {
                tracing::error!("Failed to execute notification script: {}", e);
            });
    }

    /// Play a system sound notification across platforms
    async fn play_sound_notification(sound_file: &SoundFile) {
        let file_path = match sound_file.get_path().await {
            Ok(path) => path,
            Err(e) => {
                tracing::error!("Failed to create cached sound file: {}", e);
                return;
            }
        };

        // Use platform-specific sound notification
        // Note: spawn() calls are intentionally not awaited - sound notifications should be fire-and-forget
        if cfg!(target_os = "macos") {
            let _ = tokio::process::Command::new("afplay")
                .arg(&file_path)
                .spawn();
        } else if cfg!(target_os = "linux") && !utils::is_wsl2() {
            // Try different Linux audio players
            if tokio::process::Command::new("paplay")
                .arg(&file_path)
                .spawn()
                .is_ok()
            {
                // Success with paplay
            } else if tokio::process::Command::new("aplay")
                .arg(&file_path)
                .spawn()
                .is_ok()
            {
                // Success with aplay
            } else {
                // Try system bell as fallback
                let _ = tokio::process::Command::new("echo")
                    .arg("-e")
                    .arg("\\a")
                    .spawn();
            }
        } else if cfg!(target_os = "windows") || (cfg!(target_os = "linux") && utils::is_wsl2()) {
            // Convert WSL path to Windows path if in WSL2
            let file_path = if utils::is_wsl2() {
                if let Some(windows_path) = Self::wsl_to_windows_path(&file_path).await {
                    windows_path
                } else {
                    file_path.to_string_lossy().to_string()
                }
            } else {
                file_path.to_string_lossy().to_string()
            };

            let _ = tokio::process::Command::new("powershell.exe")
                .arg("-c")
                .arg(format!(
                    r#"(New-Object Media.SoundPlayer "{file_path}").PlaySync()"#
                ))
                .spawn();
        }
    }

    /// Send a cross-platform push notification
    async fn send_push_notification(title: &str, message: &str) {
        if cfg!(target_os = "macos") {
            Self::send_macos_notification(title, message).await;
        } else if cfg!(target_os = "linux") && !utils::is_wsl2() {
            Self::send_linux_notification(title, message).await;
        } else if cfg!(target_os = "windows") || (cfg!(target_os = "linux") && utils::is_wsl2()) {
            Self::send_windows_notification(title, message).await;
        }
    }

    /// Send macOS notification using osascript
    async fn send_macos_notification(title: &str, message: &str) {
        let script = format!(
            r#"display notification "{message}" with title "{title}" sound name "Glass""#,
            message = message.replace('"', r#"\""#),
            title = title.replace('"', r#"\""#)
        );

        let _ = tokio::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .spawn();
    }

    /// Send Linux notification using notify-rust
    async fn send_linux_notification(title: &str, message: &str) {
        use notify_rust::Notification;

        let title = title.to_string();
        let message = message.to_string();

        let _handle = tokio::task::spawn_blocking(move || {
            if let Err(e) = Notification::new()
                .summary(&title)
                .body(&message)
                .timeout(10000)
                .show()
            {
                tracing::error!("Failed to send Linux notification: {}", e);
            }
        });
        drop(_handle); // Don't await, fire-and-forget
    }

    /// Send Windows/WSL notification using PowerShell toast script
    async fn send_windows_notification(title: &str, message: &str) {
        let script_path = match utils::get_powershell_script().await {
            Ok(path) => path,
            Err(e) => {
                tracing::error!("Failed to get PowerShell script: {}", e);
                return;
            }
        };

        // Convert WSL path to Windows path if in WSL2
        let script_path_str = if utils::is_wsl2() {
            if let Some(windows_path) = Self::wsl_to_windows_path(&script_path).await {
                windows_path
            } else {
                script_path.to_string_lossy().to_string()
            }
        } else {
            script_path.to_string_lossy().to_string()
        };

        let _ = tokio::process::Command::new("powershell.exe")
            .arg("-NoProfile")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-File")
            .arg(script_path_str)
            .arg("-Title")
            .arg(title)
            .arg("-Message")
            .arg(message)
            .spawn();
    }

    /// Get WSL root path via PowerShell (cached)
    async fn get_wsl_root_path() -> Option<String> {
        if let Some(cached) = WSL_ROOT_PATH_CACHE.get() {
            return cached.clone();
        }

        match tokio::process::Command::new("powershell.exe")
            .arg("-c")
            .arg("(Get-Location).Path -replace '^.*::', ''")
            .current_dir("/")
            .output()
            .await
        {
            Ok(output) => {
                match String::from_utf8(output.stdout) {
                    Ok(pwd_str) => {
                        let pwd = pwd_str.trim();
                        tracing::info!("WSL root path detected: {}", pwd);

                        // Cache the result
                        let _ = WSL_ROOT_PATH_CACHE.set(Some(pwd.to_string()));
                        return Some(pwd.to_string());
                    }
                    Err(e) => {
                        tracing::error!("Failed to parse PowerShell pwd output as UTF-8: {}", e);
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to execute PowerShell pwd command: {}", e);
            }
        }

        // Cache the failure result
        let _ = WSL_ROOT_PATH_CACHE.set(None);
        None
    }

    /// Convert WSL path to Windows UNC path for PowerShell
    async fn wsl_to_windows_path(wsl_path: &std::path::Path) -> Option<String> {
        let path_str = wsl_path.to_string_lossy();

        // Relative paths work fine as-is in PowerShell
        if !path_str.starts_with('/') {
            tracing::debug!("Using relative path as-is: {}", path_str);
            return Some(path_str.to_string());
        }

        // Get cached WSL root path from PowerShell
        if let Some(wsl_root) = Self::get_wsl_root_path().await {
            // Simply concatenate WSL root with the absolute path - PowerShell doesn't mind /
            let windows_path = format!("{wsl_root}{path_str}");
            tracing::debug!("WSL path converted: {} -> {}", path_str, windows_path);
            Some(windows_path)
        } else {
            tracing::error!(
                "Failed to determine WSL root path for conversion: {}",
                path_str
            );
            None
        }
    }
}
