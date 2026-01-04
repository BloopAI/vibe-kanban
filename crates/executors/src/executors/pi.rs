use std::{
    collections::{HashMap, VecDeque},
    path::Path,
    process::Stdio,
    sync::Arc,
};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use futures::{StreamExt, future::ready};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::process::Command;
use ts_rs::TS;
use workspace_utils::{msg_store::MsgStore, path::make_path_relative};

use crate::{
    command::{CmdOverrides, CommandBuilder, CommandParts, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
    },
    logs::{
        ActionType, CommandExitStatus, CommandRunResult, FileChange, NormalizedEntry,
        NormalizedEntryError, NormalizedEntryType, ToolResult, ToolStatus,
        plain_text_processor::PlainTextLogProcessor,
        utils::{
            EntryIndexProvider,
            patch::{add_normalized_entry, replace_normalized_entry},
        },
    },
};

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
        description = "Thinking/reasoning mode: off, low, high, etc."
    )]
    pub thinking: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Output Mode",
        description = "Output mode (default: json for structured parsing)"
    )]
    pub mode: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Use NPX",
        description = "Toggle between local binary and npx execution"
    )]
    pub use_npx: Option<bool>,

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

    fn build_command_builder(&self) -> CommandBuilder {
        // Determine base command - use npx if requested or if pi binary not found
        let base = if self.use_npx.unwrap_or(false) {
            "npx -y @mariozechner/pi-coding-agent"
        } else {
            "pi"
        };

        let mut builder = CommandBuilder::new(base);

        // Always use json mode for structured parsing, ignoring user config
        builder = builder.extend_params(["--mode", "json"]);

        // Always use --print for non-interactive execution
        builder = builder.extend_params(["--print"]);

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

async fn spawn_pi(
    command_parts: CommandParts,
    prompt: &str,
    current_dir: &Path,
    env: &ExecutionEnv,
    cmd_overrides: &CmdOverrides,
) -> Result<SpawnedChild, ExecutorError> {
    let (program_path, args) = command_parts.into_resolved().await?;

    let mut command = Command::new(program_path);
    command
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(current_dir)
        .args(args)
        .arg(prompt);

    env.clone()
        .with_profile(cmd_overrides)
        .apply_to_command(&mut command);

    let child = command.group_spawn()?;

    Ok(child.into())
}

#[async_trait]
impl StandardCodingAgentExecutor for Pi {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let pi_command = self.build_command_builder().build_initial()?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        spawn_pi(pi_command, &combined_prompt, current_dir, env, &self.cmd).await
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

        let session_path_str = session_path.to_string_lossy().to_string();
        let continue_cmd = self.build_command_builder().build_follow_up(&[
            "--session".to_string(),
            session_path_str,
        ])?;

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        spawn_pi(continue_cmd, &combined_prompt, current_dir, env, &self.cmd).await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        normalize_logs(
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

        // Check if npx is available and works
        // Note: This might be slow as it might try to download the package,
        // but it's the most reliable check. We skip the download if possible
        // but npx usually handles this.
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

// ============================================================================
// Log Normalization
// ============================================================================

pub fn normalize_logs(
    msg_store: Arc<MsgStore>,
    worktree_path: &Path,
    entry_index_provider: EntryIndexProvider,
) {
    normalize_stderr_logs(msg_store.clone(), entry_index_provider.clone());

    let worktree_path = worktree_path.to_path_buf();
    tokio::spawn(async move {
        let mut state = ToolCallStates::new(entry_index_provider.clone());
        let mut session_id_extracted = false;

        let worktree_path_str = worktree_path.to_string_lossy();

        let mut lines_stream = msg_store
            .stdout_lines_stream()
            .filter_map(|res| ready(res.ok()));

        while let Some(line) = lines_stream.next().await {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let pi_event = match serde_json::from_str::<PiJsonEvent>(trimmed) {
                Ok(event) => event,
                Err(_) => {
                    // Handle non-JSON output as raw system message
                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: strip_ansi_escapes::strip_str(trimmed).to_string(),
                        metadata: None,
                    };
                    add_normalized_entry(&msg_store, &entry_index_provider, entry);
                    continue;
                }
            };

            // Extract session ID if available and not already done
            if !session_id_extracted {
                if let Some(session_id) = pi_event.session_id() {
                    msg_store.push_session_id(session_id.to_string());
                    session_id_extracted = true;
                }
            }

            // Process the event
            match pi_event {
                PiJsonEvent::MessageUpdate {
                    thinking_delta,
                    text_delta,
                    toolcall_delta,
                    ..
                } => {
                    // Handle thinking delta
                    if let Some(thinking) = thinking_delta {
                        if !thinking.is_empty() {
                            state.accumulate_thinking(&thinking);
                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::Thinking,
                                content: state.current_thinking.clone(),
                                metadata: None,
                            };

                            if let Some(idx) = state.thinking_entry_index {
                                replace_normalized_entry(&msg_store, idx, entry);
                            } else {
                                let idx =
                                    add_normalized_entry(&msg_store, &entry_index_provider, entry);
                                state.thinking_entry_index = Some(idx);
                            }
                        }
                    }

                    // Handle text delta
                    if let Some(text) = text_delta {
                        if !text.is_empty() {
                            state.accumulate_text(&text);
                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::AssistantMessage,
                                content: state.current_text.clone(),
                                metadata: None,
                            };

                            if let Some(idx) = state.text_entry_index {
                                replace_normalized_entry(&msg_store, idx, entry);
                            } else {
                                let idx =
                                    add_normalized_entry(&msg_store, &entry_index_provider, entry);
                                state.text_entry_index = Some(idx);
                            }
                        }
                    }

                    // Handle tool call delta
                    if let Some(tool_delta) = toolcall_delta {
                        handle_tool_call_delta(
                            &msg_store,
                            &entry_index_provider,
                            &mut state,
                            tool_delta,
                            &worktree_path_str,
                        );
                    }
                }

                PiJsonEvent::ToolExecutionUpdate {
                    tool_call_id,
                    output,
                    ..
                } => {
                    // Update tool call with execution output
                    if let Some(output) = output {
                        if let Some(tool_state) = state.command_runs.get_mut(&tool_call_id) {
                            tool_state.output.push_str(&output);
                            let entry = tool_state.to_normalized_entry();
                            if let Some(idx) = tool_state.index {
                                replace_normalized_entry(&msg_store, idx, entry);
                            }
                        }
                    }
                }

                PiJsonEvent::ToolExecutionEnd {
                    tool_call_id,
                    result,
                    error,
                    ..
                } => {
                    // Finalize tool call
                    finalize_tool_call(&msg_store, &mut state, &tool_call_id, result, error);
                }

                PiJsonEvent::TurnEnd { .. } => {
                    // Reset state for next turn
                    state.reset_for_new_turn();
                }

                PiJsonEvent::Error { message, .. } => {
                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ErrorMessage {
                            error_type: NormalizedEntryError::Other,
                        },
                        content: message,
                        metadata: None,
                    };
                    add_normalized_entry(&msg_store, &entry_index_provider, entry);
                }

                _ => {
                    // Ignore other event types (session_start, session_end, etc.)
                }
            }
        }
    });
}

fn normalize_stderr_logs(msg_store: Arc<MsgStore>, entry_index_provider: EntryIndexProvider) {
    tokio::spawn(async move {
        let mut stderr = msg_store.stderr_chunked_stream();

        let mut processor = PlainTextLogProcessor::builder()
            .normalized_entry_producer(Box::new(|content: String| NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::ErrorMessage {
                    error_type: NormalizedEntryError::Other,
                },
                content,
                metadata: None,
            }))
            .transform_lines(Box::new(|lines| {
                lines.iter_mut().for_each(|line| {
                    *line = strip_ansi_escapes::strip_str(&line);
                });
            }))
            .time_gap(std::time::Duration::from_secs(2))
            .index_provider(entry_index_provider)
            .build();

        while let Some(Ok(chunk)) = stderr.next().await {
            for patch in processor.process(chunk) {
                msg_store.push_patch(patch);
            }
        }
    });
}

fn handle_tool_call_delta(
    msg_store: &Arc<MsgStore>,
    entry_index_provider: &EntryIndexProvider,
    state: &mut ToolCallStates,
    tool_delta: PiToolCallDelta,
    worktree_path_str: &str,
) {
    let tool_call_id = tool_delta.id.clone();

    // Check if this is a new tool call
    if !state.has_tool_call(&tool_call_id) {
        // Create new tool call state based on tool name
        if let Some(tool_name) = &tool_delta.name {
            create_tool_call_state(
                msg_store,
                entry_index_provider,
                state,
                &tool_call_id,
                tool_name,
                tool_delta.arguments.as_ref(),
                worktree_path_str,
            );
        }
    }

    // Update tool call with accumulated arguments if present
    if let Some(args) = tool_delta.arguments {
        update_tool_call_arguments(msg_store, state, &tool_call_id, args, worktree_path_str);
    }
}

fn create_tool_call_state(
    msg_store: &Arc<MsgStore>,
    entry_index_provider: &EntryIndexProvider,
    state: &mut ToolCallStates,
    tool_call_id: &str,
    tool_name: &str,
    arguments: Option<&Value>,
    worktree_path_str: &str,
) {
    match tool_name {
        "read" => {
            let path = arguments
                .and_then(|a| a.get("path"))
                .and_then(|p| p.as_str())
                .map(|p| make_path_relative(p, worktree_path_str))
                .unwrap_or_default();

            let tool_state = FileReadState {
                index: None,
                path: path.clone(),
                status: ToolStatus::Created,
            };
            state.file_reads.insert(tool_call_id.to_string(), tool_state);
            state.pending_fifo.push_back(PendingToolCall::Read {
                tool_call_id: tool_call_id.to_string(),
            });

            let tool_state = state.file_reads.get_mut(tool_call_id).unwrap();
            let index =
                add_normalized_entry(msg_store, entry_index_provider, tool_state.to_normalized_entry());
            tool_state.index = Some(index);
        }

        "bash" => {
            let command = arguments
                .and_then(|a| a.get("command"))
                .and_then(|c| c.as_str())
                .unwrap_or_default()
                .to_string();

            let tool_state = CommandRunState {
                index: None,
                command: command.clone(),
                output: String::new(),
                status: ToolStatus::Created,
                exit_code: None,
            };
            state.command_runs.insert(tool_call_id.to_string(), tool_state);
            state.pending_fifo.push_back(PendingToolCall::CommandRun {
                tool_call_id: tool_call_id.to_string(),
            });

            let tool_state = state.command_runs.get_mut(tool_call_id).unwrap();
            let index =
                add_normalized_entry(msg_store, entry_index_provider, tool_state.to_normalized_entry());
            tool_state.index = Some(index);
        }

        "edit" => {
            let path = arguments
                .and_then(|a| a.get("path"))
                .and_then(|p| p.as_str())
                .map(|p| make_path_relative(p, worktree_path_str))
                .unwrap_or_default();

            let old_text = arguments
                .and_then(|a| a.get("oldText"))
                .and_then(|t| t.as_str())
                .unwrap_or_default();
            let new_text = arguments
                .and_then(|a| a.get("newText"))
                .and_then(|t| t.as_str())
                .unwrap_or_default();

            let diff =
                workspace_utils::diff::create_unified_diff(&path, old_text, new_text);
            let changes = vec![FileChange::Edit {
                unified_diff: diff,
                has_line_numbers: false,
            }];

            let tool_state = FileEditState {
                index: None,
                path: path.clone(),
                changes,
                status: ToolStatus::Created,
            };
            state.file_edits.insert(tool_call_id.to_string(), tool_state);
            state.pending_fifo.push_back(PendingToolCall::FileEdit {
                tool_call_id: tool_call_id.to_string(),
            });

            let tool_state = state.file_edits.get_mut(tool_call_id).unwrap();
            let index =
                add_normalized_entry(msg_store, entry_index_provider, tool_state.to_normalized_entry());
            tool_state.index = Some(index);
        }

        "write" => {
            let path = arguments
                .and_then(|a| a.get("path"))
                .and_then(|p| p.as_str())
                .map(|p| make_path_relative(p, worktree_path_str))
                .unwrap_or_default();

            let content = arguments
                .and_then(|a| a.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or_default()
                .to_string();

            let changes = vec![FileChange::Write { content }];

            let tool_state = FileEditState {
                index: None,
                path: path.clone(),
                changes,
                status: ToolStatus::Created,
            };
            state.file_edits.insert(tool_call_id.to_string(), tool_state);
            state.pending_fifo.push_back(PendingToolCall::FileEdit {
                tool_call_id: tool_call_id.to_string(),
            });

            let tool_state = state.file_edits.get_mut(tool_call_id).unwrap();
            let index =
                add_normalized_entry(msg_store, entry_index_provider, tool_state.to_normalized_entry());
            tool_state.index = Some(index);
        }

        _ => {
            // Generic tool handling
            let tool_state = GenericToolState {
                index: None,
                name: tool_name.to_string(),
                arguments: arguments.cloned(),
                result: None,
                status: ToolStatus::Created,
            };
            state.generic_tools.insert(tool_call_id.to_string(), tool_state);
            state.pending_fifo.push_back(PendingToolCall::Generic {
                tool_call_id: tool_call_id.to_string(),
            });

            let tool_state = state.generic_tools.get_mut(tool_call_id).unwrap();
            let index =
                add_normalized_entry(msg_store, entry_index_provider, tool_state.to_normalized_entry());
            tool_state.index = Some(index);
        }
    }
}

fn update_tool_call_arguments(
    msg_store: &Arc<MsgStore>,
    state: &mut ToolCallStates,
    tool_call_id: &str,
    args: Value,
    worktree_path_str: &str,
) {
    // Update existing tool call with new arguments
    if let Some(tool_state) = state.file_reads.get_mut(tool_call_id) {
        if let Some(path) = args.get("path").and_then(|p| p.as_str()) {
            tool_state.path = make_path_relative(path, worktree_path_str);
            if let Some(idx) = tool_state.index {
                replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
            }
        }
    }

    if let Some(tool_state) = state.command_runs.get_mut(tool_call_id) {
        if let Some(command) = args.get("command").and_then(|c| c.as_str()) {
            tool_state.command = command.to_string();
            if let Some(idx) = tool_state.index {
                replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
            }
        }
    }

    if let Some(tool_state) = state.file_edits.get_mut(tool_call_id) {
        let mut updated = false;
        if let Some(path) = args.get("path").and_then(|p| p.as_str()) {
            tool_state.path = make_path_relative(path, worktree_path_str);
            updated = true;
        }
        if args.get("oldText").is_some() || args.get("newText").is_some() {
            let old_text = args.get("oldText").and_then(|t| t.as_str()).unwrap_or_default();
            let new_text = args.get("newText").and_then(|t| t.as_str()).unwrap_or_default();
            let diff = workspace_utils::diff::create_unified_diff(&tool_state.path, old_text, new_text);
            tool_state.changes = vec![FileChange::Edit {
                unified_diff: diff,
                has_line_numbers: false,
            }];
            updated = true;
        }
        if let Some(content) = args.get("content").and_then(|c| c.as_str()) {
            tool_state.changes = vec![FileChange::Write {
                content: content.to_string(),
            }];
            updated = true;
        }
        if updated {
            if let Some(idx) = tool_state.index {
                replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
            }
        }
    }

    if let Some(tool_state) = state.generic_tools.get_mut(tool_call_id) {
        tool_state.arguments = Some(args);
        if let Some(idx) = tool_state.index {
            replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
        }
    }
}

fn finalize_tool_call(
    msg_store: &Arc<MsgStore>,
    state: &mut ToolCallStates,
    tool_call_id: &str,
    result: Option<Value>,
    error: Option<String>,
) {
    let is_error = error.is_some();
    let status = if is_error {
        ToolStatus::Failed
    } else {
        ToolStatus::Success
    };

    // Try to finalize each type of tool call
    if let Some(mut tool_state) = state.file_reads.remove(tool_call_id) {
        tool_state.status = status;
        if let Some(idx) = tool_state.index {
            replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
        }
        return;
    }

    if let Some(mut tool_state) = state.command_runs.remove(tool_call_id) {
        tool_state.status = status;
        if let Some(res) = result {
            if let Some(output) = res.get("stdout").and_then(|s| s.as_str()) {
                tool_state.output = output.to_string();
            }
            if let Some(code) = res.get("exitCode").and_then(|c| c.as_i64()) {
                tool_state.exit_code = Some(code as i32);
            }
        }
        if let Some(err) = error {
            tool_state.output = err;
        }
        if let Some(idx) = tool_state.index {
            replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
        }
        return;
    }

    if let Some(mut tool_state) = state.file_edits.remove(tool_call_id) {
        tool_state.status = status;
        if let Some(idx) = tool_state.index {
            replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
        }
        return;
    }

    if let Some(mut tool_state) = state.generic_tools.remove(tool_call_id) {
        tool_state.status = status;
        if let Some(res) = result {
            tool_state.result = Some(res);
        }
        if let Some(err) = error {
            tool_state.result = Some(Value::String(err));
        }
        if let Some(idx) = tool_state.index {
            replace_normalized_entry(msg_store, idx, tool_state.to_normalized_entry());
        }
    }
}

// ============================================================================
// Pi JSON Event Types
// ============================================================================

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PiToolCallDelta {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub arguments: Option<Value>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PiJsonEvent {
    SessionStart {
        #[serde(default)]
        session_id: Option<String>,
    },
    MessageUpdate {
        #[serde(default)]
        session_id: Option<String>,
        #[serde(default)]
        thinking_delta: Option<String>,
        #[serde(default)]
        text_delta: Option<String>,
        #[serde(default)]
        toolcall_delta: Option<PiToolCallDelta>,
    },
    ToolExecutionUpdate {
        #[serde(default)]
        session_id: Option<String>,
        tool_call_id: String,
        #[serde(default)]
        output: Option<String>,
    },
    ToolExecutionEnd {
        #[serde(default)]
        session_id: Option<String>,
        tool_call_id: String,
        #[serde(default)]
        result: Option<Value>,
        #[serde(default)]
        error: Option<String>,
    },
    TurnEnd {
        #[serde(default)]
        session_id: Option<String>,
    },
    SessionEnd {
        #[serde(default)]
        session_id: Option<String>,
    },
    Error {
        #[serde(default)]
        session_id: Option<String>,
        message: String,
    },
    #[serde(other)]
    Unknown,
}

impl PiJsonEvent {
    pub fn session_id(&self) -> Option<&str> {
        match self {
            PiJsonEvent::SessionStart { session_id }
            | PiJsonEvent::MessageUpdate { session_id, .. }
            | PiJsonEvent::ToolExecutionUpdate { session_id, .. }
            | PiJsonEvent::ToolExecutionEnd { session_id, .. }
            | PiJsonEvent::TurnEnd { session_id }
            | PiJsonEvent::SessionEnd { session_id }
            | PiJsonEvent::Error { session_id, .. } => session_id.as_deref(),
            PiJsonEvent::Unknown => None,
        }
    }
}

// ============================================================================
// Tool Call State Types
// ============================================================================

trait ToNormalizedEntry {
    fn to_normalized_entry(&self) -> NormalizedEntry;
}

#[derive(Debug, Clone)]
struct FileReadState {
    index: Option<usize>,
    path: String,
    status: ToolStatus,
}

impl ToNormalizedEntry for FileReadState {
    fn to_normalized_entry(&self) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "read".to_string(),
                action_type: ActionType::FileRead {
                    path: self.path.clone(),
                },
                status: self.status.clone(),
            },
            content: self.path.clone(),
            metadata: None,
        }
    }
}

#[derive(Debug, Clone)]
struct FileEditState {
    index: Option<usize>,
    path: String,
    changes: Vec<FileChange>,
    status: ToolStatus,
}

impl ToNormalizedEntry for FileEditState {
    fn to_normalized_entry(&self) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "edit".to_string(),
                action_type: ActionType::FileEdit {
                    path: self.path.clone(),
                    changes: self.changes.clone(),
                },
                status: self.status.clone(),
            },
            content: self.path.clone(),
            metadata: None,
        }
    }
}

#[derive(Debug, Clone)]
struct CommandRunState {
    index: Option<usize>,
    command: String,
    output: String,
    status: ToolStatus,
    exit_code: Option<i32>,
}

impl ToNormalizedEntry for CommandRunState {
    fn to_normalized_entry(&self) -> NormalizedEntry {
        let result = if self.output.is_empty() && self.exit_code.is_none() {
            None
        } else {
            Some(CommandRunResult {
                exit_status: self
                    .exit_code
                    .map(|code| CommandExitStatus::ExitCode { code }),
                output: if self.output.is_empty() {
                    None
                } else {
                    Some(self.output.clone())
                },
            })
        };

        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "bash".to_string(),
                action_type: ActionType::CommandRun {
                    command: self.command.clone(),
                    result,
                },
                status: self.status.clone(),
            },
            content: self.command.clone(),
            metadata: None,
        }
    }
}

#[derive(Debug, Clone)]
struct GenericToolState {
    index: Option<usize>,
    name: String,
    arguments: Option<Value>,
    status: ToolStatus,
    result: Option<Value>,
}

impl ToNormalizedEntry for GenericToolState {
    fn to_normalized_entry(&self) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: self.name.clone(),
                action_type: ActionType::Tool {
                    tool_name: self.name.clone(),
                    arguments: self.arguments.clone(),
                    result: self.result.clone().map(|value| {
                        if let Some(str) = value.as_str() {
                            ToolResult::markdown(str)
                        } else {
                            ToolResult::json(value)
                        }
                    }),
                },
                status: self.status.clone(),
            },
            content: self.name.clone(),
            metadata: None,
        }
    }
}

type ToolCallId = String;

#[allow(dead_code)]
#[derive(Debug, Clone)]
enum PendingToolCall {
    Read { tool_call_id: ToolCallId },
    FileEdit { tool_call_id: ToolCallId },
    CommandRun { tool_call_id: ToolCallId },
    Generic { tool_call_id: ToolCallId },
}

#[derive(Debug, Clone)]
struct ToolCallStates {
    #[allow(dead_code)]
    entry_index: EntryIndexProvider,
    file_reads: HashMap<String, FileReadState>,
    file_edits: HashMap<String, FileEditState>,
    command_runs: HashMap<String, CommandRunState>,
    generic_tools: HashMap<String, GenericToolState>,
    pending_fifo: VecDeque<PendingToolCall>,
    // Streaming text accumulation
    current_thinking: String,
    thinking_entry_index: Option<usize>,
    current_text: String,
    text_entry_index: Option<usize>,
}

impl ToolCallStates {
    fn new(entry_index: EntryIndexProvider) -> Self {
        Self {
            entry_index,
            file_reads: HashMap::new(),
            file_edits: HashMap::new(),
            command_runs: HashMap::new(),
            generic_tools: HashMap::new(),
            pending_fifo: VecDeque::new(),
            current_thinking: String::new(),
            thinking_entry_index: None,
            current_text: String::new(),
            text_entry_index: None,
        }
    }

    fn has_tool_call(&self, id: &str) -> bool {
        self.file_reads.contains_key(id)
            || self.file_edits.contains_key(id)
            || self.command_runs.contains_key(id)
            || self.generic_tools.contains_key(id)
    }

    fn accumulate_thinking(&mut self, delta: &str) {
        self.current_thinking.push_str(delta);
    }

    fn accumulate_text(&mut self, delta: &str) {
        self.current_text.push_str(delta);
    }

    fn reset_for_new_turn(&mut self) {
        self.current_thinking.clear();
        self.thinking_entry_index = None;
        self.current_text.clear();
        self.text_entry_index = None;
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
    fn test_command_builder_default() {
        let pi = Pi::default();
        let builder = pi.build_command_builder();
        let result = builder.build_initial();
        // Just verify it builds without error
        assert!(result.is_ok());
    }

    #[test]
    fn test_pi_event_parsing() {
        let json = r#"{"type":"message_update","text_delta":"Hello"}"#;
        let event: PiJsonEvent = serde_json::from_str(json).unwrap();
        match event {
            PiJsonEvent::MessageUpdate { text_delta, .. } => {
                assert_eq!(text_delta, Some("Hello".to_string()));
            }
            _ => panic!("Expected MessageUpdate"),
        }
    }
}
