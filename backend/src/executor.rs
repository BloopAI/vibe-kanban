use std::str::FromStr;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use ts_rs::TS;
use uuid::Uuid;

use crate::executors::{
    AmpExecutor, CharmOpencodeExecutor, ClaudeExecutor, EchoExecutor, GeminiExecutor,
    SetupScriptExecutor,
};

// Constants for database streaming
const STDOUT_UPDATE_THRESHOLD: usize = 1;
const BUFFER_SIZE_THRESHOLD: usize = 1024;

/// Normalized conversation representation for different executor formats
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct NormalizedConversation {
    pub entries: Vec<NormalizedEntry>,
    pub session_id: Option<String>,
    pub executor_type: String,
    pub prompt: Option<String>,
    pub summary: Option<String>,
}

/// Individual entry in a normalized conversation
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct NormalizedEntry {
    pub timestamp: Option<String>,
    pub entry_type: NormalizedEntryType,
    pub content: String,
    #[ts(skip)]
    pub metadata: Option<serde_json::Value>,
}

/// Types of entries in a normalized conversation
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum NormalizedEntryType {
    UserMessage,
    AssistantMessage,
    ToolUse {
        tool_name: String,
        action_type: ActionType,
    },
    SystemMessage,
    ErrorMessage,
    Thinking,
}

/// Types of tool actions that can be performed
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "action", rename_all = "snake_case")]
#[ts(export)]
pub enum ActionType {
    FileRead { path: String },
    FileWrite { path: String },
    CommandRun { command: String },
    Search { query: String },
    WebFetch { url: String },
    TaskCreate { description: String },
    Other { description: String },
}

/// Context information for spawn failures to provide comprehensive error details
#[derive(Debug, Clone)]
pub struct SpawnContext {
    /// The type of executor that failed (e.g., "Claude", "Amp", "Echo")
    pub executor_type: String,
    /// The command that failed to spawn
    pub command: String,
    /// Command line arguments
    pub args: Vec<String>,
    /// Working directory where the command was executed
    pub working_dir: String,
    /// Task ID if available
    pub task_id: Option<Uuid>,
    /// Task title for user-friendly context
    pub task_title: Option<String>,
    /// Additional executor-specific context
    pub additional_context: Option<String>,
}

impl SpawnContext {
    /// Set the executor type (required field not available in Command)
    pub fn with_executor_type(mut self, executor_type: impl Into<String>) -> Self {
        self.executor_type = executor_type.into();
        self
    }

    /// Add task context (optional, not available in Command)
    pub fn with_task(mut self, task_id: Uuid, task_title: Option<String>) -> Self {
        self.task_id = Some(task_id);
        self.task_title = task_title;
        self
    }

    /// Add additional context information (optional, not available in Command)
    pub fn with_context(mut self, context: impl Into<String>) -> Self {
        self.additional_context = Some(context.into());
        self
    }
}

/// Extract SpawnContext from a tokio::process::Command
/// This automatically captures all available information from the Command object
impl From<&tokio::process::Command> for SpawnContext {
    fn from(command: &tokio::process::Command) -> Self {
        let program = command.as_std().get_program().to_string_lossy().to_string();
        let args = command
            .as_std()
            .get_args()
            .map(|s| s.to_string_lossy().to_string())
            .collect();

        let working_dir = command
            .as_std()
            .get_current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "current_dir".to_string());

        Self {
            executor_type: "Unknown".to_string(), // Must be set using with_executor_type()
            command: program,
            args,
            working_dir,
            task_id: None,
            task_title: None,
            additional_context: None,
        }
    }
}

#[derive(Debug)]
pub enum ExecutorError {
    SpawnFailed {
        error: std::io::Error,
        context: SpawnContext,
    },
    TaskNotFound,
    DatabaseError(sqlx::Error),
    ContextCollectionFailed(String),
    GitError(String),
}

impl std::fmt::Display for ExecutorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExecutorError::SpawnFailed { error, context } => {
                write!(f, "Failed to spawn {} process", context.executor_type)?;

                // Add task context if available
                if let Some(ref title) = context.task_title {
                    write!(f, " for task '{}'", title)?;
                } else if let Some(task_id) = context.task_id {
                    write!(f, " for task {}", task_id)?;
                }

                // Add command details
                write!(f, ": command '{}' ", context.command)?;
                if !context.args.is_empty() {
                    write!(f, "with args [{}] ", context.args.join(", "))?;
                }

                // Add working directory
                write!(f, "in directory '{}' ", context.working_dir)?;

                // Add additional context if provided
                if let Some(ref additional) = context.additional_context {
                    write!(f, "({}) ", additional)?;
                }

                // Finally, add the underlying error
                write!(f, "- {}", error)
            }
            ExecutorError::TaskNotFound => write!(f, "Task not found"),
            ExecutorError::DatabaseError(e) => write!(f, "Database error: {}", e),
            ExecutorError::ContextCollectionFailed(msg) => {
                write!(f, "Context collection failed: {}", msg)
            }
            ExecutorError::GitError(msg) => write!(f, "Git operation error: {}", msg),
        }
    }
}

impl std::error::Error for ExecutorError {}

impl From<sqlx::Error> for ExecutorError {
    fn from(err: sqlx::Error) -> Self {
        ExecutorError::DatabaseError(err)
    }
}

impl From<crate::models::task_attempt::TaskAttemptError> for ExecutorError {
    fn from(err: crate::models::task_attempt::TaskAttemptError) -> Self {
        match err {
            crate::models::task_attempt::TaskAttemptError::Database(e) => {
                ExecutorError::DatabaseError(e)
            }
            crate::models::task_attempt::TaskAttemptError::Git(e) => {
                ExecutorError::GitError(format!("Git operation failed: {}", e))
            }
            crate::models::task_attempt::TaskAttemptError::TaskNotFound => {
                ExecutorError::TaskNotFound
            }
            crate::models::task_attempt::TaskAttemptError::ProjectNotFound => {
                ExecutorError::ContextCollectionFailed("Project not found".to_string())
            }
            crate::models::task_attempt::TaskAttemptError::ValidationError(msg) => {
                ExecutorError::ContextCollectionFailed(format!("Validation failed: {}", msg))
            }
            crate::models::task_attempt::TaskAttemptError::BranchNotFound(branch) => {
                ExecutorError::GitError(format!("Branch '{}' not found", branch))
            }
            crate::models::task_attempt::TaskAttemptError::GitService(e) => {
                ExecutorError::GitError(format!("Git service error: {}", e))
            }
            crate::models::task_attempt::TaskAttemptError::GitHubService(e) => {
                ExecutorError::GitError(format!("GitHub service error: {}", e))
            }
        }
    }
}

impl ExecutorError {
    /// Create a new SpawnFailed error with context
    pub fn spawn_failed(error: std::io::Error, context: SpawnContext) -> Self {
        ExecutorError::SpawnFailed { error, context }
    }
}

/// Helper to create SpawnContext from Command with builder pattern
impl SpawnContext {
    /// Create SpawnContext from Command, then use builder methods for additional context
    pub fn from_command(
        command: &tokio::process::Command,
        executor_type: impl Into<String>,
    ) -> Self {
        Self::from(command).with_executor_type(executor_type)
    }

    /// Finalize the context and create an ExecutorError
    pub fn spawn_error(self, error: std::io::Error) -> ExecutorError {
        ExecutorError::spawn_failed(error, self)
    }
}

/// Trait for defining CLI commands that can be executed for task attempts
#[async_trait]
pub trait Executor: Send + Sync {
    /// Spawn the command for a given task attempt
    async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        worktree_path: &str,
    ) -> Result<command_group::AsyncGroupChild, ExecutorError>;

    /// Normalize executor logs into a standard format
    fn normalize_logs(
        &self,
        _logs: &str,
        _worktree_path: &str,
    ) -> Result<NormalizedConversation, String> {
        // Default implementation returns empty conversation
        Ok(NormalizedConversation {
            entries: vec![],
            session_id: None,
            executor_type: "unknown".to_string(),
            prompt: None,
            summary: None,
        })
    }

    /// Execute the command and stream output to database in real-time
    async fn execute_streaming(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        attempt_id: Uuid,
        execution_process_id: Uuid,
        worktree_path: &str,
    ) -> Result<command_group::AsyncGroupChild, ExecutorError> {
        let mut child = self.spawn(pool, task_id, worktree_path).await?;

        // Take stdout and stderr pipes for streaming
        let stdout = child
            .inner()
            .stdout
            .take()
            .expect("Failed to take stdout from child process");
        let stderr = child
            .inner()
            .stderr
            .take()
            .expect("Failed to take stderr from child process");

        // Start streaming tasks
        let pool_clone1 = pool.clone();
        let pool_clone2 = pool.clone();

        tokio::spawn(stream_output_to_db(
            stdout,
            pool_clone1,
            attempt_id,
            execution_process_id,
            true,
        ));
        tokio::spawn(stream_output_to_db(
            stderr,
            pool_clone2,
            attempt_id,
            execution_process_id,
            false,
        ));

        Ok(child)
    }
}

/// Runtime executor types for internal use
#[derive(Debug, Clone)]
pub enum ExecutorType {
    SetupScript(String),
    DevServer(String),
    CodingAgent(ExecutorConfig),
    FollowUpCodingAgent {
        config: ExecutorConfig,
        session_id: Option<String>,
        prompt: String,
    },
}

/// Configuration for different executor types
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "lowercase")]
#[ts(export)]
pub enum ExecutorConfig {
    Echo,
    Claude,
    Amp,
    Gemini,
    SetupScript { script: String },
    CharmOpencode,
    // Future executors can be added here
    // Shell { command: String },
    // Docker { image: String, command: String },
}

// Constants for frontend
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExecutorConstants {
    pub executor_types: Vec<ExecutorConfig>,
    pub executor_labels: Vec<String>,
}

impl FromStr for ExecutorConfig {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "echo" => Ok(ExecutorConfig::Echo),
            "claude" => Ok(ExecutorConfig::Claude),
            "amp" => Ok(ExecutorConfig::Amp),
            "gemini" => Ok(ExecutorConfig::Gemini),
            "charmopencode" => Ok(ExecutorConfig::CharmOpencode),
            "setup_script" => Ok(ExecutorConfig::SetupScript {
                script: "setup script".to_string(),
            }),
            _ => Err(format!("Unknown executor type: {}", s)),
        }
    }
}

impl ExecutorConfig {
    pub fn create_executor(&self) -> Box<dyn Executor> {
        match self {
            ExecutorConfig::Echo => Box::new(EchoExecutor),
            ExecutorConfig::Claude => Box::new(ClaudeExecutor),
            ExecutorConfig::Amp => Box::new(AmpExecutor),
            ExecutorConfig::Gemini => Box::new(GeminiExecutor),
            ExecutorConfig::CharmOpencode => Box::new(CharmOpencodeExecutor),
            ExecutorConfig::SetupScript { script } => {
                Box::new(SetupScriptExecutor::new(script.clone()))
            }
        }
    }

    pub fn config_path(&self) -> Option<std::path::PathBuf> {
        match self {
            ExecutorConfig::Echo => None,
            ExecutorConfig::CharmOpencode => {
                dirs::home_dir().map(|home| home.join(".opencode.json"))
            }
            ExecutorConfig::Claude => dirs::home_dir().map(|home| home.join(".claude.json")),
            ExecutorConfig::Amp => {
                dirs::config_dir().map(|config| config.join("amp").join("settings.json"))
            }
            ExecutorConfig::Gemini => {
                dirs::home_dir().map(|home| home.join(".gemini").join("settings.json"))
            }
            ExecutorConfig::SetupScript { .. } => None,
        }
    }

    /// Get the JSON attribute path for MCP servers in the config file
    pub fn mcp_attribute_path(&self) -> Option<Vec<&'static str>> {
        match self {
            ExecutorConfig::Echo => None, // Echo doesn't support MCP
            ExecutorConfig::CharmOpencode => Some(vec!["mcpServers"]),
            ExecutorConfig::Claude => Some(vec!["mcpServers"]),
            ExecutorConfig::Amp => Some(vec!["amp", "mcpServers"]), // Nested path for Amp
            ExecutorConfig::Gemini => Some(vec!["mcpServers"]),
            ExecutorConfig::SetupScript { .. } => None, // Setup scripts don't support MCP
        }
    }

    /// Check if this executor supports MCP configuration
    pub fn supports_mcp(&self) -> bool {
        !matches!(
            self,
            ExecutorConfig::Echo | ExecutorConfig::SetupScript { .. }
        )
    }

    /// Get the display name for this executor
    pub fn display_name(&self) -> &'static str {
        match self {
            ExecutorConfig::Echo => "Echo (Test Mode)",
            ExecutorConfig::CharmOpencode => "Charm Opencode",
            ExecutorConfig::Claude => "Claude",
            ExecutorConfig::Amp => "Amp",
            ExecutorConfig::Gemini => "Gemini",
            ExecutorConfig::SetupScript { .. } => "Setup Script",
        }
    }
}

impl std::fmt::Display for ExecutorConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            ExecutorConfig::Echo => "echo",
            ExecutorConfig::Claude => "claude",
            ExecutorConfig::Amp => "amp",
            ExecutorConfig::Gemini => "gemini",
            ExecutorConfig::CharmOpencode => "charmopencode",
            ExecutorConfig::SetupScript { .. } => "setup_script",
        };
        write!(f, "{}", s)
    }
}

/// Stream output from a child process to the database
pub async fn stream_output_to_db(
    output: impl tokio::io::AsyncRead + Unpin,
    pool: sqlx::SqlitePool,
    attempt_id: Uuid,
    execution_process_id: Uuid,
    is_stdout: bool,
) {
    if is_stdout {
        stream_stdout_to_db(output, pool, attempt_id, execution_process_id).await;
    } else {
        stream_stderr_to_db(output, pool, attempt_id, execution_process_id).await;
    }
}

/// Stream stdout from a child process to the database (immediate updates)
async fn stream_stdout_to_db(
    output: impl tokio::io::AsyncRead + Unpin,
    pool: sqlx::SqlitePool,
    attempt_id: Uuid,
    execution_process_id: Uuid,
) {
    use crate::models::{execution_process::ExecutionProcess, executor_session::ExecutorSession};

    let mut reader = BufReader::new(output);
    let mut line = String::new();
    let mut accumulated_output = String::new();
    let mut update_counter = 0;
    let mut session_id_parsed = false;

    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => break, // EOF
            Ok(_) => {
                // Parse session ID from the first JSONL line
                if !session_id_parsed {
                    if let Some(external_session_id) = parse_session_id_from_line(&line) {
                        if let Err(e) = ExecutorSession::update_session_id(
                            &pool,
                            execution_process_id,
                            &external_session_id,
                        )
                        .await
                        {
                            tracing::error!(
                                "Failed to update session ID for execution process {}: {}",
                                execution_process_id,
                                e
                            );
                        } else {
                            tracing::info!(
                                "Updated session ID {} for execution process {}",
                                external_session_id,
                                execution_process_id
                            );
                        }
                        session_id_parsed = true;
                    }
                }

                accumulated_output.push_str(&line);
                update_counter += 1;

                // Update database every threshold lines or when we have a significant amount of data
                if update_counter >= STDOUT_UPDATE_THRESHOLD
                    || accumulated_output.len() > BUFFER_SIZE_THRESHOLD
                {
                    if let Err(e) = ExecutionProcess::append_output(
                        &pool,
                        execution_process_id,
                        Some(&accumulated_output),
                        None,
                    )
                    .await
                    {
                        tracing::error!(
                            "Failed to update stdout for attempt {}: {}",
                            attempt_id,
                            e
                        );
                    }
                    accumulated_output.clear();
                    update_counter = 0;
                }
            }
            Err(e) => {
                tracing::error!("Error reading stdout for attempt {}: {}", attempt_id, e);
                break;
            }
        }
    }

    // Flush any remaining output
    if !accumulated_output.is_empty() {
        if let Err(e) = ExecutionProcess::append_output(
            &pool,
            execution_process_id,
            Some(&accumulated_output),
            None,
        )
        .await
        {
            tracing::error!("Failed to flush stdout for attempt {}: {}", attempt_id, e);
        }
    }
}

/// Stream stderr from a child process to the database (buffered with timeout)
async fn stream_stderr_to_db(
    output: impl tokio::io::AsyncRead + Unpin,
    pool: sqlx::SqlitePool,
    attempt_id: Uuid,
    execution_process_id: Uuid,
) {
    use tokio::time::{timeout, Duration};

    let mut reader = BufReader::new(output);
    let mut line = String::new();
    let mut accumulated_output = String::new();
    const STDERR_FLUSH_TIMEOUT_MS: u64 = 1000;
    const STDERR_FLUSH_TIMEOUT: Duration = Duration::from_millis(STDERR_FLUSH_TIMEOUT_MS); // 1000ms timeout

    loop {
        line.clear();

        // Try to read a line with a timeout
        let read_result = timeout(STDERR_FLUSH_TIMEOUT, reader.read_line(&mut line)).await;

        match read_result {
            Ok(Ok(0)) => {
                // EOF - flush remaining output and break
                break;
            }
            Ok(Ok(_)) => {
                // Successfully read a line - just accumulate it
                accumulated_output.push_str(&line);
            }
            Ok(Err(e)) => {
                tracing::error!("Error reading stderr for attempt {}: {}", attempt_id, e);
                break;
            }
            Err(_) => {
                // Timeout occurred - flush accumulated output if any
                if !accumulated_output.is_empty() {
                    flush_stderr_chunk(
                        &pool,
                        execution_process_id,
                        &accumulated_output,
                        attempt_id,
                    )
                    .await;
                    accumulated_output.clear();
                }
            }
        }
    }

    // Final flush for any remaining output
    if !accumulated_output.is_empty() {
        flush_stderr_chunk(&pool, execution_process_id, &accumulated_output, attempt_id).await;
    }
}

/// Flush a chunk of stderr output to the database
async fn flush_stderr_chunk(
    pool: &sqlx::SqlitePool,
    execution_process_id: Uuid,
    content: &str,
    attempt_id: Uuid,
) {
    use crate::models::execution_process::ExecutionProcess;

    let trimmed = content.trim();
    if trimmed.is_empty() {
        return;
    }

    // Add a delimiter to separate chunks in the database
    let chunk_with_delimiter = format!("{}\n---STDERR_CHUNK_BOUNDARY---\n", trimmed);

    if let Err(e) = ExecutionProcess::append_output(
        pool,
        execution_process_id,
        None,
        Some(&chunk_with_delimiter),
    )
    .await
    {
        tracing::error!(
            "Failed to flush stderr chunk for attempt {}: {}",
            attempt_id,
            e
        );
    } else {
        tracing::debug!(
            "Flushed stderr chunk ({} chars) for process {}",
            trimmed.len(),
            execution_process_id
        );
    }
}

/// Parse assistant message from executor logs (JSONL format)
pub fn parse_assistant_message_from_logs(logs: &str) -> Option<String> {
    use serde_json::Value;

    let mut last_assistant_message = None;

    for line in logs.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Try to parse as JSON
        if let Ok(json) = serde_json::from_str::<Value>(trimmed) {
            // Check for Claude format: {"type":"assistant","message":{"content":[...]}}
            if let Some(msg_type) = json.get("type").and_then(|t| t.as_str()) {
                if msg_type == "assistant" {
                    if let Some(message) = json.get("message") {
                        if let Some(content) = message.get("content").and_then(|c| c.as_array()) {
                            // Extract text content from Claude assistant message
                            let mut text_parts = Vec::new();
                            for content_item in content {
                                if let Some(content_type) =
                                    content_item.get("type").and_then(|t| t.as_str())
                                {
                                    if content_type == "text" {
                                        if let Some(text) =
                                            content_item.get("text").and_then(|t| t.as_str())
                                        {
                                            text_parts.push(text);
                                        }
                                    }
                                }
                            }
                            if !text_parts.is_empty() {
                                last_assistant_message = Some(text_parts.join("\n"));
                            }
                        }
                    }
                    continue;
                }
            }

            // Check for AMP format: {"type":"messages","messages":[[1,{"role":"assistant",...}]]}
            if let Some(messages) = json.get("messages").and_then(|m| m.as_array()) {
                for message_entry in messages {
                    if let Some(message_data) = message_entry.as_array().and_then(|arr| arr.get(1))
                    {
                        if let Some(role) = message_data.get("role").and_then(|r| r.as_str()) {
                            if role == "assistant" {
                                if let Some(content) =
                                    message_data.get("content").and_then(|c| c.as_array())
                                {
                                    // Extract text content from AMP assistant message
                                    let mut text_parts = Vec::new();
                                    for content_item in content {
                                        if let Some(content_type) =
                                            content_item.get("type").and_then(|t| t.as_str())
                                        {
                                            if content_type == "text" {
                                                if let Some(text) = content_item
                                                    .get("text")
                                                    .and_then(|t| t.as_str())
                                                {
                                                    text_parts.push(text);
                                                }
                                            }
                                        }
                                    }
                                    if !text_parts.is_empty() {
                                        last_assistant_message = Some(text_parts.join("\n"));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    last_assistant_message
}

/// Parse session_id from Claude or thread_id from Amp from the first JSONL line
fn parse_session_id_from_line(line: &str) -> Option<String> {
    use serde_json::Value;

    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Try to parse as JSON
    if let Ok(json) = serde_json::from_str::<Value>(trimmed) {
        // Check for Claude session_id
        if let Some(session_id) = json.get("session_id").and_then(|v| v.as_str()) {
            return Some(session_id.to_string());
        }

        // Check for Amp threadID
        if let Some(thread_id) = json.get("threadID").and_then(|v| v.as_str()) {
            return Some(thread_id.to_string());
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::executors::{AmpExecutor, ClaudeExecutor};

    #[test]
    fn test_parse_claude_session_id() {
        let claude_line = r#"{"type":"system","subtype":"init","cwd":"/private/tmp/mission-control-worktree-3abb979d-2e0e-4404-a276-c16d98a97dd5","session_id":"cc0889a2-0c59-43cc-926b-739a983888a2","tools":["Task","Bash","Glob","Grep","LS","exit_plan_mode","Read","Edit","MultiEdit","Write","NotebookRead","NotebookEdit","WebFetch","TodoRead","TodoWrite","WebSearch"],"mcp_servers":[],"model":"claude-sonnet-4-20250514","permissionMode":"bypassPermissions","apiKeySource":"/login managed key"}"#;

        assert_eq!(
            parse_session_id_from_line(claude_line),
            Some("cc0889a2-0c59-43cc-926b-739a983888a2".to_string())
        );
    }

    #[test]
    fn test_parse_amp_thread_id() {
        let amp_line = r#"{"type":"initial","threadID":"T-286f908a-2cd8-40cc-9490-da689b2f1560"}"#;

        assert_eq!(
            parse_session_id_from_line(amp_line),
            Some("T-286f908a-2cd8-40cc-9490-da689b2f1560".to_string())
        );
    }

    #[test]
    fn test_parse_invalid_json() {
        let invalid_line = "not json at all";
        assert_eq!(parse_session_id_from_line(invalid_line), None);
    }

    #[test]
    fn test_parse_json_without_ids() {
        let other_json = r#"{"type":"other","message":"hello"}"#;
        assert_eq!(parse_session_id_from_line(other_json), None);
    }

    #[test]
    fn test_parse_empty_line() {
        assert_eq!(parse_session_id_from_line(""), None);
        assert_eq!(parse_session_id_from_line("   "), None);
    }

    #[test]
    fn test_parse_assistant_message_from_logs() {
        // Test AMP format
        let amp_logs = r#"{"type":"initial","threadID":"T-e7af5516-e5a5-4754-8e34-810dc658716e"}
{"type":"messages","messages":[[0,{"role":"user","content":[{"type":"text","text":"Task title: Test task"}],"meta":{"sentAt":1751385490573}}]],"toolResults":[]}
{"type":"messages","messages":[[1,{"role":"assistant","content":[{"type":"thinking","thinking":"Testing"},{"type":"text","text":"The Pythagorean theorem states that in a right triangle, the square of the hypotenuse equals the sum of squares of the other two sides: **a² + b² = c²**."}],"state":{"type":"complete","stopReason":"end_turn"}}]],"toolResults":[]}
{"type":"state","state":"idle"}
{"type":"shutdown"}"#;

        let result = parse_assistant_message_from_logs(amp_logs);
        assert!(result.is_some());
        assert!(result.as_ref().unwrap().contains("Pythagorean theorem"));
        assert!(result.as_ref().unwrap().contains("a² + b² = c²"));
    }

    #[test]
    fn test_parse_claude_assistant_message_from_logs() {
        // Test Claude format
        let claude_logs = r#"{"type":"system","subtype":"init","cwd":"/private/tmp","session_id":"e988eeea-3712-46a1-82d4-84fbfaa69114","tools":[],"model":"claude-sonnet-4-20250514"}
{"type":"assistant","message":{"id":"msg_123","type":"message","role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"text","text":"I'll explain the Pythagorean theorem for you.\n\nThe Pythagorean theorem states that in a right triangle, the square of the hypotenuse equals the sum of the squares of the other two sides.\n\n**Formula:** a² + b² = c²"}],"stop_reason":null},"session_id":"e988eeea-3712-46a1-82d4-84fbfaa69114"}
{"type":"result","subtype":"success","is_error":false,"duration_ms":6059,"result":"Final result"}"#;

        let result = parse_assistant_message_from_logs(claude_logs);
        assert!(result.is_some());
        assert!(result.as_ref().unwrap().contains("Pythagorean theorem"));
        assert!(result
            .as_ref()
            .unwrap()
            .contains("**Formula:** a² + b² = c²"));
    }

    #[test]
    fn test_amp_log_normalization() {
        let amp_executor = AmpExecutor;
        let amp_logs = r#"{"type":"initial","threadID":"T-f8f7fec0-b330-47ab-b63a-b72c42f1ef6a"}
{"type":"messages","messages":[[0,{"role":"user","content":[{"type":"text","text":"Task title: Create and start should open task\nTask description: When I press 'create & start' on task creation dialog it should then open the task in the sidebar"}],"meta":{"sentAt":1751544747623}}]],"toolResults":[]}
{"type":"messages","messages":[[1,{"role":"assistant","content":[{"type":"thinking","thinking":"The user wants to implement a feature where pressing \"create & start\" on the task creation dialog should open the task in the sidebar."},{"type":"text","text":"I'll help you implement the \"create & start\" functionality. Let me explore the codebase to understand the current task creation and sidebar structure."},{"type":"tool_use","id":"toolu_01FQqskzGAhZaZu8H6qSs5pV","name":"todo_write","input":{"todos":[{"id":"1","content":"Explore task creation dialog component","status":"todo","priority":"high"}]}}],"state":{"type":"complete","stopReason":"tool_use"}}]],"toolResults":[]}"#;

        let result = amp_executor
            .normalize_logs(amp_logs, "/tmp/test-worktree")
            .unwrap();

        assert_eq!(result.executor_type, "amp");
        assert_eq!(
            result.session_id,
            Some("T-f8f7fec0-b330-47ab-b63a-b72c42f1ef6a".to_string())
        );
        assert!(!result.entries.is_empty());

        // Check that we have user message, assistant message, thinking, and tool use entries
        let user_messages: Vec<_> = result
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::UserMessage))
            .collect();
        assert!(!user_messages.is_empty());

        let assistant_messages: Vec<_> = result
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::AssistantMessage))
            .collect();
        assert!(!assistant_messages.is_empty());

        let thinking_entries: Vec<_> = result
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::Thinking))
            .collect();
        assert!(!thinking_entries.is_empty());

        let tool_uses: Vec<_> = result
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::ToolUse { .. }))
            .collect();
        assert!(!tool_uses.is_empty());

        // Check that tool use content is concise (not the old verbose format)
        let todo_tool_use = tool_uses.iter().find(|e| match &e.entry_type {
            NormalizedEntryType::ToolUse { tool_name, .. } => tool_name == "todo_write",
            _ => false,
        });
        assert!(todo_tool_use.is_some());
        let todo_tool_use = todo_tool_use.unwrap();
        // Should be concise, not "Tool: todo_write with input: ..."
        assert_eq!(
            todo_tool_use.content,
            "TODO List:\n⏳ Explore task creation dialog component (high)"
        );
    }

    #[test]
    fn test_claude_log_normalization() {
        let claude_executor = ClaudeExecutor;
        let claude_logs = r#"{"type":"system","subtype":"init","cwd":"/private/tmp/mission-control-worktree-8ff34214-7bb4-4a5a-9f47-bfdf79e20368","session_id":"499dcce4-04aa-4a3e-9e0c-ea0228fa87c9","tools":["Task","Bash","Glob","Grep","LS","exit_plan_mode","Read","Edit","MultiEdit","Write","NotebookRead","NotebookEdit","WebFetch","TodoRead","TodoWrite","WebSearch"],"mcp_servers":[],"model":"claude-sonnet-4-20250514","permissionMode":"bypassPermissions","apiKeySource":"none"}
{"type":"assistant","message":{"id":"msg_014xUHgkAhs6cRx5WVT3s7if","type":"message","role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"text","text":"I'll help you list your projects using vibe-kanban. Let me first explore the codebase to understand how vibe-kanban works and find your projects."}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":4,"cache_creation_input_tokens":13497,"cache_read_input_tokens":0,"output_tokens":1,"service_tier":"standard"}},"parent_tool_use_id":null,"session_id":"499dcce4-04aa-4a3e-9e0c-ea0228fa87c9"}
{"type":"assistant","message":{"id":"msg_014xUHgkAhs6cRx5WVT3s7if","type":"message","role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"tool_use","id":"toolu_01Br3TvXdmW6RPGpB5NihTHh","name":"Task","input":{"description":"Find vibe-kanban projects","prompt":"I need to find and list projects using vibe-kanban."}}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":4,"cache_creation_input_tokens":13497,"cache_read_input_tokens":0,"output_tokens":1,"service_tier":"standard"}},"parent_tool_use_id":null,"session_id":"499dcce4-04aa-4a3e-9e0c-ea0228fa87c9"}"#;

        let result = claude_executor
            .normalize_logs(claude_logs, "/tmp/test-worktree")
            .unwrap();

        assert_eq!(result.executor_type, "claude");
        assert_eq!(
            result.session_id,
            Some("499dcce4-04aa-4a3e-9e0c-ea0228fa87c9".to_string())
        );
        assert!(!result.entries.is_empty());

        // Check that we have system, assistant message, and tool use entries
        let system_messages: Vec<_> = result
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::SystemMessage))
            .collect();
        assert!(!system_messages.is_empty());

        let assistant_messages: Vec<_> = result
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::AssistantMessage))
            .collect();
        assert!(!assistant_messages.is_empty());

        let tool_uses: Vec<_> = result
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::ToolUse { .. }))
            .collect();
        assert!(!tool_uses.is_empty());

        // Check that tool use content is concise (not the old verbose format)
        let task_tool_use = tool_uses.iter().find(|e| match &e.entry_type {
            NormalizedEntryType::ToolUse { tool_name, .. } => tool_name == "Task",
            _ => false,
        });
        assert!(task_tool_use.is_some());
        let task_tool_use = task_tool_use.unwrap();
        // Should be the task description, not "Tool: Task with input: ..."
        assert_eq!(task_tool_use.content, "Find vibe-kanban projects");
    }
}
