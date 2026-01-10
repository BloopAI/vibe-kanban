// SDK submodules
pub mod client;
pub mod protocol;
pub mod types;

use std::{collections::HashMap, path::Path, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use futures::StreamExt;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use ts_rs::TS;
use workspace_utils::{
    approvals::ApprovalStatus, diff::create_unified_diff, log_msg::LogMsg, msg_store::MsgStore,
    path::make_path_relative,
};

use self::{
    client::{AUTO_APPROVE_CALLBACK_ID, ClaudeAgentClient},
    protocol::ProtocolPeer,
    types::{ClaudeCodeSettings, PermissionMode},
};
use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuilder, CommandParts, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
        codex::client::LogWriter,
    },
    logs::{
        ActionType, FileChange, NormalizedEntry, NormalizedEntryError, NormalizedEntryType,
        TodoItem, ToolStatus,
        stderr_processor::normalize_stderr_logs,
        utils::{EntryIndexProvider, patch::ConversationPatch},
    },
    stdout_dup::create_stdout_pipe_writer,
};

fn base_command(claude_code_router: bool) -> &'static str {
    if claude_code_router {
        "npx -y @musistudio/claude-code-router@1.0.66 code"
    } else {
        "npx -y @anthropic-ai/claude-code@2.0.76"
    }
}

use derivative::Derivative;

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct ClaudeCode {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub claude_code_router: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approvals: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dangerously_skip_permissions: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disable_api_key: Option<bool>,
    /// Claude Code settings (permissions, hooks, etc.)
    /// These will be written to .claude/settings.local.json in the working directory
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<ClaudeCodeSettings>,
    /// When true, reads settings from ~/.claude/settings.json and merges with profile settings
    /// Profile settings take precedence over local settings
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub use_local_settings: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,

    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    approvals_service: Option<Arc<dyn ExecutorApprovalService>>,
}

impl ClaudeCode {
    async fn build_command_builder(&self) -> CommandBuilder {
        // If base_command_override is provided and claude_code_router is also set, log a warning
        if self.cmd.base_command_override.is_some() && self.claude_code_router.is_some() {
            tracing::warn!(
                "base_command_override is set, this will override the claude_code_router setting"
            );
        }

        let mut builder =
            CommandBuilder::new(base_command(self.claude_code_router.unwrap_or(false)))
                .params(["-p"]);

        let plan = self.plan.unwrap_or(false);
        let approvals = self.approvals.unwrap_or(false);
        if plan && approvals {
            tracing::warn!("Both plan and approvals are enabled. Plan will take precedence.");
        }
        if plan || approvals {
            // Enable bypass at startup, otherwise we cannot change to it after exiting plan mode
            builder = builder.extend_params(["--permission-prompt-tool=stdio"]);
            builder = builder.extend_params([format!(
                "--permission-mode={}",
                PermissionMode::BypassPermissions
            )]);
        }
        if self.dangerously_skip_permissions.unwrap_or(false) {
            builder = builder.extend_params(["--dangerously-skip-permissions"]);
        }
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }
        builder = builder.extend_params([
            "--verbose",
            "--output-format=stream-json",
            "--input-format=stream-json",
            "--include-partial-messages",
            "--disallowedTools=AskUserQuestion",
        ]);

        apply_overrides(builder, &self.cmd)
    }

    pub fn permission_mode(&self) -> PermissionMode {
        if self.plan.unwrap_or(false) {
            PermissionMode::Plan
        } else if self.approvals.unwrap_or(false) {
            PermissionMode::Default
        } else {
            PermissionMode::BypassPermissions
        }
    }

    pub fn get_hooks(&self) -> Option<serde_json::Value> {
        if self.plan.unwrap_or(false) {
            Some(serde_json::json!({
                "PreToolUse": [
                    {
                        "matcher": "^ExitPlanMode$",
                        "hookCallbackIds": ["tool_approval"],
                    },
                    {
                        "matcher": "^(?!ExitPlanMode$).*",
                        "hookCallbackIds": [AUTO_APPROVE_CALLBACK_ID],
                    }
                ]
            }))
        } else if self.approvals.unwrap_or(false) {
            Some(serde_json::json!({
                "PreToolUse": [
                    {
                        "matcher": "^(?!(Glob|Grep|NotebookRead|Read|Task|TodoWrite)$).*",
                        "hookCallbackIds": ["tool_approval"],
                    }
                ]
            }))
        } else {
            None
        }
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for ClaudeCode {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals_service = Some(approvals);
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_builder = self.build_command_builder().await;
        let command_parts = command_builder.build_initial()?;
        self.spawn_internal(current_dir, prompt, command_parts, env)
            .await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_builder = self.build_command_builder().await;
        let command_parts = command_builder.build_follow_up(&[
            "--fork-session".to_string(),
            "--resume".to_string(),
            session_id.to_string(),
        ])?;
        self.spawn_internal(current_dir, prompt, command_parts, env)
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &Path) {
        let entry_index_provider = EntryIndexProvider::start_from(&msg_store);

        // Process stdout logs (Claude's JSON output)
        ClaudeLogProcessor::process_logs(
            msg_store.clone(),
            current_dir,
            entry_index_provider.clone(),
            HistoryStrategy::Default,
        );

        // Process stderr logs using the standard stderr processor
        normalize_stderr_logs(msg_store, entry_index_provider);
    }

    // MCP configuration methods
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".claude.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let auth_file_path = dirs::home_dir().map(|home| home.join(".claude.json"));

        if let Some(path) = auth_file_path
            && let Some(timestamp) = std::fs::metadata(&path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
        {
            return AvailabilityInfo::LoginDetected {
                last_auth_timestamp: timestamp,
            };
        }
        AvailabilityInfo::NotFound
    }
}

impl ClaudeCode {
    /// Write settings to .claude/settings.local.json in the working directory
    fn write_settings_file(&self, current_dir: &Path) -> Result<(), ExecutorError> {
        // Determine final settings by optionally merging with local user settings
        let final_settings = self.compute_final_settings();

        if let Some(settings) = final_settings {
            let claude_dir = current_dir.join(".claude");
            std::fs::create_dir_all(&claude_dir).map_err(|e| {
                ExecutorError::Io(std::io::Error::other(format!(
                    "Failed to create .claude directory: {e}"
                )))
            })?;

            let settings_path = claude_dir.join("settings.local.json");
            let settings_json = serde_json::to_string_pretty(&settings).map_err(|e| {
                ExecutorError::Io(std::io::Error::other(format!(
                    "Failed to serialize settings: {e}"
                )))
            })?;

            std::fs::write(&settings_path, settings_json).map_err(|e| {
                ExecutorError::Io(std::io::Error::other(format!(
                    "Failed to write settings file: {e}"
                )))
            })?;

            tracing::info!("Wrote Claude Code settings to {:?}", settings_path);
        }
        Ok(())
    }

    /// Compute final settings by optionally merging with local ~/.claude/settings.json
    fn compute_final_settings(&self) -> Option<ClaudeCodeSettings> {
        let use_local = self.use_local_settings.unwrap_or(false);

        if use_local {
            // Load local settings from ~/.claude/settings.json
            let local_settings = ClaudeCodeSettings::load_from_local();

            match (&self.settings, local_settings) {
                (Some(profile_settings), Some(local)) => {
                    tracing::info!("Merging profile settings with local ~/.claude/settings.json");
                    Some(profile_settings.merge_with_local(&local))
                }
                (Some(profile_settings), None) => {
                    tracing::warn!(
                        "use_local_settings enabled but ~/.claude/settings.json not found"
                    );
                    Some(profile_settings.clone())
                }
                (None, Some(local)) => {
                    tracing::info!("Using local ~/.claude/settings.json (no profile settings)");
                    Some(local)
                }
                (None, None) => {
                    tracing::warn!(
                        "use_local_settings enabled but no settings found anywhere"
                    );
                    None
                }
            }
        } else {
            // Just use profile settings as-is
            self.settings.clone()
        }
    }

    async fn spawn_internal(
        &self,
        current_dir: &Path,
        prompt: &str,
        command_parts: CommandParts,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        // Write settings file if provided
        self.write_settings_file(current_dir)?;

        let (program_path, args) = command_parts.into_resolved().await?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&args);

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

        // Remove ANTHROPIC_API_KEY if disable_api_key is enabled
        if self.disable_api_key.unwrap_or(false) {
            command.env_remove("ANTHROPIC_API_KEY");
            tracing::info!("ANTHROPIC_API_KEY removed from environment");
        }

        let mut child = command.group_spawn()?;
        let child_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("Claude Code missing stdout"))
        })?;
        let child_stdin =
            child.inner().stdin.take().ok_or_else(|| {
                ExecutorError::Io(std::io::Error::other("Claude Code missing stdin"))
            })?;

        let new_stdout = create_stdout_pipe_writer(&mut child)?;
        let permission_mode = self.permission_mode();
        let hooks = self.get_hooks();

        // Create interrupt channel for graceful shutdown
        let (interrupt_tx, interrupt_rx) = tokio::sync::oneshot::channel::<()>();

        // Spawn task to handle the SDK client with control protocol
        let prompt_clone = combined_prompt.clone();
        let approvals_clone = self.approvals_service.clone();
        tokio::spawn(async move {
            let log_writer = LogWriter::new(new_stdout);
            let client = ClaudeAgentClient::new(log_writer.clone(), approvals_clone);
            let protocol_peer =
                ProtocolPeer::spawn(child_stdin, child_stdout, client.clone(), interrupt_rx);

            // Initialize control protocol
            if let Err(e) = protocol_peer.initialize(hooks).await {
                tracing::error!("Failed to initialize control protocol: {e}");
                let _ = log_writer
                    .log_raw(&format!("Error: Failed to initialize - {e}"))
                    .await;
                return;
            }

            if let Err(e) = protocol_peer.set_permission_mode(permission_mode).await {
                tracing::warn!("Failed to set permission mode to {permission_mode}: {e}");
            }

            // Send user message
            if let Err(e) = protocol_peer.send_user_message(prompt_clone).await {
                tracing::error!("Failed to send prompt: {e}");
                let _ = log_writer
                    .log_raw(&format!("Error: Failed to send prompt - {e}"))
                    .await;
            }
        });

        Ok(SpawnedChild {
            child,
            exit_signal: None,
            interrupt_sender: Some(interrupt_tx),
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HistoryStrategy {
    // Claude-code format
    Default,
    // Amp threads format which includes logs from previous executions
    AmpResume,
}

/// Handles log processing and interpretation for Claude executor
pub struct ClaudeLogProcessor {
    model_name: Option<String>,
    // Map tool_use_id -> structured info for follow-up ToolResult replacement
    tool_map: HashMap<String, ClaudeToolCallInfo>,
    // Strategy controlling how to handle history and user messages
    strategy: HistoryStrategy,
    streaming_messages: HashMap<String, StreamingMessageState>,
    streaming_message_id: Option<String>,
}

impl ClaudeLogProcessor {
    #[cfg(test)]
    fn new() -> Self {
        Self::new_with_strategy(HistoryStrategy::Default)
    }

    fn new_with_strategy(strategy: HistoryStrategy) -> Self {
        Self {
            model_name: None,
            tool_map: HashMap::new(),
            strategy,
            streaming_messages: HashMap::new(),
            streaming_message_id: None,
        }
    }

    /// Process raw logs and convert them to normalized entries with patches
    pub fn process_logs(
        msg_store: Arc<MsgStore>,
        current_dir: &Path,
        entry_index_provider: EntryIndexProvider,
        strategy: HistoryStrategy,
    ) {
        let current_dir_clone = current_dir.to_owned();
        tokio::spawn(async move {
            let mut stream = msg_store.history_plus_stream();
            let mut buffer = String::new();
            let worktree_path = current_dir_clone.to_string_lossy().to_string();
            let mut session_id_extracted = false;
            let mut processor = Self::new_with_strategy(strategy);

            while let Some(Ok(msg)) = stream.next().await {
                let chunk = match msg {
                    LogMsg::Stdout(x) => x,
                    LogMsg::JsonPatch(_)
                    | LogMsg::SessionId(_)
                    | LogMsg::Stderr(_)
                    | LogMsg::Ready => continue,
                    LogMsg::Finished => break,
                };

                buffer.push_str(&chunk);

                // Process complete JSON lines
                for line in buffer
                    .split_inclusive('\n')
                    .filter(|l| l.ends_with('\n'))
                    .map(str::to_owned)
                    .collect::<Vec<_>>()
                {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    // Filter out claude-code-router service messages
                    if trimmed.starts_with("Service not running, starting service")
                        || trimmed
                            .contains("claude code router service has been successfully stopped")
                    {
                        continue;
                    }

                    match serde_json::from_str::<ClaudeJson>(trimmed) {
                        Ok(claude_json) => {
                            // Extract session ID if present
                            if !session_id_extracted
                                && let Some(session_id) = Self::extract_session_id(&claude_json)
                            {
                                msg_store.push_session_id(session_id);
                                session_id_extracted = true;
                            }

                            let patches = processor.normalize_entries(
                                &claude_json,
                                &worktree_path,
                                &entry_index_provider,
                            );
                            for patch in patches {
                                msg_store.push_patch(patch);
                            }
                        }
                        Err(_) => {
                            // Handle non-JSON output as raw system message
                            if !trimmed.is_empty() {
                                let entry = NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::SystemMessage,
                                    content: trimmed.to_string(),
                                    metadata: None,
                                };

                                let patch_id = entry_index_provider.next();
                                let patch =
                                    ConversationPatch::add_normalized_entry(patch_id, entry);
                                msg_store.push_patch(patch);
                            }
                        }
                    }
                }

                // Keep the partial line in the buffer
                buffer = buffer.rsplit('\n').next().unwrap_or("").to_owned();
            }

            // Handle any remaining content in buffer
            if !buffer.trim().is_empty() {
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: buffer.trim().to_string(),
                    metadata: None,
                };

                let patch_id = entry_index_provider.next();
                let patch = ConversationPatch::add_normalized_entry(patch_id, entry);
                msg_store.push_patch(patch);
            }
        });
    }

    /// Extract session ID from Claude JSON
    fn extract_session_id(claude_json: &ClaudeJson) -> Option<String> {
        match claude_json {
            ClaudeJson::System { .. } => None, // session might not have been initialized yet
            ClaudeJson::Assistant { session_id, .. } => session_id.clone(),
            ClaudeJson::User { session_id, .. } => session_id.clone(),
            ClaudeJson::ToolUse { session_id, .. } => session_id.clone(),
            ClaudeJson::ToolResult { session_id, .. } => session_id.clone(),
            ClaudeJson::Result { session_id, .. } => session_id.clone(),
            ClaudeJson::StreamEvent { .. } => None, // session might not have been initialized yet
            ClaudeJson::ApprovalResponse { .. } => None,
            ClaudeJson::Unknown { .. } => None,
        }
    }

    /// Generate warning entry if API key source is ANTHROPIC_API_KEY
    fn warn_if_unmanaged_key(src: &Option<String>) -> Option<NormalizedEntry> {
        match src.as_deref() {
            Some("ANTHROPIC_API_KEY") => {
                tracing::warn!(
                    "ANTHROPIC_API_KEY env variable detected, your Anthropic subscription is not being used"
                );
                Some(NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ErrorMessage { error_type: NormalizedEntryError::Other,
                    },
                    content: "Claude Code + ANTHROPIC_API_KEY detected. Usage will be billed via Anthropic pay-as-you-go instead of your Claude subscription. If this is unintended, please select the `disable_api_key` checkbox in the conding-agent-configurations settings page.".to_string(),
                    metadata: None,
                })
            }
            _ => None,
        }
    }

    /// Normalize Claude tool_result content to either Markdown string or parsed JSON.
    /// - If content is a string that parses as JSON, return Json with parsed value.
    /// - If content is a string (non-JSON), return Markdown with the raw string.
    /// - If content is an array of { text: string }, join texts as Markdown.
    /// - Otherwise return Json with the original value.
    fn normalize_claude_tool_result_value(
        content: &serde_json::Value,
    ) -> (crate::logs::ToolResultValueType, serde_json::Value) {
        if let Some(s) = content.as_str() {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(s) {
                return (crate::logs::ToolResultValueType::Json, parsed);
            }
            return (
                crate::logs::ToolResultValueType::Markdown,
                serde_json::Value::String(s.to_string()),
            );
        }

        if let Ok(items) = serde_json::from_value::<Vec<ClaudeToolResultTextItem>>(content.clone())
            && !items.is_empty()
        {
            let joined = items
                .into_iter()
                .map(|i| i.text)
                .collect::<Vec<_>>()
                .join("\n\n");
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&joined) {
                return (crate::logs::ToolResultValueType::Json, parsed);
            }
            return (
                crate::logs::ToolResultValueType::Markdown,
                serde_json::Value::String(joined),
            );
        }

        (crate::logs::ToolResultValueType::Json, content.clone())
    }

    /// Convert Claude content item to normalized entry
    fn content_item_to_normalized_entry(
        content_item: &ClaudeContentItem,
        role: &str,
        worktree_path: &str,
    ) -> Option<NormalizedEntry> {
        match content_item {
            ClaudeContentItem::Text { text } => {
                let entry_type = match role {
                    "assistant" => NormalizedEntryType::AssistantMessage,
                    _ => return None,
                };
                Some(NormalizedEntry {
                    timestamp: None,
                    entry_type,
                    content: text.clone(),
                    metadata: Some(
                        serde_json::to_value(content_item).unwrap_or(serde_json::Value::Null),
                    ),
                })
            }
            ClaudeContentItem::Thinking { thinking } => Some(NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::Thinking,
                content: thinking.clone(),
                metadata: Some(
                    serde_json::to_value(content_item).unwrap_or(serde_json::Value::Null),
                ),
            }),
            ClaudeContentItem::ToolUse { tool_data, id } => {
                let name = tool_data.get_name();
                let action_type = Self::extract_action_type(tool_data, worktree_path);
                let content =
                    Self::generate_concise_content(tool_data, &action_type, worktree_path);

                // Create metadata with tool_call_id for approval matching
                let mut metadata =
                    serde_json::to_value(content_item).unwrap_or(serde_json::Value::Null);
                if let Some(obj) = metadata.as_object_mut() {
                    obj.insert(
                        "tool_call_id".to_string(),
                        serde_json::Value::String(id.clone()),
                    );
                }

                Some(NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: name.to_string(),
                        action_type,
                        status: ToolStatus::Created,
                    },
                    content,
                    metadata: Some(metadata),
                })
            }
            ClaudeContentItem::ToolResult { .. } => {
                // TODO: Add proper ToolResult support to NormalizedEntry when the type system supports it
                None
            }
        }
    }

    /// Extract action type from structured tool data
    fn extract_action_type(tool_data: &ClaudeToolData, worktree_path: &str) -> ActionType {
        match tool_data {
            ClaudeToolData::Read { file_path } => ActionType::FileRead {
                path: make_path_relative(file_path, worktree_path),
            },
            ClaudeToolData::Edit {
                file_path,
                old_string,
                new_string,
            } => {
                let changes = if old_string.is_some() || new_string.is_some() {
                    vec![FileChange::Edit {
                        unified_diff: create_unified_diff(
                            file_path,
                            &old_string.clone().unwrap_or_default(),
                            &new_string.clone().unwrap_or_default(),
                        ),
                        has_line_numbers: false,
                    }]
                } else {
                    vec![]
                };
                ActionType::FileEdit {
                    path: make_path_relative(file_path, worktree_path),
                    changes,
                }
            }
            ClaudeToolData::MultiEdit { file_path, edits } => {
                let changes: Vec<FileChange> = edits
                    .iter()
                    .filter(|edit| edit.old_string.is_some() || edit.new_string.is_some())
                    .map(|edit| FileChange::Edit {
                        unified_diff: create_unified_diff(
                            file_path,
                            &edit.old_string.clone().unwrap_or_default(),
                            &edit.new_string.clone().unwrap_or_default(),
                        ),
                        has_line_numbers: false,
                    })
                    .collect();
                ActionType::FileEdit {
                    path: make_path_relative(file_path, worktree_path),
                    changes,
                }
            }
            ClaudeToolData::Write { file_path, content } => {
                let diffs = vec![FileChange::Write {
                    content: content.clone(),
                }];
                ActionType::FileEdit {
                    path: make_path_relative(file_path, worktree_path),
                    changes: diffs,
                }
            }
            ClaudeToolData::Bash { command, .. } => ActionType::CommandRun {
                command: command.clone(),
                result: None,
            },
            ClaudeToolData::Grep { pattern, .. } => ActionType::Search {
                query: pattern.clone(),
            },
            ClaudeToolData::WebFetch { url, .. } => ActionType::WebFetch { url: url.clone() },
            ClaudeToolData::WebSearch { query, .. } => ActionType::WebFetch { url: query.clone() },
            ClaudeToolData::Task {
                description,
                prompt,
                ..
            } => {
                let task_description = if let Some(desc) = description {
                    desc.clone()
                } else {
                    prompt.clone().unwrap_or_default()
                };
                ActionType::TaskCreate {
                    description: task_description,
                }
            }
            ClaudeToolData::ExitPlanMode { plan } => {
                ActionType::PlanPresentation { plan: plan.clone() }
            }
            ClaudeToolData::NotebookEdit { .. } => ActionType::Tool {
                tool_name: "NotebookEdit".to_string(),
                arguments: Some(serde_json::to_value(tool_data).unwrap_or(serde_json::Value::Null)),
                result: None,
            },
            ClaudeToolData::TodoWrite { todos } => ActionType::TodoManagement {
                todos: todos
                    .iter()
                    .map(|t| TodoItem {
                        content: t.content.clone(),
                        status: t.status.clone(),
                        priority: t.priority.clone(),
                    })
                    .collect(),
                operation: "write".to_string(),
            },
            ClaudeToolData::TodoRead { .. } => ActionType::TodoManagement {
                todos: vec![],
                operation: "read".to_string(),
            },
            ClaudeToolData::Glob { pattern, .. } => ActionType::Search {
                query: pattern.clone(),
            },
            ClaudeToolData::LS { .. } => ActionType::Other {
                description: "List directory".to_string(),
            },
            ClaudeToolData::Oracle { .. } => ActionType::Other {
                description: "Oracle".to_string(),
            },
            ClaudeToolData::Mermaid { .. } => ActionType::Other {
                description: "Mermaid diagram".to_string(),
            },
            ClaudeToolData::CodebaseSearchAgent { .. } => ActionType::Other {
                description: "Codebase search".to_string(),
            },
            ClaudeToolData::UndoEdit { .. } => ActionType::Other {
                description: "Undo edit".to_string(),
            },
            ClaudeToolData::Unknown { .. } => {
                // Surface MCP tools as generic Tool with args
                let name = tool_data.get_name();
                if name.starts_with("mcp__") {
                    let parts: Vec<&str> = name.split("__").collect();
                    let label = if parts.len() >= 3 {
                        format!("mcp:{}:{}", parts[1], parts[2])
                    } else {
                        name.to_string()
                    };
                    // Extract `input` if present by serializing then deserializing to a tiny struct
                    let args = serde_json::to_value(tool_data)
                        .ok()
                        .and_then(|v| serde_json::from_value::<ClaudeToolWithInput>(v).ok())
                        .map(|w| w.input)
                        .unwrap_or(serde_json::Value::Null);
                    ActionType::Tool {
                        tool_name: label,
                        arguments: Some(args),
                        result: None,
                    }
                } else {
                    ActionType::Other {
                        description: format!("Tool: {}", tool_data.get_name()),
                    }
                }
            }
        }
    }

    /// Convert Claude JSON to normalized patches
    fn normalize_entries(
        &mut self,
        claude_json: &ClaudeJson,
        worktree_path: &str,
        entry_index_provider: &EntryIndexProvider,
    ) -> Vec<json_patch::Patch> {
        let mut patches = Vec::new();
        match claude_json {
            ClaudeJson::System {
                subtype,
                api_key_source,
                ..
            } => {
                // emit billing warning if required
                if let Some(warning) = Self::warn_if_unmanaged_key(api_key_source) {
                    let idx = entry_index_provider.next();
                    patches.push(ConversationPatch::add_normalized_entry(idx, warning));
                }

                // keep the existing behaviour for the normal system message
                match subtype.as_deref() {
                    Some("init") => {
                        // Skip system init messages because it doesn't contain the actual model that will be used in assistant messages in case of claude-code-router.
                        // We'll send system initialized message with first assistant message that has a model field.
                    }
                    Some(subtype) => {
                        let entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::SystemMessage,
                            content: format!("System: {subtype}"),
                            metadata: Some(
                                serde_json::to_value(claude_json)
                                    .unwrap_or(serde_json::Value::Null),
                            ),
                        };
                        let idx = entry_index_provider.next();
                        patches.push(ConversationPatch::add_normalized_entry(idx, entry));
                    }
                    None => {
                        let entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::SystemMessage,
                            content: "System message".to_string(),
                            metadata: Some(
                                serde_json::to_value(claude_json)
                                    .unwrap_or(serde_json::Value::Null),
                            ),
                        };
                        let idx = entry_index_provider.next();
                        patches.push(ConversationPatch::add_normalized_entry(idx, entry));
                    }
                }
            }
            ClaudeJson::Assistant { message, .. } => {
                if let Some(patch) = extract_model_name(self, message, entry_index_provider) {
                    patches.push(patch);
                }

                let mut streaming_message_state = message
                    .id
                    .as_ref()
                    .and_then(|id| self.streaming_messages.remove(id));

                for (content_index, item) in message.content.iter().enumerate() {
                    let entry_index = streaming_message_state
                        .as_mut()
                        .and_then(|state| state.content_entry_index(content_index));

                    match item {
                        ClaudeContentItem::ToolUse { id, tool_data } => {
                            let tool_name = tool_data.get_name().to_string();
                            let action_type = Self::extract_action_type(tool_data, worktree_path);
                            let content_text = Self::generate_concise_content(
                                tool_data,
                                &action_type,
                                worktree_path,
                            );

                            // Create metadata with tool_call_id for approval matching
                            let mut metadata =
                                serde_json::to_value(item).unwrap_or(serde_json::Value::Null);
                            if let Some(obj) = metadata.as_object_mut() {
                                obj.insert(
                                    "tool_call_id".to_string(),
                                    serde_json::Value::String(id.clone()),
                                );
                            }

                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::ToolUse {
                                    tool_name: tool_name.clone(),
                                    action_type,
                                    status: ToolStatus::Created,
                                },
                                content: content_text.clone(),
                                metadata: Some(metadata),
                            };
                            let is_new = entry_index.is_none();
                            let id_num = entry_index.unwrap_or_else(|| entry_index_provider.next());
                            self.tool_map.insert(
                                id.clone(),
                                ClaudeToolCallInfo {
                                    entry_index: id_num,
                                    tool_name: tool_name.clone(),
                                    tool_data: tool_data.clone(),
                                    content: content_text,
                                },
                            );
                            let patch = if is_new {
                                ConversationPatch::add_normalized_entry(id_num, entry)
                            } else {
                                ConversationPatch::replace(id_num, entry)
                            };
                            patches.push(patch);
                        }
                        ClaudeContentItem::Text { .. } | ClaudeContentItem::Thinking { .. } => {
                            if let Some(entry) = Self::content_item_to_normalized_entry(
                                item,
                                &message.role,
                                worktree_path,
                            ) {
                                let is_new = entry_index.is_none();
                                let idx =
                                    entry_index.unwrap_or_else(|| entry_index_provider.next());
                                let patch = if is_new {
                                    ConversationPatch::add_normalized_entry(idx, entry)
                                } else {
                                    ConversationPatch::replace(idx, entry)
                                };
                                patches.push(patch);
                            }
                        }
                        ClaudeContentItem::ToolResult { .. } => {}
                    }
                }
            }
            ClaudeJson::User { message, .. } => {
                if matches!(self.strategy, HistoryStrategy::AmpResume)
                    && message
                        .content
                        .iter()
                        .any(|c| matches!(c, ClaudeContentItem::Text { .. }))
                {
                    let cur = entry_index_provider.current();
                    if cur > 0 {
                        for _ in 0..cur {
                            patches.push(ConversationPatch::remove_diff(0.to_string()));
                        }
                        entry_index_provider.reset();
                        self.tool_map.clear();
                    }

                    for item in &message.content {
                        if let ClaudeContentItem::Text { text } = item {
                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::UserMessage,
                                content: text.clone(),
                                metadata: Some(
                                    serde_json::to_value(item).unwrap_or(serde_json::Value::Null),
                                ),
                            };
                            let id = entry_index_provider.next();
                            patches.push(ConversationPatch::add_normalized_entry(id, entry));
                        }
                    }
                }

                for item in &message.content {
                    if let ClaudeContentItem::ToolResult {
                        tool_use_id,
                        content,
                        is_error,
                    } = item
                        && let Some(info) = self.tool_map.get(tool_use_id).cloned()
                    {
                        let is_command = matches!(info.tool_data, ClaudeToolData::Bash { .. });

                        let _display_tool_name = if is_command {
                            info.tool_name.clone()
                        } else {
                            let raw_name = info.tool_data.get_name().to_string();
                            if raw_name.starts_with("mcp__") {
                                let parts: Vec<&str> = raw_name.split("__").collect();
                                if parts.len() >= 3 {
                                    format!("mcp:{}:{}", parts[1], parts[2])
                                } else {
                                    raw_name
                                }
                            } else {
                                raw_name
                            }
                        };

                        if is_command {
                            let content_str = if let Some(s) = content.as_str() {
                                s.to_string()
                            } else {
                                content.to_string()
                            };

                            let result = if let Ok(result) =
                                serde_json::from_str::<AmpBashResult>(&content_str)
                            {
                                Some(crate::logs::CommandRunResult {
                                    exit_status: Some(crate::logs::CommandExitStatus::ExitCode {
                                        code: result.exit_code,
                                    }),
                                    output: Some(result.output),
                                })
                            } else {
                                Some(crate::logs::CommandRunResult {
                                    exit_status: (*is_error).map(|is_error| {
                                        crate::logs::CommandExitStatus::Success {
                                            success: !is_error,
                                        }
                                    }),
                                    output: Some(content_str),
                                })
                            };

                            let status = if is_error.unwrap_or(false) {
                                ToolStatus::Failed
                            } else {
                                ToolStatus::Success
                            };

                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::ToolUse {
                                    tool_name: info.tool_name.clone(),
                                    action_type: ActionType::CommandRun {
                                        command: info.content.clone(),
                                        result,
                                    },
                                    status,
                                },
                                content: info.content.clone(),
                                metadata: None,
                            };
                            patches.push(ConversationPatch::replace(info.entry_index, entry));
                        } else if matches!(
                            info.tool_data,
                            ClaudeToolData::Unknown { .. }
                                | ClaudeToolData::Oracle { .. }
                                | ClaudeToolData::Mermaid { .. }
                                | ClaudeToolData::CodebaseSearchAgent { .. }
                                | ClaudeToolData::NotebookEdit { .. }
                        ) {
                            let (res_type, res_value) =
                                Self::normalize_claude_tool_result_value(content);

                            let args_to_show = serde_json::to_value(&info.tool_data)
                                .ok()
                                .and_then(|v| serde_json::from_value::<ClaudeToolWithInput>(v).ok())
                                .map(|w| w.input)
                                .unwrap_or(serde_json::Value::Null);

                            let tool_name = info.tool_data.get_name().to_string();
                            let is_mcp = tool_name.starts_with("mcp__");
                            let label = if is_mcp {
                                let parts: Vec<&str> = tool_name.split("__").collect();
                                if parts.len() >= 3 {
                                    format!("mcp:{}:{}", parts[1], parts[2])
                                } else {
                                    tool_name.clone()
                                }
                            } else {
                                tool_name.clone()
                            };

                            let status = if is_error.unwrap_or(false) {
                                ToolStatus::Failed
                            } else {
                                ToolStatus::Success
                            };

                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::ToolUse {
                                    tool_name: label.clone(),
                                    action_type: ActionType::Tool {
                                        tool_name: label,
                                        arguments: Some(args_to_show),
                                        result: Some(crate::logs::ToolResult {
                                            r#type: res_type,
                                            value: res_value,
                                        }),
                                    },
                                    status,
                                },
                                content: info.content.clone(),
                                metadata: None,
                            };
                            patches.push(ConversationPatch::replace(info.entry_index, entry));
                        }
                        // Note: With control protocol, denials are handled via protocol messages
                        // rather than error content parsing
                    }
                }
            }
            ClaudeJson::ToolUse { tool_data, .. } => {
                let tool_name = tool_data.get_name();
                let action_type = Self::extract_action_type(tool_data, worktree_path);
                let content =
                    Self::generate_concise_content(tool_data, &action_type, worktree_path);

                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: tool_name.to_string(),
                        action_type,
                        status: ToolStatus::Created,
                    },
                    content,
                    metadata: Some(
                        serde_json::to_value(claude_json).unwrap_or(serde_json::Value::Null),
                    ),
                };
                let idx = entry_index_provider.next();
                patches.push(ConversationPatch::add_normalized_entry(idx, entry));
            }
            ClaudeJson::ToolResult { .. } => {
                // Add proper ToolResult support to NormalizedEntry when the type system supports it
            }
            ClaudeJson::StreamEvent { event, .. } => match event {
                ClaudeStreamEvent::MessageStart { message } => {
                    if message.role == "assistant" {
                        if let Some(patch) = extract_model_name(self, message, entry_index_provider)
                        {
                            patches.push(patch);
                        }

                        if let Some(message_id) = message.id.clone() {
                            self.streaming_messages.insert(
                                message_id.clone(),
                                StreamingMessageState::new(message.role.clone()),
                            );
                            self.streaming_message_id = Some(message_id);
                        } else {
                            self.streaming_message_id = None;
                        }
                    } else {
                        self.streaming_message_id = None;
                    }
                }
                ClaudeStreamEvent::ContentBlockStart {
                    index,
                    content_block,
                } => {
                    if let Some(state) = self
                        .streaming_message_id
                        .as_ref()
                        .and_then(|id| self.streaming_messages.get_mut(id))
                    {
                        state.content_block_start(*index, content_block.clone());
                    }
                }
                ClaudeStreamEvent::ContentBlockDelta { index, delta } => {
                    if let Some(state) = self
                        .streaming_message_id
                        .as_ref()
                        .and_then(|id| self.streaming_messages.get_mut(id))
                        && let Some(patch) = state.apply_content_block_delta(
                            *index,
                            delta,
                            worktree_path,
                            entry_index_provider,
                        )
                    {
                        patches.push(patch);
                    }
                }
                ClaudeStreamEvent::ContentBlockStop { .. } => {}
                ClaudeStreamEvent::MessageDelta { .. } => {}
                ClaudeStreamEvent::MessageStop => {
                    if let Some(message_id) = self.streaming_message_id.take() {
                        let _ = self.streaming_messages.remove(&message_id);
                    }
                }
                ClaudeStreamEvent::Unknown => {}
            },
            ClaudeJson::Result { is_error, .. } => {
                if matches!(self.strategy, HistoryStrategy::AmpResume) && is_error.unwrap_or(false)
                {
                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ErrorMessage {
                            error_type: NormalizedEntryError::Other,
                        },
                        content: serde_json::to_string(claude_json)
                            .unwrap_or_else(|_| "error".to_string()),
                        metadata: Some(
                            serde_json::to_value(claude_json).unwrap_or(serde_json::Value::Null),
                        ),
                    };
                    let idx = entry_index_provider.next();
                    patches.push(ConversationPatch::add_normalized_entry(idx, entry));
                }
            }
            ClaudeJson::ApprovalResponse {
                call_id: _,
                tool_name,
                approval_status,
            } => {
                // Convert denials and timeouts to visible entries (matching Codex behavior)
                let entry_opt = match approval_status {
                    ApprovalStatus::Pending => None,
                    ApprovalStatus::Approved => None,
                    ApprovalStatus::Denied { reason } => Some(NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::UserFeedback {
                            denied_tool: tool_name.clone(),
                        },
                        content: reason
                            .as_ref()
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .unwrap_or_else(|| "User denied this tool use request".to_string()),
                        metadata: None,
                    }),
                    ApprovalStatus::TimedOut => Some(NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ErrorMessage {
                            error_type: NormalizedEntryError::Other,
                        },
                        content: format!("Approval timed out for tool {tool_name}"),
                        metadata: None,
                    }),
                };

                if let Some(entry) = entry_opt {
                    let idx = entry_index_provider.next();
                    patches.push(ConversationPatch::add_normalized_entry(idx, entry));
                }
            }
            ClaudeJson::Unknown { data } => {
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: format!(
                        "Unrecognized JSON message: {}",
                        serde_json::to_value(data).unwrap_or_default()
                    ),
                    metadata: None,
                };
                let idx = entry_index_provider.next();
                patches.push(ConversationPatch::add_normalized_entry(idx, entry));
            }
        }
        patches
    }
    /// Generate concise, readable content for tool usage using structured data
    fn generate_concise_content(
        tool_data: &ClaudeToolData,
        action_type: &ActionType,
        worktree_path: &str,
    ) -> String {
        match action_type {
            ActionType::FileRead { path } => path.to_string(),
            ActionType::FileEdit { path, .. } => path.to_string(),
            ActionType::CommandRun { command, .. } => command.to_string(),
            ActionType::Search { query } => query.to_string(),
            ActionType::WebFetch { url } => url.to_string(),
            ActionType::TaskCreate { description } => {
                if description.is_empty() {
                    "Task".to_string()
                } else {
                    format!("Task: `{description}`")
                }
            }
            ActionType::Tool { .. } => match tool_data {
                ClaudeToolData::NotebookEdit { notebook_path, .. } => {
                    format!("`{}`", make_path_relative(notebook_path, worktree_path))
                }
                ClaudeToolData::Unknown { .. } => {
                    let name = tool_data.get_name();
                    if name.starts_with("mcp__") {
                        let parts: Vec<&str> = name.split("__").collect();
                        if parts.len() >= 3 {
                            return format!("mcp:{}:{}", parts[1], parts[2]);
                        }
                    }
                    name.to_string()
                }
                _ => tool_data.get_name().to_string(),
            },
            ActionType::PlanPresentation { plan } => plan.clone(),
            ActionType::TodoManagement { .. } => "TODO list updated".to_string(),
            ActionType::Other { description: _ } => match tool_data {
                ClaudeToolData::LS { path } => {
                    let relative_path = make_path_relative(path, worktree_path);
                    if relative_path.is_empty() {
                        "List directory".to_string()
                    } else {
                        format!("List directory: {relative_path}")
                    }
                }
                ClaudeToolData::Glob { pattern, path, .. } => {
                    if let Some(search_path) = path {
                        format!(
                            "Find files: `{}` in {}",
                            pattern,
                            make_path_relative(search_path, worktree_path)
                        )
                    } else {
                        format!("Find files: `{pattern}`")
                    }
                }
                ClaudeToolData::Oracle { task, .. } => {
                    if let Some(t) = task {
                        format!("Oracle: `{t}`")
                    } else {
                        "Oracle".to_string()
                    }
                }
                ClaudeToolData::Mermaid { .. } => "Mermaid diagram".to_string(),
                ClaudeToolData::CodebaseSearchAgent { query, path, .. } => {
                    match (query.as_ref(), path.as_ref()) {
                        (Some(q), Some(p)) if !q.is_empty() && !p.is_empty() => format!(
                            "Codebase search: `{}` in {}",
                            q,
                            make_path_relative(p, worktree_path)
                        ),
                        (Some(q), _) if !q.is_empty() => format!("Codebase search: `{q}`"),
                        _ => "Codebase search".to_string(),
                    }
                }
                ClaudeToolData::UndoEdit { path, .. } => {
                    if let Some(p) = path.as_ref() {
                        let rel = make_path_relative(p, worktree_path);
                        if rel.is_empty() {
                            "Undo edit".to_string()
                        } else {
                            format!("Undo edit: `{rel}`")
                        }
                    } else {
                        "Undo edit".to_string()
                    }
                }
                _ => tool_data.get_name().to_string(),
            },
        }
    }
}

fn extract_model_name(
    processor: &mut ClaudeLogProcessor,
    message: &ClaudeMessage,
    entry_index_provider: &EntryIndexProvider,
) -> Option<json_patch::Patch> {
    if processor.model_name.is_none()
        && let Some(model) = message.model.as_ref()
    {
        processor.model_name = Some(model.clone());
        let entry = NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::SystemMessage,
            content: format!("System initialized with model: {model}"),
            metadata: None,
        };
        let id = entry_index_provider.next();
        Some(ConversationPatch::add_normalized_entry(id, entry))
    } else {
        None
    }
}

struct StreamingMessageState {
    role: String,
    contents: HashMap<usize, StreamingContentState>,
}

impl StreamingMessageState {
    fn new(role: String) -> Self {
        Self {
            role,
            contents: HashMap::new(),
        }
    }

    fn content_block_start(&mut self, index: usize, content_block: ClaudeContentItem) {
        if let Some(state) = StreamingContentState::from_content_block(content_block) {
            self.contents.insert(index, state);
        }
    }

    fn apply_content_block_delta(
        &mut self,
        index: usize,
        delta: &ClaudeContentBlockDelta,
        worktree_path: &str,
        entry_index_provider: &EntryIndexProvider,
    ) -> Option<json_patch::Patch> {
        if let std::collections::hash_map::Entry::Vacant(e) = self.contents.entry(index) {
            let new_state = StreamingContentState::from_delta(delta)?;
            e.insert(new_state);
        }

        let entry_state = self.contents.get_mut(&index)?;
        entry_state.apply_content_delta(delta);

        let content_item = entry_state.to_content_item();
        let entry = ClaudeLogProcessor::content_item_to_normalized_entry(
            &content_item,
            &self.role,
            worktree_path,
        )?;

        if let Some(existing_index) = entry_state.entry_index {
            Some(ConversationPatch::replace(existing_index, entry))
        } else {
            let entry_index = entry_index_provider.next();
            entry_state.entry_index = Some(entry_index);
            Some(ConversationPatch::add_normalized_entry(entry_index, entry))
        }
    }

    fn content_entry_index(&self, content_index: usize) -> Option<usize> {
        self.contents
            .get(&content_index)
            .and_then(|s| s.entry_index)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum StreamingContentKind {
    Text,
    Thinking,
}

struct StreamingContentState {
    kind: StreamingContentKind,
    buffer: String,
    entry_index: Option<usize>,
}

impl StreamingContentState {
    fn from_content_block(content_block: ClaudeContentItem) -> Option<Self> {
        match content_block {
            ClaudeContentItem::Text { text } => Some(Self {
                kind: StreamingContentKind::Text,
                buffer: text,
                entry_index: None,
            }),
            ClaudeContentItem::Thinking { thinking } => Some(Self {
                kind: StreamingContentKind::Thinking,
                buffer: thinking,
                entry_index: None,
            }),
            _ => None,
        }
    }

    fn from_delta(delta: &ClaudeContentBlockDelta) -> Option<Self> {
        match delta {
            ClaudeContentBlockDelta::TextDelta { .. } => Some(Self {
                kind: StreamingContentKind::Text,
                buffer: String::new(),
                entry_index: None,
            }),
            ClaudeContentBlockDelta::ThinkingDelta { .. } => Some(Self {
                kind: StreamingContentKind::Thinking,
                buffer: String::new(),
                entry_index: None,
            }),
            _ => None,
        }
    }

    fn apply_content_delta(&mut self, delta: &ClaudeContentBlockDelta) {
        match (self.kind, delta) {
            (StreamingContentKind::Text, ClaudeContentBlockDelta::TextDelta { text }) => {
                self.buffer.push_str(text);
            }
            (
                StreamingContentKind::Thinking,
                ClaudeContentBlockDelta::ThinkingDelta { thinking },
            ) => {
                self.buffer.push_str(thinking);
            }
            _ => {
                tracing::warn!(
                    "Mismatched content types: delta {:?}, kind {:?}",
                    delta,
                    self.kind
                );
            }
        }
    }

    fn to_content_item(&self) -> ClaudeContentItem {
        match self.kind {
            StreamingContentKind::Text => ClaudeContentItem::Text {
                text: self.buffer.clone(),
            },
            StreamingContentKind::Thinking => ClaudeContentItem::Thinking {
                thinking: self.buffer.clone(),
            },
        }
    }
}

// Data structures for parsing Claude's JSON output format
#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum ClaudeJson {
    #[serde(rename = "system")]
    System {
        subtype: Option<String>,
        session_id: Option<String>,
        cwd: Option<String>,
        tools: Option<Vec<serde_json::Value>>,
        model: Option<String>,
        #[serde(default, rename = "apiKeySource")]
        api_key_source: Option<String>,
    },
    #[serde(rename = "assistant")]
    Assistant {
        message: ClaudeMessage,
        session_id: Option<String>,
    },
    #[serde(rename = "user")]
    User {
        message: ClaudeMessage,
        session_id: Option<String>,
    },
    #[serde(rename = "tool_use")]
    ToolUse {
        tool_name: String,
        #[serde(flatten)]
        tool_data: ClaudeToolData,
        session_id: Option<String>,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        result: serde_json::Value,
        is_error: Option<bool>,
        session_id: Option<String>,
    },
    #[serde(rename = "stream_event")]
    StreamEvent {
        event: ClaudeStreamEvent,
        #[serde(default)]
        session_id: Option<String>,
        #[serde(default)]
        parent_tool_use_id: Option<String>,
        #[serde(default)]
        uuid: Option<String>,
    },
    #[serde(rename = "result")]
    Result {
        #[serde(default)]
        subtype: Option<String>,
        #[serde(default, alias = "isError")]
        is_error: Option<bool>,
        #[serde(default, alias = "durationMs")]
        duration_ms: Option<u64>,
        #[serde(default)]
        result: Option<serde_json::Value>,
        #[serde(default)]
        error: Option<String>,
        #[serde(default, alias = "numTurns")]
        num_turns: Option<u32>,
        #[serde(default, alias = "sessionId")]
        session_id: Option<String>,
    },
    #[serde(rename = "approval_response")]
    ApprovalResponse {
        call_id: String,
        tool_name: String,
        approval_status: ApprovalStatus,
    },
    // Catch-all for unknown message types
    #[serde(untagged)]
    Unknown {
        #[serde(flatten)]
        data: HashMap<String, serde_json::Value>,
    },
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct ClaudeMessage {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub message_type: Option<String>,
    pub role: String,
    pub model: Option<String>,
    pub content: Vec<ClaudeContentItem>,
    pub stop_reason: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum ClaudeContentItem {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "thinking")]
    Thinking { thinking: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        #[serde(flatten)]
        tool_data: ClaudeToolData,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: serde_json::Value,
        is_error: Option<bool>,
    },
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum ClaudeStreamEvent {
    #[serde(rename = "message_start")]
    MessageStart { message: ClaudeMessage },
    #[serde(rename = "content_block_start")]
    ContentBlockStart {
        index: usize,
        content_block: ClaudeContentItem,
    },
    #[serde(rename = "content_block_delta")]
    ContentBlockDelta {
        index: usize,
        delta: ClaudeContentBlockDelta,
    },
    #[serde(rename = "content_block_stop")]
    ContentBlockStop { index: usize },
    #[serde(rename = "message_delta")]
    MessageDelta {
        #[serde(default)]
        delta: Option<ClaudeMessageDelta>,
        #[serde(default)]
        usage: Option<ClaudeUsage>,
    },
    #[serde(rename = "message_stop")]
    MessageStop,
    #[serde(other)]
    Unknown,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum ClaudeContentBlockDelta {
    #[serde(rename = "text_delta")]
    TextDelta { text: String },
    #[serde(rename = "thinking_delta")]
    ThinkingDelta { thinking: String },
    #[serde(other)]
    Unknown,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Default)]
pub struct ClaudeMessageDelta {
    #[serde(default)]
    pub stop_reason: Option<String>,
    #[serde(default)]
    pub stop_sequence: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Default)]
pub struct ClaudeUsage {
    #[serde(default)]
    pub input_tokens: Option<u64>,
    #[serde(default)]
    pub output_tokens: Option<u64>,
    #[serde(default, rename = "cache_creation_input_tokens")]
    pub cache_creation_input_tokens: Option<u64>,
    #[serde(default, rename = "cache_read_input_tokens")]
    pub cache_read_input_tokens: Option<u64>,
    #[serde(default)]
    pub service_tier: Option<String>,
}

/// Structured tool data for Claude tools based on real samples
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "name", content = "input")]
pub enum ClaudeToolData {
    #[serde(rename = "TodoWrite", alias = "todo_write")]
    TodoWrite {
        todos: Vec<ClaudeTodoItem>,
    },
    #[serde(rename = "Task", alias = "task")]
    Task {
        subagent_type: Option<String>,
        description: Option<String>,
        prompt: Option<String>,
    },
    #[serde(rename = "Glob", alias = "glob")]
    Glob {
        #[serde(alias = "filePattern")]
        pattern: String,
        #[serde(default)]
        path: Option<String>,
        #[serde(default)]
        limit: Option<u32>,
    },
    #[serde(rename = "LS", alias = "list_directory", alias = "ls")]
    LS {
        path: String,
    },
    #[serde(rename = "Read", alias = "read")]
    Read {
        #[serde(alias = "path")]
        file_path: String,
    },
    #[serde(rename = "Bash", alias = "bash")]
    Bash {
        #[serde(alias = "cmd", alias = "command_line")]
        command: String,
        #[serde(default)]
        description: Option<String>,
    },
    #[serde(rename = "Grep", alias = "grep")]
    Grep {
        pattern: String,
        #[serde(default)]
        output_mode: Option<String>,
        #[serde(default)]
        path: Option<String>,
    },
    ExitPlanMode {
        plan: String,
    },
    #[serde(rename = "Edit", alias = "edit_file")]
    Edit {
        #[serde(alias = "path")]
        file_path: String,
        #[serde(alias = "old_str")]
        old_string: Option<String>,
        #[serde(alias = "new_str")]
        new_string: Option<String>,
    },
    #[serde(rename = "MultiEdit", alias = "multi_edit")]
    MultiEdit {
        #[serde(alias = "path")]
        file_path: String,
        edits: Vec<ClaudeEditItem>,
    },
    #[serde(rename = "Write", alias = "create_file", alias = "write_file")]
    Write {
        #[serde(alias = "path")]
        file_path: String,
        content: String,
    },
    #[serde(rename = "NotebookEdit", alias = "notebook_edit")]
    NotebookEdit {
        notebook_path: String,
        new_source: String,
        edit_mode: String,
        #[serde(default)]
        cell_id: Option<String>,
    },
    #[serde(rename = "WebFetch", alias = "read_web_page")]
    WebFetch {
        url: String,
        #[serde(default)]
        prompt: Option<String>,
    },
    #[serde(rename = "WebSearch", alias = "web_search")]
    WebSearch {
        query: String,
        #[serde(default)]
        num_results: Option<u32>,
    },
    // Amp-only utilities for better UX
    #[serde(rename = "Oracle", alias = "oracle")]
    Oracle {
        #[serde(default)]
        task: Option<String>,
        #[serde(default)]
        files: Option<Vec<String>>,
        #[serde(default)]
        context: Option<String>,
    },
    #[serde(rename = "Mermaid", alias = "mermaid")]
    Mermaid {
        code: String,
    },
    #[serde(rename = "CodebaseSearchAgent", alias = "codebase_search_agent")]
    CodebaseSearchAgent {
        #[serde(default)]
        query: Option<String>,
        #[serde(default)]
        path: Option<String>,
        #[serde(default)]
        include: Option<Vec<String>>,
        #[serde(default)]
        exclude: Option<Vec<String>>,
        #[serde(default)]
        limit: Option<u32>,
    },
    #[serde(rename = "UndoEdit", alias = "undo_edit")]
    UndoEdit {
        #[serde(default, alias = "file_path")]
        path: Option<String>,
        #[serde(default)]
        steps: Option<u32>,
    },
    #[serde(rename = "TodoRead", alias = "todo_read")]
    TodoRead {},
    #[serde(untagged)]
    Unknown {
        #[serde(flatten)]
        data: std::collections::HashMap<String, serde_json::Value>,
    },
}

// Helper structs for parsing tool_result content and generic tool input
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
struct ClaudeToolResultTextItem {
    text: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
struct ClaudeToolWithInput {
    #[serde(default)]
    input: serde_json::Value,
}

// Amp's claude-compatible Bash tool_result content format
// Example content (often delivered as a JSON string):
//   {"output":"...","exitCode":0}
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
struct AmpBashResult {
    #[serde(default)]
    output: String,
    #[serde(rename = "exitCode")]
    exit_code: i32,
}

#[derive(Debug, Clone)]
struct ClaudeToolCallInfo {
    entry_index: usize,
    tool_name: String,
    tool_data: ClaudeToolData,
    content: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct ClaudeTodoItem {
    #[serde(default)]
    pub id: Option<String>,
    pub content: String,
    pub status: String,
    #[serde(default)]
    pub priority: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct ClaudeEditItem {
    pub old_string: Option<String>,
    pub new_string: Option<String>,
}

impl ClaudeToolData {
    pub fn get_name(&self) -> &str {
        match self {
            ClaudeToolData::TodoWrite { .. } => "TodoWrite",
            ClaudeToolData::Task { .. } => "Task",
            ClaudeToolData::Glob { .. } => "Glob",
            ClaudeToolData::LS { .. } => "LS",
            ClaudeToolData::Read { .. } => "Read",
            ClaudeToolData::Bash { .. } => "Bash",
            ClaudeToolData::Grep { .. } => "Grep",
            ClaudeToolData::ExitPlanMode { .. } => "ExitPlanMode",
            ClaudeToolData::Edit { .. } => "Edit",
            ClaudeToolData::MultiEdit { .. } => "MultiEdit",
            ClaudeToolData::Write { .. } => "Write",
            ClaudeToolData::NotebookEdit { .. } => "NotebookEdit",
            ClaudeToolData::WebFetch { .. } => "WebFetch",
            ClaudeToolData::WebSearch { .. } => "WebSearch",
            ClaudeToolData::TodoRead { .. } => "TodoRead",
            ClaudeToolData::Oracle { .. } => "Oracle",
            ClaudeToolData::Mermaid { .. } => "Mermaid",
            ClaudeToolData::CodebaseSearchAgent { .. } => "CodebaseSearchAgent",
            ClaudeToolData::UndoEdit { .. } => "UndoEdit",
            ClaudeToolData::Unknown { data } => data
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::logs::utils::{EntryIndexProvider, patch::extract_normalized_entry_from_patch};

    fn patches_to_entries(patches: &[json_patch::Patch]) -> Vec<NormalizedEntry> {
        patches
            .iter()
            .filter_map(|patch| extract_normalized_entry_from_patch(patch).map(|(_, entry)| entry))
            .collect()
    }

    fn normalize_helper(
        processor: &mut ClaudeLogProcessor,
        json: &ClaudeJson,
        worktree: &str,
    ) -> Vec<NormalizedEntry> {
        let provider = EntryIndexProvider::test_new();
        let patches = processor.normalize_entries(json, worktree, &provider);
        patches_to_entries(&patches)
    }

    fn normalize(json: &ClaudeJson, worktree: &str) -> Vec<NormalizedEntry> {
        let mut processor = ClaudeLogProcessor::new();
        normalize_helper(&mut processor, json, worktree)
    }

    #[test]
    fn test_claude_json_parsing() {
        let system_json =
            r#"{"type":"system","subtype":"init","session_id":"abc123","model":"claude-sonnet-4"}"#;
        let parsed: ClaudeJson = serde_json::from_str(system_json).unwrap();

        // System messages no longer extract session_id
        assert_eq!(ClaudeLogProcessor::extract_session_id(&parsed), None);

        let entries = normalize(&parsed, "");
        assert_eq!(entries.len(), 0);

        let assistant_json = r#"
        {"type":"assistant","message":{"type":"message","role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"text","text":"Hi! I'm Claude Code."}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(assistant_json).unwrap();
        let entries = normalize(&parsed, "");

        assert_eq!(entries.len(), 2);
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::SystemMessage
        ));
        assert_eq!(
            entries[0].content,
            "System initialized with model: claude-sonnet-4-20250514"
        );
    }

    #[test]
    fn test_assistant_message_parsing() {
        let assistant_json = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello world"}]},"session_id":"abc123"}"#;
        let parsed: ClaudeJson = serde_json::from_str(assistant_json).unwrap();

        let entries = normalize(&parsed, "");
        assert_eq!(entries.len(), 1);
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::AssistantMessage
        ));
        assert_eq!(entries[0].content, "Hello world");
    }

    #[test]
    fn test_result_message_ignored() {
        let result_json = r#"{"type":"result","subtype":"success","is_error":false,"duration_ms":6059,"result":"Final result"}"#;
        let parsed: ClaudeJson = serde_json::from_str(result_json).unwrap();

        let entries = normalize(&parsed, "");
        assert_eq!(entries.len(), 0); // Should be ignored like in old implementation
    }

    #[test]
    fn test_thinking_content() {
        let thinking_json = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"Let me think about this..."}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(thinking_json).unwrap();

        let entries = normalize(&parsed, "");
        assert_eq!(entries.len(), 1);
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::Thinking
        ));
        assert_eq!(entries[0].content, "Let me think about this...");
    }

    #[test]
    fn test_todo_tool_empty_list() {
        // Test TodoWrite with empty todo list
        let empty_data = ClaudeToolData::TodoWrite { todos: vec![] };

        let action_type =
            ClaudeLogProcessor::extract_action_type(&empty_data, "/tmp/test-worktree");
        let result = ClaudeLogProcessor::generate_concise_content(
            &empty_data,
            &action_type,
            "/tmp/test-worktree",
        );

        assert_eq!(result, "TODO list updated");
    }

    #[test]
    fn test_glob_tool_content_extraction() {
        // Test Glob with pattern and path
        let glob_data = ClaudeToolData::Glob {
            pattern: "**/*.ts".to_string(),
            path: Some("/tmp/test-worktree/src".to_string()),
            limit: None,
        };

        let action_type = ClaudeLogProcessor::extract_action_type(&glob_data, "/tmp/test-worktree");
        let result = ClaudeLogProcessor::generate_concise_content(
            &glob_data,
            &action_type,
            "/tmp/test-worktree",
        );

        assert_eq!(result, "**/*.ts");
    }

    #[test]
    fn test_glob_tool_pattern_only() {
        // Test Glob with pattern only
        let glob_data = ClaudeToolData::Glob {
            pattern: "*.js".to_string(),
            path: None,
            limit: None,
        };

        let action_type = ClaudeLogProcessor::extract_action_type(&glob_data, "/tmp/test-worktree");
        let result = ClaudeLogProcessor::generate_concise_content(
            &glob_data,
            &action_type,
            "/tmp/test-worktree",
        );

        assert_eq!(result, "*.js");
    }

    #[test]
    fn test_ls_tool_content_extraction() {
        // Test LS with path
        let ls_data = ClaudeToolData::LS {
            path: "/tmp/test-worktree/components".to_string(),
        };

        let action_type = ClaudeLogProcessor::extract_action_type(&ls_data, "/tmp/test-worktree");
        let result = ClaudeLogProcessor::generate_concise_content(
            &ls_data,
            &action_type,
            "/tmp/test-worktree",
        );

        assert_eq!(result, "List directory: components");
    }

    #[test]
    fn test_path_relative_conversion() {
        // Test with relative path (should remain unchanged)
        let relative_result = make_path_relative("src/main.rs", "/tmp/test-worktree");
        assert_eq!(relative_result, "src/main.rs");

        // Test with absolute path (should become relative if possible)
        let test_worktree = "/tmp/test-worktree";
        let absolute_path = format!("{test_worktree}/src/main.rs");
        let absolute_result = make_path_relative(&absolute_path, test_worktree);
        assert_eq!(absolute_result, "src/main.rs");
    }

    #[tokio::test]
    async fn test_streaming_patch_generation() {
        use std::sync::Arc;

        use workspace_utils::msg_store::MsgStore;

        let executor = ClaudeCode {
            claude_code_router: Some(false),
            plan: None,
            approvals: None,
            model: None,
            append_prompt: AppendPrompt::default(),
            dangerously_skip_permissions: None,
            settings: None,
            cmd: crate::command::CmdOverrides {
                base_command_override: None,
                additional_params: None,
                env: None,
            },
            approvals_service: None,
            disable_api_key: None,
        };
        let msg_store = Arc::new(MsgStore::new());
        let current_dir = std::path::PathBuf::from("/tmp/test-worktree");

        // Push some test messages
        msg_store.push_stdout(
            r#"{"type":"system","subtype":"init","session_id":"test123"}"#.to_string(),
        );
        msg_store.push_stdout(r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}]}}"#.to_string());
        msg_store.push_finished();

        // Start normalization (this spawns async task)
        executor.normalize_logs(msg_store.clone(), &current_dir);

        // Give some time for async processing
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Check that the history now contains patch messages
        let history = msg_store.get_history();
        let patch_count = history
            .iter()
            .filter(|msg| matches!(msg, workspace_utils::log_msg::LogMsg::JsonPatch(_)))
            .count();
        assert!(
            patch_count > 0,
            "Expected JsonPatch messages to be generated from streaming processing"
        );
    }

    #[test]
    fn test_session_id_extraction() {
        let system_json = r#"{"type":"system","session_id":"test-session-123"}"#;
        let parsed: ClaudeJson = serde_json::from_str(system_json).unwrap();

        // System messages no longer extract session_id
        assert_eq!(ClaudeLogProcessor::extract_session_id(&parsed), None);

        let tool_use_json =
            r#"{"type":"tool_use","tool_name":"read","input":{},"session_id":"another-session"}"#;
        let parsed_tool: ClaudeJson = serde_json::from_str(tool_use_json).unwrap();

        assert_eq!(
            ClaudeLogProcessor::extract_session_id(&parsed_tool),
            Some("another-session".to_string())
        );
    }

    #[test]
    fn test_amp_tool_aliases_create_file_and_edit_file() {
        // Amp "create_file" should deserialize into Write with alias field "path"
        let assistant_with_create = r#"{
            "type":"assistant",
            "message":{
                "role":"assistant",
                "content":[
                    {"type":"tool_use","id":"t1","name":"create_file","input":{"path":"/tmp/work/src/new.txt","content":"hello"}}
                ]
            }
        }"#;
        let parsed: ClaudeJson = serde_json::from_str(assistant_with_create).unwrap();
        let entries = normalize(&parsed, "/tmp/work");
        assert_eq!(entries.len(), 1);
        match &entries[0].entry_type {
            NormalizedEntryType::ToolUse { action_type, .. } => match action_type {
                ActionType::FileEdit { path, .. } => assert_eq!(path, "src/new.txt"),
                other => panic!("Expected FileEdit, got {other:?}"),
            },
            other => panic!("Expected ToolUse, got {other:?}"),
        }

        // Amp "edit_file" should deserialize into Edit with aliases for path/old_str/new_str
        let assistant_with_edit = r#"{
            "type":"assistant",
            "message":{
                "role":"assistant",
                "content":[
                    {"type":"tool_use","id":"t2","name":"edit_file","input":{"path":"/tmp/work/README.md","old_str":"foo","new_str":"bar"}}
                ]
            }
        }"#;
        let parsed_edit: ClaudeJson = serde_json::from_str(assistant_with_edit).unwrap();
        let entries = normalize(&parsed_edit, "/tmp/work");
        assert_eq!(entries.len(), 1);
        match &entries[0].entry_type {
            NormalizedEntryType::ToolUse { action_type, .. } => match action_type {
                ActionType::FileEdit { path, .. } => assert_eq!(path, "README.md"),
                other => panic!("Expected FileEdit, got {other:?}"),
            },
            other => panic!("Expected ToolUse, got {other:?}"),
        }
    }

    #[test]
    fn test_amp_tool_aliases_oracle_mermaid_codebase_undo() {
        // Oracle with task
        let oracle_json = r#"{
            "type":"assistant",
            "message":{
                "role":"assistant",
                "content":[
                    {"type":"tool_use","id":"t1","name":"oracle","input":{"task":"Assess project status"}}
                ]
            }
        }"#;
        let parsed: ClaudeJson = serde_json::from_str(oracle_json).unwrap();
        let entries = normalize(&parsed, "/tmp/work");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].content, "Oracle: `Assess project status`");

        // Mermaid with code
        let mermaid_json = r#"{
            "type":"assistant",
            "message":{
                "role":"assistant",
                "content":[
                    {"type":"tool_use","id":"t2","name":"mermaid","input":{"code":"graph TD; A-->B;"}}
                ]
            }
        }"#;
        let parsed: ClaudeJson = serde_json::from_str(mermaid_json).unwrap();
        let entries = normalize(&parsed, "/tmp/work");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].content, "Mermaid diagram");

        // CodebaseSearchAgent with query
        let csa_json = r#"{
            "type":"assistant",
            "message":{
                "role":"assistant",
                "content":[
                    {"type":"tool_use","id":"t3","name":"codebase_search_agent","input":{"query":"TODO markers"}}
                ]
            }
        }"#;
        let parsed: ClaudeJson = serde_json::from_str(csa_json).unwrap();
        let entries = normalize(&parsed, "/tmp/work");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].content, "Codebase search: `TODO markers`");

        // UndoEdit shows file path when available
        let undo_json = r#"{
            "type":"assistant",
            "message":{
                "role":"assistant",
                "content":[
                    {"type":"tool_use","id":"t4","name":"undo_edit","input":{"path":"README.md"}}
                ]
            }
        }"#;
        let parsed: ClaudeJson = serde_json::from_str(undo_json).unwrap();
        let entries = normalize(&parsed, "/tmp/work");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].content, "Undo edit: `README.md`");
    }

    #[test]
    fn test_amp_bash_and_task_content() {
        // Bash with alias field cmd
        let bash_json = r#"{
            "type":"assistant",
            "message":{
                "role":"assistant",
                "content":[
                    {"type":"tool_use","id":"t1","name":"bash","input":{"cmd":"echo hello"}}
                ]
            }
        }"#;
        let parsed: ClaudeJson = serde_json::from_str(bash_json).unwrap();
        let entries = normalize(&parsed, "/tmp/work");
        assert_eq!(entries.len(), 1);
        // Content should display the command
        assert_eq!(entries[0].content, "echo hello");

        // Task content should include description/prompt wrapped in backticks
        let task_json = r#"{
            "type":"assistant",
            "message":{
                "role":"assistant",
                "content":[
                    {"type":"tool_use","id":"t2","name":"task","input":{"subagent_type":"Task","prompt":"Add header to README"}}
                ]
            }
        }"#;
        let parsed: ClaudeJson = serde_json::from_str(task_json).unwrap();
        let entries = normalize(&parsed, "/tmp/work");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].content, "Task: `Add header to README`");
    }

    #[test]
    fn test_task_description_or_prompt_backticks() {
        // When description present, use it
        let with_desc = r#"{
            "type":"assistant",
            "message":{
                "role":"assistant",
                "content":[
                    {"type":"tool_use","id":"t3","name":"Task","input":{
                        "subagent_type":"Task",
                        "prompt":"Fallback prompt",
                        "description":"Primary description"
                    }}
                ]
            }
        }"#;
        let parsed: ClaudeJson = serde_json::from_str(with_desc).unwrap();
        let entries = normalize(&parsed, "/tmp/work");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].content, "Task: `Primary description`");

        // When description missing, fall back to prompt
        let no_desc = r#"{
            "type":"assistant",
            "message":{
                "role":"assistant",
                "content":[
                    {"type":"tool_use","id":"t4","name":"Task","input":{
                        "subagent_type":"Task",
                        "prompt":"Only prompt"
                    }}
                ]
            }
        }"#;
        let parsed: ClaudeJson = serde_json::from_str(no_desc).unwrap();
        let entries = normalize(&parsed, "/tmp/work");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].content, "Task: `Only prompt`");
    }

    #[test]
    fn test_tool_result_parsing_ignored() {
        let tool_result_json = r#"{"type":"tool_result","result":"File content here","is_error":false,"session_id":"test123"}"#;
        let parsed: ClaudeJson = serde_json::from_str(tool_result_json).unwrap();

        // Test session ID extraction from ToolResult still works
        assert_eq!(
            ClaudeLogProcessor::extract_session_id(&parsed),
            Some("test123".to_string())
        );

        // ToolResult messages should be ignored (produce no entries) until proper support is added
        let entries = normalize(&parsed, "");
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn test_content_item_tool_result_ignored() {
        let assistant_with_tool_result = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_result","tool_use_id":"tool_123","content":"Operation completed","is_error":false}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(assistant_with_tool_result).unwrap();

        // ToolResult content items should be ignored (produce no entries) until proper support is added
        let entries = normalize(&parsed, "");
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn test_api_key_source_warning() {
        // Test with ANTHROPIC_API_KEY - should generate warning
        let system_with_env_key = r#"{"type":"system","subtype":"init","apiKeySource":"ANTHROPIC_API_KEY","session_id":"test123"}"#;
        let parsed: ClaudeJson = serde_json::from_str(system_with_env_key).unwrap();
        let entries = normalize(&parsed, "");

        assert_eq!(entries.len(), 1);
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::ErrorMessage {
                error_type: NormalizedEntryError::Other,
            },
        ));
        assert_eq!(
            entries[0].content,
            "Claude Code + ANTHROPIC_API_KEY detected. Usage will be billed via Anthropic pay-as-you-go instead of your Claude subscription. If this is unintended, please select the `disable_api_key` checkbox in the conding-agent-configurations settings page."
        );

        // Test with managed API key source - should not generate warning
        let system_with_managed_key = r#"{"type":"system","subtype":"init","apiKeySource":"/login managed key","session_id":"test123"}"#;
        let parsed_managed: ClaudeJson = serde_json::from_str(system_with_managed_key).unwrap();
        let entries_managed = normalize(&parsed_managed, "");

        assert_eq!(entries_managed.len(), 0); // No warning for managed key

        // Test with other apiKeySource values - should not generate warning
        let system_other_key = r#"{"type":"system","subtype":"init","apiKeySource":"OTHER_KEY","session_id":"test123"}"#;
        let parsed_other: ClaudeJson = serde_json::from_str(system_other_key).unwrap();
        let entries_other = normalize(&parsed_other, "");

        assert_eq!(entries_other.len(), 0); // No warning for other keys

        // Test with missing apiKeySource - should not generate warning
        let system_no_key = r#"{"type":"system","subtype":"init","session_id":"test123"}"#;
        let parsed_no_key: ClaudeJson = serde_json::from_str(system_no_key).unwrap();
        let entries_no_key = normalize(&parsed_no_key, "");

        assert_eq!(entries_no_key.len(), 0); // No warning when field is missing
    }

    #[test]
    fn test_mixed_content_with_thinking_ignores_tool_result() {
        let complex_assistant_json = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"I need to read the file first"},{"type":"text","text":"I'll help you with that"},{"type":"tool_result","tool_use_id":"tool_789","content":"Success","is_error":false}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(complex_assistant_json).unwrap();

        let entries = normalize(&parsed, "");
        // Only thinking and text entries should be processed, tool_result ignored
        assert_eq!(entries.len(), 2);

        // Check thinking entry
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::Thinking
        ));
        assert_eq!(entries[0].content, "I need to read the file first");

        // Check assistant message
        assert!(matches!(
            entries[1].entry_type,
            NormalizedEntryType::AssistantMessage
        ));
        assert_eq!(entries[1].content, "I'll help you with that");

        // ToolResult entry is ignored - no third entry
    }

    // ==================== Settings Tests ====================

    use super::types::{
        ClaudeCodeHookAction, ClaudeCodeHookEntry, ClaudeCodeHooks, ClaudeCodePermissions,
        ClaudeCodeSettings,
    };
    use tempfile::TempDir;

    #[test]
    fn test_claude_code_settings_deserialization_empty() {
        let json = r#"{}"#;
        let settings: ClaudeCodeSettings = serde_json::from_str(json).unwrap();

        assert!(settings.permissions.is_none());
        assert!(settings.hooks.is_none());
        assert!(settings.max_tokens.is_none());
        assert!(settings.temperature.is_none());
        assert!(settings.system_prompt.is_none());
        assert!(settings.env.is_none());
    }

    #[test]
    fn test_claude_code_settings_deserialization_with_permissions() {
        let json = r#"{
            "permissions": {
                "allowedTools": ["Read", "Write", "Bash(git *)"],
                "deny": ["Bash(rm *)", "Read(.env*)"]
            }
        }"#;
        let settings: ClaudeCodeSettings = serde_json::from_str(json).unwrap();

        let permissions = settings.permissions.unwrap();
        let allowed = permissions.allowed_tools.unwrap();
        let denied = permissions.deny.unwrap();

        assert_eq!(allowed.len(), 3);
        assert_eq!(allowed[0], "Read");
        assert_eq!(allowed[1], "Write");
        assert_eq!(allowed[2], "Bash(git *)");

        assert_eq!(denied.len(), 2);
        assert_eq!(denied[0], "Bash(rm *)");
        assert_eq!(denied[1], "Read(.env*)");
    }

    #[test]
    fn test_claude_code_settings_deserialization_with_hooks() {
        let json = r#"{
            "hooks": {
                "PostToolUse": [
                    {
                        "matcher": "Write(*.py)",
                        "hooks": [
                            { "type": "command", "command": "python -m black $file" }
                        ]
                    }
                ],
                "PreToolUse": [
                    {
                        "matcher": "Bash(rm *)",
                        "hookCallbackIds": ["block_dangerous"]
                    }
                ]
            }
        }"#;
        let settings: ClaudeCodeSettings = serde_json::from_str(json).unwrap();

        let hooks = settings.hooks.unwrap();

        // Check PostToolUse
        let post_hooks = hooks.post_tool_use.unwrap();
        assert_eq!(post_hooks.len(), 1);
        assert_eq!(post_hooks[0].matcher, Some("Write(*.py)".to_string()));
        let actions = post_hooks[0].hooks.as_ref().unwrap();
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "command");
        assert_eq!(actions[0].command, "python -m black $file");

        // Check PreToolUse
        let pre_hooks = hooks.pre_tool_use.unwrap();
        assert_eq!(pre_hooks.len(), 1);
        assert_eq!(pre_hooks[0].matcher, Some("Bash(rm *)".to_string()));
        let callback_ids = pre_hooks[0].hook_callback_ids.as_ref().unwrap();
        assert_eq!(callback_ids.len(), 1);
        assert_eq!(callback_ids[0], "block_dangerous");
    }

    #[test]
    fn test_claude_code_settings_deserialization_full() {
        let json = r#"{
            "permissions": {
                "allowedTools": ["Read", "Glob"],
                "deny": ["Bash(sudo *)"],
                "defaultMode": "plan"
            },
            "hooks": {
                "PostToolUse": [
                    {
                        "matcher": "Write(*.ts)",
                        "hooks": [{ "type": "command", "command": "npx prettier --write $file" }]
                    }
                ]
            },
            "maxTokens": 4096,
            "temperature": 0.7,
            "systemPrompt": "You are a helpful coding assistant."
        }"#;
        let settings: ClaudeCodeSettings = serde_json::from_str(json).unwrap();

        assert_eq!(settings.max_tokens, Some(4096));
        assert_eq!(settings.temperature, Some(0.7));
        assert_eq!(
            settings.system_prompt,
            Some("You are a helpful coding assistant.".to_string())
        );

        let permissions = settings.permissions.unwrap();
        assert_eq!(permissions.default_mode, Some("plan".to_string()));
    }

    #[test]
    fn test_claude_code_struct_with_settings_deserialization() {
        let json = r#"{
            "model": "opus",
            "dangerously_skip_permissions": false,
            "settings": {
                "permissions": {
                    "allowedTools": ["Read", "Write"],
                    "deny": ["Bash(rm *)"]
                }
            }
        }"#;
        let claude_code: ClaudeCode = serde_json::from_str(json).unwrap();

        assert_eq!(claude_code.model, Some("opus".to_string()));
        assert_eq!(claude_code.dangerously_skip_permissions, Some(false));

        let settings = claude_code.settings.unwrap();
        let permissions = settings.permissions.unwrap();
        let allowed = permissions.allowed_tools.unwrap();
        assert_eq!(allowed.len(), 2);
        assert_eq!(allowed[0], "Read");
        assert_eq!(allowed[1], "Write");
    }

    #[test]
    fn test_claude_code_struct_serialization_roundtrip() {
        let settings = ClaudeCodeSettings {
            permissions: Some(ClaudeCodePermissions {
                allowed_tools: Some(vec![
                    "Read".to_string(),
                    "Write".to_string(),
                    "Bash(git *)".to_string(),
                ]),
                deny: Some(vec!["Bash(rm *)".to_string()]),
                default_mode: None,
            }),
            hooks: Some(ClaudeCodeHooks {
                pre_tool_use: None,
                post_tool_use: Some(vec![ClaudeCodeHookEntry {
                    matcher: Some("Write(*.py)".to_string()),
                    hooks: Some(vec![ClaudeCodeHookAction {
                        action_type: "command".to_string(),
                        command: "black $file".to_string(),
                    }]),
                    hook_callback_ids: None,
                }]),
                user_prompt_submit: None,
                session_start: None,
                session_end: None,
                stop: None,
            }),
            max_tokens: Some(8192),
            temperature: Some(0.5),
            system_prompt: None,
            env: None,
        };

        let claude_code = ClaudeCode {
            append_prompt: AppendPrompt::default(),
            claude_code_router: None,
            plan: None,
            approvals: None,
            model: Some("sonnet".to_string()),
            dangerously_skip_permissions: Some(true),
            disable_api_key: None,
            settings: Some(settings),
            cmd: crate::command::CmdOverrides {
                base_command_override: None,
                additional_params: None,
                env: None,
            },
            approvals_service: None,
        };

        // Serialize
        let json = serde_json::to_string(&claude_code).unwrap();

        // Deserialize back
        let deserialized: ClaudeCode = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.model, Some("sonnet".to_string()));
        assert_eq!(deserialized.dangerously_skip_permissions, Some(true));

        let settings = deserialized.settings.unwrap();
        assert_eq!(settings.max_tokens, Some(8192));
        assert_eq!(settings.temperature, Some(0.5));

        let permissions = settings.permissions.unwrap();
        let allowed = permissions.allowed_tools.unwrap();
        assert_eq!(allowed.len(), 3);
        assert!(allowed.contains(&"Read".to_string()));
        assert!(allowed.contains(&"Write".to_string()));
        assert!(allowed.contains(&"Bash(git *)".to_string()));

        let hooks = settings.hooks.unwrap();
        let post_hooks = hooks.post_tool_use.unwrap();
        assert_eq!(post_hooks.len(), 1);
        assert_eq!(post_hooks[0].matcher, Some("Write(*.py)".to_string()));
    }

    #[test]
    fn test_write_settings_file_creates_directory_and_file() {
        let temp_dir = TempDir::new().unwrap();
        let work_dir = temp_dir.path();

        let settings = ClaudeCodeSettings {
            permissions: Some(ClaudeCodePermissions {
                allowed_tools: Some(vec!["Read".to_string(), "Write".to_string()]),
                deny: Some(vec!["Bash(rm *)".to_string()]),
                default_mode: None,
            }),
            hooks: None,
            max_tokens: Some(4096),
            temperature: None,
            system_prompt: None,
            env: None,
        };

        let claude_code = ClaudeCode {
            append_prompt: AppendPrompt::default(),
            claude_code_router: None,
            plan: None,
            approvals: None,
            model: None,
            dangerously_skip_permissions: None,
            disable_api_key: None,
            settings: Some(settings),
            cmd: crate::command::CmdOverrides::default(),
            approvals_service: None,
        };

        // Write settings
        claude_code.write_settings_file(work_dir).unwrap();

        // Check .claude directory exists
        let claude_dir = work_dir.join(".claude");
        assert!(claude_dir.exists());
        assert!(claude_dir.is_dir());

        // Check settings.local.json exists
        let settings_file = claude_dir.join("settings.local.json");
        assert!(settings_file.exists());
        assert!(settings_file.is_file());

        // Read and verify contents
        let contents = std::fs::read_to_string(&settings_file).unwrap();
        let parsed: ClaudeCodeSettings = serde_json::from_str(&contents).unwrap();

        assert_eq!(parsed.max_tokens, Some(4096));
        let permissions = parsed.permissions.unwrap();
        let allowed = permissions.allowed_tools.unwrap();
        assert_eq!(allowed.len(), 2);
        assert!(allowed.contains(&"Read".to_string()));
        assert!(allowed.contains(&"Write".to_string()));
    }

    #[test]
    fn test_write_settings_file_no_op_when_settings_none() {
        let temp_dir = TempDir::new().unwrap();
        let work_dir = temp_dir.path();

        let claude_code = ClaudeCode {
            append_prompt: AppendPrompt::default(),
            claude_code_router: None,
            plan: None,
            approvals: None,
            model: None,
            dangerously_skip_permissions: None,
            disable_api_key: None,
            settings: None, // No settings
            cmd: crate::command::CmdOverrides::default(),
            approvals_service: None,
        };

        // Write settings (should be no-op)
        claude_code.write_settings_file(work_dir).unwrap();

        // Check .claude directory does NOT exist
        let claude_dir = work_dir.join(".claude");
        assert!(!claude_dir.exists());
    }

    #[test]
    fn test_write_settings_file_with_hooks() {
        let temp_dir = TempDir::new().unwrap();
        let work_dir = temp_dir.path();

        let settings = ClaudeCodeSettings {
            permissions: None,
            hooks: Some(ClaudeCodeHooks {
                pre_tool_use: Some(vec![ClaudeCodeHookEntry {
                    matcher: Some("Bash(rm *)".to_string()),
                    hooks: None,
                    hook_callback_ids: Some(vec!["block_dangerous".to_string()]),
                }]),
                post_tool_use: Some(vec![ClaudeCodeHookEntry {
                    matcher: Some("Write(*.py)".to_string()),
                    hooks: Some(vec![ClaudeCodeHookAction {
                        action_type: "command".to_string(),
                        command: "python -m black $file".to_string(),
                    }]),
                    hook_callback_ids: None,
                }]),
                user_prompt_submit: None,
                session_start: None,
                session_end: None,
                stop: None,
            }),
            max_tokens: None,
            temperature: None,
            system_prompt: None,
            env: None,
        };

        let claude_code = ClaudeCode {
            append_prompt: AppendPrompt::default(),
            claude_code_router: None,
            plan: None,
            approvals: None,
            model: None,
            dangerously_skip_permissions: None,
            disable_api_key: None,
            settings: Some(settings),
            cmd: crate::command::CmdOverrides::default(),
            approvals_service: None,
        };

        // Write settings
        claude_code.write_settings_file(work_dir).unwrap();

        // Read and verify contents
        let settings_file = work_dir.join(".claude/settings.local.json");
        let contents = std::fs::read_to_string(&settings_file).unwrap();
        let parsed: ClaudeCodeSettings = serde_json::from_str(&contents).unwrap();

        let hooks = parsed.hooks.unwrap();

        // Check PreToolUse hook
        let pre_hooks = hooks.pre_tool_use.unwrap();
        assert_eq!(pre_hooks.len(), 1);
        assert_eq!(pre_hooks[0].matcher, Some("Bash(rm *)".to_string()));
        let callback_ids = pre_hooks[0].hook_callback_ids.as_ref().unwrap();
        assert_eq!(callback_ids[0], "block_dangerous");

        // Check PostToolUse hook
        let post_hooks = hooks.post_tool_use.unwrap();
        assert_eq!(post_hooks.len(), 1);
        assert_eq!(post_hooks[0].matcher, Some("Write(*.py)".to_string()));
        let actions = post_hooks[0].hooks.as_ref().unwrap();
        assert_eq!(actions[0].command, "python -m black $file");
    }

    #[test]
    fn test_default_profiles_json_parsing() {
        // Test that our default profiles with settings can be parsed
        let profiles_json = r#"{
            "executors": {
                "CLAUDE_CODE": {
                    "SAFE": {
                        "CLAUDE_CODE": {
                            "dangerously_skip_permissions": false,
                            "settings": {
                                "permissions": {
                                    "allowedTools": ["Read", "Glob", "Grep", "Task", "TodoWrite"],
                                    "deny": ["Bash(rm *)", "Bash(sudo *)", "Read(.env*)"]
                                }
                            }
                        }
                    },
                    "DEV_WITH_HOOKS": {
                        "CLAUDE_CODE": {
                            "dangerously_skip_permissions": true,
                            "settings": {
                                "permissions": {
                                    "allowedTools": ["Read", "Write", "Edit", "Bash(git *)", "Bash(npm *)"]
                                },
                                "hooks": {
                                    "PostToolUse": [
                                        {
                                            "matcher": "Write(*.py)",
                                            "hooks": [{ "type": "command", "command": "python -m black $file" }]
                                        },
                                        {
                                            "matcher": "Write(*.ts)",
                                            "hooks": [{ "type": "command", "command": "npx prettier --write $file" }]
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            }
        }"#;

        // Parse the JSON structure
        let parsed: serde_json::Value = serde_json::from_str(profiles_json).unwrap();

        // Extract SAFE profile
        let safe_profile = &parsed["executors"]["CLAUDE_CODE"]["SAFE"]["CLAUDE_CODE"];
        let safe_claude: ClaudeCode = serde_json::from_value(safe_profile.clone()).unwrap();

        assert_eq!(safe_claude.dangerously_skip_permissions, Some(false));
        let safe_settings = safe_claude.settings.unwrap();
        let safe_permissions = safe_settings.permissions.unwrap();
        let safe_allowed = safe_permissions.allowed_tools.unwrap();
        assert_eq!(safe_allowed.len(), 5);
        assert!(safe_allowed.contains(&"Read".to_string()));
        assert!(safe_allowed.contains(&"TodoWrite".to_string()));

        let safe_denied = safe_permissions.deny.unwrap();
        assert_eq!(safe_denied.len(), 3);
        assert!(safe_denied.contains(&"Bash(rm *)".to_string()));
        assert!(safe_denied.contains(&"Read(.env*)".to_string()));

        // Extract DEV_WITH_HOOKS profile
        let dev_profile = &parsed["executors"]["CLAUDE_CODE"]["DEV_WITH_HOOKS"]["CLAUDE_CODE"];
        let dev_claude: ClaudeCode = serde_json::from_value(dev_profile.clone()).unwrap();

        assert_eq!(dev_claude.dangerously_skip_permissions, Some(true));
        let dev_settings = dev_claude.settings.unwrap();
        let dev_hooks = dev_settings.hooks.unwrap();
        let post_hooks = dev_hooks.post_tool_use.unwrap();
        assert_eq!(post_hooks.len(), 2);

        // Check Python formatter hook
        assert_eq!(post_hooks[0].matcher, Some("Write(*.py)".to_string()));
        let py_actions = post_hooks[0].hooks.as_ref().unwrap();
        assert_eq!(py_actions[0].command, "python -m black $file");

        // Check TypeScript formatter hook
        assert_eq!(post_hooks[1].matcher, Some("Write(*.ts)".to_string()));
        let ts_actions = post_hooks[1].hooks.as_ref().unwrap();
        assert_eq!(ts_actions[0].command, "npx prettier --write $file");
    }
}
