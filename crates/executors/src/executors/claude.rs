use std::{path::PathBuf, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use utils::{
    diff::{concatenate_diff_hunks, create_unified_diff, create_unified_diff_hunk},
    log_msg::LogMsg,
    msg_store::MsgStore,
    path::make_path_relative,
    shell::get_shell_command,
};

use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{ExecutorError, StandardCodingAgentExecutor},
    logs::{
        ActionType, FileChange, NormalizedEntry, NormalizedEntryType, TodoItem,
        stderr_processor::normalize_stderr_logs,
        utils::{EntryIndexProvider, patch::ConversationPatch},
    },
};

fn base_command(claude_code_router: bool) -> &'static str {
    if claude_code_router {
        "npx -y @musistudio/claude-code-router code"
    } else {
        "npx -y @anthropic-ai/claude-code@latest"
    }
}

fn build_command_builder(
    claude_code_router: bool,
    plan: bool,
    dangerously_skip_permissions: bool,
) -> CommandBuilder {
    let mut params: Vec<&'static str> = vec!["-p"];
    if plan {
        params.push("--permission-mode=plan");
    }
    if dangerously_skip_permissions {
        params.push("--dangerously-skip-permissions");
    }
    params.extend_from_slice(&["--verbose", "--output-format=stream-json"]);

    CommandBuilder::new(base_command(claude_code_router)).params(params)
}

/// An executor that uses Claude CLI to process tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct ClaudeCode {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub claude_code_router: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub append_prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dangerously_skip_permissions: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl ClaudeCode {
    fn build_command_builder(&self) -> CommandBuilder {
        // If base_command_override is provided and claude_code_router is also set, log a warning
        if self.cmd.base_command_override.is_some() && self.claude_code_router.is_some() {
            tracing::warn!(
                "base_command_override is set, this will override the claude_code_router setting"
            );
        }

        apply_overrides(
            build_command_builder(
                self.claude_code_router.unwrap_or(false),
                self.plan.unwrap_or(false),
                self.dangerously_skip_permissions.unwrap_or(false),
            ),
            &self.cmd,
        )
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for ClaudeCode {
    async fn spawn(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let command_builder = self.build_command_builder();
        let base_command = command_builder.build_initial();
        let claude_command = if self.plan.unwrap_or(false) {
            create_watchkill_script(&base_command)
        } else {
            base_command
        };

        let combined_prompt = utils::text::combine_prompt(&self.append_prompt, prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&claude_command);

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe so Claude sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
        session_id: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let command_builder = self.build_command_builder();
        // Build follow-up command with --resume {session_id}
        let base_command =
            command_builder.build_follow_up(&["--resume".to_string(), session_id.to_string()]);
        let claude_command = if self.plan.unwrap_or(false) {
            create_watchkill_script(&base_command)
        } else {
            base_command
        };

        let combined_prompt = utils::text::combine_prompt(&self.append_prompt, prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&claude_command);

        let mut child = command.group_spawn()?;

        // Feed the followup prompt in, then close the pipe
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &PathBuf) {
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
}

fn create_watchkill_script(command: &str) -> String {
    let claude_plan_stop_indicator = concat!("Exit ", "plan mode?");
    format!(
        r#"#!/usr/bin/env bash
set -euo pipefail

word="{claude_plan_stop_indicator}"
command="{command}"

exit_code=0
while IFS= read -r line; do
    printf '%s\n' "$line"
    if [[ $line == *"$word"* ]]; then
        exit 0
    fi
done < <($command <&0 2>&1)

exit_code=${{PIPESTATUS[0]}}
exit "$exit_code"
"#
    )
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
    tool_map: std::collections::HashMap<String, ClaudeToolCallInfo>,
    // Strategy controlling how to handle history and user messages
    strategy: HistoryStrategy,
}

impl ClaudeLogProcessor {
    #[cfg(test)]
    fn new() -> Self {
        Self::new_with_strategy(HistoryStrategy::Default)
    }

    fn new_with_strategy(strategy: HistoryStrategy) -> Self {
        Self {
            model_name: None,
            tool_map: std::collections::HashMap::new(),
            strategy,
        }
    }

    /// Process raw logs and convert them to normalized entries with patches
    pub fn process_logs(
        msg_store: Arc<MsgStore>,
        current_dir: &PathBuf,
        entry_index_provider: EntryIndexProvider,
        strategy: HistoryStrategy,
    ) {
        let current_dir_clone = current_dir.clone();
        tokio::spawn(async move {
            let mut stream = msg_store.history_plus_stream();
            let mut buffer = String::new();
            let worktree_path = current_dir_clone.to_string_lossy().to_string();
            let mut session_id_extracted = false;
            let mut processor = Self::new_with_strategy(strategy);

            while let Some(Ok(msg)) = stream.next().await {
                let chunk = match msg {
                    LogMsg::Stdout(x) => x,
                    LogMsg::JsonPatch(_) | LogMsg::SessionId(_) | LogMsg::Stderr(_) => continue,
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

                            // Special handling to capture tool_use ids and replace with results later
                            match &claude_json {
                                ClaudeJson::Assistant { message, .. } => {
                                    // Inject system init with model if first time
                                    if processor.model_name.is_none()
                                        && let Some(model) = message.model.as_ref()
                                    {
                                        processor.model_name = Some(model.clone());
                                        let entry = NormalizedEntry {
                                            timestamp: None,
                                            entry_type: NormalizedEntryType::SystemMessage,
                                            content: format!(
                                                "System initialized with model: {model}"
                                            ),
                                            metadata: None,
                                        };
                                        let id = entry_index_provider.next();
                                        msg_store.push_patch(
                                            ConversationPatch::add_normalized_entry(id, entry),
                                        );
                                    }

                                    for item in &message.content {
                                        match item {
                                            ClaudeContentItem::ToolUse { id, tool_data } => {
                                                let tool_name = tool_data.get_name().to_string();
                                                let action_type = Self::extract_action_type(
                                                    tool_data,
                                                    &worktree_path,
                                                );
                                                let content_text = Self::generate_concise_content(
                                                    tool_data,
                                                    &action_type,
                                                    &worktree_path,
                                                );
                                                let entry = NormalizedEntry {
                                                    timestamp: None,
                                                    entry_type: NormalizedEntryType::ToolUse {
                                                        tool_name: tool_name.clone(),
                                                        action_type,
                                                    },
                                                    content: content_text.clone(),
                                                    metadata: Some(
                                                        serde_json::to_value(item)
                                                            .unwrap_or(serde_json::Value::Null),
                                                    ),
                                                };
                                                let id_num = entry_index_provider.next();
                                                processor.tool_map.insert(
                                                    id.clone(),
                                                    ClaudeToolCallInfo {
                                                        entry_index: id_num,
                                                        tool_name: tool_name.clone(),
                                                        tool_data: tool_data.clone(),
                                                        content: content_text.clone(),
                                                    },
                                                );
                                                msg_store.push_patch(
                                                    ConversationPatch::add_normalized_entry(
                                                        id_num, entry,
                                                    ),
                                                );
                                            }
                                            ClaudeContentItem::Text { .. }
                                            | ClaudeContentItem::Thinking { .. } => {
                                                if let Some(entry) =
                                                    Self::content_item_to_normalized_entry(
                                                        item,
                                                        "assistant",
                                                        &worktree_path,
                                                    )
                                                {
                                                    let id = entry_index_provider.next();
                                                    msg_store.push_patch(
                                                        ConversationPatch::add_normalized_entry(
                                                            id, entry,
                                                        ),
                                                    );
                                                }
                                            }
                                            ClaudeContentItem::ToolResult { .. } => {
                                                // handled via User or Assistant ToolResult messages below
                                            }
                                        }
                                    }
                                }
                                ClaudeJson::User { message, .. } => {
                                    // Amp resume hack: if AmpResume and the user message contains plain text,
                                    // clear all previous entries so UI shows only fresh context, and emit user text.
                                    if matches!(processor.strategy, HistoryStrategy::AmpResume)
                                        && message
                                            .content
                                            .iter()
                                            .any(|c| matches!(c, ClaudeContentItem::Text { .. }))
                                    {
                                        let cur = entry_index_provider.current();
                                        if cur > 0 {
                                            for _ in 0..cur {
                                                msg_store.push_patch(
                                                    ConversationPatch::remove_diff(0.to_string()),
                                                );
                                            }
                                            entry_index_provider.reset();
                                            // Also reset tool map to avoid mismatches with re-streamed tool_use/tool_result ids
                                            processor.tool_map.clear();
                                        }
                                        // Emit user text messages after clearing
                                        for item in &message.content {
                                            if let ClaudeContentItem::Text { text } = item {
                                                let entry = NormalizedEntry {
                                                    timestamp: None,
                                                    entry_type: NormalizedEntryType::UserMessage,
                                                    content: text.clone(),
                                                    metadata: Some(
                                                        serde_json::to_value(item)
                                                            .unwrap_or(serde_json::Value::Null),
                                                    ),
                                                };
                                                let id = entry_index_provider.next();
                                                msg_store.push_patch(
                                                    ConversationPatch::add_normalized_entry(
                                                        id, entry,
                                                    ),
                                                );
                                            }
                                        }
                                    }
                                    for item in &message.content {
                                        if let ClaudeContentItem::ToolResult {
                                            tool_use_id,
                                            content,
                                            is_error,
                                        } = item
                                            && let Some(info) =
                                                processor.tool_map.get(tool_use_id).cloned()
                                        {
                                            let is_command = matches!(
                                                info.tool_data,
                                                ClaudeToolData::Bash { .. }
                                            );
                                            if is_command {
                                                // For bash commands, attach result as CommandRun output where possible
                                                // Prefer parsing Amp's claude-compatible Bash format: {"output":"...","exitCode":0}
                                                let content_str = if let Some(s) = content.as_str()
                                                {
                                                    s.to_string()
                                                } else {
                                                    content.to_string()
                                                };

                                                let result = if let Ok(result) =
                                                    serde_json::from_str::<AmpBashResult>(
                                                        &content_str,
                                                    ) {
                                                    Some(crate::logs::CommandRunResult {

                                                        exit_status : Some(
                                                            crate::logs::CommandExitStatus::ExitCode {
                                                                code: result.exit_code,
                                                            },
                                                        ),
                                                        output: Some(result.output)
                                                    })
                                                } else {
                                                    Some(crate::logs::CommandRunResult {
                                                        exit_status: (*is_error).map(|is_error| {
                                                            crate::logs::CommandExitStatus::Success { success: !is_error }
                                                        }),
                                                        output: Some(content_str)
                                                    })
                                                };

                                                let entry = NormalizedEntry {
                                                    timestamp: None,
                                                    entry_type: NormalizedEntryType::ToolUse {
                                                        tool_name: info.tool_name.clone(),
                                                        action_type: ActionType::CommandRun {
                                                            command: info.content.clone(),
                                                            result,
                                                        },
                                                    },
                                                    content: info.content.clone(),
                                                    metadata: None,
                                                };
                                                msg_store.push_patch(ConversationPatch::replace(
                                                    info.entry_index,
                                                    entry,
                                                ));
                                            } else {
                                                // Show args and results for NotebookEdit and MCP tools
                                                let tool_name =
                                                    info.tool_data.get_name().to_string();
                                                if matches!(
                                                    info.tool_data,
                                                    ClaudeToolData::Unknown { .. }
                                                        | ClaudeToolData::Oracle { .. }
                                                        | ClaudeToolData::Mermaid { .. }
                                                        | ClaudeToolData::CodebaseSearchAgent { .. }
                                                        | ClaudeToolData::NotebookEdit { .. }
                                                ) {
                                                    let (res_type, res_value) =
                                                        Self::normalize_claude_tool_result_value(
                                                            content,
                                                        );

                                                    // Arguments: prefer input for MCP unknown, else full struct
                                                    // Arguments: prefer `input` field if present, derived from tool_data
                                                    let args_to_show =
                                                        serde_json::to_value(&info.tool_data)
                                                            .ok()
                                                            .and_then(|v| {
                                                                serde_json::from_value::<
                                                                    ClaudeToolWithInput,
                                                                >(
                                                                    v
                                                                )
                                                                .ok()
                                                            })
                                                            .map(|w| w.input)
                                                            .unwrap_or(serde_json::Value::Null);

                                                    // Normalize MCP label
                                                    let is_mcp = tool_name.starts_with("mcp__");
                                                    let label = if is_mcp {
                                                        let parts: Vec<&str> =
                                                            tool_name.split("__").collect();
                                                        if parts.len() >= 3 {
                                                            format!("mcp:{}:{}", parts[1], parts[2])
                                                        } else {
                                                            tool_name.clone()
                                                        }
                                                    } else {
                                                        tool_name.clone()
                                                    };

                                                    let entry = NormalizedEntry {
                                                        timestamp: None,
                                                        entry_type: NormalizedEntryType::ToolUse {
                                                            tool_name: label.clone(),
                                                            action_type: ActionType::Tool {
                                                                tool_name: label,
                                                                arguments: Some(args_to_show),
                                                                result: Some(
                                                                    crate::logs::ToolResult {
                                                                        r#type: res_type,
                                                                        value: res_value,
                                                                    },
                                                                ),
                                                            },
                                                        },
                                                        content: info.content.clone(),
                                                        metadata: None,
                                                    };
                                                    msg_store.push_patch(
                                                        ConversationPatch::replace(
                                                            info.entry_index,
                                                            entry,
                                                        ),
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }
                                _ => {
                                    // Convert to normalized entries and create patches for other kinds
                                    for entry in processor
                                        .to_normalized_entries(&claude_json, &worktree_path)
                                    {
                                        let patch_id = entry_index_provider.next();
                                        let patch = ConversationPatch::add_normalized_entry(
                                            patch_id, entry,
                                        );
                                        msg_store.push_patch(patch);
                                    }
                                }
                            }
                        }
                        Err(_) => {
                            // Handle non-JSON output as raw system message
                            if !trimmed.is_empty() {
                                let entry = NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::SystemMessage,
                                    content: format!("Raw output: {trimmed}"),
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
                    content: format!("Raw output: {}", buffer.trim()),
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
            ClaudeJson::System { session_id, .. } => session_id.clone(),
            ClaudeJson::Assistant { session_id, .. } => session_id.clone(),
            ClaudeJson::User { session_id, .. } => session_id.clone(),
            ClaudeJson::ToolUse { session_id, .. } => session_id.clone(),
            ClaudeJson::ToolResult { session_id, .. } => session_id.clone(),
            ClaudeJson::Result { .. } => None,
            ClaudeJson::Unknown { .. } => None,
        }
    }

    /// Convert Claude JSON to normalized entries
    fn to_normalized_entries(
        &mut self,
        claude_json: &ClaudeJson,
        worktree_path: &str,
    ) -> Vec<NormalizedEntry> {
        match claude_json {
            ClaudeJson::System { subtype, .. } => {
                let content = match subtype.as_deref() {
                    Some("init") => {
                        // Skip system init messages because it doesn't contain the actual model that will be used in assistant messages in case of claude-code-router.
                        // We'll send system initialized message with first assistant message that has a model field.
                        return vec![];
                    }
                    Some(subtype) => format!("System: {subtype}"),
                    None => "System message".to_string(),
                };

                vec![NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content,
                    metadata: Some(
                        serde_json::to_value(claude_json).unwrap_or(serde_json::Value::Null),
                    ),
                }]
            }
            ClaudeJson::Assistant { message, .. } => {
                let mut entries = Vec::new();

                if self.model_name.is_none()
                    && let Some(model) = message.model.as_ref()
                {
                    self.model_name = Some(model.clone());
                    entries.push(NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: format!("System initialized with model: {model}"),
                        metadata: None,
                    });
                }

                for content_item in &message.content {
                    if let Some(entry) = Self::content_item_to_normalized_entry(
                        content_item,
                        "assistant",
                        worktree_path,
                    ) {
                        entries.push(entry);
                    }
                }
                entries
            }
            ClaudeJson::User { .. } => {
                vec![]
            }
            ClaudeJson::ToolUse { tool_data, .. } => {
                let tool_name = tool_data.get_name();
                let action_type = Self::extract_action_type(tool_data, worktree_path);
                let content =
                    Self::generate_concise_content(tool_data, &action_type, worktree_path);

                vec![NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: tool_name.to_string(),
                        action_type,
                    },
                    content,
                    metadata: Some(
                        serde_json::to_value(claude_json).unwrap_or(serde_json::Value::Null),
                    ),
                }]
            }
            ClaudeJson::ToolResult { .. } => {
                // TODO: Add proper ToolResult support to NormalizedEntry when the type system supports it
                vec![]
            }
            ClaudeJson::Result { .. } => {
                // Skip result messages
                vec![]
            }
            ClaudeJson::Unknown { data } => {
                vec![NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: format!(
                        "Unrecognized JSON message: {}",
                        serde_json::to_value(data).unwrap_or_default()
                    ),
                    metadata: None,
                }]
            }
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
            ClaudeContentItem::ToolUse { tool_data, .. } => {
                let name = tool_data.get_name();
                let action_type = Self::extract_action_type(tool_data, worktree_path);
                let content =
                    Self::generate_concise_content(tool_data, &action_type, worktree_path);

                Some(NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: name.to_string(),
                        action_type,
                    },
                    content,
                    metadata: Some(
                        serde_json::to_value(content_item).unwrap_or(serde_json::Value::Null),
                    ),
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
                let hunks: Vec<String> = edits
                    .iter()
                    .filter_map(|edit| {
                        if edit.old_string.is_some() || edit.new_string.is_some() {
                            Some(create_unified_diff_hunk(
                                &edit.old_string.clone().unwrap_or_default(),
                                &edit.new_string.clone().unwrap_or_default(),
                            ))
                        } else {
                            None
                        }
                    })
                    .collect();
                ActionType::FileEdit {
                    path: make_path_relative(file_path, worktree_path),
                    changes: vec![FileChange::Edit {
                        unified_diff: concatenate_diff_hunks(file_path, &hunks),
                        has_line_numbers: false,
                    }],
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

    /// Generate concise, readable content for tool usage using structured data
    fn generate_concise_content(
        tool_data: &ClaudeToolData,
        action_type: &ActionType,
        worktree_path: &str,
    ) -> String {
        match action_type {
            ActionType::FileRead { path } => format!("`{path}`"),
            ActionType::FileEdit { path, .. } => format!("`{path}`"),
            ActionType::CommandRun { command, .. } => format!("`{command}`"),
            ActionType::Search { query } => format!("`{query}`"),
            ActionType::WebFetch { url } => format!("`{url}`"),
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
                        format!("List directory: `{relative_path}`")
                    }
                }
                ClaudeToolData::Glob { pattern, path, .. } => {
                    if let Some(search_path) = path {
                        format!(
                            "Find files: `{}` in `{}`",
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
                            "Codebase search: `{}` in `{}`",
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

// Data structures for parsing Claude's JSON output format
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum ClaudeJson {
    #[serde(rename = "system")]
    System {
        subtype: Option<String>,
        session_id: Option<String>,
        cwd: Option<String>,
        tools: Option<Vec<serde_json::Value>>,
        model: Option<String>,
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
    #[serde(rename = "result")]
    Result {
        subtype: Option<String>,
        is_error: Option<bool>,
        duration_ms: Option<u64>,
        result: Option<serde_json::Value>,
    },
    // Catch-all for unknown message types
    #[serde(untagged)]
    Unknown {
        #[serde(flatten)]
        data: std::collections::HashMap<String, serde_json::Value>,
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

    #[test]
    fn test_claude_json_parsing() {
        let system_json =
            r#"{"type":"system","subtype":"init","session_id":"abc123","model":"claude-sonnet-4"}"#;
        let parsed: ClaudeJson = serde_json::from_str(system_json).unwrap();

        assert_eq!(
            ClaudeLogProcessor::extract_session_id(&parsed),
            Some("abc123".to_string())
        );

        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");
        assert_eq!(entries.len(), 0);

        let assistant_json = r#"
        {"type":"assistant","message":{"type":"message","role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"text","text":"Hi! I'm Claude Code."}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(assistant_json).unwrap();
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");

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

        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");
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

        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");
        assert_eq!(entries.len(), 0); // Should be ignored like in old implementation
    }

    #[test]
    fn test_thinking_content() {
        let thinking_json = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"Let me think about this..."}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(thinking_json).unwrap();

        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");
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

        assert_eq!(result, "`**/*.ts`");
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

        assert_eq!(result, "`*.js`");
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

        assert_eq!(result, "List directory: `components`");
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

        use utils::msg_store::MsgStore;

        let executor = ClaudeCode {
            claude_code_router: Some(false),
            plan: None,
            append_prompt: None,
            dangerously_skip_permissions: None,
            cmd: crate::command::CmdOverrides {
                base_command_override: None,
                additional_params: None,
            },
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
            .filter(|msg| matches!(msg, utils::log_msg::LogMsg::JsonPatch(_)))
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

        assert_eq!(
            ClaudeLogProcessor::extract_session_id(&parsed),
            Some("test-session-123".to_string())
        );

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
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "/tmp/work");
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
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed_edit, "/tmp/work");
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
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "/tmp/work");
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
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "/tmp/work");
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
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "/tmp/work");
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
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "/tmp/work");
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
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "/tmp/work");
        assert_eq!(entries.len(), 1);
        // Content should display the command in backticks
        assert_eq!(entries[0].content, "`echo hello`");

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
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "/tmp/work");
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
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "/tmp/work");
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
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "/tmp/work");
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
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn test_content_item_tool_result_ignored() {
        let assistant_with_tool_result = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_result","tool_use_id":"tool_123","content":"Operation completed","is_error":false}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(assistant_with_tool_result).unwrap();

        // ToolResult content items should be ignored (produce no entries) until proper support is added
        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn test_mixed_content_with_thinking_ignores_tool_result() {
        let complex_assistant_json = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"I need to read the file first"},{"type":"text","text":"I'll help you with that"},{"type":"tool_result","tool_use_id":"tool_789","content":"Success","is_error":false}]}}"#;
        let parsed: ClaudeJson = serde_json::from_str(complex_assistant_json).unwrap();

        let entries = ClaudeLogProcessor::new().to_normalized_entries(&parsed, "");
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
}
