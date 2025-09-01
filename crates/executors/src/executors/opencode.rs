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
use utils::{
    diff::create_unified_diff, msg_store::MsgStore, path::make_path_relative,
    shell::get_shell_command,
};

use crate::{
    command::CommandBuilder,
    executors::{ExecutorError, StandardCodingAgentExecutor},
    logs::{
        ActionType, FileChange, NormalizedEntry, NormalizedEntryType, TodoItem,
        plain_text_processor::{MessageBoundary, PlainTextLogProcessor},
        utils::EntryIndexProvider,
    },
};

/// An executor that uses OpenCode to process tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct Opencode {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub append_prompt: Option<String>,
}

impl Opencode {
    fn build_command_builder(&self) -> CommandBuilder {
        CommandBuilder::new("npx -y opencode-ai@latest run").params(["--print-logs"])
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
        let opencode_command = self.build_command_builder().build_initial();

        let combined_prompt = utils::text::combine_prompt(&self.append_prompt, prompt);

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
        let opencode_command = self
            .build_command_builder()
            .build_follow_up(&["--session".to_string(), session_id.to_string()]);

        let combined_prompt = utils::text::combine_prompt(&self.append_prompt, prompt);

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
            stdin.write_all(combined_prompt.as_bytes()).await?;
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
        let entry_index_counter = EntryIndexProvider::start_from(&msg_store);
        let worktree_path = worktree_path.clone();

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
                metadata: None,
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
        #[serde(default)]
        content: Option<String>,
    },
    #[serde(rename = "edit")]
    Edit {
        #[serde(rename = "filePath")]
        file_path: String,
        #[serde(rename = "oldString", default)]
        old_string: Option<String>,
        #[serde(rename = "newString", default)]
        new_string: Option<String>,
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
    #[serde(rename = "task")]
    Task { description: String },
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
            Tool::Task { .. } => "task".to_string(),
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
                let mut args = serde_json::json!({ "filePath": file_path });
                if let Some(content) = content {
                    args["content"] = content.clone().into();
                }
                args
            }
            Tool::Edit {
                file_path,
                old_string,
                new_string,
                replace_all,
            } => {
                let mut args = serde_json::json!({
                    "filePath": file_path
                });
                if let Some(old_string) = old_string {
                    args["oldString"] = old_string.clone().into();
                }
                if let Some(new_string) = new_string {
                    args["newString"] = new_string.clone().into();
                }
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
            Tool::Task { description } => {
                serde_json::json!({ "description": description })
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
    ///
    /// Supports both legacy JSON argument format and new simplified formats, e.g.:
    /// |  Write    drill.md
    /// |  Read     drill.md
    /// |  Edit     drill.md
    /// |  List     {"path":"/path","ignore":["node_modules"]}
    /// |  Glob     {"pattern":"*.md"}
    /// |  Grep     pattern here
    /// |  Bash     echo "cmd"
    /// |  webfetch  https://example.com (application/json)
    /// |  Todo     2 todos
    /// |  task     Some description
    pub fn parse(line: &str) -> Option<Self> {
        let line = line.trim_end();
        if !line.starts_with('|') {
            return None;
        }

        // Remove the leading '|' and trim surrounding whitespace
        let content = line[1..].trim();
        if content.is_empty() {
            return None;
        }

        // First token is the tool name, remainder are arguments
        let mut parts = content.split_whitespace();
        let raw_tool = parts.next()?;
        let tool_name = raw_tool.to_lowercase();

        // Compute the remainder (preserve original spacing after tool name)
        let rest = content.get(raw_tool.len()..).unwrap_or("").trim_start();

        // JSON tool arguments
        if rest.starts_with('{')
            && let Ok(arguments) = serde_json::from_str::<serde_json::Value>(rest)
        {
            let tool_json = serde_json::json!({
                "tool_name": tool_name,
                "arguments": arguments
            });

            return match serde_json::from_value::<Tool>(tool_json) {
                Ok(tool) => Some(ToolCall { tool }),
                Err(_) => Some(ToolCall {
                    tool: Tool::Other {
                        tool_name,
                        arguments,
                    },
                }),
            };
        }

        // Simplified tool argument summary
        let tool = match tool_name.as_str() {
            "read" => Tool::Read {
                file_path: rest.to_string(),
                offset: None,
                limit: None,
            },
            "write" => Tool::Write {
                file_path: rest.to_string(),
                // Simplified logs omit content; set to None
                content: None,
            },
            "edit" => {
                // Simplified logs provide only file path; set strings to None
                Tool::Edit {
                    file_path: rest.to_string(),
                    old_string: None,
                    new_string: None,
                    replace_all: None,
                }
            }
            "bash" => Tool::Bash {
                command: rest.to_string(),
                timeout: None,
                description: None,
            },
            "grep" => Tool::Grep {
                // Treat the remainder as the pattern if not JSON
                pattern: rest.to_string(),
                path: None,
                include: None,
            },
            "glob" => Tool::Glob {
                pattern: rest.to_string(),
                path: None,
            },
            "list" => {
                if rest.is_empty() {
                    Tool::List {
                        path: None,
                        ignore: None,
                    }
                } else {
                    Tool::List {
                        path: Some(rest.to_string()),
                        ignore: None,
                    }
                }
            }
            "webfetch" => {
                // Extract the first token as URL, ignore trailing "(...)" content-type hints
                let url = rest.split_whitespace().next().unwrap_or(rest).to_string();
                Tool::WebFetch {
                    url,
                    format: None,
                    timeout: None,
                }
            }
            "todo" => Tool::TodoRead,
            "task" => {
                // Use the rest as the task description
                Tool::Task {
                    description: rest.to_string(),
                }
            }
            other => {
                let arguments = if rest.is_empty() {
                    serde_json::Value::Null
                } else {
                    serde_json::json!({ "content": rest })
                };
                Tool::Other {
                    tool_name: other.to_string(),
                    arguments,
                }
            }
        };

        Some(ToolCall { tool })
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
                let changes = if let Some(content) = content.clone() {
                    vec![FileChange::Write { content }]
                } else {
                    vec![]
                };
                ActionType::FileEdit {
                    path: make_path_relative(file_path, worktree_path),
                    changes,
                }
            }
            Tool::Edit {
                file_path,
                old_string,
                new_string,
                ..
            } => {
                let changes = match (old_string, new_string) {
                    (Some(old), Some(new)) => vec![FileChange::Edit {
                        unified_diff: create_unified_diff(file_path, old, new),
                        has_line_numbers: false,
                    }],
                    _ => Vec::new(),
                };
                ActionType::FileEdit {
                    path: make_path_relative(file_path, worktree_path),
                    changes,
                }
            }
            Tool::Bash { command, .. } => ActionType::CommandRun {
                command: command.clone(),
                result: None,
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
            Tool::TodoWrite { todos } => ActionType::TodoManagement {
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
            Tool::TodoRead => ActionType::TodoManagement {
                todos: vec![],
                operation: "read".to_string(),
            },
            Tool::Task { description } => ActionType::Other {
                description: format!("Task: {description}"),
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
                    format!(
                        "List directory: `{}`",
                        make_path_relative(path, worktree_path)
                    )
                } else {
                    "List directory".to_string()
                }
            }
            Tool::WebFetch { url, .. } => {
                format!("fetch `{url}`")
            }
            Tool::Task { description } => {
                format!("Task: `{description}`")
            }
            Tool::TodoWrite { .. } => "TODO list updated".to_string(),
            Tool::TodoRead => "TODO list read".to_string(),
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
}

// =============================================================================
// Log interpretation UTILITIES
// =============================================================================

lazy_static! {
    // Accurate regex for OpenCode log lines: LEVEL timestamp +ms ...
    static ref OPENCODE_LOG_REGEX: Regex = Regex::new(r"^(INFO|DEBUG|WARN|ERROR)\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\s+\+\d+\s*ms.*").unwrap();
    static ref SESSION_ID_REGEX: Regex = Regex::new(r".*\b(id|session|sessionID)=([^ ]+)").unwrap();
    static ref NPM_WARN_REGEX: Regex = Regex::new(r"^npm warn .*").unwrap();
    static ref CWD_GIT_LOG_NOISE: Regex = Regex::new(r"^ cwd=.* git=.*/snapshots tracking$").unwrap();
}

/// Log utilities for OpenCode processing
pub struct LogUtils;

impl LogUtils {
    /// Check if a line should be skipped as noise
    pub fn is_noise(line: &str) -> bool {
        // Empty lines are noise
        if line.is_empty() {
            return true;
        }

        if CWD_GIT_LOG_NOISE.is_match(line) {
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
