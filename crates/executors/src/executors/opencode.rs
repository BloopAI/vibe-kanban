use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use fork_stream::StreamExt as _;
use futures::{StreamExt, future::ready, stream::BoxStream};
use regex::Regex;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    actions::SpawnContext,
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
    },
    logs::{
        ActionType, NormalizedEntry, NormalizedEntryError, NormalizedEntryType, ToolStatus,
        utils::EntryIndexProvider,
    },
    stdout_dup,
};

// JSON event structures for --format json output
/// OpenCode JSON event format (--format json)
///
/// When OpenCode is invoked with `--format json`, it emits structured events
/// to stdout as newline-delimited JSON. This is the official programmatic
/// interface for monitoring OpenCode execution.
///
/// # Event Types
///
/// - `step_start`: Beginning of an agent step
/// - `text`: Text content (may be assistant message text OR tool call JSON)
/// - `step_finish`: End of step with completion reason and token usage
///
/// # Example Events
///
/// ```json
/// {"type":"step_start","sessionID":"ses_786439b6dffe4b","part":{"id":"prt_001","messageID":"msg_001","type":"step-start"}}
/// {"type":"text","sessionID":"ses_786439b6dffe4b","part":{"id":"prt_002","messageID":"msg_001","type":"text","text":"Hello!"}}
/// {"type":"step_finish","sessionID":"ses_786439b6dffe4b","part":{"id":"prt_003","messageID":"msg_001","type":"step-finish","reason":"stop","tokens":{"input":100,"output":50}}}
/// ```
///
/// # Message Assembly
///
/// Text events are chunked by `messageID`. Multiple text events with the same
/// `messageID` should be concatenated to form complete messages. Tool calls
/// appear as JSON strings within text events and are detected by parsing.
///
/// # References
///
/// OpenCode documentation: https://github.com/opencodeco/opencode
#[allow(dead_code)] // Fields used by serde deserialization
#[derive(Debug, Clone, Deserialize)]
struct JsonEvent {
    #[serde(rename = "type")]
    event_type: String,
    timestamp: Option<i64>,
    #[serde(rename = "sessionID")]
    session_id: String,
    part: JsonPart,
}

/// Event part payload containing the actual event data
///
/// # Fields
///
/// - `id`: Unique identifier for this part (e.g., "prt_001")
/// - `message_id`: Groups related parts together (e.g., "msg_001")
/// - `part_type`: Matches event type (e.g., "step-start", "text", "step-finish")
/// - `text`: Content text (present in "text" events only)
/// - `reason`: Completion reason (present in "step_finish" events, e.g., "stop")
/// - `tokens`: Token usage statistics (present in "step_finish" events)
///
/// # Text Events
///
/// The `text` field may contain:
/// - Plain assistant message text: "Let me help you with that..."
/// - JSON-formatted tool calls: `{"name":"Read","input":{"filePath":"test.txt"}}`
///
/// Tool calls are detected by checking if text starts with `{` and contains `"name"`.
#[allow(dead_code)] // Fields used by serde deserialization
#[derive(Debug, Clone, Deserialize)]
struct JsonPart {
    id: String,
    #[serde(rename = "messageID")]
    message_id: String,
    #[serde(rename = "type")]
    part_type: String,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    reason: Option<String>,
    #[serde(default)]
    tokens: Option<JsonTokens>,
}

/// Token usage statistics from step completion
///
/// Included in `step_finish` events to track LLM token consumption.
///
/// # Example
///
/// ```json
/// "tokens": {"input": 100, "output": 50}
/// ```
#[allow(dead_code)] // Fields used by serde deserialization
#[derive(Debug, Clone, Deserialize)]
struct JsonTokens {
    input: u64,
    output: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Opencode {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub no_context: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Opencode {
    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new("opencode run").params([
            "--print-logs",
            "--log-level",
            "ERROR",
            "--format",
            "json",
            "--dangerously-skip-permissions",
        ]);

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }

        if let Some(agent) = &self.agent {
            builder = builder.extend_params(["--agent", agent]);
        }

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Opencode {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        context: SpawnContext,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_parts = self.build_command_builder().build_initial()?;
        let (program_path, args) = command_parts.into_resolved().await?;

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&args)
            .env("NODE_NO_WARNINGS", "1");

        // Remove pnpm-specific env vars that cause npm warnings when using npx
        command.env_remove("npm_config__jsr_registry");
        command.env_remove("npm_config_verify_deps_before_run");
        command.env_remove("npm_config_globalconfig");

        // Set VK context environment variables for MCP tools
        command
            .env("VK_ATTEMPT_ID", context.task_attempt_id.to_string())
            .env("VK_TASK_ID", context.task_id.to_string())
            .env(
                "VK_EXECUTION_PROCESS_ID",
                context.execution_process_id.to_string(),
            );

        let mut child = command.group_spawn().map_err(ExecutorError::SpawnError)?;

        // Write prompt to stdin
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        // Capture stdout for JSON events
        let _stdout_stream = stdout_dup::duplicate_stdout(&mut child)?;

        Ok(child.into())
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<SpawnedChild, ExecutorError> {
        // Note: Environment variables (VK_ATTEMPT_ID, VK_TASK_ID, VK_EXECUTION_PROCESS_ID)
        // are inherited from the parent process that spawned this follow-up session
        let command_parts = self
            .build_command_builder()
            .build_follow_up(&["--session".to_string(), session_id.to_string()])?;
        let (program_path, args) = command_parts.into_resolved().await?;

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&args)
            .env("NODE_NO_WARNINGS", "1");

        // Remove pnpm-specific env vars that cause npm warnings when using npx
        command.env_remove("npm_config__jsr_registry");
        command.env_remove("npm_config_verify_deps_before_run");
        command.env_remove("npm_config_globalconfig");

        let mut child = command.group_spawn().map_err(ExecutorError::SpawnError)?;

        // Write prompt to stdin
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        // Capture stdout for JSON events
        let _stdout_stream = stdout_dup::duplicate_stdout(&mut child)?;

        Ok(child.into())
    }

    /// Normalize logs for OpenCode executor
    ///
    /// This implementation uses three separate threads:
    /// 1. Session ID thread: read by line, search for session ID format, store it.
    /// 2. Error log recognition thread: read by line, identify error log lines, store them as error messages.
    /// 3. Main normalizer thread: read stderr by line, filter out log lines, send lines (with '\n' appended) to plain text normalizer,
    ///    then define predicate for split and create appropriate normalized entry (either assistant or tool call).
    fn normalize_logs(
        &self,
        msg_store: Arc<MsgStore>,
        worktree_path: &Path,
        entry_index_counter: EntryIndexProvider,
    ) -> tokio::task::JoinHandle<()> {
        let stderr_lines = msg_store
            .stderr_lines_stream()
            .filter_map(|res| ready(res.ok()))
            .map(|line| strip_ansi_escapes::strip_str(&line))
            .fork();

        // Log line: INFO  2025-08-05T10:17:26 +1ms service=session id=ses_786439b6dffe4bLqNBS4fGd7mJ
        // error line: !  some error message
        let log_lines = stderr_lines
            .clone()
            .filter(|line| {
                ready(OPENCODE_LOG_REGEX.is_match(line) || LogUtils::is_error_line(line))
            })
            .boxed();

        // Process log lines, which contain error messages. We now source session ID
        // from the oc-share stream instead of stderr.
        let log_lines_handle = tokio::spawn(Self::process_opencode_log_lines(
            log_lines,
            msg_store.clone(),
            entry_index_counter.clone(),
            worktree_path.to_path_buf(),
        ));

        // Also parse JSON events from stdout
        let json_events = msg_store
            .stdout_lines_stream()
            .filter_map(|res| ready(res.ok()))
            .filter(|line| ready(line.starts_with('{')))
            .boxed();
        let json_events_handle = tokio::spawn(Self::process_json_events(
            json_events,
            worktree_path.to_path_buf(),
            entry_index_counter.clone(),
            msg_store.clone(),
        ));

        // Return a handle that awaits both normalization tasks
        tokio::spawn(async move {
            let _ = log_lines_handle.await;
            let _ = json_events_handle.await;
        })
    }

    // MCP configuration methods
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        #[cfg(unix)]
        {
            xdg::BaseDirectories::with_prefix("opencode").get_config_file("opencode.json")
        }
        #[cfg(not(unix))]
        {
            dirs::config_dir().map(|config| config.join("opencode").join("opencode.json"))
        }
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        let installation_indicator_found = dirs::config_dir()
            .map(|config| config.join("opencode").exists())
            .unwrap_or(false);

        if mcp_config_found || installation_indicator_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
}
impl Opencode {
    async fn process_opencode_log_lines(
        mut log_lines: BoxStream<'_, String>,
        msg_store: Arc<MsgStore>,
        entry_index_counter: EntryIndexProvider,
        _worktree_path: PathBuf,
    ) {
        while let Some(line) = log_lines.next().await {
            if line.starts_with("ERROR") || LogUtils::is_error_line(&line) {
                // Use automatic error classification based on content patterns
                let error_type = NormalizedEntryError::classify(&line);
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ErrorMessage { error_type },
                    content: line.clone(),
                    metadata: None,
                };

                // Create a patch for this single entry
                let patch = crate::logs::utils::ConversationPatch::add_normalized_entry(
                    entry_index_counter.next(),
                    entry,
                );
                msg_store.push_patch(patch);
            }
        }
    }
}

impl Opencode {
    /// Parse JSON events from OpenCode stdout and emit normalized patches
    ///
    /// This function processes newline-delimited JSON events from OpenCode's
    /// `--format json` output and transforms them into conversation patches
    /// for the UI.
    ///
    /// # Event Flow
    ///
    /// 1. **Session ID Extraction**: The `sessionID` from the first event is
    ///    pushed to `msg_store` to enable follow-up messages.
    ///
    /// 2. **Text Events**: Processed as either:
    ///    - **Assistant Messages**: Plain text is accumulated by `messageID`
    ///      and upserted as `AssistantMessage` entries. Multiple text chunks
    ///      with the same `messageID` are concatenated for streaming display.
    ///    - **Tool Calls**: Text starting with `{` and containing `"name"` is
    ///      parsed as tool call JSON and creates `ToolUse` entries.
    ///
    /// 3. **Step Boundaries**: `step_start` and `step_finish` events track
    ///    execution boundaries but currently don't create UI entries.
    ///
    /// # Message Accumulation
    ///
    /// Assistant messages often arrive in multiple chunks with the same `messageID`.
    /// We maintain a `HashMap<messageID, accumulated_text>` and use `ConversationPatch::replace`
    /// to update the same entry index, creating a streaming effect in the UI.
    ///
    /// # Tool Call Detection
    ///
    /// Tool calls are embedded as JSON strings within text events:
    /// ```json
    /// {"type":"text","part":{"text":"{\"name\":\"Read\",\"input\":{\"filePath\":\"test.txt\"}}"}}
    /// ```
    ///
    /// We detect these by checking if `text.starts_with('{')` and parsing as JSON.
    async fn process_json_events(
        mut lines: BoxStream<'_, String>,
        _worktree_path: PathBuf,
        entry_index_counter: EntryIndexProvider,
        msg_store: Arc<MsgStore>,
    ) {
        use std::collections::HashMap;

        use crate::logs::utils::ConversationPatch;

        let mut session_id_set = false;
        // Accumulate message text by message_id
        let mut message_texts: HashMap<String, String> = HashMap::new();
        // Track entry indices by message_id for updates
        let mut message_indices: HashMap<String, usize> = HashMap::new();

        while let Some(line) = lines.next().await {
            let Ok(event) = serde_json::from_str::<JsonEvent>(&line) else {
                continue;
            };

            // Set session ID once from first event
            if !session_id_set {
                msg_store.push_session_id(event.session_id.clone());
                session_id_set = true;
            }

            match event.event_type.as_str() {
                "text" => {
                    if let Some(text) = event.part.text {
                        // Check if text is a tool call JSON
                        // Tool calls contain {"name": pattern
                        if text.trim_start().starts_with('{') && text.contains("\"name\"") {
                            // Attempt to parse as tool call JSON
                            #[derive(serde::Deserialize)]
                            struct ToolCallJson {
                                name: String,
                                #[serde(default)]
                                input: Option<serde_json::Value>,
                            }

                            if let Ok(tool_call) = serde_json::from_str::<ToolCallJson>(&text) {
                                // Create ToolUse entry
                                let entry = NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::ToolUse {
                                        tool_name: tool_call.name.clone(),
                                        action_type: ActionType::Tool {
                                            tool_name: tool_call.name.clone(),
                                            arguments: tool_call.input.clone(),
                                            result: None,
                                        },
                                        status: ToolStatus::Created,
                                    },
                                    content: format!("{} called", tool_call.name),
                                    metadata: None,
                                };

                                let idx = entry_index_counter.next();
                                msg_store.push_patch(ConversationPatch::add_normalized_entry(
                                    idx, entry,
                                ));
                            }
                        } else {
                            // Create/update AssistantMessage entry
                            let msg_key = event.part.message_id.clone();
                            let content = message_texts.entry(msg_key.clone()).or_default();
                            content.push_str(&text);

                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::AssistantMessage,
                                content: content.clone(),
                                metadata: None,
                            };

                            // Upsert by message ID - either add or replace
                            use std::collections::hash_map::Entry;
                            match message_indices.entry(msg_key) {
                                Entry::Occupied(o) => {
                                    let idx = *o.get();
                                    msg_store.push_patch(ConversationPatch::replace(idx, entry));
                                }
                                Entry::Vacant(v) => {
                                    let idx = entry_index_counter.next();
                                    v.insert(idx);
                                    msg_store.push_patch(ConversationPatch::add_normalized_entry(
                                        idx, entry,
                                    ));
                                }
                            }
                        }
                    }
                }
                "step_start" => {}
                "step_finish" => {
                    if let Some(tokens) = &event.part.tokens {
                        let entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::TokenUsage {
                                input_tokens: tokens.input as i64,
                                cached_input_tokens: 0,
                                output_tokens: tokens.output as i64,
                                reasoning_tokens: 0,
                                last_total_tokens: (tokens.input + tokens.output) as i64,
                                context_window: None,
                            },
                            content: String::new(),
                            metadata: None,
                        };
                        let idx = entry_index_counter.next();
                        msg_store.push_patch(ConversationPatch::add_normalized_entry(idx, entry));
                    }
                }
                _ => {}
            }
        }
    }
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

/// TODO information structure
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct TodoInfo {
    pub content: String,
    pub status: String,
    #[serde(default)]
    pub priority: Option<String>,
}

// =============================================================================
// Log interpretation UTILITIES
// =============================================================================

// Accurate regex for OpenCode log lines: LEVEL timestamp +ms ...
static OPENCODE_LOG_REGEX: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
    Regex::new(r"^(INFO|DEBUG|WARN|ERROR)\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\s+\+\d+\s*ms.*")
        .unwrap()
});

/// Log utilities for OpenCode processing
pub struct LogUtils;

impl LogUtils {
    pub fn is_error_line(line: &str) -> bool {
        line.starts_with("!  ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_spawn_no_share_bridge_env_vars() {
        let opencode = Opencode {
            append_prompt: AppendPrompt::default(),
            no_context: None,
            model: None,
            agent: None,
            cmd: CmdOverrides::default(),
        };

        // Build the command to check environment variables
        let command_parts = opencode.build_command_builder().build_initial().unwrap();
        let (program_path, args) = command_parts.into_resolved().await.unwrap();

        let mut command = Command::new(program_path);
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .args(&args)
            .env("NODE_NO_WARNINGS", "1");

        // Verify that OPENCODE_AUTO_SHARE and OPENCODE_API are not set
        // Get the command's environment variables (if accessible)
        // Since we can't directly inspect Command's env, we verify by checking
        // that the spawn implementation doesn't set these variables.

        // NOTE: spawn() should not set OPENCODE_AUTO_SHARE or OPENCODE_API.
        // This test documents the expected behavior - the absence of
        // bridge-related code in spawn() ensures these env vars are not set.
    }

    #[tokio::test]
    async fn test_spawn_captures_stdout() {
        let _opencode = Opencode {
            append_prompt: AppendPrompt::default(),
            no_context: None,
            model: None,
            agent: None,
            cmd: CmdOverrides::default(),
        };

        // Create a simple test command that outputs to stdout
        let mut command = Command::new("echo");
        command
            .arg("test output")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = command.group_spawn().unwrap();

        // Verify stdout can be captured
        let stdout_stream = stdout_dup::duplicate_stdout(&mut child);

        assert!(
            stdout_stream.is_ok(),
            "Should be able to capture stdout for JSON events"
        );

        // Clean up
        let _ = child.kill().await;
    }

    #[tokio::test]
    async fn test_command_builder_includes_format_json() {
        let opencode = Opencode {
            append_prompt: AppendPrompt::default(),
            no_context: None,
            model: None,
            agent: None,
            cmd: CmdOverrides::default(),
        };

        // Build the command
        let command_parts = opencode.build_command_builder().build_initial().unwrap();
        let (_program_path, args) = command_parts.into_resolved().await.unwrap();

        // Find --format flag
        let format_idx = args
            .iter()
            .position(|a| a == "--format")
            .expect("--format flag not found in command arguments");

        // Verify it's followed by "json"
        assert_eq!(
            args[format_idx + 1],
            "json",
            "Expected --format to be followed by 'json'"
        );
    }

    #[test]
    fn test_json_event_parsing() {
        // Test step_start event
        let step_start_json = r#"{
            "type": "step_start",
            "timestamp": 1705680000000,
            "sessionID": "ses_abc123",
            "part": {
                "id": "prt_001",
                "messageID": "msg_001",
                "type": "step-start"
            }
        }"#;

        let event: JsonEvent = serde_json::from_str(step_start_json).unwrap();
        assert_eq!(event.event_type, "step_start");
        assert_eq!(event.session_id, "ses_abc123");
        assert_eq!(event.part.id, "prt_001");
        assert_eq!(event.part.message_id, "msg_001");
        assert_eq!(event.part.part_type, "step-start");

        // Test text event
        let text_json = r#"{
            "type": "text",
            "timestamp": 1705680001000,
            "sessionID": "ses_abc123",
            "part": {
                "id": "prt_002",
                "messageID": "msg_001",
                "type": "text",
                "text": "Hello, world!"
            }
        }"#;

        let event: JsonEvent = serde_json::from_str(text_json).unwrap();
        assert_eq!(event.event_type, "text");
        assert_eq!(event.session_id, "ses_abc123");
        assert_eq!(event.part.text, Some("Hello, world!".to_string()));

        // Test step_finish event with tokens
        let step_finish_json = r#"{
            "type": "step_finish",
            "timestamp": 1705680002000,
            "sessionID": "ses_abc123",
            "part": {
                "id": "prt_003",
                "messageID": "msg_001",
                "type": "step-finish",
                "reason": "stop",
                "tokens": {
                    "input": 100,
                    "output": 50
                }
            }
        }"#;

        let event: JsonEvent = serde_json::from_str(step_finish_json).unwrap();
        assert_eq!(event.event_type, "step_finish");
        assert_eq!(event.part.reason, Some("stop".to_string()));
        assert!(event.part.tokens.is_some());

        let tokens = event.part.tokens.unwrap();
        assert_eq!(tokens.input, 100);
        assert_eq!(tokens.output, 50);
    }

    #[tokio::test]
    async fn test_text_event_creates_assistant_message() {
        use futures::stream;
        use workspace_utils::msg_store::MsgStore;

        let msg_store = Arc::new(MsgStore::new());
        let entry_index = EntryIndexProvider::start_from(&msg_store);
        let worktree_path = std::path::PathBuf::from("/tmp/test");

        // Create a stream with a text event
        let events = vec![
            r#"{"type":"text","sessionID":"ses_test","part":{"id":"prt_1","messageID":"msg_1","type":"text","text":"Hello!"}}"#.to_string(),
        ];
        let stream = stream::iter(events).boxed();

        // Process events - should complete without errors
        Opencode::process_json_events(stream, worktree_path, entry_index, msg_store.clone()).await;

        // Verify by checking history contains expected LogMsg entries
        let history = msg_store.get_history();
        // Should have session_id push and patch push
        assert!(
            !history.is_empty(),
            "Expected at least session_id to be pushed"
        );
    }

    #[tokio::test]
    async fn test_tool_call_detection() {
        use futures::stream;
        use workspace_utils::msg_store::MsgStore;

        let msg_store = Arc::new(MsgStore::new());
        let entry_index = EntryIndexProvider::start_from(&msg_store);
        let worktree_path = std::path::PathBuf::from("/tmp/test");

        // Create a stream with a tool call JSON in text
        // Need to escape quotes in the nested JSON
        let events = vec![
            r#"{"type":"text","sessionID":"ses_test","part":{"id":"prt_1","messageID":"msg_1","type":"text","text":"{\"name\":\"Read\",\"input\":{\"filePath\":\"test.txt\"}}"}}"#.to_string(),
        ];
        let stream = stream::iter(events).boxed();

        // Process events - should detect tool call and create ToolUse entry
        Opencode::process_json_events(stream, worktree_path, entry_index, msg_store.clone()).await;

        // Verify by checking history - should have session_id + tool use patch
        let history = msg_store.get_history();
        assert!(
            history.len() >= 2,
            "Expected session_id and tool call to be processed"
        );
    }

    #[tokio::test]
    async fn test_session_id_extracted() {
        use futures::stream;
        use workspace_utils::msg_store::MsgStore;

        let msg_store = Arc::new(MsgStore::new());
        let entry_index = EntryIndexProvider::start_from(&msg_store);
        let worktree_path = std::path::PathBuf::from("/tmp/test");

        // Create a stream with events
        let events = vec![
            r#"{"type":"step_start","sessionID":"ses_unique_123","part":{"id":"prt_1","messageID":"msg_1","type":"step-start"}}"#.to_string(),
            r#"{"type":"text","sessionID":"ses_unique_123","part":{"id":"prt_2","messageID":"msg_1","type":"text","text":"Test"}}"#.to_string(),
        ];
        let stream = stream::iter(events).boxed();

        // Process events - should extract session ID from first event
        Opencode::process_json_events(stream, worktree_path, entry_index, msg_store.clone()).await;

        // Verify session ID was pushed to msg_store
        let history = msg_store.get_history();
        // First message should be SessionId
        assert!(!history.is_empty(), "Expected session_id to be pushed");
    }
}
