use std::{collections::HashMap, path::PathBuf, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use futures::StreamExt;
use json_patch::Patch;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use utils::{msg_store::MsgStore, path::make_path_relative, shell::get_shell_command};

use crate::{
    command::{AgentProfiles, CommandBuilder},
    executors::{ExecutorError, StandardCodingAgentExecutor},
    logs::{
        ActionType, EditDiff, NormalizedEntry, NormalizedEntryType,
        stderr_processor::normalize_stderr_logs,
        utils::{EntryIndexProvider, patch::ConversationPatch},
    },
};

/// An executor that uses Amp to process tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct Amp {
    command_builder: CommandBuilder,
}

impl Default for Amp {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Amp {
    async fn spawn(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let amp_command = self.command_builder.build_initial();

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
            stdin.write_all(prompt.as_bytes()).await.unwrap();
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
        let amp_command = self.command_builder.build_follow_up(&[
            "threads".to_string(),
            "continue".to_string(),
            session_id.to_string(),
        ]);

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
            stdin.write_all(prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    fn normalize_logs(&self, raw_logs_msg_store: Arc<MsgStore>, current_dir: &PathBuf) {
        let entry_index_provider = EntryIndexProvider::new();

        // Process stderr logs using the standard stderr processor
        normalize_stderr_logs(raw_logs_msg_store.clone(), entry_index_provider.clone());

        // Process stdout logs (Amp's JSON output)
        let current_dir = current_dir.clone();
        tokio::spawn(async move {
            let mut s = raw_logs_msg_store.stdout_lines_stream();

            let mut seen_amp_message_ids: HashMap<usize, Vec<usize>> = HashMap::new();
            while let Some(Ok(line)) = s.next().await {
                let trimmed = line.trim();
                match serde_json::from_str(trimmed) {
                    Ok(amp_json) => match amp_json {
                        AmpJson::Messages {
                            messages,
                            tool_results,
                        } => {
                            for (amp_message_id, message) in messages {
                                let role = &message.role;

                                for (content_index, content_item) in
                                    message.content.iter().enumerate()
                                {
                                    let mut has_patch_ids =
                                        seen_amp_message_ids.get_mut(&amp_message_id);

                                    if let Some(entry) = content_item.to_normalized_entry(
                                        role,
                                        &message,
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
                                                    ConversationPatch::remove_diff(
                                                        index_to_remove.to_string(),
                                                    ),
                                                );
                                            }
                                            entry_index_provider.reset();
                                        }

                                        let patch: Patch = match &mut has_patch_ids {
                                            None => {
                                                let new_id = entry_index_provider.next();
                                                seen_amp_message_ids
                                                    .entry(amp_message_id)
                                                    .or_default()
                                                    .push(new_id);
                                                ConversationPatch::add_normalized_entry(
                                                    new_id, entry,
                                                )
                                            }
                                            Some(patch_ids) => match patch_ids.get(content_index) {
                                                Some(patch_id) => {
                                                    ConversationPatch::replace(*patch_id, entry)
                                                }
                                                None => {
                                                    let new_id = entry_index_provider.next();
                                                    patch_ids.push(new_id);
                                                    ConversationPatch::add_normalized_entry(
                                                        new_id, entry,
                                                    )
                                                }
                                            },
                                        };

                                        raw_logs_msg_store.push_patch(patch);
                                    }
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

impl Amp {
    pub fn new() -> Self {
        let profile = AgentProfiles::get_cached()
            .get_profile("amp")
            .expect("Default amp profile should exist");

        Self::with_command_builder(profile.command.clone())
    }

    pub fn with_command_builder(command_builder: CommandBuilder) -> Self {
        Self { command_builder }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum AmpJson {
    #[serde(rename = "messages")]
    Messages {
        messages: Vec<(usize, AmpMessage)>,
        #[serde(rename = "toolResults")]
        tool_results: Vec<serde_json::Value>,
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
    #[serde(alias = "bash")]
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
        run: serde_json::Value,
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
                let action_type = Self::extract_action_type(name, input, worktree_path);
                let content =
                    Self::generate_concise_content(name, input, &action_type, worktree_path);

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

    fn extract_action_type(
        tool_name: &str,
        input: &AmpToolData,
        worktree_path: &str,
    ) -> ActionType {
        match input {
            AmpToolData::Read { path, .. } => ActionType::FileRead {
                path: make_path_relative(path, worktree_path),
            },
            AmpToolData::CreateFile { path, content, .. } => {
                let diffs = content
                    .as_ref()
                    .map(|content| EditDiff::Replace {
                        old: String::new(),
                        new: content.clone(),
                    })
                    .into_iter()
                    .collect();
                ActionType::FileEdit {
                    path: make_path_relative(path, worktree_path),
                    diffs,
                }
            }
            AmpToolData::EditFile {
                path,
                old_str,
                new_str,
                ..
            } => {
                let diffs = if old_str.is_some() || new_str.is_some() {
                    vec![EditDiff::Replace {
                        old: old_str.clone().unwrap_or_default(),
                        new: new_str.clone().unwrap_or_default(),
                    }]
                } else {
                    vec![]
                };
                ActionType::FileEdit {
                    path: make_path_relative(path, worktree_path),
                    diffs,
                }
            }
            AmpToolData::Bash { command, .. } => ActionType::CommandRun {
                command: command.clone(),
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
            AmpToolData::Todo { .. } => ActionType::Other {
                description: "Manage TODO list".to_string(),
            },
            AmpToolData::Unknown { .. } => ActionType::Other {
                description: format!("Tool: {tool_name}"),
            },
        }
    }

    fn generate_concise_content(
        tool_name: &str,
        input: &AmpToolData,
        action_type: &ActionType,
        worktree_path: &str,
    ) -> String {
        match action_type {
            ActionType::FileRead { path } => format!("`{path}`"),
            ActionType::FileEdit { path, .. } => format!("`{path}`"),
            ActionType::CommandRun { command } => format!("`{command}`"),
            ActionType::Search { query } => format!("`{query}`"),
            ActionType::WebFetch { url } => format!("`{url}`"),
            ActionType::PlanPresentation { plan } => format!("Plan Presentation: `{plan}`"),
            ActionType::TaskCreate { description } => description.clone(),
            ActionType::Other { description: _ } => {
                // For other tools, try to extract key information or fall back to tool name
                match input {
                    AmpToolData::Todo { todos, .. } => {
                        if let Some(todos) = todos {
                            let mut todo_items = Vec::new();
                            for todo in todos {
                                let emoji = match todo.status.as_str() {
                                    "completed" => "✅",
                                    "in_progress" | "in-progress" => "🔄",
                                    "pending" | "todo" => "⏳",
                                    _ => "📝",
                                };
                                let priority = todo.priority.as_deref().unwrap_or("medium");
                                todo_items
                                    .push(format!("{} {} ({})", emoji, todo.content, priority));
                            }
                            if !todo_items.is_empty() {
                                format!("TODO List:\n{}", todo_items.join("\n"))
                            } else {
                                "Managing TODO list".to_string()
                            }
                        } else {
                            "Managing TODO list".to_string()
                        }
                    }
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
                    _ => tool_name.to_string(),
                }
            }
        }
    }
}
