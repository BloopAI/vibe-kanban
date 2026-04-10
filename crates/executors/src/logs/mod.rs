use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::approvals::ApprovalStatus;

pub mod normalizer;
pub mod plain_text_processor;
pub mod stderr_processor;
pub mod tool_states;
pub mod utils;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum ToolResultValueType {
    Markdown,
    Json,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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
#[ts(export)]
pub enum CommandExitStatus {
    ExitCode { code: i32 },
    Success { success: bool },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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
    /// Authentication or login required
    SetupRequired,
    /// Rate limit exceeded (429, quota, throttling)
    RateLimited,
    /// Network connectivity issues (connection refused, timeout, DNS)
    NetworkError,
    /// Tool execution failed
    ToolExecutionError,
    /// Permission denied (403, unauthorized)
    PermissionDenied,
    /// API or model error (invalid request, model unavailable)
    ApiError,
    /// Generic/unclassified error
    Other,
}

impl NormalizedEntryError {
    /// Classify error message content into appropriate error type
    pub fn classify(content: &str) -> Self {
        let content_lower = content.to_lowercase();

        // Check for setup/auth required patterns
        if content_lower.contains("authentication required")
            || content_lower.contains("auth required")
            || content_lower.contains("please log in")
            || content_lower.contains("login required")
            || content_lower.contains("not authenticated")
            || content_lower.contains("please run")
                && (content_lower.contains("login") || content_lower.contains("auth"))
        {
            return Self::SetupRequired;
        }

        // Check for rate limiting patterns
        if content_lower.contains("rate limit")
            || content_lower.contains("rate-limit")
            || content_lower.contains("ratelimit")
            || content_lower.contains("too many requests")
            || content_lower.contains("quota exceeded")
            || content_lower.contains("throttle")
            || content_lower.contains("429")
            || content_lower.contains("overloaded")
        {
            return Self::RateLimited;
        }

        // Check for network error patterns
        if content_lower.contains("connection refused")
            || content_lower.contains("connection reset")
            || content_lower.contains("connection timed out")
            || content_lower.contains("network error")
            || content_lower.contains("dns resolution")
            || content_lower.contains("could not resolve")
            || content_lower.contains("econnrefused")
            || content_lower.contains("enotfound")
            || content_lower.contains("etimedout")
            || content_lower.contains("socket hang up")
            || content_lower.contains("network is unreachable")
        {
            return Self::NetworkError;
        }

        // Check for permission denied patterns
        if content_lower.contains("permission denied")
            || content_lower.contains("access denied")
            || content_lower.contains("unauthorized")
            || content_lower.contains("forbidden")
            || content_lower.contains("403")
            || content_lower.contains("401") && !content_lower.contains("authentication required")
        {
            return Self::PermissionDenied;
        }

        // Check for tool execution error patterns
        if content_lower.contains("tool execution failed")
            || content_lower.contains("command failed")
            || content_lower.contains("tool error")
            || content_lower.contains("execution error")
            || content_lower.contains("subprocess failed")
        {
            return Self::ToolExecutionError;
        }

        // Check for API error patterns
        if content_lower.contains("api error")
            || content_lower.contains("invalid request")
            || content_lower.contains("bad request")
            || content_lower.contains("model not found")
            || content_lower.contains("model unavailable")
            || content_lower.contains("invalid api key")
            || content_lower.contains("service unavailable")
            || content_lower.contains("500")
            || content_lower.contains("502")
            || content_lower.contains("503")
            || content_lower.contains("504")
        {
            return Self::ApiError;
        }

        Self::Other
    }
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
    /// Marks the start of an execution process (injected by frontend)
    ExecutionStart {
        process_id: String,
        process_name: String,
        started_at: String,
    },
    /// Marks the end of an execution process (injected by frontend)
    ExecutionEnd {
        process_id: String,
        process_name: String,
        started_at: String,
        ended_at: String,
        duration_seconds: u64,
        status: String,
    },
    /// Result message from session completion (Claude Code)
    ResultMessage {
        subtype: String,
        duration_ms: u64,
        num_turns: u64,
        #[serde(skip_serializing_if = "Option::is_none")]
        total_cost_usd: Option<f64>,
        is_error: bool,
    },
    /// Token usage snapshot from the executor (Codex TokenCount event).
    /// Updated in-place after each turn; shows cumulative totals plus context window.
    TokenUsage {
        /// Cumulative input tokens across all turns
        input_tokens: i64,
        /// Cumulative cached input tokens (counts toward context, not re-billed)
        cached_input_tokens: i64,
        /// Cumulative output tokens across all turns
        output_tokens: i64,
        /// Cumulative reasoning tokens (subset of output)
        reasoning_tokens: i64,
        /// Total tokens this turn (last turn only, for per-turn insight)
        last_total_tokens: i64,
        /// Model context window size (tokens), if reported
        #[serde(skip_serializing_if = "Option::is_none")]
        context_window: Option<i64>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct NormalizedEntry {
    pub timestamp: Option<String>,
    pub entry_type: NormalizedEntryType,
    pub content: String,
    #[ts(type = "Record<string, unknown> | null")]
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

/// Source of denial for tool execution
#[derive(Debug, Clone, Serialize, Deserialize, TS, Default, PartialEq)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum DenialSource {
    /// User explicitly denied the tool
    #[default]
    User,
    /// Hook or pre-flight check denied the tool
    Hook,
    /// Permission policy denied the tool
    Policy,
    /// System/executor denied the tool
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Default, PartialEq)]
#[ts(export)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ToolStatus {
    #[default]
    Created,
    Success,
    Failed,
    Denied {
        reason: Option<String>,
        /// Source of the denial
        #[serde(default)]
        source: DenialSource,
    },
    PendingApproval {
        approval_id: String,
        requested_at: DateTime<Utc>,
        timeout_at: DateTime<Utc>,
    },
    TimedOut {
        /// How long the approval was waited for before timing out, in seconds
        #[serde(default)]
        waited_seconds: Option<u64>,
    },
    /// Pending user question for AskUserQuestion tool
    PendingQuestion {
        question_id: String,
        questions: Vec<workspace_utils::approvals::Question>,
        requested_at: DateTime<Utc>,
        timeout_at: DateTime<Utc>,
    },
    /// Question was answered by user - includes their selections
    Answered {
        /// Map of question text -> selected answer(s)
        answers: std::collections::HashMap<String, String>,
    },
}

impl ToolStatus {
    pub fn from_approval_status(status: &ApprovalStatus) -> Option<Self> {
        match status {
            ApprovalStatus::Approved => Some(ToolStatus::Created),
            ApprovalStatus::Denied { reason } => Some(ToolStatus::Denied {
                reason: reason.clone(),
                source: DenialSource::User, // Default to user denial
            }),
            ApprovalStatus::TimedOut => Some(ToolStatus::TimedOut {
                waited_seconds: None,
            }),
            ApprovalStatus::Pending => None, // this should not happen
        }
    }

    /// Create status from approval response, including answers if present
    pub fn from_approval_response(
        status: &ApprovalStatus,
        answers: Option<&std::collections::HashMap<String, String>>,
    ) -> Option<Self> {
        match status {
            ApprovalStatus::Approved => {
                // If answers were provided, use Answered status to preserve them
                if let Some(ans) = answers
                    && !ans.is_empty()
                {
                    return Some(ToolStatus::Answered {
                        answers: ans.clone(),
                    });
                }
                Some(ToolStatus::Created)
            }
            ApprovalStatus::Denied { reason } => Some(ToolStatus::Denied {
                reason: reason.clone(),
                source: DenialSource::User, // Default to user denial
            }),
            ApprovalStatus::TimedOut => Some(ToolStatus::TimedOut {
                waited_seconds: None,
            }),
            ApprovalStatus::Pending => None,
        }
    }

    /// Create a TimedOut status with the waited duration
    pub fn timed_out_with_duration(requested_at: DateTime<Utc>) -> Self {
        let waited = (Utc::now() - requested_at).num_seconds().max(0) as u64;
        ToolStatus::TimedOut {
            waited_seconds: Some(waited),
        }
    }

    /// Create a Denied status with a specific source
    pub fn denied_with_source(reason: Option<String>, source: DenialSource) -> Self {
        ToolStatus::Denied { reason, source }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TodoItem {
    pub content: String,
    pub status: String,
    #[serde(default)]
    pub priority: Option<String>,
}

/// Types of tool actions that can be performed
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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
    },
    PlanPresentation {
        plan: String,
    },
    TodoManagement {
        todos: Vec<TodoItem>,
        operation: String,
    },
    Other {
        description: String,
    },
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_setup_required() {
        // Test various authentication-related error messages
        assert_eq!(
            NormalizedEntryError::classify(
                "Authentication required. Please run 'cursor-agent login' first."
            ),
            NormalizedEntryError::SetupRequired
        );
        assert_eq!(
            NormalizedEntryError::classify("Error: Auth required to continue"),
            NormalizedEntryError::SetupRequired
        );
        assert_eq!(
            NormalizedEntryError::classify("Please log in to your account"),
            NormalizedEntryError::SetupRequired
        );
        assert_eq!(
            NormalizedEntryError::classify("Error: login required before running commands"),
            NormalizedEntryError::SetupRequired
        );
        assert_eq!(
            NormalizedEntryError::classify("User not authenticated"),
            NormalizedEntryError::SetupRequired
        );
    }

    #[test]
    fn test_classify_rate_limited() {
        // Test rate limiting error messages
        assert_eq!(
            NormalizedEntryError::classify("Error: Rate limit exceeded, please try again later"),
            NormalizedEntryError::RateLimited
        );
        assert_eq!(
            NormalizedEntryError::classify("HTTP 429: Too many requests"),
            NormalizedEntryError::RateLimited
        );
        assert_eq!(
            NormalizedEntryError::classify("API quota exceeded for this month"),
            NormalizedEntryError::RateLimited
        );
        assert_eq!(
            NormalizedEntryError::classify("Request throttled, slow down"),
            NormalizedEntryError::RateLimited
        );
        assert_eq!(
            NormalizedEntryError::classify("Model is overloaded, try again"),
            NormalizedEntryError::RateLimited
        );
    }

    #[test]
    fn test_classify_network_error() {
        // Test network-related error messages
        assert_eq!(
            NormalizedEntryError::classify("Error: Connection refused by remote host"),
            NormalizedEntryError::NetworkError
        );
        assert_eq!(
            NormalizedEntryError::classify("Connection timed out after 30s"),
            NormalizedEntryError::NetworkError
        );
        assert_eq!(
            NormalizedEntryError::classify("Network error: could not resolve hostname"),
            NormalizedEntryError::NetworkError
        );
        assert_eq!(
            NormalizedEntryError::classify("ECONNREFUSED: Connection refused"),
            NormalizedEntryError::NetworkError
        );
        assert_eq!(
            NormalizedEntryError::classify("Error: ETIMEDOUT - request timed out"),
            NormalizedEntryError::NetworkError
        );
        assert_eq!(
            NormalizedEntryError::classify("Socket hang up during request"),
            NormalizedEntryError::NetworkError
        );
    }

    #[test]
    fn test_classify_permission_denied() {
        // Test permission/authorization error messages
        assert_eq!(
            NormalizedEntryError::classify("Permission denied: cannot access /etc/passwd"),
            NormalizedEntryError::PermissionDenied
        );
        assert_eq!(
            NormalizedEntryError::classify("Error: Access denied to resource"),
            NormalizedEntryError::PermissionDenied
        );
        assert_eq!(
            NormalizedEntryError::classify("HTTP 403: Forbidden"),
            NormalizedEntryError::PermissionDenied
        );
        assert_eq!(
            NormalizedEntryError::classify("Unauthorized: invalid credentials"),
            NormalizedEntryError::PermissionDenied
        );
    }

    #[test]
    fn test_classify_tool_execution_error() {
        // Test tool/command execution error messages
        assert_eq!(
            NormalizedEntryError::classify("Tool execution failed: npm install returned error"),
            NormalizedEntryError::ToolExecutionError
        );
        assert_eq!(
            NormalizedEntryError::classify("Command failed with exit code 1"),
            NormalizedEntryError::ToolExecutionError
        );
        assert_eq!(
            NormalizedEntryError::classify("Tool error: unable to parse response"),
            NormalizedEntryError::ToolExecutionError
        );
        assert_eq!(
            NormalizedEntryError::classify("Subprocess failed with signal SIGKILL"),
            NormalizedEntryError::ToolExecutionError
        );
    }

    #[test]
    fn test_classify_api_error() {
        // Test API-related error messages
        assert_eq!(
            NormalizedEntryError::classify("API error: invalid request format"),
            NormalizedEntryError::ApiError
        );
        assert_eq!(
            NormalizedEntryError::classify("Error: Bad request - missing required field"),
            NormalizedEntryError::ApiError
        );
        assert_eq!(
            NormalizedEntryError::classify("Model not found: gpt-5-ultra"),
            NormalizedEntryError::ApiError
        );
        assert_eq!(
            NormalizedEntryError::classify("Error: Invalid API key provided"),
            NormalizedEntryError::ApiError
        );
        assert_eq!(
            NormalizedEntryError::classify("HTTP 500: Internal server error"),
            NormalizedEntryError::ApiError
        );
        assert_eq!(
            NormalizedEntryError::classify("HTTP 503: Service unavailable"),
            NormalizedEntryError::ApiError
        );
    }

    #[test]
    fn test_classify_other() {
        // Test that unrecognized errors fall back to Other
        assert_eq!(
            NormalizedEntryError::classify("Some random error message"),
            NormalizedEntryError::Other
        );
        assert_eq!(
            NormalizedEntryError::classify("Warning: deprecated function used"),
            NormalizedEntryError::Other
        );
        assert_eq!(
            NormalizedEntryError::classify("Info: processing complete"),
            NormalizedEntryError::Other
        );
    }

    #[test]
    fn test_classify_case_insensitive() {
        // Verify case-insensitive matching
        assert_eq!(
            NormalizedEntryError::classify("AUTHENTICATION REQUIRED"),
            NormalizedEntryError::SetupRequired
        );
        assert_eq!(
            NormalizedEntryError::classify("RATE LIMIT EXCEEDED"),
            NormalizedEntryError::RateLimited
        );
        assert_eq!(
            NormalizedEntryError::classify("CONNECTION REFUSED"),
            NormalizedEntryError::NetworkError
        );
    }

    #[test]
    fn test_denial_source_default() {
        // Test that DenialSource defaults to User
        let source = DenialSource::default();
        assert_eq!(source, DenialSource::User);
    }

    #[test]
    fn test_denial_source_serialization() {
        // Test serialization of DenialSource variants
        assert_eq!(
            serde_json::to_string(&DenialSource::User).unwrap(),
            "\"user\""
        );
        assert_eq!(
            serde_json::to_string(&DenialSource::Hook).unwrap(),
            "\"hook\""
        );
        assert_eq!(
            serde_json::to_string(&DenialSource::Policy).unwrap(),
            "\"policy\""
        );
        assert_eq!(
            serde_json::to_string(&DenialSource::System).unwrap(),
            "\"system\""
        );
    }

    #[test]
    fn test_tool_status_denied_with_source() {
        // Test denied_with_source helper method
        let status =
            ToolStatus::denied_with_source(Some("User said no".to_string()), DenialSource::User);
        match status {
            ToolStatus::Denied { reason, source } => {
                assert_eq!(reason, Some("User said no".to_string()));
                assert_eq!(source, DenialSource::User);
            }
            _ => panic!("Expected Denied status"),
        }

        // Test with Hook source
        let status = ToolStatus::denied_with_source(None, DenialSource::Hook);
        match status {
            ToolStatus::Denied { reason, source } => {
                assert_eq!(reason, None);
                assert_eq!(source, DenialSource::Hook);
            }
            _ => panic!("Expected Denied status"),
        }
    }

    #[test]
    fn test_tool_status_timed_out_with_duration() {
        // Test timed_out_with_duration helper method
        // Use a time 30 seconds in the past
        let requested_at = chrono::Utc::now() - chrono::Duration::seconds(30);
        let status = ToolStatus::timed_out_with_duration(requested_at);
        match status {
            ToolStatus::TimedOut { waited_seconds } => {
                // Should be approximately 30 seconds (allow for small timing variance)
                assert!(waited_seconds.is_some());
                let seconds = waited_seconds.unwrap();
                assert!(
                    (29..=31).contains(&seconds),
                    "Expected ~30 seconds, got {}",
                    seconds
                );
            }
            _ => panic!("Expected TimedOut status"),
        }
    }

    #[test]
    fn test_tool_status_from_approval_status_includes_source() {
        use workspace_utils::approvals::ApprovalStatus;

        // Test that from_approval_status creates Denied with User source
        let status = ToolStatus::from_approval_status(&ApprovalStatus::Denied {
            reason: Some("Rejected".to_string()),
        });
        match status {
            Some(ToolStatus::Denied { reason, source }) => {
                assert_eq!(reason, Some("Rejected".to_string()));
                assert_eq!(source, DenialSource::User);
            }
            _ => panic!("Expected Denied status"),
        }
    }

    #[test]
    fn test_tool_status_timed_out_serialization() {
        // Test serialization of TimedOut with waited_seconds
        let status = ToolStatus::TimedOut {
            waited_seconds: Some(45),
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"timed_out\""));
        assert!(json.contains("\"waited_seconds\":45"));

        // Test with None
        let status = ToolStatus::TimedOut {
            waited_seconds: None,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"timed_out\""));
        assert!(json.contains("\"waited_seconds\":null"));
    }

    #[test]
    fn test_tool_status_denied_serialization() {
        // Test serialization of Denied with source
        let status = ToolStatus::Denied {
            reason: Some("Not allowed".to_string()),
            source: DenialSource::Policy,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"denied\""));
        assert!(json.contains("\"source\":\"policy\""));
        assert!(json.contains("\"reason\":\"Not allowed\""));
    }
}
