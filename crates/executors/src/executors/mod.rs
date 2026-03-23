use std::{fmt, path::Path, str::FromStr, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use enum_dispatch::enum_dispatch;
use futures::stream::BoxStream;
use futures_io::Error as FuturesIoError;
use schemars::JsonSchema;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use thiserror::Error;
use tokio::task::JoinHandle;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

#[cfg(feature = "qa-mode")]
use crate::executors::qa_mock::QaMockExecutor;
use crate::{
    actions::{ExecutorAction, review::RepoReviewContext},
    approvals::ExecutorApprovalService,
    command::CommandBuildError,
    env::ExecutionEnv,
    executors::{
        acp_server::AcpServerExecutor, amp::Amp, claude::ClaudeCode, codex::Codex,
        cursor::CursorAgent, opencode::Opencode,
    },
    logs::utils::patch,
    mcp_config::McpConfig,
    profile::ExecutorConfig,
};

pub mod acp;
pub mod acp_server;
pub mod amp;
pub mod claude;
pub mod codex;
pub mod cursor;
pub mod opencode;
#[cfg(feature = "qa-mode")]
pub mod qa_mock;
pub mod utils;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
pub struct SlashCommandDescription {
    /// Command name without the leading slash, e.g. `help` for `/help`.
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(use_ts_enum)]
pub enum BaseAgentCapability {
    SessionFork,
    /// Agent requires a setup script before it can run (e.g., login, installation)
    SetupHelper,
    /// Agent reports context/token usage information
    ContextUsage,
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

// ---------------------------------------------------------------------------
// BaseCodingAgent  –  string newtype
// ---------------------------------------------------------------------------

/// Executor identity. Non-ACP built-ins use SCREAMING_SNAKE_CASE.
/// ACP servers use registry ID directly (e.g. "gemini", "cline").
#[derive(Debug, Clone, Hash, Eq, PartialEq)]
pub struct BaseCodingAgent(String);

/// Normalize any agent name to SCREAMING_SNAKE_CASE.
/// Handles legacy aliases and kebab-case registry IDs.
fn normalize_base_agent(raw: &str) -> String {
    // Handle specific legacy aliases first
    match raw {
        "COPILOT" => return "GITHUB_COPILOT_CLI".to_string(),
        "DROID" => return "FACTORY_DROID".to_string(),
        _ => {}
    }
    // Convert kebab-case / lowercase to SCREAMING_SNAKE_CASE
    raw.replace('-', "_").to_ascii_uppercase()
}

impl BaseCodingAgent {
    pub fn claude_code() -> Self {
        Self("CLAUDE_CODE".into())
    }
    pub fn amp() -> Self {
        Self("AMP".into())
    }
    pub fn codex() -> Self {
        Self("CODEX".into())
    }
    pub fn opencode() -> Self {
        Self("OPENCODE".into())
    }
    pub fn cursor() -> Self {
        Self("CURSOR_AGENT".into())
    }
    pub fn qa_mock() -> Self {
        Self("QA_MOCK".into())
    }
    pub fn from_registry_id(id: impl Into<String>) -> Self {
        Self(normalize_base_agent(&id.into()))
    }
    /// Create from a raw string without normalization.
    /// Used when the name is already in SCREAMING_SNAKE_CASE.
    pub fn from_str_raw(name: &str) -> Self {
        if name.is_empty() {
            Self("ACP_SERVER".into())
        } else {
            Self(name.to_string())
        }
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
    /// Returns `true` for executors that are NOT ACP-protocol based
    /// (i.e. they have their own dedicated executor struct).
    pub fn is_builtin_non_acp(&self) -> bool {
        matches!(
            self.0.as_str(),
            "CLAUDE_CODE" | "AMP" | "CODEX" | "OPENCODE" | "CURSOR_AGENT" | "QA_MOCK"
        )
    }
}

impl fmt::Display for BaseCodingAgent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl FromStr for BaseCodingAgent {
    type Err = std::convert::Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self(normalize_base_agent(s)))
    }
}

impl Serialize for BaseCodingAgent {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for BaseCodingAgent {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(deserializer)?;
        Ok(Self(normalize_base_agent(&raw)))
    }
}

// --- ts_rs manual impl ---

impl TS for BaseCodingAgent {
    type WithoutGenerics = Self;
    type OptionInnerType = Self;

    fn name() -> String {
        "BaseCodingAgent".to_string()
    }

    fn decl() -> String {
        "type BaseCodingAgent = string;".to_string()
    }

    fn decl_concrete() -> String {
        Self::decl()
    }

    fn inline() -> String {
        "string".to_string()
    }

    fn inline_flattened() -> String {
        Self::inline()
    }

    fn output_path() -> Option<std::path::PathBuf> {
        Some(std::path::PathBuf::from("BaseCodingAgent.ts"))
    }
}

// --- From impls ---

impl From<&CodingAgent> for BaseCodingAgent {
    fn from(agent: &CodingAgent) -> Self {
        match agent {
            CodingAgent::ClaudeCode(_) => Self::claude_code(),
            CodingAgent::Amp(_) => Self::amp(),
            CodingAgent::Codex(_) => Self::codex(),
            CodingAgent::Opencode(_) => Self::opencode(),
            CodingAgent::CursorAgent(_) => Self::cursor(),
            CodingAgent::AcpServer(a) => Self::from_str_raw(&a.name),
            #[cfg(feature = "qa-mode")]
            CodingAgent::QaMock(_) => Self::qa_mock(),
        }
    }
}

impl From<CodingAgent> for BaseCodingAgent {
    fn from(agent: CodingAgent) -> Self {
        Self::from(&agent)
    }
}

// ---------------------------------------------------------------------------
// CodingAgent  enum
// ---------------------------------------------------------------------------

#[enum_dispatch]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CodingAgent {
    ClaudeCode,
    Amp,
    Codex,
    Opencode,
    CursorAgent,
    #[serde(
        alias = "GEMINI",
        alias = "QWEN_CODE",
        alias = "COPILOT",
        alias = "DROID",
        alias = "FACTORY_DROID"
    )]
    AcpServer(AcpServerExecutor),
    #[cfg(feature = "qa-mode")]
    QaMock(QaMockExecutor),
}

impl fmt::Display for CodingAgent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let base = BaseCodingAgent::from(self);
        write!(f, "{}", base)
    }
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
        // ACP servers always support MCP (passed via ACP protocol, not file-based)
        matches!(self, Self::AcpServer(_)) || self.default_mcp_config_path().is_some()
    }

    /// Returns capabilities from static config or disk cache (sync, never probes).
    /// For on-demand probing, use `GET /api/agents/capabilities`.
    pub fn capabilities(&self) -> Vec<BaseAgentCapability> {
        match self {
            Self::ClaudeCode(_) => vec![
                BaseAgentCapability::SessionFork,
                BaseAgentCapability::ContextUsage,
            ],
            Self::Opencode(_) => vec![
                BaseAgentCapability::SessionFork,
                BaseAgentCapability::ContextUsage,
            ],
            Self::Codex(_) => vec![
                BaseAgentCapability::SessionFork,
                BaseAgentCapability::SetupHelper,
                BaseAgentCapability::ContextUsage,
            ],
            Self::Amp(_) => vec![],
            Self::CursorAgent(_) => vec![BaseAgentCapability::SetupHelper],
            Self::AcpServer(exec) => {
                let mut caps = vec![];
                if let Some(cached) = crate::capability_cache::get_for_server(&exec.name)
                    && cached.supports_fork
                {
                    caps.push(BaseAgentCapability::SessionFork);
                }
                caps
            }
            #[cfg(feature = "qa-mode")]
            Self::QaMock(_) => vec![],
        }
    }

    /// Async version that probes ACP servers on demand (for dedicated endpoint).
    pub async fn capabilities_with_probe(&self) -> Vec<BaseAgentCapability> {
        match self {
            Self::AcpServer(exec) => {
                let mut caps = vec![];
                if let Some(rid) = exec.registry_id()
                    && let Some(cached) = crate::capability_cache::get_or_probe(&rid).await
                    && cached.supports_fork
                {
                    caps.push(BaseAgentCapability::SessionFork);
                }
                caps
            }
            _ => self.capabilities(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
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
    fn apply_overrides(&mut self, _executor_config: &ExecutorConfig) {}

    fn use_approvals(&mut self, _approvals: Arc<dyn ExecutorApprovalService>) {}

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError>;

    /// Continue a session, optionally resetting to a specific message.
    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        reset_to_message_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError>;

    async fn spawn_review(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        match session_id {
            Some(id) => {
                self.spawn_follow_up(current_dir, prompt, id, None, env)
                    .await
            }
            None => self.spawn(current_dir, prompt, env).await,
        }
    }

    fn normalize_logs(
        &self,
        _raw_logs_event_store: Arc<MsgStore>,
        _worktree_path: &Path,
    ) -> Vec<JoinHandle<()>> {
        vec![]
    }

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

    /// Returns a stream of executor discovered options updates.
    async fn discover_options(
        &self,
        _workdir: Option<&Path>,
        _repo_path: Option<&Path>,
    ) -> Result<BoxStream<'static, json_patch::Patch>, ExecutorError> {
        let options = crate::executor_discovery::ExecutorDiscoveredOptions::default();
        Ok(Box::pin(futures::stream::once(async move {
            patch::executor_discovered_options(options)
        })))
    }

    /// Returns the default overrides defined by this preset/variant.
    fn get_preset_options(&self) -> ExecutorConfig;
}

/// Result communicated through the exit signal
#[derive(Debug, Clone, Copy)]
pub enum ExecutorExitResult {
    /// Process completed successfully (exit code 0)
    Success,
    /// Process should be marked as failed (non-zero exit)
    Failure,
}

/// Optional exit notification from an executor.
/// When this receiver resolves, the container should gracefully stop the process
/// and mark it according to the result.
pub type ExecutorExitSignal = tokio::sync::oneshot::Receiver<ExecutorExitResult>;

/// Cancellation token for requesting graceful shutdown of an executor.
/// When cancelled, the executor should attempt to cancel gracefully before being killed.
pub type CancellationToken = tokio_util::sync::CancellationToken;

#[derive(Debug)]
pub struct SpawnedChild {
    pub child: AsyncGroupChild,
    /// Executor -> Container: signals when executor wants to exit
    pub exit_signal: Option<ExecutorExitSignal>,
    /// Container -> Executor: signals when container wants to cancel the execution
    pub cancel: Option<CancellationToken>,
}

impl From<AsyncGroupChild> for SpawnedChild {
    fn from(child: AsyncGroupChild) -> Self {
        Self {
            child,
            exit_signal: None,
            cancel: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
#[serde(transparent)]
#[schemars(
    title = "Append Prompt",
    description = "Extra text appended to the prompt",
    extend("format" = "textarea")
)]
#[derive(Default)]
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

pub fn build_review_prompt(
    context: Option<&[RepoReviewContext]>,
    additional_prompt: Option<&str>,
) -> String {
    let mut prompt = String::from("Please review the code changes.\n\n");

    if let Some(repos) = context {
        for repo in repos {
            prompt.push_str(&format!("Repository: {}\n", repo.repo_name));
            prompt.push_str(&format!(
                "Review all changes from base commit {} to HEAD.\n",
                repo.base_commit
            ));
            prompt.push_str(&format!(
                "Use `git diff {}..HEAD` to see the changes.\n",
                repo.base_commit
            ));
            prompt.push('\n');
        }
    }

    if let Some(additional) = additional_prompt {
        prompt.push_str(additional);
    }

    prompt
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use super::*;

    #[test]
    fn test_legacy_agent_normalization() {
        // CURSOR_AGENT stays CURSOR_AGENT (canonical name)
        let result = BaseCodingAgent::from_str("CURSOR_AGENT").unwrap();
        assert_eq!(result.as_str(), "CURSOR_AGENT");

        // Legacy COPILOT → GITHUB_COPILOT_CLI
        let result = BaseCodingAgent::from_str("COPILOT").unwrap();
        assert_eq!(result.as_str(), "GITHUB_COPILOT_CLI");

        // Legacy DROID → FACTORY_DROID
        let result = BaseCodingAgent::from_str("DROID").unwrap();
        assert_eq!(result.as_str(), "FACTORY_DROID");

        // SCREAMING_SNAKE stays as-is
        let result = BaseCodingAgent::from_str("GEMINI").unwrap();
        assert_eq!(result.as_str(), "GEMINI");

        let result = BaseCodingAgent::from_str("QWEN_CODE").unwrap();
        assert_eq!(result.as_str(), "QWEN_CODE");

        // kebab-case registry IDs convert to SCREAMING_SNAKE
        let result = BaseCodingAgent::from_str("qwen-code").unwrap();
        assert_eq!(result.as_str(), "QWEN_CODE");

        let result = BaseCodingAgent::from_str("github-copilot-cli").unwrap();
        assert_eq!(result.as_str(), "GITHUB_COPILOT_CLI");

        // Builtins stay as-is
        let result = BaseCodingAgent::from_str("CLAUDE_CODE").unwrap();
        assert_eq!(result, BaseCodingAgent::claude_code());
    }

    #[test]
    fn test_base_coding_agent_serde_roundtrip() {
        let agent = BaseCodingAgent::claude_code();
        let json = serde_json::to_string(&agent).unwrap();
        assert_eq!(json, r#""CLAUDE_CODE""#);
        let back: BaseCodingAgent = serde_json::from_str(&json).unwrap();
        assert_eq!(back, agent);
    }
}
