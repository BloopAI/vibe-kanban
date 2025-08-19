use core::str;
use std::{path::PathBuf, process::Stdio, sync::Arc, time::Duration};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use utils::{
    diff::{
        concatenate_diff_hunks, create_unified_diff, create_unified_diff_hunk,
        extract_unified_diff_hunks,
    },
    msg_store::MsgStore,
    path::make_path_relative,
    shell::get_shell_command,
};

use crate::{
    command::CommandBuilder,
    executors::{ExecutorError, StandardCodingAgentExecutor},
    logs::{
        ActionType, FileChange, NormalizedEntry, NormalizedEntryType, TodoItem,
        plain_text_processor::PlainTextLogProcessor,
        utils::{ConversationPatch, EntryIndexProvider},
    },
};

/// Executor for running Cursor CLI and normalizing its JSONL stream
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct Cursor {
    pub command: CommandBuilder,
    pub append_prompt: Option<String>,
}

#[async_trait]
impl StandardCodingAgentExecutor for Cursor {
    async fn spawn(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let agent_cmd = self.command.build_initial();

        let combined_prompt = utils::text::combine_prompt(&self.append_prompt, prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&agent_cmd);

        let mut child = command.group_spawn()?;

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
        let agent_cmd = self
            .command
            .build_follow_up(&["--resume".to_string(), session_id.to_string()]);

        let combined_prompt = utils::text::combine_prompt(&self.append_prompt, prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&agent_cmd);

        let mut child = command.group_spawn()?;

        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &PathBuf) {
        let entry_index_provider = EntryIndexProvider::seeded_from_msg_store(&msg_store);

        // Process Cursor stdout JSONL with typed serde models
        let current_dir = worktree_path.clone();
        tokio::spawn(async move {
            let mut lines = msg_store.stdout_lines_stream();

            // Cursor agent doesn't use STDERR. Everything comes through STDOUT, both JSONL and raw error output.
            let mut error_plaintext_processor = PlainTextLogProcessor::builder()
                .normalized_entry_producer(Box::new(|content: String| NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::ErrorMessage,
                    content,
                    metadata: None,
                }))
                .time_gap(Duration::from_secs(2)) // Break messages if they are 2 seconds apart
                .index_provider(entry_index_provider.clone())
                .build();

            // Assistant streaming coalescer state
            let mut model_reported = false;
            let mut session_id_reported = false;

            let mut current_assistant_message_buffer = String::new();
            let mut current_assistant_message_index: Option<usize> = None;

            let worktree_str = current_dir.to_string_lossy().to_string();

            while let Some(Ok(line)) = lines.next().await {
                // Parse line as CursorJson
                let cursor_json: CursorJson = match serde_json::from_str(&line) {
                    Ok(cursor_json) => cursor_json,
                    Err(_) => {
                        // Not valid JSON, treat as raw error output
                        let line = strip_ansi_escapes::strip_str(line);
                        let line = strip_cursor_ascii_art_banner(line);
                        if line.trim().is_empty() {
                            continue; // Skip empty lines after stripping Noise
                        }

                        // Provide a useful sign-in message if needed
                        let line = if line == "Press any key to sign in..." {
                            "Please sign in to Cursor CLI using `cursor-agent login` or set the CURSOR_API_KEY environment variable.".to_string()
                        } else {
                            line
                        };

                        for patch in error_plaintext_processor.process(line + "\n") {
                            msg_store.push_patch(patch);
                        }
                        continue;
                    }
                };

                // Push session_id if present
                if !session_id_reported && let Some(session_id) = cursor_json.extract_session_id() {
                    msg_store.push_session_id(session_id);
                    session_id_reported = true;
                }

                let is_assistant_message = matches!(cursor_json, CursorJson::Assistant { .. });
                if !is_assistant_message && current_assistant_message_index.is_some() {
                    // flush
                    current_assistant_message_index = None;
                    current_assistant_message_buffer.clear();
                }

                match &cursor_json {
                    CursorJson::System { model, .. } => {
                        if !model_reported && let Some(model) = model.as_ref() {
                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::SystemMessage,
                                content: format!("System initialized with model: {model}"),
                                metadata: None,
                            };
                            let id = entry_index_provider.next();
                            msg_store
                                .push_patch(ConversationPatch::add_normalized_entry(id, entry));
                            model_reported = true;
                        }
                    }

                    CursorJson::User { .. } => {}

                    CursorJson::Assistant { message, .. } => {
                        if let Some(chunk) = message.concat_text() {
                            current_assistant_message_buffer.push_str(&chunk);
                            let replace_entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::AssistantMessage,
                                content: current_assistant_message_buffer.clone(),
                                metadata: None,
                            };
                            if let Some(id) = current_assistant_message_index {
                                msg_store.push_patch(ConversationPatch::replace(id, replace_entry))
                            } else {
                                let id = entry_index_provider.next();
                                current_assistant_message_index = Some(id);
                                msg_store.push_patch(ConversationPatch::add_normalized_entry(
                                    id,
                                    replace_entry,
                                ));
                            };
                        }
                    }

                    CursorJson::ToolCall {
                        subtype, tool_call, ..
                    } => {
                        // Only process "started" subtype (completed contains results we currently ignore)
                        if subtype
                            .as_deref()
                            .map(|s| s.eq_ignore_ascii_case("started"))
                            .unwrap_or(false)
                        {
                            let tool_name = tool_call.get_name().to_string();
                            let (action_type, content) =
                                tool_call.to_action_and_content(&worktree_str);

                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::ToolUse {
                                    tool_name,
                                    action_type,
                                },
                                content,
                                metadata: None,
                            };
                            let id = entry_index_provider.next();
                            msg_store
                                .push_patch(ConversationPatch::add_normalized_entry(id, entry));
                        }
                    }

                    CursorJson::Result { .. } => {
                        // no-op; metadata-only events not surfaced
                    }

                    CursorJson::Unknown => {
                        let entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::SystemMessage,
                            content: format!("Raw output: `{line}`"),
                            metadata: None,
                        };
                        let id = entry_index_provider.next();
                        msg_store.push_patch(ConversationPatch::add_normalized_entry(id, entry));
                    }
                }
            }
        });
    }
}

fn strip_cursor_ascii_art_banner(line: String) -> String {
    static BANNER_LINES: std::sync::OnceLock<Vec<String>> = std::sync::OnceLock::new();
    let banner_lines = BANNER_LINES.get_or_init(|| {
        r#"            +i":;;
        [?+<l,",::;;;I
      {[]_~iI"":::;;;;II
  )){↗↗↗↗↗↗↗↗↗↗↗↗↗↗↗↗↗↗↗↗↗ll          …  Cursor Agent
  11{[#M##M##M#########*ppll
  11}[]-+############oppqqIl
  1}[]_+<il;,####bpqqqqwIIII
  []?_~<illi_++qqwwwwww;IIII
  ]?-+~>i~{??--wwwwwww;;;III
  -_+]>{{{}}[[[mmmmmm_<_:;;I
  r\\|||(()))))mmmm)1)111{?_
   t/\\\\\|||(|ZZZ||\\\/tf^
        ttttt/tZZfff^>
            ^^^O>>
              >>"#
        .lines()
        .map(str::to_string)
        .collect()
    });

    for banner_line in banner_lines {
        if line.starts_with(banner_line) {
            return line.replacen(banner_line, "", 1).trim().to_string();
        }
    }
    line
}

/* ===========================
Typed Cursor JSON structures
=========================== */

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum CursorJson {
    #[serde(rename = "system")]
    System {
        #[serde(default)]
        subtype: Option<String>,
        #[serde(default, rename = "apiKeySource")]
        api_key_source: Option<String>,
        #[serde(default)]
        cwd: Option<String>,
        #[serde(default)]
        session_id: Option<String>,
        #[serde(default)]
        model: Option<String>,
        #[serde(default, rename = "permissionMode")]
        permission_mode: Option<String>,
    },
    #[serde(rename = "user")]
    User {
        message: CursorMessage,
        #[serde(default)]
        session_id: Option<String>,
    },
    #[serde(rename = "assistant")]
    Assistant {
        message: CursorMessage,
        #[serde(default)]
        session_id: Option<String>,
    },
    #[serde(rename = "tool_call")]
    ToolCall {
        #[serde(default)]
        subtype: Option<String>, // "started" | "completed"
        #[serde(default)]
        call_id: Option<String>,
        tool_call: CursorToolCall,
        #[serde(default)]
        session_id: Option<String>,
    },
    #[serde(rename = "result")]
    Result {
        #[serde(default)]
        subtype: Option<String>,
        #[serde(default)]
        is_error: Option<bool>,
        #[serde(default)]
        duration_ms: Option<u64>,
        #[serde(default)]
        result: Option<serde_json::Value>,
    },
    #[serde(other)]
    Unknown,
}

impl CursorJson {
    pub fn extract_session_id(&self) -> Option<String> {
        match self {
            CursorJson::System { session_id, .. } => session_id.clone(),
            CursorJson::User { session_id, .. } => session_id.clone(),
            CursorJson::Assistant { session_id, .. } => session_id.clone(),
            CursorJson::ToolCall { session_id, .. } => session_id.clone(),
            CursorJson::Result { .. } => None,
            CursorJson::Unknown => None,
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorMessage {
    pub role: String,
    pub content: Vec<CursorContentItem>,
}

impl CursorMessage {
    pub fn concat_text(&self) -> Option<String> {
        let mut out = String::new();
        for CursorContentItem::Text { text } in &self.content {
            out.push_str(text);
        }
        if out.is_empty() { None } else { Some(out) }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum CursorContentItem {
    #[serde(rename = "text")]
    Text { text: String },
}

/* ===========================
Tool call structure
=========================== */

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub enum CursorToolCall {
    #[serde(rename = "shellToolCall")]
    Shell {
        args: CursorShellArgs,
        #[serde(default)]
        result: Option<serde_json::Value>,
    },
    #[serde(rename = "lsToolCall")]
    LS {
        args: CursorLsArgs,
        #[serde(default)]
        result: Option<serde_json::Value>,
    },
    #[serde(rename = "globToolCall")]
    Glob {
        args: CursorGlobArgs,
        #[serde(default)]
        result: Option<serde_json::Value>,
    },
    #[serde(rename = "grepToolCall")]
    Grep {
        args: CursorGrepArgs,
        #[serde(default)]
        result: Option<serde_json::Value>,
    },
    #[serde(rename = "writeToolCall")]
    Write {
        args: CursorWriteArgs,
        #[serde(default)]
        result: Option<serde_json::Value>,
    },
    #[serde(rename = "readToolCall")]
    Read {
        args: CursorReadArgs,
        #[serde(default)]
        result: Option<serde_json::Value>,
    },
    #[serde(rename = "editToolCall")]
    Edit {
        args: CursorEditArgs,
        #[serde(default)]
        result: Option<serde_json::Value>,
    },
    #[serde(rename = "deleteToolCall")]
    Delete {
        args: CursorDeleteArgs,
        #[serde(default)]
        result: Option<serde_json::Value>,
    },
    #[serde(rename = "updateTodosToolCall")]
    Todo {
        args: CursorUpdateTodosArgs,
        #[serde(default)]
        result: Option<serde_json::Value>,
    },
    /// Generic fallback for unknown tools (amp.rs pattern)
    #[serde(untagged)]
    Unknown {
        #[serde(flatten)]
        data: std::collections::HashMap<String, serde_json::Value>,
    },
}

impl CursorToolCall {
    pub fn get_name(&self) -> &str {
        match self {
            CursorToolCall::Shell { .. } => "shell",
            CursorToolCall::LS { .. } => "ls",
            CursorToolCall::Glob { .. } => "glob",
            CursorToolCall::Grep { .. } => "grep",
            CursorToolCall::Write { .. } => "write",
            CursorToolCall::Read { .. } => "read",
            CursorToolCall::Edit { .. } => "edit",
            CursorToolCall::Delete { .. } => "delete",
            CursorToolCall::Todo { .. } => "todo",
            CursorToolCall::Unknown { data } => {
                data.keys().next().map(|s| s.as_str()).unwrap_or("unknown")
            }
        }
    }

    pub fn to_action_and_content(&self, worktree_path: &str) -> (ActionType, String) {
        match self {
            CursorToolCall::Read { args, .. } => {
                let path = make_path_relative(&args.path, worktree_path);
                (
                    ActionType::FileRead { path: path.clone() },
                    format!("`{path}`"),
                )
            }
            CursorToolCall::Write { args, .. } => {
                let path = make_path_relative(&args.path, worktree_path);
                (
                    ActionType::FileEdit {
                        path: path.clone(),
                        changes: vec![],
                    },
                    format!("`{path}`"),
                )
            }
            CursorToolCall::Edit { args, .. } => {
                let path = make_path_relative(&args.path, worktree_path);
                let mut changes = vec![];

                if let Some(apply_patch) = &args.apply_patch {
                    let hunks = extract_unified_diff_hunks(&apply_patch.patch_content);
                    changes.push(FileChange::Edit {
                        unified_diff: concatenate_diff_hunks(&path, &hunks),
                        has_line_numbers: false,
                    });
                }

                if let Some(str_replace) = &args.str_replace {
                    changes.push(FileChange::Edit {
                        unified_diff: create_unified_diff(
                            &path,
                            &str_replace.old_text,
                            &str_replace.new_text,
                        ),
                        has_line_numbers: false,
                    });
                }

                if let Some(multi_str_replace) = &args.multi_str_replace {
                    let hunks: Vec<String> = multi_str_replace
                        .edits
                        .iter()
                        .map(|edit| create_unified_diff_hunk(&edit.old_text, &edit.new_text))
                        .collect();
                    changes.push(FileChange::Edit {
                        unified_diff: concatenate_diff_hunks(&path, &hunks),
                        has_line_numbers: false,
                    });
                }

                (
                    ActionType::FileEdit {
                        path: path.clone(),
                        changes,
                    },
                    format!("`{path}`"),
                )
            }
            CursorToolCall::Delete { args, .. } => {
                let path = make_path_relative(&args.path, worktree_path);
                (
                    ActionType::FileEdit {
                        path: path.clone(),
                        changes: vec![],
                    },
                    format!("`{path}`"),
                )
            }
            CursorToolCall::Shell { args, .. } => {
                let cmd = &args.command;
                (
                    ActionType::CommandRun {
                        command: cmd.clone(),
                    },
                    format!("`{cmd}`"),
                )
            }
            CursorToolCall::Grep { args, .. } => {
                let pattern = &args.pattern;
                (
                    ActionType::Search {
                        query: pattern.clone(),
                    },
                    format!("`{pattern}`"),
                )
            }
            CursorToolCall::Glob { args, .. } => {
                let pattern = args.glob_pattern.clone().unwrap_or_else(|| "*".to_string());
                if let Some(path) = args.path.as_ref().or(args.target_directory.as_ref()) {
                    let path = make_path_relative(path, worktree_path);
                    (
                        ActionType::Search {
                            query: pattern.clone(),
                        },
                        format!("Find files: `{pattern}` in `{path}`"),
                    )
                } else {
                    (
                        ActionType::Search {
                            query: pattern.clone(),
                        },
                        format!("Find files: `{pattern}`"),
                    )
                }
            }
            CursorToolCall::LS { args, .. } => {
                let path = make_path_relative(&args.path, worktree_path);
                let content = if path.is_empty() {
                    "List directory".to_string()
                } else {
                    format!("List directory: `{path}`")
                };
                (
                    ActionType::Other {
                        description: "List directory".to_string(),
                    },
                    content,
                )
            }
            CursorToolCall::Todo { args, .. } => {
                let todos = args
                    .todos
                    .as_ref()
                    .map(|todos| {
                        todos
                            .iter()
                            .map(|t| TodoItem {
                                content: t.content.clone(),
                                status: t.status.clone(),
                                priority: None, // CursorTodoItem doesn't have priority field
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                (
                    ActionType::TodoManagement {
                        todos,
                        operation: "write".to_string(),
                    },
                    "TODO list updated".to_string(),
                )
            }
            CursorToolCall::Unknown { .. } => (
                ActionType::Other {
                    description: format!("Tool: {}", self.get_name()),
                },
                self.get_name().to_string(),
            ),
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorShellArgs {
    pub command: String,
    #[serde(default, alias = "working_directory", alias = "workingDirectory")]
    pub working_directory: Option<String>,
    #[serde(default)]
    pub timeout: Option<u64>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorLsArgs {
    pub path: String,
    #[serde(default)]
    pub ignore: Vec<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorGlobArgs {
    #[serde(default, alias = "globPattern", alias = "glob_pattern")]
    pub glob_pattern: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default, alias = "target_directory")]
    pub target_directory: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorGrepArgs {
    pub pattern: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default, alias = "glob")]
    pub glob_filter: Option<String>,
    #[serde(default, alias = "outputMode", alias = "output_mode")]
    pub output_mode: Option<String>,
    #[serde(default, alias = "-i", alias = "caseInsensitive")]
    pub case_insensitive: Option<bool>,
    #[serde(default)]
    pub multiline: Option<bool>,
    #[serde(default, alias = "headLimit", alias = "head_limit")]
    pub head_limit: Option<u64>,
    #[serde(default)]
    pub r#type: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorWriteArgs {
    pub path: String,
    #[serde(
        default,
        alias = "fileText",
        alias = "file_text",
        alias = "contents",
        alias = "content"
    )]
    pub contents: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorReadArgs {
    pub path: String,
    #[serde(default)]
    pub offset: Option<u64>,
    #[serde(default)]
    pub limit: Option<u64>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorEditArgs {
    pub path: String,
    #[serde(default, rename = "applyPatch")]
    pub apply_patch: Option<CursorApplyPatch>,
    #[serde(default, rename = "strReplace")]
    pub str_replace: Option<CursorStrReplace>,
    #[serde(default, rename = "multiStrReplace")]
    pub multi_str_replace: Option<CursorMultiStrReplace>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorApplyPatch {
    #[serde(rename = "patchContent")]
    pub patch_content: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorStrReplace {
    #[serde(rename = "oldText")]
    pub old_text: String,
    #[serde(rename = "newText")]
    pub new_text: String,
    #[serde(default, rename = "replaceAll")]
    pub replace_all: Option<bool>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorMultiStrReplace {
    pub edits: Vec<CursorMultiEditItem>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorMultiEditItem {
    #[serde(rename = "oldText")]
    pub old_text: String,
    #[serde(rename = "newText")]
    pub new_text: String,
    #[serde(default, rename = "replaceAll")]
    pub replace_all: Option<bool>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorDeleteArgs {
    pub path: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorUpdateTodosArgs {
    #[serde(default)]
    pub todos: Option<Vec<CursorTodoItem>>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorTodoItem {
    #[serde(default)]
    pub id: Option<String>,
    pub content: String,
    pub status: String,
    #[serde(default, rename = "createdAt")]
    pub created_at: Option<String>,
    #[serde(default, rename = "updatedAt")]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub dependencies: Option<Vec<String>>,
}

/* ===========================
Tests
=========================== */

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use utils::msg_store::MsgStore;

    use super::*;

    #[tokio::test]
    async fn test_cursor_streaming_patch_generation() {
        // Avoid relying on feature flag in tests; construct with a dummy command
        let executor = Cursor {
            command: CommandBuilder::new(""),
            append_prompt: None,
        };
        let msg_store = Arc::new(MsgStore::new());
        let current_dir = std::path::PathBuf::from("/tmp/test-worktree");

        // A minimal synthetic init + assistant micro-chunks (as Cursor would emit)
        msg_store.push_stdout(format!(
            "{}\n",
            r#"{"type":"system","subtype":"init","session_id":"sess-123","model":"OpenAI GPT-5"}"#
        ));
        msg_store.push_stdout(format!(
            "{}\n",
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}]}}"#
        ));
        msg_store.push_stdout(format!(
            "{}\n",
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":" world"}]}}"#
        ));
        msg_store.push_finished();

        executor.normalize_logs(msg_store.clone(), &current_dir);

        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

        // Verify patches were emitted (system init + assistant add/replace)
        let history = msg_store.get_history();
        let patch_count = history
            .iter()
            .filter(|m| matches!(m, utils::log_msg::LogMsg::JsonPatch(_)))
            .count();
        assert!(
            patch_count >= 2,
            "Expected at least 2 patches, got {patch_count}"
        );
    }

    #[test]
    fn test_session_id_extraction_from_system_line() {
        // Ensure we can parse and find session_id from a system JSON line
        let system_line = r#"{"type":"system","subtype":"init","session_id":"abc-xyz","model":"Claude 4 Sonnet"}"#;
        let parsed: CursorJson = serde_json::from_str(system_line).unwrap();
        assert_eq!(parsed.extract_session_id().as_deref(), Some("abc-xyz"));
    }

    #[test]
    fn test_cursor_tool_call_parsing() {
        // Test known variant (from reference JSONL)
        let shell_tool_json = r#"{"shellToolCall":{"args":{"command":"wc -l drill.md","workingDirectory":"","timeout":0}}}"#;
        let parsed: CursorToolCall = serde_json::from_str(shell_tool_json).unwrap();

        match parsed {
            CursorToolCall::Shell { args, result } => {
                assert_eq!(args.command, "wc -l drill.md");
                assert_eq!(args.working_directory, Some("".to_string()));
                assert_eq!(args.timeout, Some(0));
                assert_eq!(result, None);
            }
            _ => panic!("Expected Shell variant"),
        }

        // Test unknown variant (captures raw data)
        let unknown_tool_json =
            r#"{"unknownTool":{"args":{"someData":"value"},"result":{"status":"success"}}}"#;
        let parsed: CursorToolCall = serde_json::from_str(unknown_tool_json).unwrap();

        match parsed {
            CursorToolCall::Unknown { data } => {
                assert!(data.contains_key("unknownTool"));
                let unknown_tool = &data["unknownTool"];
                assert_eq!(unknown_tool["args"]["someData"], "value");
                assert_eq!(unknown_tool["result"]["status"], "success");
            }
            _ => panic!("Expected Unknown variant"),
        }
    }
}
