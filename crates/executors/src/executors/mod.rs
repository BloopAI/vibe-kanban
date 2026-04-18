use std::{path::Path, sync::Arc};

use tokio::task::JoinHandle;

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use enum_dispatch::enum_dispatch;
use futures_io::Error as FuturesIoError;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::Type;
use strum_macros::{Display, EnumDiscriminants, EnumString, VariantNames};
use thiserror::Error;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::logs::utils::EntryIndexProvider;

use crate::{
    actions::{ExecutorAction, SpawnContext, coding_agent_review::CodingAgentReviewRequest},
    approvals::ExecutorApprovalService,
    command::CommandBuildError,
    executors::{
        amp::Amp,
        claude::{ClaudeCode, protocol::ProtocolPeer as ClaudeProtocolPeer},
        codex::{Codex, client::AppServerClient},
        copilot::Copilot,
        cursor::CursorAgent,
        droid::Droid,
        gemini::Gemini,
        opencode::Opencode,
        qwen::QwenCode,
    },
    mcp_config::McpConfig,
};

pub mod acp;
pub mod amp;
pub mod claude;
pub mod codex;
pub mod copilot;
pub mod cursor;
pub mod droid;
pub mod gemini;
pub mod opencode;
pub mod qwen;
pub mod session_index;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(use_ts_enum)]
pub enum BaseAgentCapability {
    SessionFork,
    /// Agent requires a setup script before it can run (e.g., login, installation)
    SetupHelper,
}

#[derive(Debug, Error)]
pub enum ExecutorError {
    #[error("Follow-up is not supported: {0}")]
    FollowUpNotSupported(String),
    #[error(transparent)]
    SpawnError(#[from] FuturesIoError),
    #[error("Unknown executor type: {0}")]
    UnknownExecutorType(String),
    #[error("I/O error: {0}")]
    Io(std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    TomlSerialize(#[from] toml::ser::Error),
    #[error(transparent)]
    TomlDeserialize(#[from] toml::de::Error),
    #[error(transparent)]
    ExecutorApprovalError(#[from] crate::approvals::ExecutorApprovalError),
    #[error(transparent)]
    CommandBuild(#[from] CommandBuildError),
    #[error("Executable `{program}` not found in PATH")]
    ExecutableNotFound { program: String },
    #[error("Setup helper not supported")]
    SetupHelperNotSupported,
    #[error("Auth required: {0}")]
    AuthRequired(String),
}

#[enum_dispatch]
#[derive(
    Debug, Clone, Serialize, Deserialize, PartialEq, TS, Display, EnumDiscriminants, VariantNames,
)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
#[strum_discriminants(
    name(BaseCodingAgent),
    // Only add Hash; Eq/PartialEq are already provided by EnumDiscriminants.
    derive(EnumString, Hash, strum_macros::Display, Serialize, Deserialize, TS, Type),
    strum(serialize_all = "SCREAMING_SNAKE_CASE"),
    ts(use_ts_enum),
    serde(rename_all = "SCREAMING_SNAKE_CASE"),
    sqlx(type_name = "TEXT", rename_all = "SCREAMING_SNAKE_CASE")
)]
pub enum CodingAgent {
    ClaudeCode,
    Amp,
    Gemini,
    Codex,
    Opencode,
    #[serde(alias = "CURSOR")]
    #[strum_discriminants(serde(alias = "CURSOR"))]
    #[strum_discriminants(strum(serialize = "CURSOR", serialize = "CURSOR_AGENT"))]
    CursorAgent,
    QwenCode,
    Copilot,
    Droid,
}

impl CodingAgent {
    pub fn get_mcp_config(&self) -> McpConfig {
        match self {
            Self::Codex(_) => McpConfig::new(
                vec!["mcp_servers".to_string()],
                serde_json::json!({
                    "mcp_servers": {}
                }),
                self.preconfigured_mcp(),
                true,
            ),
            Self::Amp(_) => McpConfig::new(
                vec!["amp.mcpServers".to_string()],
                serde_json::json!({
                    "amp.mcpServers": {}
                }),
                self.preconfigured_mcp(),
                false,
            ),
            Self::Opencode(_) => McpConfig::new(
                vec!["mcp".to_string()],
                serde_json::json!({
                    "mcp": {},
                    "$schema": "https://opencode.ai/config.json"
                }),
                self.preconfigured_mcp(),
                false,
            ),
            Self::Droid(_) => McpConfig::new(
                vec!["mcpServers".to_string()],
                serde_json::json!({
                    "mcpServers": {}
                }),
                self.preconfigured_mcp(),
                false,
            ),
            _ => McpConfig::new(
                vec!["mcpServers".to_string()],
                serde_json::json!({
                    "mcpServers": {}
                }),
                self.preconfigured_mcp(),
                false,
            ),
        }
    }

    pub fn supports_mcp(&self) -> bool {
        self.default_mcp_config_path().is_some()
    }

    pub fn capabilities(&self) -> Vec<BaseAgentCapability> {
        match self {
            Self::ClaudeCode(_)
            | Self::Amp(_)
            | Self::Gemini(_)
            | Self::QwenCode(_)
            | Self::Droid(_) => vec![BaseAgentCapability::SessionFork],
            Self::Codex(_) => vec![
                BaseAgentCapability::SessionFork,
                BaseAgentCapability::SetupHelper,
            ],
            Self::CursorAgent(_) => vec![BaseAgentCapability::SetupHelper],
            Self::Opencode(_) | Self::Copilot(_) => vec![],
        }
    }

    /// Returns true if this executor should start fresh without context on each turn.
    /// When true, follow-up requests will not carry conversation history from previous turns.
    pub fn no_context(&self) -> bool {
        match self {
            Self::ClaudeCode(c) => c.no_context.unwrap_or(false),
            Self::Amp(c) => c.no_context.unwrap_or(false),
            Self::Gemini(c) => c.no_context.unwrap_or(false),
            Self::Codex(c) => c.no_context.unwrap_or(false),
            Self::Opencode(c) => c.no_context.unwrap_or(false),
            Self::CursorAgent(c) => c.no_context.unwrap_or(false),
            Self::QwenCode(c) => c.no_context.unwrap_or(false),
            Self::Copilot(c) => c.no_context.unwrap_or(false),
            Self::Droid(c) => c.no_context.unwrap_or(false),
        }
    }

    /// Get the model name if configured, or None for default model
    pub fn model(&self) -> Option<&str> {
        match self {
            Self::ClaudeCode(c) => c.model.as_deref(),
            Self::Amp(_) => None,
            Self::Gemini(c) => c.model.as_deref(),
            Self::Codex(c) => c.model.as_deref(),
            Self::Opencode(c) => c.model.as_deref(),
            Self::CursorAgent(c) => c.model.as_deref(),
            Self::QwenCode(_) => None,
            Self::Copilot(c) => c.model.as_deref(),
            Self::Droid(c) => c.model.as_deref(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(export)]
pub enum AvailabilityInfo {
    LoginDetected { last_auth_timestamp: i64 },
    InstallationFound,
    NotFound,
}

impl AvailabilityInfo {
    pub fn is_available(&self) -> bool {
        matches!(
            self,
            AvailabilityInfo::LoginDetected { .. } | AvailabilityInfo::InstallationFound
        )
    }
}

#[async_trait]
#[enum_dispatch(CodingAgent)]
pub trait StandardCodingAgentExecutor {
    fn use_approvals(&mut self, _approvals: Arc<dyn ExecutorApprovalService>) {}

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        context: SpawnContext,
    ) -> Result<SpawnedChild, ExecutorError>;
    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<SpawnedChild, ExecutorError>;
    async fn spawn_review(
        &self,
        _current_dir: &Path,
        _request: &CodingAgentReviewRequest,
        _context: SpawnContext,
    ) -> Result<SpawnedChild, ExecutorError> {
        Err(ExecutorError::FollowUpNotSupported(
            "review is not supported by this executor".to_string(),
        ))
    }
    fn normalize_logs(
        &self,
        _raw_logs_event_store: Arc<MsgStore>,
        _worktree_path: &Path,
        _entry_index_provider: EntryIndexProvider,
    ) -> JoinHandle<()>;

    // MCP configuration methods
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf>;

    async fn get_setup_helper_action(&self) -> Result<ExecutorAction, ExecutorError> {
        Err(ExecutorError::SetupHelperNotSupported)
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let config_files_found = self
            .default_mcp_config_path()
            .map(|path| path.exists())
            .unwrap_or(false);

        if config_files_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
}

/// Reason why an executor session completed
#[derive(Debug, Clone, Default)]
pub enum SessionCompletionReason {
    /// Session ended with a Result message (normal completion)
    ResultMessage {
        is_error: bool,
        subtype: Option<String>,
        duration_ms: Option<u64>,
        num_turns: Option<u32>,
    },
    /// Session ended with EOF without a Result message (abnormal)
    #[default]
    EofWithoutResult,
    /// Session was killed by user
    Killed,
    /// Session ended due to an error
    Error { message: String },
}

impl SessionCompletionReason {
    /// Returns a short string identifier for the completion reason
    pub fn as_str(&self) -> &'static str {
        match self {
            SessionCompletionReason::ResultMessage { is_error: true, .. } => "result_error",
            SessionCompletionReason::ResultMessage {
                is_error: false, ..
            } => "result_success",
            SessionCompletionReason::EofWithoutResult => "eof",
            SessionCompletionReason::Killed => "killed",
            SessionCompletionReason::Error { .. } => "error",
        }
    }
}

/// Result communicated through the exit signal
#[derive(Debug, Clone)]
pub enum ExecutorExitResult {
    /// Process completed successfully (exit code 0)
    Success { reason: SessionCompletionReason },
    /// Process should be marked as failed (non-zero exit)
    Failure { reason: SessionCompletionReason },
}

impl ExecutorExitResult {
    /// Create a success result with the given completion reason
    pub fn success(reason: SessionCompletionReason) -> Self {
        ExecutorExitResult::Success { reason }
    }

    /// Create a success result with default reason (EOF)
    pub fn success_default() -> Self {
        ExecutorExitResult::Success {
            reason: SessionCompletionReason::EofWithoutResult,
        }
    }

    /// Create a failure result with the given completion reason
    pub fn failure(reason: SessionCompletionReason) -> Self {
        ExecutorExitResult::Failure { reason }
    }

    /// Create a failure result with default reason (EOF)
    pub fn failure_default() -> Self {
        ExecutorExitResult::Failure {
            reason: SessionCompletionReason::EofWithoutResult,
        }
    }

    /// Get the completion reason
    pub fn reason(&self) -> &SessionCompletionReason {
        match self {
            ExecutorExitResult::Success { reason } | ExecutorExitResult::Failure { reason } => {
                reason
            }
        }
    }

    /// Check if this is a success result
    pub fn is_success(&self) -> bool {
        matches!(self, ExecutorExitResult::Success { .. })
    }
}

/// Optional exit notification from an executor.
/// When this receiver resolves, the container should gracefully stop the process
/// and mark it according to the result.
pub type ExecutorExitSignal = tokio::sync::oneshot::Receiver<ExecutorExitResult>;

#[derive(Clone)]
pub enum ProtocolPeer {
    Claude(Arc<ClaudeProtocolPeer>),
    Codex(Arc<AppServerClient>),
}

impl std::fmt::Debug for ProtocolPeer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Claude(_) => f.write_str("ProtocolPeer::Claude(..)"),
            Self::Codex(_) => f.write_str("ProtocolPeer::Codex(..)"),
        }
    }
}

impl ProtocolPeer {
    pub async fn send_user_message(&self, content: String) -> Result<(), ExecutorError> {
        match self {
            Self::Claude(peer) => peer.send_user_message(content).await,
            Self::Codex(client) => client.send_user_message(content).await,
        }
    }

    pub async fn interrupt(&self) -> Result<bool, ExecutorError> {
        match self {
            Self::Claude(_) => Ok(false),
            Self::Codex(client) => client.interrupt_current_turn().await,
        }
    }
}

#[derive(Debug)]
pub struct SpawnedChild {
    pub child: AsyncGroupChild,
    pub exit_signal: Option<ExecutorExitSignal>,
    /// Protocol peer for live message injection and agent-aware control.
    pub protocol_peer: Option<Arc<ProtocolPeer>>,
}

impl From<AsyncGroupChild> for SpawnedChild {
    fn from(child: AsyncGroupChild) -> Self {
        Self {
            child,
            exit_signal: None,
            protocol_peer: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct SlashCommandDescription {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, Default)]
#[serde(transparent)]
#[schemars(
    title = "Append Prompt",
    description = "Extra text appended to the prompt",
    extend("format" = "textarea")
)]
pub struct AppendPrompt(pub Option<String>);

impl AppendPrompt {
    pub fn get(&self) -> Option<String> {
        self.0.clone()
    }

    pub fn combine_prompt(&self, prompt: &str) -> String {
        match self {
            AppendPrompt(Some(value)) => format!("{prompt}{value}"),
            AppendPrompt(None) => prompt.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use super::*;

    #[test]
    fn test_cursor_agent_deserialization() {
        // Test that CURSOR_AGENT is accepted
        let result = BaseCodingAgent::from_str("CURSOR_AGENT");
        assert!(result.is_ok(), "CURSOR_AGENT should be valid");
        assert_eq!(result.unwrap(), BaseCodingAgent::CursorAgent);

        // Test that legacy CURSOR is still accepted for backwards compatibility
        let result = BaseCodingAgent::from_str("CURSOR");
        assert!(
            result.is_ok(),
            "CURSOR should be valid for backwards compatibility"
        );
        assert_eq!(result.unwrap(), BaseCodingAgent::CursorAgent);

        // Test serde deserialization for CURSOR_AGENT
        let result: Result<BaseCodingAgent, _> = serde_json::from_str(r#""CURSOR_AGENT""#);
        assert!(result.is_ok(), "CURSOR_AGENT should deserialize via serde");
        assert_eq!(result.unwrap(), BaseCodingAgent::CursorAgent);

        // Test serde deserialization for legacy CURSOR
        let result: Result<BaseCodingAgent, _> = serde_json::from_str(r#""CURSOR""#);
        assert!(result.is_ok(), "CURSOR should deserialize via serde");
        assert_eq!(result.unwrap(), BaseCodingAgent::CursorAgent);
    }
}
