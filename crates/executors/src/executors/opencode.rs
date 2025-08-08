use std::{fmt, path::PathBuf, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use fork_stream::StreamExt as _;
use futures::{StreamExt, future::ready, stream::BoxStream};
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use utils::{msg_store::MsgStore, path::make_path_relative, shell::get_shell_command};

use crate::{
    command::{AgentProfiles, CommandBuilder},
    executors::{ExecutorError, StandardCodingAgentExecutor},
    logs::{
        ActionType, EditDiff, NormalizedEntry, NormalizedEntryType,
        plain_text_processor::{MessageBoundary, PlainTextLogProcessor},
        utils::EntryIndexProvider,
    },
};

/// An executor that uses OpenCode to process tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct Opencode {
    command_builder: CommandBuilder,
}

impl Default for Opencode {
    fn default() -> Self {
        Self::new()
    }
}

impl Opencode {
    pub fn new() -> Self {
        let profile = AgentProfiles::get_cached()
            .get_profile("opencode")
            .expect("Default opencode profile should exist");

        Self::with_command_builder(profile.command.clone())
    }

    pub fn with_command_builder(command_builder: CommandBuilder) -> Self {
        Self { command_builder }
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Opencode {
    async fn spawn(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let opencode_command = self.command_builder.build_initial();

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped()) // Keep stdout but we won't use it
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(opencode_command)
            .env("NODE_NO_WARNINGS", "1");

        let mut child = command.group_spawn()?;

        // Write prompt to stdin
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(prompt.as_bytes()).await?;
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
        let opencode_command = self
            .command_builder
            .build_follow_up(&["--session".to_string(), session_id.to_string()]);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped()) // Keep stdout but we won't use it
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&opencode_command)
            .env("NODE_NO_WARNINGS", "1");

        let mut child = command.group_spawn()?;

        // Write prompt to stdin
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    /// Normalize logs for OpenCode executor
    ///
    /// This implementation uses three separate threads:
    /// 1. Session ID thread: read by line, search for session ID format, store it.
    /// 2. Error log recognition thread: read by line, identify error log lines, store them as error messages.
    /// 3. Main normalizer thread: read stderr by line, filter out log lines, send lines (with '\n' appended) to plain text normalizer,
    ///    then define predicate for split and create appropriate normalized entry (either assistant or tool call).
    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &PathBuf) {
        let entry_index_counter = EntryIndexProvider::new();
        let worktree_path = worktree_path.clone();

        let stderr_lines = msg_store
            .stderr_lines_stream()
            .filter_map(|res| ready(res.ok()))
            .map(|line| LogUtils::strip_ansi_codes(&line))
            .fork();

        // Log line: INFO  2025-08-05T10:17:26 +1ms service=session id=ses_786439b6dffe4bLqNBS4fGd7mJ
        // error line: !  some error message
        let log_lines = stderr_lines
            .clone()
            .filter(|line| {
                ready(OPENCODE_LOG_REGEX.is_match(line) || LogUtils::is_error_line(line))
            })
            .boxed();

        // Process log lines, which contain error messages and session ID
        tokio::spawn(Self::process_opencode_log_lines(
            log_lines,
            msg_store.clone(),
            entry_index_counter.clone(),
        ));

        let agent_logs = stderr_lines
            .filter(|line| {
                ready(
                    !LogUtils::is_noise(line)
                        && !OPENCODE_LOG_REGEX.is_match(line)
                        && !LogUtils::is_error_line(line),
                )
            })
            .boxed();

        // Normalize agent logs
        tokio::spawn(Self::process_agent_logs(
            agent_logs,
            worktree_path,
            entry_index_counter,
            msg_store,
        ));
    }
}
impl Opencode {
    async fn process_opencode_log_lines(
        mut log_lines: BoxStream<'_, String>,
        msg_store: Arc<MsgStore>,
        entry_index_counter: EntryIndexProvider,
    ) {
        let mut session_id_extracted = false;
        while let Some(line) = log_lines.next().await {
            if line.starts_with("ERROR")
                || line.starts_with("WARN")
                || LogUtils::is_error_line(&line)
            {
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ErrorMessage,
                    content: line.clone(),
                    metadata: None,
                };

                // Create a patch for this single entry
                let patch = crate::logs::utils::ConversationPatch::add_normalized_entry(
                    entry_index_counter.next(),
                    entry,
                );
                msg_store.push_patch(patch);
            } else if !session_id_extracted
                && let Some(session_id) = LogUtils::parse_session_id_from_line(&line)
            {
                msg_store.push_session_id(session_id);
                session_id_extracted = true;
            }
        }
    }

    async fn process_agent_logs(
        mut agent_logs: BoxStream<'_, String>,
        worktree_path: PathBuf,
        entry_index_counter: EntryIndexProvider,
        msg_store: Arc<MsgStore>,
    ) {
        // Create processor for stderr content
        let mut processor = PlainTextLogProcessor::builder()
            .normalized_entry_producer(Box::new(move |content: String| {
                Self::create_normalized_entry(content, &worktree_path.clone())
            }))
            .message_boundary_predicate(Box::new(|lines: &[String]| Self::detect_tool_call(lines)))
            .index_provider(entry_index_counter.clone())
            .build();

        while let Some(line) = agent_logs.next().await {
            debug_assert!(!line.ends_with('\n'));

            // Process the line through the plain text processor
            for patch in processor.process(line + "\n") {
                msg_store.push_patch(patch);
            }
        }
    }

    /// Create normalized entry from content
    pub fn create_normalized_entry(content: String, worktree_path: &PathBuf) -> NormalizedEntry {
        // Check if this is a tool call
        if let Some(tool_call) = ToolCall::parse(&content) {
            let tool_name = tool_call.tool.name();
            let action_type =
                ToolUtils::determine_action_type(&tool_call.tool, &worktree_path.to_string_lossy());
            let tool_content =
                ToolUtils::generate_tool_content(&tool_call.tool, &worktree_path.to_string_lossy());

            return NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::ToolUse {
                    tool_name,
                    action_type,
                },
                content: tool_content,
                metadata: Some(tool_call.arguments()),
            };
        }

        // Default to assistant message
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::AssistantMessage,
            content,
            metadata: None,
        }
    }

    /// Detect message boundaries for tool calls and other content using serde deserialization
    pub fn detect_tool_call(lines: &[String]) -> Option<MessageBoundary> {
        for (i, line) in lines.iter().enumerate() {
            if ToolCall::is_tool_line(line) {
                if i == 0 {
                    // separate tool call from subsequent content
                    return Some(MessageBoundary::Split(1));
                } else {
                    // separate tool call from previous content
                    return Some(MessageBoundary::Split(i));
                }
            }
        }
        None
    }
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

/// Represents different types of tools that can be called by OpenCode
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "tool_name", content = "arguments")]
pub enum Tool {
    #[serde(rename = "read")]
    Read {
        #[serde(rename = "filePath")]
        file_path: String,
        #[serde(default)]
        offset: Option<u64>,
        #[serde(default)]
        limit: Option<u64>,
    },
    #[serde(rename = "write")]
    Write {
        #[serde(rename = "filePath")]
        file_path: String,
        content: String,
    },
    #[serde(rename = "edit")]
    Edit {
        #[serde(rename = "filePath")]
        file_path: String,
        #[serde(rename = "oldString")]
        old_string: String,
        #[serde(rename = "newString")]
        new_string: String,
        #[serde(rename = "replaceAll", default)]
        replace_all: Option<bool>,
    },
    #[serde(rename = "bash")]
    Bash {
        command: String,
        #[serde(default)]
        timeout: Option<u64>,
        #[serde(default)]
        description: Option<String>,
    },
    #[serde(rename = "grep")]
    Grep {
        pattern: String,
        #[serde(default)]
        path: Option<String>,
        #[serde(default)]
        include: Option<String>,
    },
    #[serde(rename = "glob")]
    Glob {
        pattern: String,
        #[serde(default)]
        path: Option<String>,
    },
    #[serde(rename = "todowrite")]
    TodoWrite { todos: Vec<TodoInfo> },
    #[serde(rename = "todoread")]
    TodoRead,
    #[serde(rename = "list")]
    List {
        #[serde(default)]
        path: Option<String>,
        #[serde(default)]
        ignore: Option<Vec<String>>,
    },
    #[serde(rename = "webfetch")]
    WebFetch {
        url: String,
        #[serde(default)]
        format: Option<WebFetchFormat>,
        #[serde(default)]
        timeout: Option<u64>,
    },
    /// Catch-all for unknown tools (including MCP tools)
    Other {
        tool_name: String,
        arguments: serde_json::Value,
    },
}

/// TODO information structure
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct TodoInfo {
    pub content: String,
    pub status: String,
    #[serde(default)]
    pub priority: Option<String>,
}

/// Web fetch format options
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "lowercase")]
pub enum WebFetchFormat {
    Text,
    Markdown,
    Html,
}

impl Tool {
    /// Get the tool name as a string
    pub fn name(&self) -> String {
        match self {
            Tool::Read { .. } => "read".to_string(),
            Tool::Write { .. } => "write".to_string(),
            Tool::Edit { .. } => "edit".to_string(),
            Tool::Bash { .. } => "bash".to_string(),
            Tool::Grep { .. } => "grep".to_string(),
            Tool::Glob { .. } => "glob".to_string(),
            Tool::TodoWrite { .. } => "todowrite".to_string(),
            Tool::TodoRead => "todoread".to_string(),
            Tool::List { .. } => "list".to_string(),
            Tool::WebFetch { .. } => "webfetch".to_string(),
            Tool::Other { tool_name, .. } => tool_name.clone(),
        }
    }

    /// Get the tool arguments as JSON value
    pub fn arguments(&self) -> serde_json::Value {
        match self {
            Tool::Read {
                file_path,
                offset,
                limit,
            } => {
                let mut args = serde_json::json!({ "filePath": file_path });
                if let Some(offset) = offset {
                    args["offset"] = (*offset).into();
                }
                if let Some(limit) = limit {
                    args["limit"] = (*limit).into();
                }
                args
            }
            Tool::Write { file_path, content } => {
                serde_json::json!({ "filePath": file_path, "content": content })
            }
            Tool::Edit {
                file_path,
                old_string,
                new_string,
                replace_all,
            } => {
                let mut args = serde_json::json!({
                    "filePath": file_path,
                    "oldString": old_string,
                    "newString": new_string
                });
                if let Some(replace_all) = replace_all {
                    args["replaceAll"] = (*replace_all).into();
                }
                args
            }
            Tool::Bash {
                command,
                timeout,
                description,
            } => {
                let mut args = serde_json::json!({ "command": command });
                if let Some(timeout) = timeout {
                    args["timeout"] = (*timeout).into();
                }
                if let Some(description) = description {
                    args["description"] = description.clone().into();
                }
                args
            }
            Tool::Grep {
                pattern,
                path,
                include,
            } => {
                let mut args = serde_json::json!({ "pattern": pattern });
                if let Some(path) = path {
                    args["path"] = path.clone().into();
                }
                if let Some(include) = include {
                    args["include"] = include.clone().into();
                }
                args
            }
            Tool::Glob { pattern, path } => {
                let mut args = serde_json::json!({ "pattern": pattern });
                if let Some(path) = path {
                    args["path"] = path.clone().into();
                }
                args
            }
            Tool::TodoWrite { todos } => {
                serde_json::json!({ "todos": todos })
            }
            Tool::TodoRead => serde_json::Value::Null,
            Tool::List { path, ignore } => {
                let mut args = serde_json::Value::Object(serde_json::Map::new());
                if let Some(path) = path {
                    args["path"] = path.clone().into();
                }
                if let Some(ignore) = ignore {
                    args["ignore"] = ignore.clone().into();
                }
                args
            }
            Tool::WebFetch {
                url,
                format,
                timeout,
            } => {
                let mut args = serde_json::json!({ "url": url });
                if let Some(format) = format {
                    args["format"] = match format {
                        WebFetchFormat::Text => "text".into(),
                        WebFetchFormat::Markdown => "markdown".into(),
                        WebFetchFormat::Html => "html".into(),
                    };
                }
                if let Some(timeout) = timeout {
                    args["timeout"] = (*timeout).into();
                }
                args
            }
            Tool::Other { arguments, .. } => arguments.clone(),
        }
    }
}

// =============================================================================
// TOOL CALL PARSING
// =============================================================================

/// Represents a parsed tool call line from OpenCode output
#[derive(Debug, Clone, PartialEq)]
pub struct ToolCall {
    pub tool: Tool,
}

impl ToolCall {
    /// Parse a tool call from a string that starts with |
    pub fn parse(line: &str) -> Option<Self> {
        let line: &str = line.trim_end();
        if !line.starts_with('|') {
            return None;
        }

        // Remove the | and any surrounding whitespace
        let content = line[1..].trim();

        // Split into tool name and JSON arguments
        let parts: Vec<&str> = content.splitn(2, char::is_whitespace).collect();
        if parts.len() != 2 {
            return None;
        }

        let tool_name = parts[0].to_string().to_lowercase();
        let args_str = parts[1].trim();

        // Try to parse the arguments as JSON
        let arguments: serde_json::Value = match serde_json::from_str(args_str) {
            Ok(args) => args,
            Err(_) => return None,
        };

        // Create a JSON object that matches our Tool enum's serde format
        let tool_json = serde_json::json!({
            "tool_name": tool_name,
            "arguments": arguments
        });

        // Let serde deserialize the tool automatically
        match serde_json::from_value::<Tool>(tool_json) {
            Ok(tool) => Some(ToolCall { tool }),
            Err(_) => {
                // If serde parsing fails, fall back to Other variant
                Some(ToolCall {
                    tool: Tool::Other {
                        tool_name,
                        arguments,
                    },
                })
            }
        }
    }

    /// Check if a line is a valid tool line
    pub fn is_tool_line(line: &str) -> bool {
        Self::parse(line).is_some()
    }

    /// Get the tool name
    pub fn tool_name(&self) -> String {
        self.tool.name()
    }

    /// Get the tool arguments as JSON
    pub fn arguments(&self) -> serde_json::Value {
        self.tool.arguments()
    }
}

impl fmt::Display for ToolCall {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "| {} {}", self.tool.name(), self.tool.arguments())
    }
}

// =============================================================================
// TOOL UTILITIES
// =============================================================================

/// Utilities for processing tool calls
pub struct ToolUtils;

impl ToolUtils {
    pub fn normalize_tool_name(tool_name: &str) -> String {
        tool_name.to_lowercase()
    }

    /// Helper function to determine action type for tool usage
    pub fn determine_action_type(tool: &Tool, worktree_path: &str) -> ActionType {
        match tool {
            Tool::Read { file_path, .. } => ActionType::FileRead {
                path: make_path_relative(file_path, worktree_path),
            },
            Tool::Write {
                file_path, content, ..
            } => {
                let diffs = vec![EditDiff::Replace {
                    old: String::new(),
                    new: content.clone(),
                }];
                ActionType::FileEdit {
                    path: make_path_relative(file_path, worktree_path),
                    diffs,
                }
            }
            Tool::Edit {
                file_path,
                old_string,
                new_string,
                ..
            } => {
                let diffs = vec![EditDiff::Replace {
                    old: old_string.clone(),
                    new: new_string.clone(),
                }];
                ActionType::FileEdit {
                    path: make_path_relative(file_path, worktree_path),
                    diffs,
                }
            }
            Tool::Bash { command, .. } => ActionType::CommandRun {
                command: command.clone(),
            },
            Tool::Grep { pattern, .. } => ActionType::Search {
                query: pattern.clone(),
            },
            Tool::Glob { pattern, .. } => ActionType::Search {
                query: format!("glob: {pattern}"),
            },
            Tool::List { .. } => ActionType::Other {
                description: "Directory listing".to_string(),
            },
            Tool::WebFetch { url, .. } => ActionType::Other {
                description: format!("Web fetch: {url}"),
            },
            Tool::TodoWrite { .. } | Tool::TodoRead => ActionType::Other {
                description: "TODO list management".to_string(),
            },
            Tool::Other { tool_name, .. } => {
                // Handle MCP tools (format: client_name_tool_name)
                if tool_name.contains('_') {
                    ActionType::Other {
                        description: format!("MCP tool: {tool_name}"),
                    }
                } else {
                    ActionType::Other {
                        description: format!("Tool: {tool_name}"),
                    }
                }
            }
        }
    }

    /// Helper function to generate concise content for tool usage
    pub fn generate_tool_content(tool: &Tool, worktree_path: &str) -> String {
        match tool {
            Tool::Read { file_path, .. } => {
                format!("`{}`", make_path_relative(file_path, worktree_path))
            }
            Tool::Write { file_path, .. } | Tool::Edit { file_path, .. } => {
                format!("`{}`", make_path_relative(file_path, worktree_path))
            }
            Tool::Bash { command, .. } => {
                format!("`{command}`")
            }
            Tool::Grep {
                pattern,
                path,
                include,
            } => {
                let search_path = path.as_deref().unwrap_or(".");
                match include {
                    Some(include_pattern) => {
                        format!("`{pattern}` in `{search_path}` ({include_pattern})")
                    }
                    None => format!("`{pattern}` in `{search_path}`"),
                }
            }
            Tool::Glob { pattern, path } => {
                let search_path = path.as_deref().unwrap_or(".");
                format!("glob `{pattern}` in `{search_path}`")
            }
            Tool::List { path, .. } => {
                if let Some(path) = path {
                    format!("`{}`", make_path_relative(path, worktree_path))
                } else {
                    "List directory".to_string()
                }
            }
            Tool::WebFetch { url, .. } => {
                format!("fetch `{url}`")
            }
            Tool::TodoWrite { todos } => Self::generate_todo_content(todos),
            Tool::TodoRead => "Managing TODO list".to_string(),
            Tool::Other { tool_name, .. } => {
                // Handle MCP tools (format: client_name_tool_name)
                if tool_name.contains('_') {
                    format!("MCP: `{tool_name}`")
                } else {
                    format!("`{tool_name}`")
                }
            }
        }
    }

    /// Generate formatted content for TODO tools from TodoInfo struct
    fn generate_todo_content(todos: &[TodoInfo]) -> String {
        if todos.is_empty() {
            return "Managing TODO list".to_string();
        }

        let mut todo_items = Vec::new();
        for todo in todos {
            let status_emoji = match todo.status.as_str() {
                "completed" => "✅",
                "in_progress" => "🔄",
                "pending" | "todo" => "⏳",
                _ => "📝",
            };
            let priority = todo.priority.as_deref().unwrap_or("medium");
            todo_items.push(format!("{} {} ({})", status_emoji, todo.content, priority));
        }
        format!("TODO List:\n{}", todo_items.join("\n"))
    }
}

// =============================================================================
// Log interpretation UTILITIES
// =============================================================================

lazy_static! {
    // Accurate regex for OpenCode log lines: LEVEL timestamp +ms ...
    static ref OPENCODE_LOG_REGEX: Regex = Regex::new(r"^(INFO|DEBUG|WARN|ERROR)\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\s+\+\d+\s*ms.*").unwrap();
    static ref SESSION_ID_REGEX: Regex = Regex::new(r".*\b(id|session|sessionID)=([^ ]+)").unwrap();
    static ref NPM_WARN_REGEX: Regex = Regex::new(r"^npm warn .*").unwrap();
}

/// Log utilities for OpenCode processing
pub struct LogUtils;

impl LogUtils {
    /// Strip ANSI escape codes from text (conservative)
    pub fn strip_ansi_codes(text: &str) -> String {
        // Handle both unicode escape sequences and raw ANSI codes
        let result = text.replace("\\u001b", "\x1b");

        let mut cleaned = String::new();
        let mut chars = result.chars().peekable();

        while let Some(ch) = chars.next() {
            if ch == '\x1b' {
                // Skip ANSI escape sequence
                if chars.peek() == Some(&'[') {
                    chars.next(); // consume '['
                    // Skip until we find a letter (end of ANSI sequence)
                    for next_ch in chars.by_ref() {
                        if next_ch.is_ascii_alphabetic() {
                            break;
                        }
                    }
                }
            } else {
                cleaned.push(ch);
            }
        }

        cleaned
    }

    /// Check if a line should be skipped as noise
    pub fn is_noise(line: &str) -> bool {
        // Empty lines are noise
        if line.is_empty() {
            return true;
        }

        let line = line.trim();

        if NPM_WARN_REGEX.is_match(line) {
            return true;
        }

        // Spinner glyphs
        if line.len() == 1 && "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏".contains(line) {
            return true;
        }

        // Banner lines containing block glyphs (Unicode Block Elements range)
        if line
            .chars()
            .take(1)
            .any(|c| ('\u{2580}'..='\u{259F}').contains(&c))
        {
            return true;
        }

        // UI/stats frames using Box Drawing glyphs (U+2500-257F)
        if line
            .chars()
            .take(1)
            .any(|c| ('\u{2500}'..='\u{257F}').contains(&c))
        {
            return true;
        }

        // Model banner (@ with spaces)
        if line.starts_with("@ ") {
            return true;
        }

        // Share link
        if line.starts_with("~  https://opencode.ai/s/") {
            return true;
        }

        // Everything else is NOT noise
        false
    }

    /// Detect if a line is an OpenCode log line format using regex
    pub fn is_opencode_log_line(line: &str) -> bool {
        OPENCODE_LOG_REGEX.is_match(line)
    }

    pub fn is_error_line(line: &str) -> bool {
        line.starts_with("!  ")
    }

    /// Parse session_id from OpenCode log lines
    pub fn parse_session_id_from_line(line: &str) -> Option<String> {
        // Only apply to OpenCode log lines
        if !Self::is_opencode_log_line(line) {
            return None;
        }

        // Try regex for session ID extraction from service=session logs
        if let Some(captures) = SESSION_ID_REGEX.captures(line)
            && let Some(id) = captures.get(2)
        {
            return Some(id.as_str().to_string());
        }

        None
    }
}
