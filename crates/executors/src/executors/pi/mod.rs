mod events;
mod normalize;
mod rpc_client;

use std::{path::Path, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    command::{CmdOverrides, CommandBuilder, CommandParts, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, InterruptSender, SpawnedChild,
        StandardCodingAgentExecutor,
    },
    logs::utils::EntryIndexProvider,
};

pub use events::{AssistantMessageEvent, PiRpcEvent, PiStateData, PiToolResult, ToolCallInfo};
pub use rpc_client::PiRpcClient;

/// Pi executor configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, Default)]
pub struct Pi {
    #[serde(default)]
    pub append_prompt: AppendPrompt,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Provider",
        description = "LLM provider to use (e.g., anthropic, openai)"
    )]
    pub provider: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Model",
        description = "Model to use (e.g., claude-sonnet-4-20250514)"
    )]
    pub model: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Thinking Mode",
        description = "Thinking/reasoning mode: off, low, high, xhigh"
    )]
    pub thinking: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Use NPX",
        description = "Toggle between local binary and npx execution"
    )]
    pub use_npx: Option<bool>,

    // Extension control
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Disable Extensions",
        description = "Disable extension discovery"
    )]
    pub no_extensions: Option<bool>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Disable Skills",
        description = "Disable skills discovery and loading"
    )]
    pub no_skills: Option<bool>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schemars(
        title = "Extensions",
        description = "Extension file paths to load"
    )]
    pub extensions: Vec<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Skills Filter",
        description = "Comma-separated glob patterns to filter skills (e.g., 'git-*,docker')"
    )]
    pub skills: Option<String>,

    // Tool control
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Tools",
        description = "Comma-separated tools to enable (read,bash,edit,write,grep,find,ls)"
    )]
    pub tools: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Disable All Tools",
        description = "Disable all built-in tools"
    )]
    pub no_tools: Option<bool>,

    // System prompt
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "System Prompt",
        description = "Custom system prompt (text or file path)"
    )]
    pub system_prompt: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Append System Prompt",
        description = "Append text or file contents to the system prompt"
    )]
    pub append_system_prompt: Option<String>,

    // Model constraints
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Model Patterns",
        description = "Model patterns for Ctrl+P cycling (e.g., 'sonnet:high,haiku:low')"
    )]
    pub models: Option<String>,

    // Session behavior
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Ephemeral Session",
        description = "Don't save session (ephemeral mode)"
    )]
    pub no_session: Option<bool>,

    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Pi {
    /// Get the session file path for a given session ID
    fn get_session_path(session_id: &str) -> std::path::PathBuf {
        // Sanitize session_id to prevent path traversal
        // Allow only alphanumeric characters, dashes, and underscores
        let sanitized_id: String = session_id
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
            .collect();

        let safe_id = if sanitized_id.is_empty() {
            "default".to_string()
        } else {
            sanitized_id
        };

        dirs::home_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join(".pi")
            .join("agent")
            .join("sessions")
            .join("vibe-kanban")
            .join(format!("{}.jsonl", safe_id))
    }

    /// Get the session directory for vibe-kanban sessions
    fn get_session_dir() -> std::path::PathBuf {
        dirs::home_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join(".pi")
            .join("agent")
            .join("sessions")
            .join("vibe-kanban")
    }

    /// Build the RPC command builder
    fn build_rpc_command_builder(&self) -> CommandBuilder {
        // Determine base command - use npx if requested
        let base = if self.use_npx.unwrap_or(false) {
            "npx -y @mariozechner/pi-coding-agent"
        } else {
            "pi"
        };

        let mut builder = CommandBuilder::new(base);

        // Use RPC mode for bidirectional communication
        builder = builder.extend_params(["--mode", "rpc"]);

        // Use vibe-kanban-specific session directory
        let session_dir = Self::get_session_dir();
        builder = builder.extend_params(["--session-dir", &session_dir.to_string_lossy()]);

        // Extension and skills control (no longer hardcoded)
        if self.no_extensions.unwrap_or(false) {
            builder = builder.extend_params(["--no-extensions"]);
        }
        if self.no_skills.unwrap_or(false) {
            builder = builder.extend_params(["--no-skills"]);
        }

        // Load specific extensions
        for ext in &self.extensions {
            builder = builder.extend_params(["--extension", ext]);
        }

        // Skills filter
        if let Some(skills) = &self.skills {
            builder = builder.extend_params(["--skills", skills]);
        }

        // Tool control
        if self.no_tools.unwrap_or(false) {
            builder = builder.extend_params(["--no-tools"]);
        } else if let Some(tools) = &self.tools {
            builder = builder.extend_params(["--tools", tools]);
        }

        // System prompt
        if let Some(sp) = &self.system_prompt {
            builder = builder.extend_params(["--system-prompt", sp]);
        }
        if let Some(asp) = &self.append_system_prompt {
            builder = builder.extend_params(["--append-system-prompt", asp]);
        }

        // Model constraints
        if let Some(models) = &self.models {
            builder = builder.extend_params(["--models", models]);
        }

        // Session behavior
        if self.no_session.unwrap_or(false) {
            builder = builder.extend_params(["--no-session"]);
        }

        // Add provider if specified
        if let Some(provider) = &self.provider {
            builder = builder.extend_params(["--provider", provider.as_str()]);
        }

        // Add model if specified
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model.as_str()]);
        }

        // Add thinking mode if specified
        if let Some(thinking) = &self.thinking {
            builder = builder.extend_params(["--thinking", thinking.as_str()]);
        }

        apply_overrides(builder, &self.cmd)
    }
}

async fn spawn_pi_rpc(
    command_parts: CommandParts,
    current_dir: &Path,
    env: &ExecutionEnv,
    cmd_overrides: &CmdOverrides,
) -> Result<(command_group::AsyncGroupChild, PiRpcClient), ExecutorError> {
    let (program_path, args) = command_parts.into_resolved().await?;

    let mut command = Command::new(program_path);
    command
        .kill_on_drop(true)
        .stdin(Stdio::piped()) // Need stdin for RPC commands
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(current_dir)
        .args(args);

    env.clone()
        .with_profile(cmd_overrides)
        .apply_to_command(&mut command);

    let mut child = command.group_spawn()?;

    let stdin = child.inner().stdin.take().ok_or_else(|| {
        ExecutorError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Failed to capture stdin",
        ))
    })?;

    let client = PiRpcClient::new(stdin);

    Ok((child, client))
}

#[async_trait]
impl StandardCodingAgentExecutor for Pi {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_parts = self.build_rpc_command_builder().build_initial()?;
        let (child, client) =
            spawn_pi_rpc(command_parts, current_dir, env, &self.cmd).await?;

        // Send initial prompt
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        client.send_prompt(&combined_prompt).await?;

        // Request state to get session ID
        client.get_state().await?;

        // Set up interrupt handling
        let (interrupt_tx, interrupt_rx): (InterruptSender, _) = tokio::sync::oneshot::channel();

        // Spawn task to handle interrupt
        let client_for_abort = client.clone();
        tokio::spawn(async move {
            if interrupt_rx.await.is_ok() {
                let _ = client_for_abort.abort().await;
            }
        });

        Ok(SpawnedChild {
            child,
            exit_signal: None,
            interrupt_sender: Some(interrupt_tx),
        })
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let session_path = Self::get_session_path(session_id);

        // Ensure parent directory exists
        if let Some(parent) = session_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                ExecutorError::Io(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Failed to create session directory: {}", e),
                ))
            })?;
        }

        // Build command with session file
        let session_path_str = session_path.to_string_lossy().to_string();
        let command_parts = self.build_rpc_command_builder().build_follow_up(&[
            "--session".to_string(),
            session_path_str,
        ])?;

        let (child, client) =
            spawn_pi_rpc(command_parts, current_dir, env, &self.cmd).await?;

        // Send follow-up prompt
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        client.send_prompt(&combined_prompt).await?;

        // Set up interrupt handling
        let (interrupt_tx, interrupt_rx): (InterruptSender, _) = tokio::sync::oneshot::channel();

        let client_for_abort = client.clone();
        tokio::spawn(async move {
            if interrupt_rx.await.is_ok() {
                let _ = client_for_abort.abort().await;
            }
        });

        Ok(SpawnedChild {
            child,
            exit_signal: None,
            interrupt_sender: Some(interrupt_tx),
        })
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        normalize::normalize_logs(
            msg_store.clone(),
            worktree_path,
            EntryIndexProvider::start_from(&msg_store),
        );
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        // Pi doesn't support MCP configuration
        None
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // Check if pi binary works
        if std::process::Command::new("pi")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return AvailabilityInfo::InstallationFound;
        }

        // Check if npx is available
        if std::process::Command::new("npx")
            .args(["-y", "@mariozechner/pi-coding-agent", "--version"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return AvailabilityInfo::InstallationFound;
        }

        AvailabilityInfo::NotFound
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_path_generation() {
        let path = Pi::get_session_path("test-session-123");
        assert!(path.to_string_lossy().contains("vibe-kanban"));
        assert!(path.to_string_lossy().ends_with("test-session-123.jsonl"));
    }

    #[test]
    fn test_session_path_sanitization() {
        // Test path traversal prevention
        let path = Pi::get_session_path("../../../etc/passwd");
        assert!(!path.to_string_lossy().contains(".."));
        assert!(path.to_string_lossy().contains("vibe-kanban"));
    }

    #[test]
    fn test_command_builder_default() {
        let pi = Pi::default();
        let builder = pi.build_rpc_command_builder();
        let result = builder.build_initial();
        assert!(result.is_ok());
    }

    #[test]
    fn test_command_builder_with_options() {
        let pi = Pi {
            provider: Some("anthropic".to_string()),
            model: Some("claude-sonnet-4-20250514".to_string()),
            thinking: Some("high".to_string()),
            ..Default::default()
        };
        let builder = pi.build_rpc_command_builder();
        let result = builder.build_initial();
        assert!(result.is_ok());
    }
}
