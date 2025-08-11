use std::{path::PathBuf, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use futures::StreamExt;
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
        utils::{EntryIndexProvider, patch::ConversationPatch},
    },
};

/// Handles session management for Codex executor
pub struct SessionHandler;

impl SessionHandler {
    /// Start monitoring stderr lines for session ID extraction
    pub fn start_session_id_extraction(msg_store: Arc<MsgStore>) {
        tokio::spawn(async move {
            let mut stderr_lines_stream = msg_store.stderr_lines_stream();

            while let Some(Ok(line)) = stderr_lines_stream.next().await {
                if let Some(session_id) = Self::extract_session_id_from_line(&line) {
                    msg_store.push_session_id(session_id);
                }
            }
        });
    }

    /// Extract session ID from codex stderr output
    pub fn extract_session_id_from_line(line: &str) -> Option<String> {
        // Look for session_id in the log format:
        // 2025-07-23T15:47:59.877058Z  INFO codex_exec: Codex initialized with event: Event { id: "0", msg: SessionConfigured(SessionConfiguredEvent { session_id: 3cdcc4df-c7c3-4cca-8902-48c3d4a0f96b, model: "codex-mini-latest", history_log_id: 9104228, history_entry_count: 1 }) }
        static SESSION_ID_REGEX: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
        let regex = SESSION_ID_REGEX.get_or_init(|| {
            Regex::new(r"session_id:\s*([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})").unwrap()
        });

        regex
            .captures(line)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().to_string())
    }

    /// Find codex rollout file path for given session_id. Used during follow-up execution.
    pub fn find_rollout_file_path(session_id: &str) -> Result<PathBuf, String> {
        let home_dir = dirs::home_dir().ok_or("Could not determine home directory")?;
        let sessions_dir = home_dir.join(".codex").join("sessions");

        // Scan the sessions directory recursively for rollout files matching the session_id
        // Pattern: rollout-{YYYY}-{MM}-{DD}T{HH}-{mm}-{ss}-{session_id}.jsonl
        Self::scan_directory(&sessions_dir, session_id)
    }

    // Helper for `find_rollout_file_path`.
    // Recursively scan directory for rollout files matching the session_id
    fn scan_directory(dir: &PathBuf, session_id: &str) -> Result<PathBuf, String> {
        if !dir.exists() {
            return Err(format!(
                "Sessions directory does not exist: {}",
                dir.display()
            ));
        }

        let entries = std::fs::read_dir(dir)
            .map_err(|e| format!("Failed to read directory {}: {}", dir.display(), e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {e}"))?;
            let path = entry.path();

            if path.is_dir() {
                // Recursively search subdirectories
                if let Ok(found) = Self::scan_directory(&path, session_id) {
                    return Ok(found);
                }
            } else if path.is_file()
                && let Some(filename) = path.file_name()
                && let Some(filename_str) = filename.to_str()
                && filename_str.contains(session_id)
                && filename_str.starts_with("rollout-")
                && filename_str.ends_with(".jsonl")
            {
                return Ok(path);
            }
        }

        Err(format!(
            "Could not find rollout file for session_id: {session_id}"
        ))
    }
}

/// An executor that uses Codex CLI to process tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct Codex {
    command_builder: CommandBuilder,
}

impl Default for Codex {
    fn default() -> Self {
        Self::new()
    }
}

impl Codex {
    /// Create a new Codex executor with default settings
    pub fn new() -> Self {
        let profile = AgentProfiles::get_cached()
            .get_profile("codex")
            .expect("Default codex profile should exist");

        Self::with_command_builder(profile.command.clone())
    }

    /// Create a new Codex executor with custom command builder
    pub fn with_command_builder(command_builder: CommandBuilder) -> Self {
        Self { command_builder }
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Codex {
    async fn spawn(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let codex_command = self.command_builder.build_initial();

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
        // Find the rollout file for the given session_id using SessionHandler
        let rollout_file_path =
            SessionHandler::find_rollout_file_path(session_id).map_err(|e| {
                ExecutorError::SpawnError(std::io::Error::new(std::io::ErrorKind::NotFound, e))
            })?;

        let (shell_cmd, shell_arg) = get_shell_command();
        let codex_command = self.command_builder.build_follow_up(&[
            "-c".to_string(),
            format!("experimental_resume={}", rollout_file_path.display()),
        ]);

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
            stdin.write_all(prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child)
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &PathBuf) {
        let entry_index_provider = EntryIndexProvider::new();

        // Process stderr logs for session extraction only (errors come through JSONL)
        SessionHandler::start_session_id_extraction(msg_store.clone());

        // Process stdout logs (Codex's JSONL output)
        let current_dir = current_dir.clone();
        tokio::spawn(async move {
            let mut stream = msg_store.stdout_lines_stream();

            while let Some(Ok(line)) = stream.next().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                if let Ok(entries) = serde_json::from_str::<CodexJson>(trimmed).map(|codex_json| {
                    codex_json
                        .to_normalized_entries(&current_dir)
                        .unwrap_or_default()
                }) {
                    for entry in entries {
                        let new_id = entry_index_provider.next();
                        let patch = ConversationPatch::add_normalized_entry(new_id, entry);
                        msg_store.push_patch(patch);
                    }
                } else {
                    // Handle malformed JSON as raw output
                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: format!("Raw output: {trimmed}"),
                        metadata: None,
                    };

                    let new_id = entry_index_provider.next();
                    let patch = ConversationPatch::add_normalized_entry(new_id, entry);
                    msg_store.push_patch(patch);
                }
            }
        });
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
        changes: std::collections::HashMap<String, FileChange>,
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
pub enum FileChange {
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
    pub fn to_normalized_entries(&self, current_dir: &PathBuf) -> Option<Vec<NormalizedEntry>> {
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
                    CodexMsgContent::ExecCommandBegin { command, .. } => {
                        let command_str = command.join(" ");

                        // Map shell commands to tool names (following Claude pattern)
                        let tool_name = if command_str.contains("bash") {
                            "bash"
                        } else {
                            "shell"
                        };

                        Some(vec![NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::ToolUse {
                                tool_name: tool_name.to_string(),
                                action_type: ActionType::CommandRun {
                                    command: command_str.clone(),
                                },
                            },
                            content: format!("`{command_str}`"),
                            metadata: None,
                        }])
                    }
                    CodexMsgContent::PatchApplyBegin { changes, .. } => {
                        let mut entries = Vec::new();

                        for (file_path, change_data) in changes {
                            // Make path relative to current directory
                            let relative_path =
                                make_path_relative(file_path, &current_dir.to_string_lossy());

                            // Try to extract unified diff from change data
                            let mut diffs = vec![];

                            match change_data {
                                FileChange::Update { unified_diff, .. } => {
                                    if !unified_diff.is_empty() {
                                        diffs.push(EditDiff::Unified {
                                            unified_diff: unified_diff.clone(),
                                        });
                                    }
                                }
                                FileChange::Add { content } => {
                                    // For new files, we could show the content as a diff
                                    diffs.push(EditDiff::Replace {
                                        old: String::new(),
                                        new: content.clone(),
                                    });
                                }
                                FileChange::Delete => {
                                    // For deletions, we don't have old content to show
                                }
                            };

                            entries.push(NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::ToolUse {
                                    tool_name: "edit".to_string(),
                                    action_type: ActionType::FileEdit {
                                        path: relative_path.clone(),
                                        diffs,
                                    },
                                },
                                content: relative_path,
                                metadata: None,
                            });
                        }

                        Some(entries)
                    }
                    CodexMsgContent::McpToolCallBegin { invocation, .. } => {
                        let tool_name = format!("mcp_{}", invocation.tool);
                        let content = invocation.tool.clone();

                        Some(vec![NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::ToolUse {
                                tool_name,
                                action_type: ActionType::Other {
                                    description: format!(
                                        "MCP tool call to {} from {}",
                                        invocation.tool, invocation.server
                                    ),
                                },
                            },
                            content,
                            metadata: None,
                        }])
                    }
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
                    content: format!("Raw output: {trimmed}"),
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
    fn test_normalize_logs_basic() {
        let logs = r#"{"id":"1","msg":{"type":"task_started"}}
{"id":"1","msg":{"type":"agent_reasoning","text":"**Inspecting the directory tree**\n\nI want to check the root directory tree and I think using `ls -1` is acceptable since the guidelines don't explicitly forbid it, unlike `ls -R`, `find`, or `grep`. I could also consider using `rg --files`, but that might be too overwhelming if there are many files. Focusing on the top-level files and directories seems like a better approach. I'm particularly interested in `LICENSE`, `README.md`, and any relevant README files. So, let's start with `ls -1`."}}
{"id":"1","msg":{"type":"exec_command_begin","call_id":"call_I1o1QnQDtlLjGMg4Vd9HXJLd","command":["bash","-lc","ls -1"],"cwd":"/Users/user/dev/vk-wip"}}
{"id":"1","msg":{"type":"exec_command_end","call_id":"call_I1o1QnQDtlLjGMg4Vd9HXJLd","stdout":"AGENT.md\nCLAUDE.md\nCODE-OF-CONDUCT.md\nCargo.lock\nCargo.toml\nDockerfile\nLICENSE\nREADME.md\nbackend\nbuild-npm-package.sh\ndev_assets\ndev_assets_seed\nfrontend\nnode_modules\nnpx-cli\npackage-lock.json\npackage.json\npnpm-lock.yaml\npnpm-workspace.yaml\nrust-toolchain.toml\nrustfmt.toml\nscripts\nshared\ntest-npm-package.sh\n","stderr":"","exit_code":0}}
{"id":"1","msg":{"type":"task_complete","last_agent_message":"I can see the directory structure of your project. This appears to be a Rust project with a frontend/backend architecture, using pnpm for package management. The project includes various configuration files, documentation, and development assets."}}"#;

        let entries = parse_test_json_lines(logs);

        // Should have: agent_reasoning, exec_command_begin (task_started and task_complete skipped)
        assert_eq!(entries.len(), 2);

        // Check agent reasoning (thinking)
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::Thinking
        ));
        assert!(entries[0].content.contains("Inspecting the directory tree"));

        // Check bash command
        assert!(matches!(
            entries[1].entry_type,
            NormalizedEntryType::ToolUse { .. }
        ));
        if let NormalizedEntryType::ToolUse {
            tool_name,
            action_type,
        } = &entries[1].entry_type
        {
            assert_eq!(tool_name, "bash");
            assert!(matches!(action_type, ActionType::CommandRun { .. }));
        }
        assert_eq!(entries[1].content, "`bash -lc ls -1`");
    }

    #[test]
    fn test_normalize_logs_shell_vs_bash_mapping() {
        // Test shell command (not bash)
        let shell_logs = r#"{"id":"1","msg":{"type":"exec_command_begin","call_id":"call_test","command":["sh","-c","echo hello"],"cwd":"/tmp"}}"#;
        let entries = parse_test_json_lines(shell_logs);
        assert_eq!(entries.len(), 1);

        if let NormalizedEntryType::ToolUse { tool_name, .. } = &entries[0].entry_type {
            assert_eq!(tool_name, "shell"); // Maps to shell, not bash
        }

        // Test bash command
        let bash_logs = r#"{"id":"1","msg":{"type":"exec_command_begin","call_id":"call_test","command":["bash","-c","echo hello"],"cwd":"/tmp"}}"#;
        let entries = parse_test_json_lines(bash_logs);
        assert_eq!(entries.len(), 1);

        if let NormalizedEntryType::ToolUse { tool_name, .. } = &entries[0].entry_type {
            assert_eq!(tool_name, "bash"); // Maps to bash
        }
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
        assert!(
            entries[0]
                .content
                .contains("Raw output: invalid json line here")
        );
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

        // Should have 2 entries (mcp_tool_call_begin and agent_message, mcp_tool_call_end skipped)
        assert_eq!(entries.len(), 2);

        // Check MCP tool call begin
        assert!(matches!(
            entries[0].entry_type,
            NormalizedEntryType::ToolUse { .. }
        ));
        if let NormalizedEntryType::ToolUse {
            tool_name,
            action_type,
        } = &entries[0].entry_type
        {
            assert_eq!(tool_name, "mcp_list_projects");
            assert!(matches!(action_type, ActionType::Other { .. }));
        }

        // Check agent message
        assert!(matches!(
            entries[1].entry_type,
            NormalizedEntryType::AssistantMessage
        ));
        assert_eq!(entries[1].content, "Here are your projects");
    }

    #[test]
    fn test_normalize_logs_mcp_tool_call_multiple() {
        let logs = r#"{"id":"1","msg":{"type":"mcp_tool_call_begin","call_id":"call_1","invocation":{"server":"vibe_kanban","tool":"create_task","arguments":{"title":"Test task"}}}}
{"id":"1","msg":{"type":"mcp_tool_call_end","call_id":"call_1","invocation":{"server":"vibe_kanban","tool":"create_task","arguments":{"title":"Test task"}},"result":{"Ok":{"content":[{"text":"Task created"}],"isError":false}}}}
{"id":"1","msg":{"type":"mcp_tool_call_begin","call_id":"call_2","invocation":{"server":"vibe_kanban","tool":"list_tasks","arguments":{}}}}
{"id":"1","msg":{"type":"mcp_tool_call_end","call_id":"call_2","invocation":{"server":"vibe_kanban","tool":"list_tasks","arguments":{}},"result":{"Ok":{"content":[{"text":"Tasks listed"}],"isError":false}}}}"#;

        let entries = parse_test_json_lines(logs);

        // Should have 2 entries (both mcp_tool_call_begin events, mcp_tool_call_end events skipped)
        assert_eq!(entries.len(), 2);

        // Check first MCP tool call
        if let NormalizedEntryType::ToolUse { tool_name, .. } = &entries[0].entry_type {
            assert_eq!(tool_name, "mcp_create_task");
        }
        assert!(entries[0].content.contains("create_task"));

        // Check second MCP tool call
        if let NormalizedEntryType::ToolUse { tool_name, .. } = &entries[1].entry_type {
            assert_eq!(tool_name, "mcp_list_tasks");
        }
        assert!(entries[1].content.contains("list_tasks"));
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
}
