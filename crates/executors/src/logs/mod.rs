use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::approvals::{ApprovalStatus, QuestionStatus};

use crate::logs::utils::shell_command_parsing::CommandCategory;

pub mod plain_text_processor;
pub mod stderr_processor;
pub mod utils;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ToolResultValueType {
    Markdown,
    Json,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ToolResult {
    pub r#type: ToolResultValueType,
    /// For Markdown, this will be a JSON string; for JSON, a structured value
    pub value: serde_json::Value,
}

impl ToolResult {
    pub fn markdown<S: Into<String>>(markdown: S) -> Self {
        Self {
            r#type: ToolResultValueType::Markdown,
            value: serde_json::Value::String(markdown.into()),
        }
    }

    pub fn json(value: serde_json::Value) -> Self {
        Self {
            r#type: ToolResultValueType::Json,
            value,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CommandExitStatus {
    ExitCode { code: i32 },
    Success { success: bool },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CommandRunResult {
    pub exit_status: Option<CommandExitStatus>,
    pub output: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct NormalizedConversation {
    pub entries: Vec<NormalizedEntry>,
    pub session_id: Option<String>,
    pub executor_type: String,
    pub prompt: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NormalizedEntryError {
    SetupRequired,
    Other,
}

#[allow(clippy::large_enum_variant)]
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NormalizedEntryType {
    UserMessage,
    UserFeedback {
        denied_tool: String,
    },
    AssistantMessage,
    ToolUse {
        tool_name: String,
        action_type: ActionType,
        status: ToolStatus,
    },
    SystemMessage,
    ErrorMessage {
        error_type: NormalizedEntryError,
    },
    Thinking,
    Loading,
    NextAction {
        failed: bool,
        execution_processes: usize,
        needs_setup: bool,
    },
    TokenUsageInfo(TokenUsageInfo),
    UserAnsweredQuestions {
        answers: Vec<AnsweredQuestion>,
    },
}

/// A question–answer pair from a completed AskUserQuestion interaction.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AnsweredQuestion {
    pub question: String,
    pub answer: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TokenUsageInfo {
    pub total_tokens: u32,
    pub model_context_window: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct NormalizedEntry {
    pub timestamp: Option<String>,
    pub entry_type: NormalizedEntryType,
    pub content: String,
    #[ts(skip)]
    pub metadata: Option<serde_json::Value>,
}

impl NormalizedEntry {
    pub fn with_tool_status(&self, status: ToolStatus) -> Option<Self> {
        if let NormalizedEntryType::ToolUse {
            tool_name,
            action_type,
            ..
        } = &self.entry_type
        {
            Some(Self {
                entry_type: NormalizedEntryType::ToolUse {
                    tool_name: tool_name.clone(),
                    action_type: action_type.clone(),
                    status,
                },
                ..self.clone()
            })
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Default)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ToolStatus {
    #[default]
    Created,
    Success,
    Failed,
    Denied {
        reason: Option<String>,
    },
    PendingApproval {
        approval_id: String,
    },
    TimedOut,
}

impl ToolStatus {
    pub fn from_approval_status(status: &ApprovalStatus) -> Option<Self> {
        match status {
            ApprovalStatus::Approved => Some(ToolStatus::Created),
            ApprovalStatus::Denied { reason } => Some(ToolStatus::Denied {
                reason: reason.clone(),
            }),
            ApprovalStatus::TimedOut => Some(ToolStatus::TimedOut),
            ApprovalStatus::Pending => None,
        }
    }

    pub fn from_question_status(status: &QuestionStatus) -> Self {
        match status {
            QuestionStatus::Answered { .. } => ToolStatus::Success,
            QuestionStatus::TimedOut => ToolStatus::TimedOut,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TodoItem {
    pub content: String,
    pub status: String,
    #[serde(default)]
    pub priority: Option<String>,
}

/// Types of tool actions that can be performed
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum ActionType {
    FileRead {
        path: String,
    },
    FileEdit {
        path: String,
        changes: Vec<FileChange>,
    },
    CommandRun {
        command: String,
        #[serde(default)]
        result: Option<CommandRunResult>,
        #[serde(default)]
        category: CommandCategory,
    },
    Search {
        query: String,
    },
    WebFetch {
        url: String,
    },
    /// Generic tool with optional arguments and result for rich rendering
    Tool {
        tool_name: String,
        #[serde(default)]
        arguments: Option<serde_json::Value>,
        #[serde(default)]
        result: Option<ToolResult>,
    },
    TaskCreate {
        description: String,
        #[serde(default)]
        subagent_type: Option<String>,
        #[serde(default)]
        result: Option<ToolResult>,
    },
    PlanPresentation {
        plan: String,
    },
    TodoManagement {
        todos: Vec<TodoItem>,
        operation: String,
    },
    AskUserQuestion {
        questions: Vec<AskUserQuestionItem>,
    },
    Other {
        description: String,
    },
}

/// A single question in an AskUserQuestion tool call.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AskUserQuestionItem {
    pub question: String,
    pub header: String,
    pub options: Vec<AskUserQuestionOption>,
    #[serde(rename = "multiSelect")]
    pub multi_select: bool,
}

/// An option for an AskUserQuestion question.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AskUserQuestionOption {
    pub label: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum FileChange {
    /// Create a file if it doesn't exist, and overwrite its content.
    Write { content: String },
    /// Delete a file.
    Delete,
    /// Rename a file.
    Rename { new_path: String },
    /// Edit a file with a unified diff.
    Edit {
        /// Unified diff containing file header and hunks.
        unified_diff: String,
        /// Whether line number in the hunks are reliable.
        has_line_numbers: bool,
    },
}
