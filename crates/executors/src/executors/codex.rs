mod session;

use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use futures::StreamExt;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use strum_macros::AsRefStr;
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use utils::{
    diff::{concatenate_diff_hunks, extract_unified_diff_hunks},
    msg_store::MsgStore,
    path::make_path_relative,
    shell::get_shell_command,
};

use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{
        AppendPrompt, ExecutorError, StandardCodingAgentExecutor, codex::session::SessionHandler,
    },
    logs::{
        ActionType, FileChange, NormalizedEntry, NormalizedEntryType,
        utils::{EntryIndexProvider, patch::ConversationPatch},
    },
};

/// Sandbox policy modes for Codex
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum SandboxMode {
    Auto,
    ReadOnly,
    WorkspaceWrite,
    DangerFullAccess,
}

/// Approval policy for Codex
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, AsRefStr, JsonSchema)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum ApprovalPolicy {
    Untrusted,
    OnFailure,
    OnRequest,
    Never,
}

/// Reasoning effort for the underlying model
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum ReasoningEffort {
    Low,
    Medium,
    High,
}

/// Model reasoning summary style
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum ReasoningSummary {
    Auto,
    Concise,
    Detailed,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Codex {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<SandboxMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval: Option<ApprovalPolicy>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub oss: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_reasoning_effort: Option<ReasoningEffort>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_reasoning_summary: Option<ReasoningSummary>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Codex {
    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new("npx -y @openai/codex@latest exec")
            .params(["--json", "--skip-git-repo-check"]);

        if let Some(approval) = &self.approval {
            builder = builder.extend_params(["--ask-for-approval", approval.as_ref()]);
        }

        if let Some(sandbox) = &self.sandbox {
            if sandbox == &SandboxMode::Auto {
                builder = builder.extend_params(["--full-auto"]);
            } else {
                builder = builder.extend_params(["--sandbox", sandbox.as_ref()]);
                if sandbox == &SandboxMode::DangerFullAccess && self.approval.is_none() {
                    builder = builder.extend_params(["--dangerously-bypass-approvals-and-sandbox"]);
                }
            }
        }

        if self.oss.unwrap_or(false) {
            builder = builder.extend_params(["--oss"]);
        }

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }

        if let Some(effort) = &self.model_reasoning_effort {
            builder = builder.extend_params([
                "--config",
                &format!("model_reasoning_effort={}", effort.as_ref()),
            ]);
        }

        if let Some(summary) = &self.model_reasoning_summary {
            builder = builder.extend_params([
                "--config",
                &format!("model_reasoning_summary={}", summary.as_ref()),
            ]);
        }

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Codex {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let codex_command = self.build_command_builder().build_initial();

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&codex_command)
            .env("NODE_NO_WARNINGS", "1")
            .env("RUST_LOG", "info");

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe so codex sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        // Fork rollout: copy and assign a new session id so each execution has a unique session
        let (_rollout_file_path, new_session_id) = SessionHandler::fork_rollout_file(session_id)
            .map_err(|e| ExecutorError::SpawnError(std::io::Error::other(e)))?;

        let (shell_cmd, shell_arg) = get_shell_command();
        let codex_command = self
            .build_command_builder()
            .build_follow_up(&["resume".to_string(), new_session_id]);

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&codex_command)
            .env("NODE_NO_WARNINGS", "1")
            .env("RUST_LOG", "info");

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe so codex sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &Path) {
        let entry_index_provider = EntryIndexProvider::start_from(&msg_store);

        // Process stderr logs for session extraction only (errors come through JSONL)
        SessionHandler::start_session_id_extraction(msg_store.clone());

        // Process stdout logs (Codex's JSONL output)
        let current_dir = current_dir.to_path_buf();
        tokio::spawn(async move {
            let mut stream = msg_store.stdout_lines_stream();
            use std::collections::HashMap;
            // Track exec call ids to entry index, tool_name, content, and command
            let mut exec_info_map: HashMap<String, (usize, String, String, String)> =
                HashMap::new();
            // Track MCP calls to index, tool_name, args, and initial content
            let mut mcp_info_map: HashMap<
                String,
                (usize, String, Option<serde_json::Value>, String),
            > = HashMap::new();

            while let Some(Ok(line)) = stream.next().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                if let Ok(cj) = serde_json::from_str::<CodexJson>(trimmed) {
                    // Handle result-carrying events that require replacement
                    match &cj {
                        CodexJson::StructuredMessage { msg, .. } => match msg {
                            CodexMsgContent::ExecCommandBegin {
                                call_id, command, ..
                            } => {
                                let command_str = command.join(" ");
                                let entry = NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::ToolUse {
                                        tool_name: if command_str.contains("bash") {
                                            "bash".to_string()
                                        } else {
                                            "shell".to_string()
                                        },
                                        action_type: ActionType::CommandRun {
                                            command: command_str.clone(),
                                            result: None,
                                        },
                                    },
                                    content: format!("`{command_str}`"),
                                    metadata: None,
                                };
                                let id = entry_index_provider.next();
                                if let Some(cid) = call_id.as_ref() {
                                    let tool_name = if command_str.contains("bash") {
                                        "bash".to_string()
                                    } else {
                                        "shell".to_string()
                                    };
                                    exec_info_map.insert(
                                        cid.clone(),
                                        (id, tool_name, entry.content.clone(), command_str.clone()),
                                    );
                                }
                                msg_store
                                    .push_patch(ConversationPatch::add_normalized_entry(id, entry));
                            }
                            CodexMsgContent::ExecCommandEnd {
                                call_id,
                                stdout,
                                stderr,
                                success,
                                exit_code,
                            } => {
                                if let Some(cid) = call_id.as_ref()
                                    && let Some((idx, tool_name, prev_content, prev_command)) =
                                        exec_info_map.get(cid).cloned()
                                {
                                    // Merge stdout and stderr for richer context
                                    let output = match (stdout.as_ref(), stderr.as_ref()) {
                                        (Some(sout), Some(serr)) => {
                                            let sout_trim = sout.trim();
                                            let serr_trim = serr.trim();
                                            if sout_trim.is_empty() && serr_trim.is_empty() {
                                                None
                                            } else if sout_trim.is_empty() {
                                                Some(serr.clone())
                                            } else if serr_trim.is_empty() {
                                                Some(sout.clone())
                                            } else {
                                                Some(format!(
                                                    "STDOUT:\n{sout_trim}\n\nSTDERR:\n{serr_trim}"
                                                ))
                                            }
                                        }
                                        (Some(sout), None) => {
                                            if sout.trim().is_empty() {
                                                None
                                            } else {
                                                Some(sout.clone())
                                            }
                                        }
                                        (None, Some(serr)) => {
                                            if serr.trim().is_empty() {
                                                None
                                            } else {
                                                Some(serr.clone())
                                            }
                                        }
                                        (None, None) => None,
                                    };
                                    let exit_status = if let Some(s) = success {
                                        Some(crate::logs::CommandExitStatus::Success {
                                            success: *s,
                                        })
                                    } else {
                                        exit_code.as_ref().map(|code| {
                                            crate::logs::CommandExitStatus::ExitCode { code: *code }
                                        })
                                    };
                                    let entry = NormalizedEntry {
                                        timestamp: None,
                                        entry_type: NormalizedEntryType::ToolUse {
                                            tool_name,
                                            action_type: ActionType::CommandRun {
                                                command: prev_command,
                                                result: Some(crate::logs::CommandRunResult {
                                                    exit_status,
                                                    output,
                                                }),
                                            },
                                        },
                                        content: prev_content,
                                        metadata: None,
                                    };
                                    msg_store.push_patch(ConversationPatch::replace(idx, entry));
                                }
                            }
                            CodexMsgContent::McpToolCallBegin {
                                call_id,
                                invocation,
                            } => {
                                let tool_name =
                                    format!("mcp:{}:{}", invocation.server, invocation.tool);
                                let content_str = invocation.tool.clone();
                                let entry = NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::ToolUse {
                                        tool_name: tool_name.clone(),
                                        action_type: ActionType::Tool {
                                            tool_name: tool_name.clone(),
                                            arguments: invocation.arguments.clone(),
                                            result: None,
                                        },
                                    },
                                    content: content_str.clone(),
                                    metadata: None,
                                };
                                let id = entry_index_provider.next();
                                mcp_info_map.insert(
                                    call_id.clone(),
                                    (
                                        id,
                                        tool_name.clone(),
                                        invocation.arguments.clone(),
                                        content_str,
                                    ),
                                );
                                msg_store
                                    .push_patch(ConversationPatch::add_normalized_entry(id, entry));
                            }
                            CodexMsgContent::McpToolCallEnd {
                                call_id, result, ..
                            } => {
                                if let Some((idx, tool_name, args, prev_content)) =
                                    mcp_info_map.remove(call_id)
                                {
                                    let entry = NormalizedEntry {
                                        timestamp: None,
                                        entry_type: NormalizedEntryType::ToolUse {
                                            tool_name: tool_name.clone(),
                                            action_type: ActionType::Tool {
                                                tool_name,
                                                arguments: args,
                                                result: Some(crate::logs::ToolResult {
                                                    r#type: crate::logs::ToolResultValueType::Json,
                                                    value: result.clone(),
                                                }),
                                            },
                                        },
                                        content: prev_content,
                                        metadata: None,
                                    };
                                    msg_store.push_patch(ConversationPatch::replace(idx, entry));
                                }
                            }
                            _ => {
                                if let Some(entries) = cj.to_normalized_entries(&current_dir) {
                                    for entry in entries {
                                        let new_id = entry_index_provider.next();
                                        let patch =
                                            ConversationPatch::add_normalized_entry(new_id, entry);
                                        msg_store.push_patch(patch);
                                    }
                                }
                            }
                        },
                        _ => {
                            if let Some(entries) = cj.to_normalized_entries(&current_dir) {
                                for entry in entries {
                                    let new_id = entry_index_provider.next();
                                    let patch =
                                        ConversationPatch::add_normalized_entry(new_id, entry);
                                    msg_store.push_patch(patch);
                                }
                            }
                        }
                    }
                } else {
                    // Handle malformed JSON as raw output
                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: trimmed.to_string(),
                        metadata: None,
                    };

                    let new_id = entry_index_provider.next();
                    let patch = ConversationPatch::add_normalized_entry(new_id, entry);
                    msg_store.push_patch(patch);
                }
            }
        });
    }

    // MCP configuration methods
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".codex").join("config.toml"))
    }
}

// Data structures for parsing Codex's JSON output format
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(untagged)]
pub enum CodexJson {
    /// Structured message with id and msg fields
    StructuredMessage { id: String, msg: CodexMsgContent },
    /// Prompt message (user input)
    Prompt { prompt: String },
    /// System configuration message (first message with config fields)
    SystemConfig {
        #[serde(default)]
        model: Option<String>,
        #[serde(rename = "reasoning effort", default)]
        reasoning_effort: Option<String>,
        #[serde(default)]
        provider: Option<String>,
        #[serde(default)]
        sandbox: Option<String>,
        #[serde(default)]
        approval: Option<String>,
        #[serde(default)]
        workdir: Option<String>,
        #[serde(rename = "reasoning summaries", default)]
        reasoning_summaries: Option<String>,
        #[serde(flatten)]
        other_fields: std::collections::HashMap<String, serde_json::Value>,
    },
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct McpInvocation {
    pub server: String,
    pub tool: String,
    #[serde(default)]
    pub arguments: Option<serde_json::Value>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum CodexMsgContent {
    #[serde(rename = "agent_message")]
    AgentMessage { message: String },

    #[serde(rename = "agent_reasoning")]
    AgentReasoning { text: String },

    #[serde(rename = "agent_reasoning_raw_content")]
    AgentReasoningRawContent { text: String },

    #[serde(rename = "agent_reasoning_raw_content_delta")]
    AgentReasoningRawContentDelta { delta: String },

    #[serde(rename = "error")]
    Error { message: Option<String> },

    #[serde(rename = "mcp_tool_call_begin")]
    McpToolCallBegin {
        call_id: String,
        invocation: McpInvocation,
    },

    #[serde(rename = "mcp_tool_call_end")]
    McpToolCallEnd {
        call_id: String,
        invocation: McpInvocation,
        #[serde(default)]
        duration: serde_json::Value,
        result: serde_json::Value,
    },

    #[serde(rename = "exec_command_begin")]
    ExecCommandBegin {
        call_id: Option<String>,
        command: Vec<String>,
        cwd: Option<String>,
    },

    #[serde(rename = "exec_command_output_delta")]
    ExecCommandOutputDelta {
        call_id: Option<String>,
        // "stdout" | "stderr" typically
        stream: Option<String>,
        // Could be bytes or string; keep flexible
        chunk: Option<serde_json::Value>,
    },

    #[serde(rename = "exec_command_end")]
    ExecCommandEnd {
        call_id: Option<String>,
        stdout: Option<String>,
        stderr: Option<String>,
        // Codex protocol has exit_code + duration; CLI may provide success; keep optional
        success: Option<bool>,
        #[serde(default)]
        exit_code: Option<i32>,
    },

    #[serde(rename = "exec_approval_request")]
    ExecApprovalRequest {
        call_id: Option<String>,
        command: Vec<String>,
        cwd: Option<String>,
        reason: Option<String>,
    },

    #[serde(rename = "apply_patch_approval_request")]
    ApplyPatchApprovalRequest {
        call_id: Option<String>,
        changes: std::collections::HashMap<String, serde_json::Value>,
        reason: Option<String>,
        grant_root: Option<String>,
    },

    #[serde(rename = "background_event")]
    BackgroundEvent { message: String },

    #[serde(rename = "patch_apply_begin")]
    PatchApplyBegin {
        call_id: Option<String>,
        auto_approved: Option<bool>,
        changes: std::collections::HashMap<String, CodexFileChange>,
    },

    #[serde(rename = "patch_apply_end")]
    PatchApplyEnd {
        call_id: Option<String>,
        stdout: Option<String>,
        stderr: Option<String>,
        success: Option<bool>,
    },

    #[serde(rename = "turn_diff")]
    TurnDiff { unified_diff: String },

    #[serde(rename = "get_history_entry_response")]
    GetHistoryEntryResponse {
        offset: Option<usize>,
        log_id: Option<u64>,
        entry: Option<serde_json::Value>,
    },

    #[serde(rename = "plan_update")]
    PlanUpdate {
        #[serde(flatten)]
        value: serde_json::Value,
    },

    #[serde(rename = "task_started")]
    TaskStarted,
    #[serde(rename = "task_complete")]
    TaskComplete { last_agent_message: Option<String> },
    #[serde(rename = "token_count")]
    TokenCount {
        input_tokens: Option<u64>,
        cached_input_tokens: Option<u64>,
        output_tokens: Option<u64>,
        reasoning_output_tokens: Option<u64>,
        total_tokens: Option<u64>,
    },

    // Catch-all for unknown message types
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CodexFileChange {
    Add {
        content: String,
    },
    Delete,
    Update {
        unified_diff: String,
        move_path: Option<PathBuf>,
    },
}

impl CodexJson {
    /// Convert to normalized entries
    pub fn to_normalized_entries(&self, current_dir: &Path) -> Option<Vec<NormalizedEntry>> {
        match self {
            CodexJson::SystemConfig { .. } => self.format_config_message().map(|content| {
                vec![NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content,
                    metadata: Some(serde_json::to_value(self).unwrap_or(serde_json::Value::Null)),
                }]
            }),
            CodexJson::Prompt { .. } => None, // Skip prompt messages
            CodexJson::StructuredMessage { msg, .. } => {
                let this = &msg;

                match this {
                    CodexMsgContent::AgentMessage { message } => Some(vec![NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::AssistantMessage,
                        content: message.clone(),
                        metadata: None,
                    }]),
                    CodexMsgContent::AgentReasoning { text } => Some(vec![NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::Thinking,
                        content: text.clone(),
                        metadata: None,
                    }]),
                    CodexMsgContent::Error { message } => {
                        let error_message = message
                            .clone()
                            .unwrap_or_else(|| "Unknown error occurred".to_string());
                        Some(vec![NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::ErrorMessage,
                            content: error_message,
                            metadata: None,
                        }])
                    }
                    CodexMsgContent::ExecCommandBegin { .. } => None,
                    CodexMsgContent::PatchApplyBegin { changes, .. } => {
                        let mut entries = Vec::new();

                        for (file_path, change_data) in changes {
                            // Make path relative to current directory
                            let relative_path =
                                make_path_relative(file_path, &current_dir.to_string_lossy());

                            // Try to extract unified diff from change data
                            let mut changes = vec![];

                            match change_data {
                                CodexFileChange::Update {
                                    unified_diff,
                                    move_path,
                                } => {
                                    let mut new_path = relative_path.clone();

                                    if let Some(move_path) = move_path {
                                        new_path = make_path_relative(
                                            &move_path.to_string_lossy(),
                                            &current_dir.to_string_lossy(),
                                        );
                                        changes.push(FileChange::Rename {
                                            new_path: new_path.clone(),
                                        });
                                    }
                                    if !unified_diff.is_empty() {
                                        let hunks = extract_unified_diff_hunks(unified_diff);
                                        changes.push(FileChange::Edit {
                                            unified_diff: concatenate_diff_hunks(&new_path, &hunks),
                                            has_line_numbers: true,
                                        });
                                    }
                                }
                                CodexFileChange::Add { content } => {
                                    changes.push(FileChange::Write {
                                        content: content.clone(),
                                    });
                                }
                                CodexFileChange::Delete => {
                                    changes.push(FileChange::Delete);
                                }
                            };

                            entries.push(NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::ToolUse {
                                    tool_name: "edit".to_string(),
                                    action_type: ActionType::FileEdit {
                                        path: relative_path.clone(),
                                        changes,
                                    },
                                },
                                content: relative_path,
                                metadata: None,
                            });
                        }

                        Some(entries)
                    }
                    CodexMsgContent::McpToolCallBegin { .. } => None,
                    CodexMsgContent::ExecApprovalRequest {
                        command,
                        cwd,
                        reason,
                        ..
                    } => {
                        let command_str = command.join(" ");
                        let mut parts = vec![format!("command: `{}`", command_str)];
                        if let Some(c) = cwd {
                            parts.push(format!("cwd: {c}"));
                        }
                        if let Some(r) = reason {
                            parts.push(format!("reason: {r}"));
                        }
                        let content =
                            format!("Execution approval requested — {}", parts.join("  "));
                        Some(vec![NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::SystemMessage,
                            content,
                            metadata: None,
                        }])
                    }
                    CodexMsgContent::ApplyPatchApprovalRequest {
                        changes,
                        reason,
                        grant_root,
                        ..
                    } => {
                        let mut parts = vec![format!("files: {}", changes.len())];
                        if let Some(root) = grant_root {
                            parts.push(format!("grant_root: {root}"));
                        }
                        if let Some(r) = reason {
                            parts.push(format!("reason: {r}"));
                        }
                        let content = format!("Patch approval requested — {}", parts.join("  "));
                        Some(vec![NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::SystemMessage,
                            content,
                            metadata: None,
                        }])
                    }
                    CodexMsgContent::PlanUpdate { value } => Some(vec![NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: "Plan update".to_string(),
                        metadata: Some(value.clone()),
                    }]),

                    // Ignored message types
                    CodexMsgContent::AgentReasoningRawContent { .. }
                    | CodexMsgContent::AgentReasoningRawContentDelta { .. }
                    | CodexMsgContent::ExecCommandOutputDelta { .. }
                    | CodexMsgContent::GetHistoryEntryResponse { .. }
                    | CodexMsgContent::ExecCommandEnd { .. }
                    | CodexMsgContent::PatchApplyEnd { .. }
                    | CodexMsgContent::McpToolCallEnd { .. }
                    | CodexMsgContent::TaskStarted
                    | CodexMsgContent::TaskComplete { .. }
                    | CodexMsgContent::TokenCount { .. }
                    | CodexMsgContent::TurnDiff { .. }
                    | CodexMsgContent::BackgroundEvent { .. }
                    | CodexMsgContent::Unknown => None,
                }
            }
        }
    }

    /// Format system configuration message for display
    fn format_config_message(&self) -> Option<String> {
        if let CodexJson::SystemConfig {
            model,
            reasoning_effort,
            provider,
            sandbox: _,
            approval: _,
            workdir: _,
            reasoning_summaries: _,
            other_fields: _,
        } = self
        {
            let mut params = vec![];

            if let Some(model) = model {
                params.push(format!("model: {model}"));
            }
            if let Some(provider) = provider {
                params.push(format!("provider: {provider}"));
            }
            if let Some(reasoning_effort) = reasoning_effort {
                params.push(format!("reasoning effort: {reasoning_effort}"));
            }

            if params.is_empty() {
                None
            } else {
                Some(params.join("  ").to_string())
            }
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::logs::{ActionType, NormalizedEntry, NormalizedEntryType};

    /// Test helper that directly tests the JSON parsing functions
    fn parse_test_json_lines(input: &str) -> Vec<NormalizedEntry> {
        let current_dir = PathBuf::from("/tmp");
        let mut entries = Vec::new();

        for line in input.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(parsed_entries) =
                serde_json::from_str::<CodexJson>(trimmed).map(|codex_json| {
                    codex_json
                        .to_normalized_entries(&current_dir)
                        .unwrap_or_default()
                })
            {
                entries.extend(parsed_entries);
            } else {
                // Handle malformed JSON as raw output
                entries.push(NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: trimmed.to_string(),
                    metadata: None,
                });
            }
        }

        entries
    }

    /// Test helper for testing CodexJson deserialization
    fn test_codex_json_parsing(json_str: &str) -> Result<CodexJson, serde_json::Error> {
        serde_json::from_str(json_str)
    }

    #[test]
    fn test_extract_session_id_from_line() {
        let line = "2025-07-23T15:47:59.877058Z  INFO codex_exec: Codex initialized with event: Event { id: \"0\", msg: SessionConfigured(SessionConfiguredEvent { session_id: 3cdcc4df-c7c3-4cca-8902-48c3d4a0f96b, model: \"codex-mini-latest\", history_log_id: 9104228, history_entry_count: 1 }) }";

        let session_id = SessionHandler::extract_session_id_from_line(line);
        assert_eq!(
            session_id,
            Some("3cdcc4df-c7c3-4cca-8902-48c3d4a0f96b".to_string())
        );
    }

    #[test]
    fn test_extract_session_id_no_match() {
        let line = "Some random log line without session id";
        let session_id = SessionHandler::extract_session_id_from_line(line);
        assert_eq!(session_id, None);
    }

    #[test]
    fn test_extract_session_id_from_line_new_format() {
        // Newer Codex versions wrap the UUID in ConversationId(...)
        let line = "2025-09-12T14:36:32.515901Z  INFO codex_exec: Codex initialized with event: SessionConfiguredEvent { session_id: ConversationId(bd823d48-4bd8-4d9e-9d87-93a66afbf4d2), model: \"gpt-5\", history_log_id: 0, history_entry_count: 0, initial_messages: None, rollout_path: \"/home/user/.codex/sessions/2025/09/12/rollout-2025-09-12T14-36-32-bd823d48-4bd8-4d9e-9d87-93a66afbf4d2.jsonl\" }";

        let session_id = SessionHandler::extract_session_id_from_line(line);
        assert_eq!(
            session_id,
            Some("bd823d48-4bd8-4d9e-9d87-93a66afbf4d2".to_string())
        );
    }

    #[test]
    fn test_normalize_logs_basic() {
        let logs = r#"{"id":"1","msg":{"type":"task_started"}}
{"id":"1","msg":{"type":"agent_reasoning","text":"**Inspecting the directory tree**\n\nI want to check the root directory tree and I think using `ls -1` is acceptable since the guidelines don't explicitly forbid it, unlike `ls -R`, `find`, or `grep`. I could also consider using `rg --files`, but that might be too overwhelming if there are many files. Focusing on the top-level files and directories seems like a better approach. I'm particularly interested in `LICENSE`, `README.md`, and any relevant README files. So, let's start with `ls -1`."}}
{"id":"1","msg":{"type":"exec_command_begin","call_id":"call_I1o1QnQDtlLjGMg4Vd9HXJLd","command":["bash","-lc","ls -1"],"cwd":"/Users/user/dev/vk-wip"}}
{"id":"1","msg":{"type":"exec_command_end","call_id":"call_I1o1QnQDtlLjGMg4Vd9HXJLd","stdout":"AGENT.md\nCLAUDE.md\nCODE-OF-CONDUCT.md\nCargo.lock\nCargo.toml\nDockerfile\nLICENSE\nREADME.md\nbackend\nbuild-npm-package.sh\ndev_assets\ndev_assets_seed\nfrontend\nnode_modules\nnpx-cli\npackage-lock.json\npackage.json\npnpm-lock.yaml\npnpm-workspace.yaml\nrust-toolchain.toml\nrustfmt.toml\nscripts\nshared\ntest-npm-package.sh\n","stderr":"","exit_code":0}}
{"id":"1","msg":{"type":"task_complete","last_agent_message":"I can see the directory structure of your project. This appears to be a Rust project with a frontend/backend architecture, using pnpm for package management. The project includes various configuration files, documentation, and development assets."}}"#;

        let entries = parse_test_json_lines(logs);

        // Should have only agent_reasoning (task_started, exec_command_begin, task_complete are skipped in to_normalized_entries)
        assert_eq!(entries.len(), 1);

        // Check agent reasoning (thinking)
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::Thinking
        ));
        assert!(entries[0].content.contains("Inspecting the directory tree"));

        // Command entries are handled in the streaming path, not to_normalized_entries
    }

    #[test]
    fn test_normalize_logs_shell_vs_bash_mapping() {
        // Test shell command (not bash)
        let shell_logs = r#"{"id":"1","msg":{"type":"exec_command_begin","call_id":"call_test","command":["sh","-c","echo hello"],"cwd":"/tmp"}}"#;
        let entries = parse_test_json_lines(shell_logs);
        // to_normalized_entries skips exec_command_begin; mapping is tested in streaming path
        assert_eq!(entries.len(), 0);

        // Test bash command
        let bash_logs = r#"{"id":"1","msg":{"type":"exec_command_begin","call_id":"call_test","command":["bash","-c","echo hello"],"cwd":"/tmp"}}"#;
        let entries = parse_test_json_lines(bash_logs);
        assert_eq!(entries.len(), 0);

        // Mapping to bash is exercised in the streaming path
    }

    #[test]
    fn test_normalize_logs_token_count_skipped() {
        let logs = r#"{"id":"1","msg":{"type":"task_started"}}
{"id":"1","msg":{"type":"token_count","input_tokens":1674,"cached_input_tokens":1627,"output_tokens":384,"reasoning_output_tokens":384,"total_tokens":2058}}
{"id":"1","msg":{"type":"task_complete","last_agent_message":"Done!"}}"#;

        let entries = parse_test_json_lines(logs);

        // Should have: nothing (task_started, task_complete, and token_count all skipped)
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn test_normalize_logs_malformed_json() {
        let logs = r#"{"id":"1","msg":{"type":"task_started"}}
invalid json line here
{"id":"1","msg":{"type":"task_complete","last_agent_message":"Done!"}}"#;

        let entries = parse_test_json_lines(logs);

        // Should have: raw output only (task_started and task_complete skipped)
        assert_eq!(entries.len(), 1);

        // Check that malformed JSON becomes raw output
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::SystemMessage
        ));
        assert!(entries[0].content.contains("invalid json line here"));
    }

    #[test]
    fn test_normalize_logs_prompt_ignored() {
        let logs = r#"{"prompt":"project_id: f61fbd6a-9552-4b68-a1fe-10561f028dfc\n            \nTask title: describe this repo"}
{"id":"1","msg":{"type":"task_started"}}
{"id":"1","msg":{"type":"agent_message","message":"Hello, I'll help you with that."}}"#;

        let entries = parse_test_json_lines(logs);

        // Should have 1 entry (prompt and task_started ignored, only agent_message)
        assert_eq!(entries.len(), 1);

        // Check that we only have agent_message
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::AssistantMessage
        ));
        assert_eq!(entries[0].content, "Hello, I'll help you with that.");
    }

    #[test]
    fn test_normalize_logs_error_message() {
        let logs = r#"{"id":"1","msg":{"type":"error","message":"Missing environment variable: `OPENAI_API_KEY`. Create an API key (https://platform.openai.com) and export it as an environment variable."}}"#;

        let entries = parse_test_json_lines(logs);

        // Should have 1 entry for the error message
        assert_eq!(entries.len(), 1);

        // Check error message
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::ErrorMessage
        ));
        assert!(
            entries[0]
                .content
                .contains("Missing environment variable: `OPENAI_API_KEY`")
        );
    }

    #[test]
    fn test_normalize_logs_error_message_no_content() {
        let logs = r#"{"id":"1","msg":{"type":"error"}}"#;

        let entries = parse_test_json_lines(logs);

        // Should have 1 entry for the error message
        assert_eq!(entries.len(), 1);

        // Check error message fallback
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::ErrorMessage
        ));
        assert_eq!(entries[0].content, "Unknown error occurred");
    }

    #[test]
    fn test_normalize_logs_real_example() {
        let logs = r#"{"sandbox":"danger-full-access","reasoning summaries":"auto","approval":"Never","provider":"openai","reasoning effort":"medium","workdir":"/private/var/folders/4m/6cwx14sx59lc2k9km5ph76gh0000gn/T/vibe-kanban-dev/vk-ec8b-describe-t","model":"codex-mini-latest"}
{"prompt":"project_id: f61fbd6a-9552-4b68-a1fe-10561f028dfc\n            \nTask title: describe this repo"}
{"id":"1","msg":{"type":"task_started"}}
{"id":"1","msg":{"type":"error","message":"Missing environment variable: `OPENAI_API_KEY`. Create an API key (https://platform.openai.com) and export it as an environment variable."}}"#;

        let entries = parse_test_json_lines(logs);

        // Should have 2 entries: config, error (prompt and task_started ignored)
        assert_eq!(entries.len(), 2);

        // Check configuration message
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::SystemMessage
        ));
        assert!(entries[0].content.contains("model"));

        // Check error message
        assert!(matches!(
            entries[1].entry_type,
            NormalizedEntryType::ErrorMessage
        ));
        assert!(entries[1].content.contains("Missing environment variable"));
    }

    #[test]
    fn test_normalize_logs_partial_config() {
        // Test with just model and provider (should still work)
        let logs = r#"{"model":"codex-mini-latest","provider":"openai"}"#;

        let entries = parse_test_json_lines(logs);

        // Should have 1 entry for the configuration message
        assert_eq!(entries.len(), 1);

        // Check configuration message contains available params
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::SystemMessage
        ));
    }

    #[test]
    fn test_normalize_logs_agent_message() {
        let logs = r#"{"id":"1","msg":{"type":"agent_message","message":"I've made a small restructuring of the top‐level README:\n\n- **Inserted a \"Table of Contents\"** under the screenshot, linking to all major sections (Overview, Installation, Documentation, Support, Contributing, Development → Prerequisites/Running/Build, Environment Variables, Custom OAuth, and License).\n- **Appended a \"License\" section** at the bottom pointing to the Apache 2.0 LICENSE file.\n\nThese tweaks should make navigation and licensing info more discoverable. Let me know if you'd like any other adjustments!"}}"#;

        let entries = parse_test_json_lines(logs);

        // Should have 1 entry for the agent message
        assert_eq!(entries.len(), 1);

        // Check agent message
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::AssistantMessage
        ));
        assert!(
            entries[0]
                .content
                .contains("I've made a small restructuring")
        );
        assert!(entries[0].content.contains("Table of Contents"));
    }

    #[test]
    fn test_normalize_logs_patch_apply() {
        let logs = r#"{"id":"1","msg":{"type":"patch_apply_begin","call_id":"call_zr84aWQuwJR3aWgJLkfv56Gl","auto_approved":true,"changes":{"/private/var/folders/4m/6cwx14sx59lc2k9km5ph76gh0000gn/T/vibe-kanban-dev/vk-a712-minor-rest/README.md":{"update":{"unified_diff":"@@ -18,2 +18,17 @@\n \n+## Table of Contents\n+\n+- [Overview](#overview)\n+- [Installation](#installation)","move_path":null}}}}}
{"id":"1","msg":{"type":"patch_apply_end","call_id":"call_zr84aWQuwJR3aWgJLkfv56Gl","stdout":"Success. Updated the following files:\nM /private/var/folders/4m/6cwx14sx59lc2k9km5ph76gh0000gn/T/vibe-kanban-dev/vk-a712-minor-rest/README.md\n","stderr":"","success":true}}"#;

        let entries = parse_test_json_lines(logs);

        // Should have 1 entry (patch_apply_begin, patch_apply_end skipped)
        assert_eq!(entries.len(), 1);

        // Check edit tool use (follows claude.rs pattern)
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::ToolUse { .. }
        ));
        if let NormalizedEntryType::ToolUse {
            tool_name,
            action_type,
        } = &entries[0].entry_type
        {
            assert_eq!(tool_name, "edit");
            assert!(matches!(action_type, ActionType::FileEdit { .. }));
        }
        assert!(entries[0].content.contains("README.md"));
    }

    #[test]
    fn test_normalize_logs_skip_task_messages() {
        let logs = r#"{"id":"1","msg":{"type":"task_started"}}
{"id":"1","msg":{"type":"agent_message","message":"Hello world"}}
{"id":"1","msg":{"type":"task_complete","last_agent_message":"Done!"}}"#;

        let entries = parse_test_json_lines(logs);

        // Should have 1 entry (task_started and task_complete skipped)
        assert_eq!(entries.len(), 1);

        // Check that only agent_message remains
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::AssistantMessage
        ));
        assert_eq!(entries[0].content, "Hello world");
    }

    #[test]
    fn test_normalize_logs_mcp_tool_calls() {
        let logs = r#"{"id":"1","msg":{"type":"mcp_tool_call_begin","call_id":"call_KHwEJyaUuL5D8sO7lPfImx7I","invocation":{"server":"vibe_kanban","tool":"list_projects","arguments":{}}}}
{"id":"1","msg":{"type":"mcp_tool_call_end","call_id":"call_KHwEJyaUuL5D8sO7lPfImx7I","invocation":{"server":"vibe_kanban","tool":"list_projects","arguments":{}},"result":{"Ok":{"content":[{"text":"Projects listed successfully"}],"isError":false}}}}
{"id":"1","msg":{"type":"agent_message","message":"Here are your projects"}}"#;

        let entries = parse_test_json_lines(logs);

        // Should have only agent_message (mcp_tool_call_begin/end are skipped in to_normalized_entries)
        assert_eq!(entries.len(), 1);
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::AssistantMessage
        ));
        assert_eq!(entries[0].content, "Here are your projects");
    }

    #[test]
    fn test_normalize_logs_mcp_tool_call_multiple() {
        let logs = r#"{"id":"1","msg":{"type":"mcp_tool_call_begin","call_id":"call_1","invocation":{"server":"vibe_kanban","tool":"create_task","arguments":{"title":"Test task"}}}}
{"id":"1","msg":{"type":"mcp_tool_call_end","call_id":"call_1","invocation":{"server":"vibe_kanban","tool":"create_task","arguments":{"title":"Test task"}},"result":{"Ok":{"content":[{"text":"Task created"}],"isError":false}}}}
{"id":"1","msg":{"type":"mcp_tool_call_begin","call_id":"call_2","invocation":{"server":"vibe_kanban","tool":"list_tasks","arguments":{}}}}
{"id":"1","msg":{"type":"mcp_tool_call_end","call_id":"call_2","invocation":{"server":"vibe_kanban","tool":"list_tasks","arguments":{}},"result":{"Ok":{"content":[{"text":"Tasks listed"}],"isError":false}}}}"#;

        let entries = parse_test_json_lines(logs);

        // to_normalized_entries skips mcp_tool_call_begin/end; expect none
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn test_codex_json_system_config_parsing() {
        let config_json = r#"{"sandbox":"danger-full-access","reasoning summaries":"auto","approval":"Never","provider":"openai","reasoning effort":"medium","workdir":"/tmp","model":"codex-mini-latest"}"#;

        let parsed = test_codex_json_parsing(config_json).unwrap();
        assert!(matches!(parsed, CodexJson::SystemConfig { .. }));

        let current_dir = PathBuf::from("/tmp");
        let entries = parsed.to_normalized_entries(&current_dir).unwrap();
        assert_eq!(entries.len(), 1);
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::SystemMessage
        ));
        assert!(entries[0].content.contains("model: codex-mini-latest"));
    }

    #[test]
    fn test_codex_json_prompt_parsing() {
        let prompt_json = r#"{"prompt":"project_id: f61fbd6a-9552-4b68-a1fe-10561f028dfc\n\nTask title: describe this repo"}"#;

        let parsed = test_codex_json_parsing(prompt_json).unwrap();
        assert!(matches!(parsed, CodexJson::Prompt { .. }));

        let current_dir = PathBuf::from("/tmp");
        let entries = parsed.to_normalized_entries(&current_dir);
        assert!(entries.is_none()); // Should return None
    }

    #[test]
    fn test_set_session_id_in_rollout_meta_old_format() {
        let mut meta = serde_json::json!({
            "id": "8724aa3f-efb7-4bbb-96a4-63fb3cb7ee90",
            "timestamp": "2025-09-09T16:46:39.250Z",
            "instructions": "# ...",
            "git": {
                "commit_hash": "70497c4cb9d64473e1e7602083badf338e59e75a",
                "branch": "vk/9986-retry-with",
                "repository_url": "https://github.com/bloopai/vibe-kanban"
            }
        });
        let new_id = "11111111-2222-3333-4444-555555555555";
        SessionHandler::set_session_id_in_rollout_meta(&mut meta, new_id).unwrap();
        // After migration, we should write new-format header
        assert_eq!(meta["type"].as_str(), Some("session_meta"));
        assert_eq!(meta["payload"]["id"].as_str(), Some(new_id));
        // Preserve instructions and git inside payload when present
        assert_eq!(meta["payload"]["instructions"].as_str(), Some("# ..."));
        assert!(meta["payload"]["git"].is_object());
        // Top-level id should be absent in new format
        assert_eq!(meta.get("id").and_then(|v| v.as_str()), None);
    }

    #[test]
    fn test_set_session_id_in_rollout_meta_new_format() {
        let mut meta = serde_json::json!({
            "timestamp": "2025-09-12T15:34:41.080Z",
            "type": "session_meta",
            "payload": {
                "id": "0c2061fc-1da8-4733-b33f-70159b4c57f2",
                "timestamp": "2025-09-12T15:34:41.068Z",
                "cwd": "/var/tmp/vibe-kanban-dev/worktrees/vk-f625-hi",
                "originator": "codex_cli_rs",
                "cli_version": "0.34.0",
                "instructions": "# ...",
                "git": {
                    "commit_hash": "07fad5465fcdca9b719cea965372a0ea39f42d15",
                    "branch": "vk/f625-hi",
                    "repository_url": "https://github.com/bloopai/vibe-kanban"
                }
            }
        });
        let new_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
        SessionHandler::set_session_id_in_rollout_meta(&mut meta, new_id).unwrap();
        // New format takes precedence: payload.id updated
        assert_eq!(meta["payload"]["id"].as_str(), Some(new_id));
        // Top-level id should remain absent (new format only uses payload.id)
        assert_eq!(meta["id"].as_str(), None);
    }
}
