// TEMPORARY STUBS: These types replace removed executors crate types
// They allow code to compile but should not be used for new functionality
// TODO: Remove code that depends on these stubs in future refactoring

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
pub struct ExecutorProfileId {
    pub executor: String,
    pub variant: Option<String>,
}

impl ExecutorProfileId {
    // Two-argument constructor for full specification
    pub fn new_with_variant(executor: impl Into<String>, variant: Option<impl Into<String>>) -> Self {
        Self {
            executor: executor.into(),
            variant: variant.map(|v| v.into()),
        }
    }

    // Single-argument constructor (common case, no variant)
    pub fn new(executor: impl Into<String>) -> Self {
        Self {
            executor: executor.into(),
            variant: None,
        }
    }
}

// Stub for BaseCodingAgent (legacy type from executors crate)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum BaseCodingAgent {
    ClaudeCode,
    Cursor,
    Codex,
    Amp,
    GeminiCli,
}

impl std::str::FromStr for BaseCodingAgent {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "CLAUDE_CODE" | "CLAUDECODE" => Ok(Self::ClaudeCode),
            "CURSOR" => Ok(Self::Cursor),
            "CODEX" => Ok(Self::Codex),
            "AMP" => Ok(Self::Amp),
            "GEMINI_CLI" | "GEMINICLI" => Ok(Self::GeminiCli),
            _ => Err(format!("Unknown executor: {}", s)),
        }
    }
}

impl From<String> for BaseCodingAgent {
    fn from(s: String) -> Self {
        s.parse().unwrap_or(Self::ClaudeCode)
    }
}

impl std::fmt::Display for BaseCodingAgent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ClaudeCode => write!(f, "claude_code"),
            Self::Cursor => write!(f, "cursor"),
            Self::Codex => write!(f, "codex"),
            Self::Amp => write!(f, "amp"),
            Self::GeminiCli => write!(f, "gemini_cli"),
        }
    }
}

// Allow ExecutorProfileId to be created from BaseCodingAgent
impl From<BaseCodingAgent> for ExecutorProfileId {
    fn from(agent: BaseCodingAgent) -> Self {
        Self {
            executor: agent.to_string(),
            variant: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedEntry {
    pub timestamp: Option<String>,
    pub entry_type: NormalizedEntryType,
    pub content: String,
    pub metadata: Option<serde_json::Value>,
}

impl NormalizedEntry {
    pub fn with_tool_status(mut self, status: ToolStatus) -> Option<Self> {
        if let NormalizedEntryType::ToolUse { status: ref mut s, .. } = self.entry_type {
            *s = status;
            Some(self)
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum NormalizedEntryType {
    ToolUse {
        tool_name: String,
        tool_call_id: String,
        status: ToolStatus,
        action_type: Option<ActionType>,
    },
    Message {
        content: String,
    },
    ErrorMessage {
        error_type: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "status")]
pub enum ToolStatus {
    Created,
    Pending,
    Running,
    Completed { result: Option<String> },
    Failed { error: String },
    PendingApproval {
        approval_id: String,
        requested_at: chrono::DateTime<chrono::Utc>,
        timeout_at: chrono::DateTime<chrono::Utc>,
    },
    Approved,
    Rejected,
    TimedOut,
}

impl ToolStatus {
    pub fn from_approval_status(status: utils::approvals::ApprovalStatus) -> Self {
        match status {
            utils::approvals::ApprovalStatus::Approved => ToolStatus::Approved,
            utils::approvals::ApprovalStatus::Denied { .. } => ToolStatus::Rejected,
            utils::approvals::ApprovalStatus::TimedOut => ToolStatus::TimedOut,
            utils::approvals::ApprovalStatus::Pending => ToolStatus::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionType {
    Read,
    Write,
    Execute,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallMetadata {
    pub approval_id: String,
    pub tool_call_id: String,
}

#[derive(Debug, Error)]
pub enum ExecutorApprovalError {
    #[error("Approval error: {0}")]
    Generic(String),
}

#[derive(Debug, Error)]
pub enum ExecutorError {
    #[error("Executable not found: {program}")]
    ExecutableNotFound { program: String },
    #[error("Executor error: {0}")]
    Generic(String),
}

#[async_trait::async_trait]
pub trait ExecutorApprovalService: Send + Sync {
    async fn request_tool_approval(
        &self,
        tool_name: &str,
        tool_input: serde_json::Value,
        tool_call_id: &str,
    ) -> Result<utils::approvals::ApprovalStatus, ExecutorApprovalError>;
}

// Stub for CommandBuilder
pub struct CommandBuilder {
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
}

impl CommandBuilder {
    pub fn new(command: impl Into<String>) -> Self {
        Self {
            command: command.into(),
            args: Vec::new(),
            env: HashMap::new(),
        }
    }

    pub fn arg(mut self, arg: impl Into<String>) -> Self {
        self.args.push(arg.into());
        self
    }

    pub fn env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.insert(key.into(), value.into());
        self
    }

    pub fn build_initial(self) -> Result<CommandParts, String> {
        Ok(CommandParts {
            command: self.command,
            args: self.args,
            env: self.env,
        })
    }
}

// Command parts with resolve capability
pub struct CommandParts {
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
}

impl CommandParts {
    pub async fn into_resolved(self) -> Result<(std::path::PathBuf, Vec<String>), ExecutorError> {
        // Simple resolution - just convert to PathBuf
        // In actual usage, the system will check if executable exists
        let path = std::path::PathBuf::from(&self.command);

        // Check if it's an absolute path or needs PATH resolution
        if path.is_absolute() && path.exists() {
            Ok((path, self.args))
        } else {
            // For relative paths or commands, assume they're in PATH
            // The actual spawn will fail if not found
            Ok((path, self.args))
        }
    }
}

// Stub for ConversationPatch
pub mod patch {
    use super::NormalizedEntry;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub enum ConversationPatch {
        Add { index: usize, entry: NormalizedEntry },
        Replace { index: usize, entry: NormalizedEntry },
        Remove { index: usize },
    }

    impl ConversationPatch {
        pub fn add(index: usize, entry: NormalizedEntry) -> Self {
            Self::Add { index, entry }
        }

        pub fn replace(index: usize, entry: NormalizedEntry) -> Self {
            Self::Replace { index, entry }
        }

        pub fn remove(index: usize) -> Self {
            Self::Remove { index }
        }

        // Convert to json_patch::Patch for MsgStore
        pub fn to_json_patch(&self) -> json_patch::Patch {
            // Create patch using JSON string representation
            let patch_json = match self {
                Self::Add { index, entry } => {
                    let value = serde_json::to_value(entry).unwrap_or(serde_json::Value::Null);
                    serde_json::json!([{
                        "op": "add",
                        "path": "/-",
                        "value": value
                    }])
                }
                Self::Replace { index, entry } => {
                    let value = serde_json::to_value(entry).unwrap_or(serde_json::Value::Null);
                    serde_json::json!([{
                        "op": "replace",
                        "path": format!("/{}", index),
                        "value": value
                    }])
                }
                Self::Remove { index } => {
                    serde_json::json!([{
                        "op": "remove",
                        "path": format!("/{}", index)
                    }])
                }
            };

            serde_json::from_value(patch_json).unwrap_or_else(|_| json_patch::Patch(vec![]))
        }

        // Aliases for diff operations - return json_patch::Patch directly
        pub fn add_diff(path: String, diff: serde_json::Value) -> json_patch::Patch {
            let patch_json = serde_json::json!([{
                "op": "add",
                "path": path,
                "value": diff
            }]);
            serde_json::from_value(patch_json).unwrap_or_else(|_| json_patch::Patch(vec![]))
        }

        pub fn remove_diff(path: String) -> json_patch::Patch {
            let patch_json = serde_json::json!([{
                "op": "remove",
                "path": path
            }]);
            serde_json::from_value(patch_json).unwrap_or_else(|_| json_patch::Patch(vec![]))
        }
    }

    pub fn extract_normalized_entry_from_patch(patch: &ConversationPatch) -> Option<&NormalizedEntry> {
        match patch {
            ConversationPatch::Add { entry, .. } | ConversationPatch::Replace { entry, .. } => Some(entry),
            ConversationPatch::Remove { .. } => None,
        }
    }

    // Helper function for JSON pointer escaping
    pub fn escape_json_pointer_segment(segment: &str) -> String {
        segment.replace('~', "~0").replace('/', "~1")
    }
}

// Additional stubs for server crate compatibility
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutorConfigs {
    pub executors: HashMap<String, CodingAgentStub>,
}

impl ExecutorConfigs {
    pub fn get_cached() -> Self {
        Self {
            executors: HashMap::new(),
        }
    }

    pub async fn get_recommended_executor_profile(&self) -> Result<ExecutorProfileId, String> {
        Ok(ExecutorProfileId::from(BaseCodingAgent::ClaudeCode))
    }

    pub fn get_coding_agent(&self, _profile_id: &ExecutorProfileId) -> Option<&CodingAgentStub> {
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodingAgentStub {
    pub name: String,
}

impl CodingAgentStub {
    pub fn capabilities(&self) -> Vec<BaseAgentCapability> {
        vec![]
    }

    pub fn supports_mcp(&self) -> bool {
        false // Execution disabled, MCP not supported
    }

    pub fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        None
    }

    pub async fn get_mcp_config(&self) -> Result<Option<McpConfig>, std::io::Error> {
        Ok(None)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct McpConfig {
    pub servers: HashMap<String, serde_json::Value>,
    pub servers_path: Option<std::path::PathBuf>,
}

impl McpConfig {
    pub fn new() -> Self {
        Self {
            servers: HashMap::new(),
            servers_path: None,
        }
    }
}

impl Default for McpConfig {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AvailabilityInfo {
    pub available: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum BaseAgentCapability {
    Chat,
    Edit,
    Terminal,
}

// Stub functions for MCP config file operations
pub async fn read_agent_config(
    _config_path: &std::path::Path,
    _default_config: &McpConfig,
) -> Result<McpConfig, std::io::Error> {
    // Return empty config - execution disabled
    Ok(McpConfig::new())
}

pub async fn write_agent_config(
    _config_path: &std::path::Path,
    _config: &McpConfig,
) -> Result<(), std::io::Error> {
    // No-op - execution disabled
    Ok(())
}
