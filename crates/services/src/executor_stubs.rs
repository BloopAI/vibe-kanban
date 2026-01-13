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
    pub fn new(executor: impl Into<String>, variant: Option<impl Into<String>>) -> Self {
        Self {
            executor: executor.into(),
            variant: variant.map(|v| v.into()),
        }
    }
}

// Stub for BaseCodingAgent (legacy type from executors crate)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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
            utils::approvals::ApprovalStatus::Rejected => ToolStatus::Rejected,
            utils::approvals::ApprovalStatus::TimedOut => ToolStatus::TimedOut,
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

    pub fn build_initial(self) -> Result<(String, Vec<String>, HashMap<String, String>), String> {
        Ok((self.command, self.args, self.env))
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

        // Aliases for diff operations
        pub fn add_diff(path: String, diff: serde_json::Value) -> Self {
            let entry = super::NormalizedEntry {
                timestamp: None,
                entry_type: super::NormalizedEntryType::Message {
                    content: serde_json::to_string(&diff).unwrap_or_default(),
                },
                content: format!("Diff at {}", path),
                metadata: Some(diff),
            };
            Self::Add { index: 0, entry }
        }

        pub fn remove_diff(path: String) -> Self {
            Self::Remove { index: 0 }
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
