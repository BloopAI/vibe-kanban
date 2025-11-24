use core::str;
use std::{collections::HashMap, path::Path, process::Stdio, sync::Arc, time::Duration};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use futures::StreamExt;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use workspace_utils::{
    diff::{concatenate_diff_hunks, create_unified_diff, extract_unified_diff_hunks},
    msg_store::MsgStore,
    path::make_path_relative,
    shell::resolve_executable_path_blocking,
};

use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
    },
    logs::{
        ActionType, FileChange, NormalizedEntry, NormalizedEntryError, NormalizedEntryType,
        TodoItem, ToolStatus,
        plain_text_processor::PlainTextLogProcessor,
        utils::{ConversationPatch, EntryIndexProvider},
    },
};

mod mcp;
const CURSOR_AUTH_REQUIRED_MSG: &str = "Authentication required. Please run 'cursor-agent login' first, or set CURSOR_API_KEY environment variable.";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct CursorAgent {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(description = "Force allow commands unless explicitly denied")]
    pub force: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(description = "auto, sonnet-4.5, sonnet-4.5-thinking, gpt-5, opus-4.1, grok")]
    pub model: Option<String>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl CursorAgent {
    pub fn base_command() -> &'static str {
        "cursor-agent"
    }

    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder =
            CommandBuilder::new(Self::base_command()).params(["-p", "--output-format=stream-json"]);

        if self.force.unwrap_or(false) {
            builder = builder.extend_params(["--force"]);
        }

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for CursorAgent {
    async fn spawn(&self, current_dir: &Path, prompt: &str) -> Result<SpawnedChild, ExecutorError> {
        mcp::ensure_mcp_server_trust(self, current_dir).await;

        let command_parts = self.build_command_builder().build_initial()?;

        let (executable_path, args) = command_parts.into_resolved().await?;

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(executable_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&args);

        let mut child = command.group_spawn()?;

        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child.into())
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<SpawnedChild, ExecutorError> {
        mcp::ensure_mcp_server_trust(self, current_dir).await;

        let command_parts = self
            .build_command_builder()
            .build_follow_up(&["--resume".to_string(), session_id.to_string()])?;
        let (executable_path, args) = command_parts.into_resolved().await?;

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(executable_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&args);

        let mut child = command.group_spawn()?;

        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child.into())
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        let entry_index_provider = EntryIndexProvider::start_from(&msg_store);

        // Custom stderr processor for Cursor that detects login errors
        let msg_store_stderr = msg_store.clone();
        let entry_index_provider_stderr = entry_index_provider.clone();
        tokio::spawn(async move {
            let mut stderr = msg_store_stderr.stderr_chunked_stream();
            let mut processor = PlainTextLogProcessor::builder()
                .normalized_entry_producer(Box::new(|content: String| {
                    let content = strip_ansi_escapes::strip_str(&content);

                    NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ErrorMessage {
                            error_type: NormalizedEntryError::Other,
                        },
                        content,
                        metadata: None,
                    }
                }))
                .time_gap(Duration::from_secs(2))
                .index_provider(entry_index_provider_stderr.clone())
                .build();

            while let Some(Ok(chunk)) = stderr.next().await {
                let content = strip_ansi_escapes::strip_str(&chunk);
                if content.contains(CURSOR_AUTH_REQUIRED_MSG) {
                    let error_message = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ErrorMessage {
                            error_type: NormalizedEntryError::SetupRequired,
                        },
                        content: content.to_string(),
                        metadata: None,
                    };
                    let id = entry_index_provider_stderr.next();
                    msg_store_stderr
                        .push_patch(ConversationPatch::add_normalized_entry(id, error_message));
                } else {
                    // Always emit error message
                    for patch in processor.process(chunk) {
                        msg_store_stderr.push_patch(patch);
                    }
                }
            }
        });

        // Process Cursor stdout JSONL with typed serde models
        let current_dir = worktree_path.to_path_buf();
        tokio::spawn(async move {
            let mut lines = msg_store.stdout_lines_stream();

            // Assistant streaming coalescer state
            let mut model_reported = false;
            let mut session_id_reported = false;

            let mut current_assistant_message_buffer = String::new();
            let mut current_assistant_message_index: Option<usize> = None;
            let mut current_thinking_message_buffer = String::new();
            let mut current_thinking_message_index: Option<usize> = None;

            let worktree_str = current_dir.to_string_lossy().to_string();

            use std::collections::HashMap;
            // Track tool call_id -> entry index
            let mut call_index_map: HashMap<String, usize> = HashMap::new();

            while let Some(Ok(line)) = lines.next().await {
                // Parse line as CursorJson
                let cursor_json: CursorJson = match serde_json::from_str(&line) {
                    Ok(cursor_json) => cursor_json,
                    Err(_) => {
                        // Handle non-JSON output as raw system message
                        if !line.is_empty() {
                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::SystemMessage,
                                content: line.to_string(),
                                metadata: None,
                            };

                            let patch_id = entry_index_provider.next();
                            let patch = ConversationPatch::add_normalized_entry(patch_id, entry);
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
                let is_thinking_message = matches!(cursor_json, CursorJson::Thinking { .. });
                if !is_assistant_message && current_assistant_message_index.is_some() {
                    // flush
                    current_assistant_message_index = None;
                    current_assistant_message_buffer.clear();
                }
                if !is_thinking_message && current_thinking_message_index.is_some() {
                    current_thinking_message_index = None;
                    current_thinking_message_buffer.clear();
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
                    CursorJson::Thinking { text, .. } => {
                        if let Some(chunk) = text
                            && !chunk.is_empty()
                        {
                            current_thinking_message_buffer.push_str(chunk);
                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::Thinking,
                                content: current_thinking_message_buffer.clone(),
                                metadata: None,
                            };
                            if let Some(id) = current_thinking_message_index {
                                msg_store.push_patch(ConversationPatch::replace(id, entry));
                            } else {
                                let id = entry_index_provider.next();
                                current_thinking_message_index = Some(id);
                                msg_store
                                    .push_patch(ConversationPatch::add_normalized_entry(id, entry));
                            }
                        }
                    }

                    CursorJson::ToolCall {
                        subtype,
                        call_id,
                        tool_call,
                        ..
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
                                    status: ToolStatus::Created,
                                },
                                content,
                                metadata: None,
                            };
                            let id = entry_index_provider.next();
                            if let Some(cid) = call_id.as_ref() {
                                call_index_map.insert(cid.clone(), id);
                            }
                            msg_store
                                .push_patch(ConversationPatch::add_normalized_entry(id, entry));
                        } else if subtype
                            .as_deref()
                            .map(|s| s.eq_ignore_ascii_case("completed"))
                            .unwrap_or(false)
                            && let Some(cid) = call_id.as_ref()
                            && let Some(&idx) = call_index_map.get(cid)
                        {
                            // Compute base content and action again
                            let (mut new_action, content_str) =
                                tool_call.to_action_and_content(&worktree_str);
                            if let CursorToolCall::Shell { args, result } = &tool_call {
                                // Merge stdout/stderr and derive exit status when available using typed deserialization
                                let (stdout_val, stderr_val, exit_code) = if let Some(res) = result
                                {
                                    match serde_json::from_value::<CursorShellResult>(res.clone()) {
                                        Ok(r) => {
                                            if let Some(out) = r.into_outcome() {
                                                (out.stdout, out.stderr, out.exit_code)
                                            } else {
                                                (None, None, None)
                                            }
                                        }
                                        Err(_) => (None, None, None),
                                    }
                                } else {
                                    (None, None, None)
                                };
                                let output = match (stdout_val, stderr_val) {
                                    (Some(sout), Some(serr)) => {
                                        let st = sout.trim();
                                        let se = serr.trim();
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
                                let exit_status = exit_code
                                    .map(|code| crate::logs::CommandExitStatus::ExitCode { code });
                                new_action = ActionType::CommandRun {
                                    command: args.command.clone(),
                                    result: Some(crate::logs::CommandRunResult {
                                        exit_status,
                                        output,
                                    }),
                                };
                            } else if let CursorToolCall::Mcp { args, result } = &tool_call {
                                // Extract a human-readable text from content array using typed deserialization
                                let md: Option<String> = if let Some(res) = result {
                                    match serde_json::from_value::<CursorMcpResult>(res.clone()) {
                                        Ok(r) => r.into_markdown(),
                                        Err(_) => None,
                                    }
                                } else {
                                    None
                                };
                                let provider = args.provider_identifier.as_deref().unwrap_or("mcp");
                                let tname = args.tool_name.as_deref().unwrap_or(&args.name);
                                let label = format!("mcp:{provider}:{tname}");
                                new_action = ActionType::Tool {
                                    tool_name: label.clone(),
                                    arguments: Some(serde_json::json!({
                                        "name": args.name,
                                        "args": args.args,
                                        "providerIdentifier": args.provider_identifier,
                                        "toolName": args.tool_name,
                                    })),
                                    result: md.map(|s| crate::logs::ToolResult {
                                        r#type: crate::logs::ToolResultValueType::Markdown,
                                        value: serde_json::Value::String(s),
                                    }),
                                };
                            }

                            let entry = NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::ToolUse {
                                    tool_name: match &tool_call {
                                        CursorToolCall::Mcp { args, .. } => {
                                            let provider = args
                                                .provider_identifier
                                                .as_deref()
                                                .unwrap_or("mcp");
                                            let tname =
                                                args.tool_name.as_deref().unwrap_or(&args.name);
                                            format!("mcp:{provider}:{tname}")
                                        }
                                        _ => tool_call.get_name().to_string(),
                                    },
                                    action_type: new_action,
                                    status: ToolStatus::Success,
                                },
                                content: content_str,
                                metadata: None,
                            };
                            msg_store.push_patch(ConversationPatch::replace(idx, entry));
                        }
                    }

                    CursorJson::Result { .. } => {
                        // no-op; metadata-only events not surfaced
                    }

                    CursorJson::Unknown => {
                        let entry = NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::SystemMessage,
                            content: line,
                            metadata: None,
                        };
                        let id = entry_index_provider.next();
                        msg_store.push_patch(ConversationPatch::add_normalized_entry(id, entry));
                    }
                }
            }
        });
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".cursor").join("mcp.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let binary_found = resolve_executable_path_blocking(Self::base_command()).is_some();
        if !binary_found {
            return AvailabilityInfo::NotFound;
        }

        let config_files_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        if config_files_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
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
    #[serde(rename = "thinking")]
    Thinking {
        #[serde(default)]
        subtype: Option<String>,
        #[serde(default)]
        text: Option<String>,
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
            CursorJson::Thinking { session_id, .. } => session_id.clone(),
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
    #[serde(rename = "semSearchToolCall")]
    SemSearch {
        args: CursorSemSearchArgs,
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
        result: Option<CursorEditResult>,
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
    #[serde(rename = "mcpToolCall")]
    Mcp {
        args: CursorMcpArgs,
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
            CursorToolCall::SemSearch { .. } => "semsearch",
            CursorToolCall::Write { .. } => "write",
            CursorToolCall::Read { .. } => "read",
            CursorToolCall::Edit { .. } => "edit",
            CursorToolCall::Delete { .. } => "delete",
            CursorToolCall::Todo { .. } => "todo",
            CursorToolCall::Mcp { .. } => "mcp",
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
            CursorToolCall::Edit { args, result, .. } => {
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
                    let edits: Vec<FileChange> = multi_str_replace
                        .edits
                        .iter()
                        .map(|edit| FileChange::Edit {
                            unified_diff: create_unified_diff(
                                &path,
                                &edit.old_text,
                                &edit.new_text,
                            ),
                            has_line_numbers: false,
                        })
                        .collect();
                    changes.extend(edits);
                }

                if changes.is_empty()
                    && let Some(CursorEditResult::Success(CursorEditSuccessResult {
                        diff_string: Some(diff_string),
                        ..
                    })) = &result
                {
                    let hunks = extract_unified_diff_hunks(diff_string);
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
                        changes: vec![FileChange::Delete],
                    },
                    format!("`{path}`"),
                )
            }
            CursorToolCall::Shell { args, .. } => {
                let cmd = &args.command;
                (
                    ActionType::CommandRun {
                        command: cmd.clone(),
                        result: None,
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
            CursorToolCall::SemSearch { args, .. } => {
                let query = &args.query;
                (
                    ActionType::Search {
                        query: query.clone(),
                    },
                    format!("`{query}`"),
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
            CursorToolCall::Mcp { args, .. } => {
                let provider = args.provider_identifier.as_deref().unwrap_or("mcp");
                let tool_name = args.tool_name.as_deref().unwrap_or(&args.name);
                let label = format!("mcp:{provider}:{tool_name}");
                let summary = tool_name.to_string();
                let mut arguments = serde_json::json!({
                    "name": args.name,
                    "args": args.args,
                });
                if let Some(p) = &args.provider_identifier {
                    arguments["providerIdentifier"] = serde_json::Value::String(p.clone());
                }
                if let Some(tn) = &args.tool_name {
                    arguments["toolName"] = serde_json::Value::String(tn.clone());
                }
                (
                    ActionType::Tool {
                        tool_name: label,
                        arguments: Some(arguments),
                        result: None,
                    },
                    summary,
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

/* ===========================
Typed tool results for Cursor
=========================== */

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorShellOutcome {
    #[serde(default)]
    pub stdout: Option<String>,
    #[serde(default)]
    pub stderr: Option<String>,
    #[serde(default, rename = "exitCode")]
    pub exit_code: Option<i32>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorShellWrappedResult {
    #[serde(default)]
    pub success: Option<CursorShellOutcome>,
    #[serde(default)]
    pub failure: Option<CursorShellOutcome>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(untagged)]
pub enum CursorShellResult {
    Wrapped(CursorShellWrappedResult),
    Flat(CursorShellOutcome),
    Unknown(serde_json::Value),
}

impl CursorShellResult {
    pub fn into_outcome(self) -> Option<CursorShellOutcome> {
        match self {
            CursorShellResult::Flat(o) => Some(o),
            CursorShellResult::Wrapped(w) => w.success.or(w.failure),
            CursorShellResult::Unknown(_) => None,
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorMcpTextInner {
    pub text: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorMcpContentItem {
    #[serde(default)]
    pub text: Option<CursorMcpTextInner>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorMcpOutcome {
    #[serde(default)]
    pub content: Option<Vec<CursorMcpContentItem>>,
    #[serde(default, rename = "isError")]
    pub is_error: Option<bool>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorMcpWrappedResult {
    #[serde(default)]
    pub success: Option<CursorMcpOutcome>,
    #[serde(default)]
    pub failure: Option<CursorMcpOutcome>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(untagged)]
pub enum CursorMcpResult {
    Wrapped(CursorMcpWrappedResult),
    Flat(CursorMcpOutcome),
    Unknown(serde_json::Value),
}

impl CursorMcpResult {
    pub fn into_markdown(self) -> Option<String> {
        let outcome = match self {
            CursorMcpResult::Flat(o) => Some(o),
            CursorMcpResult::Wrapped(w) => w.success.or(w.failure),
            CursorMcpResult::Unknown(_) => None,
        }?;

        let items = outcome.content.unwrap_or_default();
        let mut parts: Vec<String> = Vec::new();
        for item in items {
            if let Some(t) = item.text {
                parts.push(t.text);
            }
        }
        if parts.is_empty() {
            None
        } else {
            Some(parts.join("\n\n"))
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
    #[serde(default, alias = "targetDirectory")]
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
pub struct CursorSemSearchArgs {
    pub query: String,
    #[serde(default, alias = "targetDirectories")]
    pub target_directories: Option<Vec<String>>,
    #[serde(default)]
    pub explanation: Option<String>,
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
#[serde(rename_all = "lowercase")]
pub enum CursorEditResult {
    Success(CursorEditSuccessResult),
    #[serde(untagged)]
    Unknown {
        #[serde(flatten)]
        data: HashMap<String, serde_json::Value>,
    },
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct CursorEditSuccessResult {
    pub path: String,
    #[serde(default, rename = "resultForModel")]
    pub result_for_model: Option<String>,
    #[serde(default, rename = "linesAdded")]
    pub lines_added: Option<u64>,
    #[serde(default, rename = "linesRemoved")]
    pub lines_removed: Option<u64>,
    #[serde(default, rename = "diffString")]
    pub diff_string: Option<String>,
    #[serde(default, rename = "afterFullFileContent")]
    pub after_full_file_content: Option<String>,
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
pub struct CursorMcpArgs {
    pub name: String,
    #[serde(default)]
    pub args: serde_json::Value,
    #[serde(default, alias = "providerIdentifier")]
    pub provider_identifier: Option<String>,
    #[serde(default, alias = "toolName")]
    pub tool_name: Option<String>,
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

    use workspace_utils::msg_store::MsgStore;

    use super::*;

    #[tokio::test]
    async fn test_cursor_streaming_patch_generation() {
        // Avoid relying on feature flag in tests; construct with a dummy command
        let executor = CursorAgent {
            // No command field needed anymore
            append_prompt: AppendPrompt::default(),
            force: None,
            model: None,
            cmd: Default::default(),
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
            .filter(|m| matches!(m, workspace_utils::log_msg::LogMsg::JsonPatch(_)))
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
