use std::{collections::HashMap, path::PathBuf, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use futures::StreamExt;
use json_patch::Patch;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use utils::{
    diff::create_unified_diff, msg_store::MsgStore, path::make_path_relative,
    shell::get_shell_command,
};

use crate::{
    command::CommandBuilder,
    executors::{ExecutorError, StandardCodingAgentExecutor},
    logs::{
        ActionType, FileChange, NormalizedEntry, NormalizedEntryType, TodoItem as LogsTodoItem,
        stderr_processor::normalize_stderr_logs,
        utils::{EntryIndexProvider, patch::ConversationPatch},
    },
};

/// An executor that uses Amp to process tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct Amp {
    pub command: CommandBuilder,
    pub append_prompt: Option<String>,
}

#[async_trait]
impl StandardCodingAgentExecutor for Amp {
    async fn spawn(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let amp_command = self.command.build_initial();

        let combined_prompt = utils::text::combine_prompt(&self.append_prompt, prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped()) // <-- open a pipe
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(amp_command);

        let mut child = command.group_spawn()?;

        // feed the prompt in, then close the pipe so `amp` sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await.unwrap();
            stdin.shutdown().await.unwrap(); // or `drop(stdin);`
        }

        Ok(child)
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
        session_id: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let amp_command = self.command.build_follow_up(&[
            "threads".to_string(),
            "continue".to_string(),
            session_id.to_string(),
        ]);

        let combined_prompt = utils::text::combine_prompt(&self.append_prompt, prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&amp_command);

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe so amp sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    fn normalize_logs(&self, raw_logs_msg_store: Arc<MsgStore>, current_dir: &PathBuf) {
        let entry_index_provider = EntryIndexProvider::start_from(&raw_logs_msg_store);

        // Process stderr logs using the standard stderr processor
        normalize_stderr_logs(raw_logs_msg_store.clone(), entry_index_provider.clone());

        // Process stdout logs (Amp's JSON output)
        let current_dir = current_dir.clone();
        tokio::spawn(async move {
            let mut s = raw_logs_msg_store.stdout_lines_stream();

            let mut seen_amp_message_ids: HashMap<usize, Vec<usize>> = HashMap::new();
            // Consolidated tool state keyed by toolUseID
            let mut tool_records: HashMap<String, ToolRecord> = HashMap::new();
            while let Some(Ok(line)) = s.next().await {
                let trimmed = line.trim();
                match serde_json::from_str(trimmed) {
                    Ok(amp_json) => match amp_json {
                        AmpJson::Messages {
                            messages,
                            tool_results,
                        } => {
                            for (amp_message_id, message) in &messages {
                                let role = &message.role;

                                for (content_index, content_item) in
                                    message.content.iter().enumerate()
                                {
                                    let mut has_patch_ids =
                                        seen_amp_message_ids.get_mut(amp_message_id);

                                    if let Some(mut entry) = content_item.to_normalized_entry(
                                        role,
                                        message,
                                        &current_dir.to_string_lossy(),
                                    ) {
                                        // Text
                                        if matches!(&content_item, AmpContentItem::Text { .. })
                                            && role == "user"
                                        {
                                            // Remove all previous roles
                                            for index_to_remove in 0..entry_index_provider.current()
                                            {
                                                raw_logs_msg_store.push_patch(
                                                    ConversationPatch::remove_diff(0.to_string()), // Always 0 as we're removing each index
                                                );
                                            }
                                            entry_index_provider.reset();
                                            // Clear tool state on new user message to avoid stale mappings
                                            tool_records.clear();
                                        }

                                        // Consolidate tool state and refine concise content
                                        if let AmpContentItem::ToolUse { id, tool_data } =
                                            content_item
                                        {
                                            let rec = tool_records.entry(id.clone()).or_default();
                                            rec.tool_name = Some(tool_data.get_name().to_string());
                                            if let Some(new_content) = rec
                                                .update_tool_content_from_tool_input(
                                                    tool_data,
                                                    &current_dir.to_string_lossy(),
                                                )
                                            {
                                                entry.content = new_content;
                                            }
                                            rec.update_concise(&entry.content);
                                        }

                                        let patch: Patch = match &mut has_patch_ids {
                                            None => {
                                                let new_id = entry_index_provider.next();
                                                seen_amp_message_ids
                                                    .entry(*amp_message_id)
                                                    .or_default()
                                                    .push(new_id);
                                                // Track tool_use id if present
                                                if let AmpContentItem::ToolUse { id, .. } =
                                                    content_item
                                                    && let Some(rec) = tool_records.get_mut(id)
                                                {
                                                    rec.entry_idx = Some(new_id);
                                                }
                                                ConversationPatch::add_normalized_entry(
                                                    new_id, entry,
                                                )
                                            }
                                            Some(patch_ids) => match patch_ids.get(content_index) {
                                                Some(patch_id) => {
                                                    // Update tool record's entry index
                                                    if let AmpContentItem::ToolUse { id, .. } =
                                                        content_item
                                                        && let Some(rec) = tool_records.get_mut(id)
                                                    {
                                                        rec.entry_idx = Some(*patch_id);
                                                    }
                                                    ConversationPatch::replace(*patch_id, entry)
                                                }
                                                None => {
                                                    let new_id = entry_index_provider.next();
                                                    patch_ids.push(new_id);
                                                    if let AmpContentItem::ToolUse { id, .. } =
                                                        content_item
                                                        && let Some(rec) = tool_records.get_mut(id)
                                                    {
                                                        rec.entry_idx = Some(new_id);
                                                    }
                                                    ConversationPatch::add_normalized_entry(
                                                        new_id, entry,
                                                    )
                                                }
                                            },
                                        };

                                        raw_logs_msg_store.push_patch(patch);
                                    }

                                    // Handle tool_result messages in-stream, keyed by toolUseID
                                    if let AmpContentItem::ToolResult {
                                        tool_use_id,
                                        run,
                                        content: result_content,
                                    } = content_item
                                    {
                                        let rec =
                                            tool_records.entry(tool_use_id.clone()).or_default();
                                        rec.run = run.clone();
                                        rec.content_result = result_content.clone();
                                        if let Some(idx) = rec.entry_idx
                                            && let Some(entry) = build_result_entry(rec)
                                        {
                                            raw_logs_msg_store
                                                .push_patch(ConversationPatch::replace(idx, entry));
                                        }
                                    }

                                    // No separate pending apply: handled right after ToolUse entry creation
                                }
                            }
                            // Also process separate toolResults pairs that may arrive outside messages
                            for AmpToolResultsEntry::Pair([first, second]) in tool_results {
                                // Normalize order: references to ToolUse then ToolResult
                                let (tool_use_ref, tool_result_ref) = match (&first, &second) {
                                    (
                                        AmpToolResultsObject::ToolUse { .. },
                                        AmpToolResultsObject::ToolResult { .. },
                                    ) => (&first, &second),
                                    (
                                        AmpToolResultsObject::ToolResult { .. },
                                        AmpToolResultsObject::ToolUse { .. },
                                    ) => (&second, &first),
                                    _ => continue,
                                };

                                // Apply tool_use summary
                                let (id, name, input_val) = match tool_use_ref {
                                    AmpToolResultsObject::ToolUse { id, name, input } => {
                                        (id.clone(), name.clone(), input.clone())
                                    }
                                    _ => unreachable!(),
                                };
                                let rec = tool_records.entry(id.clone()).or_default();
                                rec.tool_name = Some(name.clone());
                                // Only update tool input/args if the input is meaningful (not empty)
                                if is_meaningful_input(&input_val) {
                                    if let Some(parsed) = parse_tool_input(&name, &input_val) {
                                        if let Some(new_content) = rec
                                            .update_tool_content_from_tool_input(
                                                &parsed,
                                                &current_dir.to_string_lossy(),
                                            )
                                        {
                                            rec.update_concise(&new_content);
                                        }
                                    } else {
                                        rec.args = Some(input_val);
                                    }
                                }

                                // Apply tool_result summary
                                if let AmpToolResultsObject::ToolResult {
                                    tool_use_id: _,
                                    run,
                                    content,
                                } = tool_result_ref
                                {
                                    rec.run = run.clone();
                                    rec.content_result = content.clone();
                                }

                                // Render: replace existing entry or add a new one
                                if let Some(idx) = rec.entry_idx {
                                    if let Some(entry) = build_result_entry(rec) {
                                        raw_logs_msg_store
                                            .push_patch(ConversationPatch::replace(idx, entry));
                                    }
                                } else if let Some(entry) = build_result_entry(rec) {
                                    let new_id = entry_index_provider.next();
                                    if let Some(rec_mut) = tool_records.get_mut(&id) {
                                        rec_mut.entry_idx = Some(new_id);
                                    }
                                    raw_logs_msg_store.push_patch(
                                        ConversationPatch::add_normalized_entry(new_id, entry),
                                    );
                                }
                            }
                        }
                        AmpJson::Initial { thread_id } => {
                            if let Some(thread_id) = thread_id {
                                raw_logs_msg_store.push_session_id(thread_id);
                            }
                        }
                        _ => {}
                    },
                    Err(_) => {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::SystemMessage,
                                content: format!("Raw output: {trimmed}"),
                                metadata: None,
                            };

                            let new_id = entry_index_provider.next();
                            let patch = ConversationPatch::add_normalized_entry(new_id, entry);
                            raw_logs_msg_store.push_patch(patch);
                        }
                    }
                };
            }
        });
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum AmpJson {
    #[serde(rename = "messages")]
    Messages {
        messages: Vec<(usize, AmpMessage)>,
        #[serde(rename = "toolResults")]
        tool_results: Vec<AmpToolResultsEntry>,
    },
    #[serde(rename = "initial")]
    Initial {
        #[serde(rename = "threadID")]
        thread_id: Option<String>,
    },
    #[serde(rename = "token-usage")]
    TokenUsage(serde_json::Value),
    #[serde(rename = "state")]
    State { state: String },
    #[serde(rename = "shutdown")]
    Shutdown,
    #[serde(rename = "tool-status")]
    ToolStatus(serde_json::Value),
    // Subthread/subagent noise we should ignore
    #[serde(rename = "subagent-started")]
    SubagentStarted(serde_json::Value),
    #[serde(rename = "subagent-status")]
    SubagentStatus(serde_json::Value),
    #[serde(rename = "subagent-finished")]
    SubagentFinished(serde_json::Value),
    #[serde(rename = "subthread-activity")]
    SubthreadActivity(serde_json::Value),
}

impl AmpJson {
    pub fn should_process(&self) -> bool {
        matches!(self, AmpJson::Messages { .. })
    }

    pub fn extract_session_id(&self) -> Option<String> {
        match self {
            AmpJson::Initial { thread_id } => thread_id.clone(),
            _ => None,
        }
    }

    pub fn has_streaming_content(&self) -> bool {
        match self {
            AmpJson::Messages { messages, .. } => messages.iter().any(|(_index, message)| {
                if let Some(state) = &message.state {
                    if let Some(state_type) = state.get("type").and_then(|t| t.as_str()) {
                        state_type == "streaming"
                    } else {
                        false
                    }
                } else {
                    false
                }
            }),
            _ => false,
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
pub struct AmpMessage {
    pub role: String,
    pub content: Vec<AmpContentItem>,
    pub state: Option<serde_json::Value>,
    pub meta: Option<AmpMeta>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
pub struct AmpMeta {
    #[serde(rename = "sentAt")]
    pub sent_at: u64,
}

// Typed objects for top-level toolResults stream (outside messages)
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(untagged)]
pub enum AmpToolResultsEntry {
    // Common shape: an array of two objects [tool_use, tool_result]
    Pair([AmpToolResultsObject; 2]),
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum AmpToolResultsObject {
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        #[serde(default)]
        input: serde_json::Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        #[serde(rename = "toolUseID")]
        tool_use_id: String,
        #[serde(default)]
        run: Option<AmpToolRun>,
        #[serde(default)]
        content: Option<serde_json::Value>,
    },
}

/// Tool data combining name and input
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "name", content = "input")]
pub enum AmpToolData {
    #[serde(alias = "read", alias = "read_file")]
    Read {
        #[serde(alias = "file_path")]
        path: String,
    },
    #[serde(alias = "create_file")]
    CreateFile {
        #[serde(alias = "file_path")]
        path: String,
        #[serde(alias = "file_content")]
        content: Option<String>,
    },
    #[serde(alias = "edit_file", alias = "edit", alias = "undo_edit")]
    EditFile {
        #[serde(alias = "file_path")]
        path: String,
        #[serde(default)]
        old_str: Option<String>,
        #[serde(default)]
        new_str: Option<String>,
    },
    #[serde(alias = "bash", alias = "Bash")]
    Bash {
        #[serde(alias = "cmd")]
        command: String,
    },
    #[serde(alias = "grep", alias = "codebase_search_agent", alias = "Grep")]
    Search {
        #[serde(alias = "query")]
        pattern: String,
        #[serde(default)]
        include: Option<String>,
        #[serde(default)]
        path: Option<String>,
    },
    #[serde(alias = "read_web_page")]
    ReadWebPage { url: String },
    #[serde(alias = "web_search")]
    WebSearch { query: String },
    #[serde(alias = "task", alias = "Task")]
    Task {
        #[serde(alias = "prompt")]
        description: String,
    },
    #[serde(alias = "glob")]
    Glob {
        #[serde(alias = "filePattern")]
        pattern: String,
        #[serde(default)]
        path: Option<String>,
    },
    #[serde(alias = "ls", alias = "list_directory")]
    List {
        #[serde(default)]
        path: Option<String>,
    },
    #[serde(alias = "todo_write", alias = "todo_read")]
    Todo {
        #[serde(default)]
        todos: Option<Vec<TodoItem>>,
    },
    /// Generic fallback for unknown tools
    #[serde(untagged)]
    Unknown {
        #[serde(flatten)]
        data: std::collections::HashMap<String, serde_json::Value>,
    },
}

impl AmpToolData {
    pub fn get_name(&self) -> &str {
        match self {
            AmpToolData::Read { .. } => "read",
            AmpToolData::CreateFile { .. } => "create_file",
            AmpToolData::EditFile { .. } => "edit_file",
            AmpToolData::Bash { .. } => "bash",
            AmpToolData::Search { .. } => "search",
            AmpToolData::ReadWebPage { .. } => "read_web_page",
            AmpToolData::WebSearch { .. } => "web_search",
            AmpToolData::Task { .. } => "task",
            AmpToolData::Glob { .. } => "glob",
            AmpToolData::List { .. } => "list",
            AmpToolData::Todo { .. } => "todo",
            AmpToolData::Unknown { data } => data
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown"),
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
pub struct TodoItem {
    pub content: String,
    pub status: String,
    #[serde(default)]
    pub priority: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum AmpContentItem {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "thinking")]
    Thinking { thinking: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        #[serde(flatten)]
        tool_data: AmpToolData,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        #[serde(rename = "toolUseID")]
        tool_use_id: String,
        #[serde(default)]
        run: Option<AmpToolRun>,
        #[serde(default)]
        content: Option<serde_json::Value>,
    },
}

impl AmpContentItem {
    pub fn to_normalized_entry(
        &self,
        role: &str,
        message: &AmpMessage,
        worktree_path: &str,
    ) -> Option<NormalizedEntry> {
        use serde_json::Value;

        let timestamp = message.meta.as_ref().map(|meta| meta.sent_at.to_string());

        match self {
            AmpContentItem::Text { text } => {
                let entry_type = match role {
                    "user" => NormalizedEntryType::UserMessage,
                    "assistant" => NormalizedEntryType::AssistantMessage,
                    _ => return None,
                };
                Some(NormalizedEntry {
                    timestamp,
                    entry_type,
                    content: text.clone(),
                    metadata: Some(serde_json::to_value(self).unwrap_or(Value::Null)),
                })
            }
            AmpContentItem::Thinking { thinking } => Some(NormalizedEntry {
                timestamp,
                entry_type: NormalizedEntryType::Thinking,
                content: thinking.clone(),
                metadata: Some(serde_json::to_value(self).unwrap_or(Value::Null)),
            }),
            AmpContentItem::ToolUse { tool_data, .. } => {
                let name = tool_data.get_name();
                let input = tool_data;
                let (action_type, content) = Self::action_and_content(input, worktree_path);

                Some(NormalizedEntry {
                    timestamp,
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: name.to_string(),
                        action_type,
                    },
                    content,
                    metadata: Some(serde_json::to_value(self).unwrap_or(Value::Null)),
                })
            }
            AmpContentItem::ToolResult { .. } => None,
        }
    }

    fn action_and_content(input: &AmpToolData, worktree_path: &str) -> (ActionType, String) {
        let action_type = Self::extract_action_type(input, worktree_path);
        let content = Self::generate_concise_content(input, &action_type, worktree_path);
        (action_type, content)
    }

    fn extract_action_type(input: &AmpToolData, worktree_path: &str) -> ActionType {
        match input {
            AmpToolData::Read { path, .. } => ActionType::FileRead {
                path: make_path_relative(path, worktree_path),
            },
            AmpToolData::CreateFile { path, content, .. } => {
                let changes = content
                    .as_ref()
                    .map(|content| FileChange::Write {
                        content: content.clone(),
                    })
                    .into_iter()
                    .collect();
                ActionType::FileEdit {
                    path: make_path_relative(path, worktree_path),
                    changes,
                }
            }
            AmpToolData::EditFile {
                path,
                old_str,
                new_str,
                ..
            } => {
                let changes = if old_str.is_some() || new_str.is_some() {
                    vec![FileChange::Edit {
                        unified_diff: create_unified_diff(
                            path,
                            old_str.as_deref().unwrap_or(""),
                            new_str.as_deref().unwrap_or(""),
                        ),
                        has_line_numbers: false,
                    }]
                } else {
                    vec![]
                };
                ActionType::FileEdit {
                    path: make_path_relative(path, worktree_path),
                    changes,
                }
            }
            AmpToolData::Bash { command, .. } => ActionType::CommandRun {
                command: command.clone(),
                result: None,
            },
            AmpToolData::Search { pattern, .. } => ActionType::Search {
                query: pattern.clone(),
            },
            AmpToolData::ReadWebPage { url, .. } => ActionType::WebFetch { url: url.clone() },
            AmpToolData::WebSearch { query, .. } => ActionType::WebFetch { url: query.clone() },
            AmpToolData::Task { description, .. } => ActionType::TaskCreate {
                description: description.clone(),
            },
            AmpToolData::Glob { .. } => ActionType::Other {
                description: "File pattern search".to_string(),
            },
            AmpToolData::List { .. } => ActionType::Other {
                description: "List directory".to_string(),
            },
            AmpToolData::Todo { todos } => ActionType::TodoManagement {
                todos: todos
                    .as_ref()
                    .map(|todos| {
                        todos
                            .iter()
                            .map(|t| LogsTodoItem {
                                content: t.content.clone(),
                                status: t.status.clone(),
                                priority: t.priority.clone(),
                            })
                            .collect()
                    })
                    .unwrap_or_default(),
                operation: "write".to_string(),
            },
            AmpToolData::Unknown { .. } => ActionType::Other {
                description: format!("Tool: {}", input.get_name()),
            },
        }
    }

    fn generate_concise_content(
        input: &AmpToolData,
        action_type: &ActionType,
        worktree_path: &str,
    ) -> String {
        let tool_name = input.get_name();
        match action_type {
            ActionType::FileRead { path } => format!("`{path}`"),
            ActionType::FileEdit { path, .. } => format!("`{path}`"),
            ActionType::CommandRun { command, .. } => format!("`{command}`"),
            ActionType::Search { query } => format!("Search: `{query}`"),
            ActionType::WebFetch { url } => format!("`{url}`"),
            ActionType::Tool { .. } => tool_name.to_string(),
            ActionType::PlanPresentation { plan } => format!("Plan Presentation: `{plan}`"),
            ActionType::TaskCreate { description } => description.clone(),
            ActionType::TodoManagement { .. } => "TODO list updated".to_string(),
            ActionType::Other { description: _ } => {
                // For other tools, try to extract key information or fall back to tool name
                match input {
                    AmpToolData::List { path, .. } => {
                        if let Some(path) = path {
                            let relative_path = make_path_relative(path, worktree_path);
                            if relative_path.is_empty() {
                                "List directory".to_string()
                            } else {
                                format!("List directory: `{relative_path}`")
                            }
                        } else {
                            "List directory".to_string()
                        }
                    }
                    AmpToolData::Glob { pattern, path, .. } => {
                        if let Some(path) = path {
                            let relative_path = make_path_relative(path, worktree_path);
                            format!("Find files: `{pattern}` in `{relative_path}`")
                        } else {
                            format!("Find files: `{pattern}`")
                        }
                    }
                    AmpToolData::Search {
                        pattern,
                        include,
                        path,
                        ..
                    } => {
                        let mut parts = vec![format!("Search: `{}`", pattern)];
                        if let Some(include) = include {
                            parts.push(format!("in `{include}`"));
                        }
                        if let Some(path) = path {
                            let relative_path = make_path_relative(path, worktree_path);
                            parts.push(format!("at `{relative_path}`"));
                        }
                        parts.join(" ")
                    }
                    AmpToolData::Unknown { data } => {
                        // Manually check if "name" is prefixed with "todo"
                        // This is a hack to avoid flickering on the frontend
                        let name = data
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or(tool_name);
                        if name.starts_with("todo") {
                            "TODO list updated".to_string()
                        } else {
                            tool_name.to_string()
                        }
                    }
                    _ => tool_name.to_string(),
                }
            }
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
pub struct AmpToolRun {
    #[serde(default)]
    pub result: Option<serde_json::Value>,
    #[serde(default)]
    pub error: Option<serde_json::Value>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub progress: Option<serde_json::Value>,
    // Some tools provide stdout/stderr/success at top-level under run
    #[serde(default)]
    pub stdout: Option<String>,
    #[serde(default)]
    pub stderr: Option<String>,
    #[serde(default)]
    pub success: Option<bool>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq, Default)]
struct BashInnerResult {
    #[serde(default)]
    output: Option<String>,
    #[serde(default, rename = "exitCode")]
    exit_code: Option<i32>,
}

#[derive(Debug, Clone, Default)]
struct ToolRecord {
    entry_idx: Option<usize>,
    tool_name: Option<String>,
    tool_input: Option<AmpToolData>,
    args: Option<serde_json::Value>,
    concise_content: Option<String>,
    bash_cmd: Option<String>,
    run: Option<AmpToolRun>,
    content_result: Option<serde_json::Value>,
}

impl ToolRecord {
    fn update_concise(&mut self, new_content: &str) {
        let new_is_cmd = new_content.trim_start().starts_with('`');
        match self.concise_content.as_ref() {
            None => self.concise_content = Some(new_content.to_string()),
            Some(prev) => {
                let prev_is_cmd = prev.trim_start().starts_with('`');
                if !(prev_is_cmd && !new_is_cmd) {
                    self.concise_content = Some(new_content.to_string());
                }
            }
        }
    }

    fn update_tool_content_from_tool_input(
        &mut self,
        tool_data: &AmpToolData,
        worktree_path: &str,
    ) -> Option<String> {
        self.tool_input = Some(tool_data.clone());
        match tool_data {
            AmpToolData::Task { description } => {
                self.args = Some(serde_json::json!({ "description": description }));
                None
            }
            AmpToolData::Bash { command } => {
                self.bash_cmd = Some(command.clone());
                None
            }
            AmpToolData::Glob { pattern, path } => {
                self.args = Some(serde_json::json!({ "pattern": pattern, "path": path }));
                // Prefer concise content derived from typed input
                let (_action, content) =
                    AmpContentItem::action_and_content(tool_data, worktree_path);
                Some(content)
            }
            AmpToolData::Search {
                pattern,
                include,
                path,
            } => {
                self.args = Some(
                    serde_json::json!({ "pattern": pattern, "include": include, "path": path }),
                );
                None
            }
            AmpToolData::List { path } => {
                self.args = Some(serde_json::json!({ "path": path }));
                None
            }
            AmpToolData::Read { path }
            | AmpToolData::CreateFile { path, .. }
            | AmpToolData::EditFile { path, .. } => {
                self.args = Some(serde_json::json!({ "path": path }));
                None
            }
            AmpToolData::ReadWebPage { url } => {
                self.args = Some(serde_json::json!({ "url": url }));
                None
            }
            AmpToolData::WebSearch { query } => {
                self.args = Some(serde_json::json!({ "query": query }));
                None
            }
            AmpToolData::Todo { .. } => None,
            AmpToolData::Unknown { data } => {
                if let Some(inp) = data.get("input")
                    && is_meaningful_input(inp)
                {
                    self.args = Some(inp.clone());
                    let name = self
                        .tool_name
                        .clone()
                        .unwrap_or_else(|| tool_data.get_name().to_string());
                    return parse_tool_input(&name, inp).map(|parsed| {
                        let (_action, content) =
                            AmpContentItem::action_and_content(&parsed, worktree_path);
                        content
                    });
                }
                None
            }
        }
    }
}

fn parse_tool_input(tool_name: &str, input: &serde_json::Value) -> Option<AmpToolData> {
    let obj = serde_json::json!({ "name": tool_name, "input": input });
    serde_json::from_value::<AmpToolData>(obj).ok()
}

fn is_meaningful_input(v: &serde_json::Value) -> bool {
    use serde_json::Value::*;
    match v {
        Null => false,
        Bool(_) | Number(_) => true,
        String(s) => !s.trim().is_empty(),
        Array(arr) => !arr.is_empty(),
        Object(map) => !map.is_empty(),
    }
}

fn build_result_entry(rec: &ToolRecord) -> Option<NormalizedEntry> {
    let input = rec.tool_input.as_ref()?;
    match input {
        AmpToolData::Bash { .. } => {
            let mut output: Option<String> = None;
            let mut exit_status: Option<crate::logs::CommandExitStatus> = None;
            if let Some(run) = &rec.run {
                if let Some(res) = &run.result
                    && let Ok(inner) = serde_json::from_value::<BashInnerResult>(res.clone())
                {
                    if let Some(oc) = inner.output
                        && !oc.trim().is_empty()
                    {
                        output = Some(oc);
                    }
                    if let Some(code) = inner.exit_code {
                        exit_status = Some(crate::logs::CommandExitStatus::ExitCode { code });
                    }
                }
                if output.is_none() {
                    output = match (run.stdout.clone(), run.stderr.clone()) {
                        (Some(sout), Some(serr)) => {
                            let st = sout.trim().to_string();
                            let se = serr.trim().to_string();
                            if st.is_empty() && se.is_empty() {
                                None
                            } else if st.is_empty() {
                                Some(serr)
                            } else if se.is_empty() {
                                Some(sout)
                            } else {
                                Some(format!("STDOUT:\n{st}\n\nSTDERR:\n{se}"))
                            }
                        }
                        (Some(sout), None) => {
                            if sout.trim().is_empty() {
                                None
                            } else {
                                Some(sout)
                            }
                        }
                        (None, Some(serr)) => {
                            if serr.trim().is_empty() {
                                None
                            } else {
                                Some(serr)
                            }
                        }
                        (None, None) => None,
                    };
                }
                if exit_status.is_none()
                    && let Some(s) = run.success
                {
                    exit_status = Some(crate::logs::CommandExitStatus::Success { success: s });
                }
            }
            let cmd = rec.bash_cmd.clone().unwrap_or_default();
            let content = rec
                .concise_content
                .clone()
                .or_else(|| {
                    if !cmd.is_empty() {
                        Some(format!("`{cmd}`"))
                    } else {
                        None
                    }
                })
                .unwrap_or_else(|| input.get_name().to_string());
            Some(NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::ToolUse {
                    tool_name: input.get_name().to_string(),
                    action_type: ActionType::CommandRun {
                        command: cmd,
                        result: Some(crate::logs::CommandRunResult {
                            exit_status,
                            output,
                        }),
                    },
                },
                content,
                metadata: None,
            })
        }
        AmpToolData::Read { .. }
        | AmpToolData::CreateFile { .. }
        | AmpToolData::EditFile { .. }
        | AmpToolData::Glob { .. }
        | AmpToolData::Search { .. }
        | AmpToolData::List { .. }
        | AmpToolData::ReadWebPage { .. }
        | AmpToolData::WebSearch { .. }
        | AmpToolData::Todo { .. } => None,
        _ => {
            // Generic tool: attach args + result as JSON
            let args = rec.args.clone().unwrap_or(serde_json::Value::Null);
            let render_value = rec
                .run
                .as_ref()
                .and_then(|r| r.result.clone())
                .or_else(|| rec.content_result.clone())
                .unwrap_or(serde_json::Value::Null);
            let content = rec
                .concise_content
                .clone()
                .unwrap_or_else(|| input.get_name().to_string());
            Some(NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::ToolUse {
                    tool_name: input.get_name().to_string(),
                    action_type: ActionType::Tool {
                        tool_name: input.get_name().to_string(),
                        arguments: Some(args),
                        result: Some(crate::logs::ToolResult {
                            r#type: crate::logs::ToolResultValueType::Json,
                            value: render_value,
                        }),
                    },
                },
                content,
                metadata: None,
            })
        }
    }
}
