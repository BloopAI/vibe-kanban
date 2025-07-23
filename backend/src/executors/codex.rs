use std::path::PathBuf;

use async_trait::async_trait;
use regex::Regex;
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, BufReader};
use uuid::Uuid;

use crate::{
    command_runner::{CommandProcess, CommandRunner},
    executor::{
        ActionType, Executor, ExecutorError, NormalizedConversation, NormalizedEntry,
        NormalizedEntryType,
    },
    models::{executor_session::ExecutorSession, task::Task},
    utils::{path::make_path_relative, shell::get_shell_command},
};

/// Check if a JSON message looks like a system configuration message
/// This prevents accidentally filtering out regular messages or tool messages
fn is_system_config_message(json: &Value) -> bool {
    // System config messages have configuration-like fields and lack message structure
    // They should NOT have "msg" field (which indicates structured codex messages)
    // They should NOT have "id" field (which indicates task-related messages)
    if json.get("msg").is_some() || json.get("id").is_some() {
        return false;
    }

    // Check for presence of typical system configuration fields
    let config_fields = [
        "model",
        "reasoning effort",
        "provider",
        "sandbox",
        "approval",
        "workdir",
    ];
    let found_config_fields = config_fields
        .iter()
        .filter(|&field| json.get(field).is_some())
        .count();

    // Consider it a config message if we have at least 2 config fields
    found_config_fields >= 2
}

/// Extract session ID from codex stderr output
fn extract_session_id_from_line(line: &str) -> Option<String> {
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

/// Find codex rollout file path for given session_id
fn find_rollout_file_path(session_id: &str) -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir().ok_or("Could not determine home directory")?;
    let sessions_dir = home_dir.join(".codex").join("sessions");

    // Scan the sessions directory recursively for rollout files matching the session_id
    // Pattern: rollout-{YYYY}-{MM}-{DD}T{HH}-{mm}-{ss}-{session_id}.jsonl
    let pattern = format!("rollout-*-{}.jsonl", session_id);

    fn scan_directory(
        dir: &PathBuf,
        _pattern: &str,
        session_id: &str,
    ) -> Result<Option<PathBuf>, String> {
        if !dir.exists() {
            return Ok(None);
        }

        let entries = std::fs::read_dir(dir)
            .map_err(|e| format!("Failed to read directory {}: {}", dir.display(), e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_dir() {
                // Recursively search subdirectories
                if let Some(found) = scan_directory(&path, _pattern, session_id)? {
                    return Ok(Some(found));
                }
            } else if path.is_file() {
                if let Some(filename) = path.file_name() {
                    if let Some(filename_str) = filename.to_str() {
                        if filename_str.contains(session_id)
                            && filename_str.starts_with("rollout-")
                            && filename_str.ends_with(".jsonl")
                        {
                            return Ok(Some(path));
                        }
                    }
                }
            }
        }

        Ok(None)
    }

    scan_directory(&sessions_dir, &pattern, session_id)?
        .ok_or_else(|| format!("Could not find rollout file for session_id: {}", session_id))
}

/// Stream stderr from codex process to extract session_id but don't save stderr to DB
pub async fn stream_codex_stderr_to_extract_session(
    output: impl tokio::io::AsyncRead + Unpin,
    pool: sqlx::SqlitePool,
    execution_process_id: Uuid,
) {
    let mut reader = BufReader::new(output);
    let mut line = String::new();
    let mut session_extracted = false;

    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => break, // EOF
            Ok(_) => {
                line = line.trim_end_matches(['\r', '\n']).to_string();

                if !session_extracted {
                    if let Some(session_id) = extract_session_id_from_line(&line) {
                        if let Err(e) = ExecutorSession::update_session_id(
                            &pool,
                            execution_process_id,
                            &session_id,
                        )
                        .await
                        {
                            tracing::error!(
                                "Failed to update session ID for execution process {}: {}",
                                execution_process_id,
                                e
                            );
                        } else {
                            tracing::info!(
                                "Updated session ID {} for execution process {}",
                                session_id,
                                execution_process_id
                            );
                            session_extracted = true;
                        }
                    }
                }
            }
            Err(e) => {
                tracing::error!(
                    "Error reading stderr for execution process {}: {}",
                    execution_process_id,
                    e
                );
                break;
            }
        }
    }
}

/// An executor that uses Codex CLI to process tasks
pub struct CodexExecutor {
    executor_type: String,
    command: String,
}

impl Default for CodexExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl CodexExecutor {
    /// Create a new CodexExecutor with default settings
    pub fn new() -> Self {
        Self {
            executor_type: "Codex".to_string(),
            command: "npx @openai/codex exec --json --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check".to_string(),
        }
    }
}

#[async_trait]
impl Executor for CodexExecutor {
    async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        worktree_path: &str,
    ) -> Result<CommandProcess, ExecutorError> {
        // Get the task to fetch its description
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?;

        let prompt = if let Some(task_description) = task.description {
            format!(
                r#"project_id: {}
            
Task title: {}
Task description: {}"#,
                task.project_id, task.title, task_description
            )
        } else {
            format!("project_id: {}\n{}", task.project_id, task.title)
        };

        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();

        let mut command = CommandRunner::new();
        command
            .command(shell_cmd)
            .arg(shell_arg)
            .arg(&self.command)
            .stdin(&prompt)
            .working_dir(worktree_path)
            .env("NODE_NO_WARNINGS", "1")
            .env("RUST_LOG", "info"); // Enable rust logging to capture session info

        let child = command.start().await.map_err(|e| {
            crate::executor::SpawnContext::from_command(&command, &self.executor_type)
                .with_task(task_id, Some(task.title.clone()))
                .with_context(format!("{} CLI execution for new task", self.executor_type))
                .spawn_error(e)
        })?;

        Ok(child)
    }

    async fn spawn_followup(
        &self,
        _pool: &sqlx::SqlitePool,
        _task_id: Uuid,
        session_id: &str,
        prompt: &str,
        worktree_path: &str,
    ) -> Result<CommandProcess, ExecutorError> {
        // Find the rollout file for this session
        let rollout_file_path =
            find_rollout_file_path(session_id).map_err(ExecutorError::InvalidSessionId)?;

        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();

        let codex_command = format!(
            "{} -c experimental_resume={}",
            self.command,
            rollout_file_path.display()
        );

        let mut command = CommandRunner::new();
        command
            .command(shell_cmd)
            .arg(shell_arg)
            .arg(&codex_command)
            .stdin(prompt)
            .working_dir(worktree_path)
            .env("NODE_NO_WARNINGS", "1")
            .env("RUST_LOG", "info");

        let child = command.start().await.map_err(|e| {
            crate::executor::SpawnContext::from_command(&command, &self.executor_type)
                .with_context(format!(
                    "{} CLI followup execution for session {}",
                    self.executor_type, session_id
                ))
                .spawn_error(e)
        })?;

        Ok(child)
    }

    /// Custom streaming setup to handle stderr for session extraction
    async fn execute_streaming(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        attempt_id: Uuid,
        execution_process_id: Uuid,
        worktree_path: &str,
    ) -> Result<CommandProcess, ExecutorError> {
        let mut child = self.spawn(pool, task_id, worktree_path).await?;

        // Get streams from the child process
        let streams = child
            .stream()
            .await
            .expect("Failed to get streams from child process");

        // Take stdout for logs (standard streaming)
        let stdout = streams
            .stdout
            .expect("Failed to take stdout from child process");

        // Take stderr for session extraction only (don't save to DB)
        let stderr = streams
            .stderr
            .expect("Failed to take stderr from child process");

        let pool_clone1 = pool.clone();
        let pool_clone2 = pool.clone();

        // Stream stdout to database (true = is_stdout)
        tokio::spawn(crate::executor::stream_output_to_db(
            stdout,
            pool_clone1,
            attempt_id,
            execution_process_id,
            true,
        ));

        // Stream stderr for session extraction only (don't save to DB)
        tokio::spawn(stream_codex_stderr_to_extract_session(
            stderr,
            pool_clone2,
            execution_process_id,
        ));

        Ok(child)
    }

    /// Custom followup streaming with same stderr handling
    async fn execute_followup_streaming(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        attempt_id: Uuid,
        execution_process_id: Uuid,
        session_id: &str,
        prompt: &str,
        worktree_path: &str,
    ) -> Result<CommandProcess, ExecutorError> {
        let mut child = self
            .spawn_followup(pool, task_id, session_id, prompt, worktree_path)
            .await?;

        // Get streams from the child process
        let streams = child
            .stream()
            .await
            .expect("Failed to get streams from child process");

        // Take stdout for logs (standard streaming)
        let stdout = streams
            .stdout
            .expect("Failed to take stdout from child process");

        // Take stderr for session extraction only (don't save to DB)
        let stderr = streams
            .stderr
            .expect("Failed to take stderr from child process");

        let pool_clone1 = pool.clone();
        let pool_clone2 = pool.clone();

        // Stream stdout to database (true = is_stdout)
        tokio::spawn(crate::executor::stream_output_to_db(
            stdout,
            pool_clone1,
            attempt_id,
            execution_process_id,
            true,
        ));

        // Stream stderr for session extraction only (don't save to DB)
        tokio::spawn(stream_codex_stderr_to_extract_session(
            stderr,
            pool_clone2,
            execution_process_id,
        ));

        Ok(child)
    }

    fn normalize_logs(
        &self,
        logs: &str,
        worktree_path: &str,
    ) -> Result<NormalizedConversation, String> {
        let mut entries = Vec::new();
        let mut session_id = None;

        for line in logs.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Try to parse as JSON from codex jsonl output
            let json: Value = match serde_json::from_str(trimmed) {
                Ok(json) => json,
                Err(_) => {
                    // If line isn't valid JSON, add it as raw text
                    entries.push(NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: format!("Raw output: {}", trimmed),
                        metadata: None,
                    });
                    continue;
                }
            };

            // Extract session ID if not already set
            if session_id.is_none() {
                if let Some(sess_id) = json.get("session_id").and_then(|v| v.as_str()) {
                    session_id = Some(sess_id.to_string());
                }
            }

            // Handle initial configuration message - check if this looks like a system config
            if is_system_config_message(&json) {
                let mut config_params = Vec::new();

                // Collect relevant system parameters that might be present
                if let Some(model) = json.get("model").and_then(|m| m.as_str()) {
                    config_params.push(format!("model: {}", model));
                }
                if let Some(reasoning_effort) =
                    json.get("reasoning effort").and_then(|r| r.as_str())
                {
                    config_params.push(format!("reasoning effort: {}", reasoning_effort));
                }
                if let Some(provider) = json.get("provider").and_then(|p| p.as_str()) {
                    config_params.push(format!("provider: {}", provider));
                }

                // If we found any config parameters, create a system message
                if !config_params.is_empty() {
                    let content = format!(
                        "Session Parameters:\n{}",
                        config_params
                            .iter()
                            .map(|param| param.to_string())
                            .collect::<Vec<_>>()
                            .join("\n")
                    );

                    entries.push(NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content,
                        metadata: Some(json.clone()),
                    });
                    continue;
                }
            }

            // Handle prompt message - ignore as requested since frontend displays it
            if json.get("prompt").is_some() {
                continue;
            }

            // Process different message types based on codex jsonl format
            if let Some(msg) = json.get("msg") {
                if let Some(msg_type) = msg.get("type").and_then(|t| t.as_str()) {
                    match msg_type {
                        "task_started" => {
                            // Skip task_started messages as requested
                            continue;
                        }
                        "agent_reasoning" => {
                            if let Some(text) = msg.get("text").and_then(|t| t.as_str()) {
                                entries.push(NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::Thinking,
                                    content: text.to_string(),
                                    metadata: Some(json.clone()),
                                });
                            }
                        }
                        "exec_command_begin" => {
                            if let Some(command_array) =
                                msg.get("command").and_then(|c| c.as_array())
                            {
                                let command = command_array
                                    .iter()
                                    .filter_map(|v| v.as_str())
                                    .collect::<Vec<_>>()
                                    .join(" ");

                                // Map shell command to bash tool
                                let (tool_name, action_type) =
                                    if command_array.first().and_then(|v| v.as_str())
                                        == Some("bash")
                                    {
                                        (
                                            "bash".to_string(),
                                            ActionType::CommandRun {
                                                command: command.clone(),
                                            },
                                        )
                                    } else {
                                        (
                                            "shell".to_string(),
                                            ActionType::CommandRun {
                                                command: command.clone(),
                                            },
                                        )
                                    };

                                entries.push(NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::ToolUse {
                                        tool_name,
                                        action_type,
                                    },
                                    content: format!("`{}`", command),
                                    metadata: Some(json.clone()),
                                });
                            }
                        }
                        "exec_command_end" => {
                            // Skip command end entries to avoid duplication
                            continue;
                        }
                        "task_complete" => {
                            // Skip task_complete messages as requested
                            continue;
                        }
                        "token_count" => {
                            // Skip token count entries
                            continue;
                        }
                        "agent_message" => {
                            if let Some(message) = msg.get("message").and_then(|m| m.as_str()) {
                                entries.push(NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::AssistantMessage,
                                    content: message.to_string(),
                                    metadata: Some(json.clone()),
                                });
                            }
                        }
                        "patch_apply_begin" => {
                            // Map to internal edit tool (same as claude.rs pattern)
                            if let Some(changes) = msg.get("changes").and_then(|c| c.as_object()) {
                                // For each file being modified, create an edit tool entry
                                for (file_path, _change_details) in changes {
                                    // Make path relative to worktree using utility function
                                    let relative_path =
                                        make_path_relative(file_path, worktree_path);

                                    entries.push(NormalizedEntry {
                                        timestamp: None,
                                        entry_type: NormalizedEntryType::ToolUse {
                                            tool_name: "edit".to_string(),
                                            action_type: ActionType::FileWrite {
                                                path: relative_path.clone(),
                                            },
                                        },
                                        content: format!("`{}`", relative_path),
                                        metadata: Some(json.clone()),
                                    });
                                }
                            }
                        }
                        "patch_apply_end" => {
                            // Skip patch end entries to avoid duplication (similar to exec_command_end)
                            continue;
                        }
                        "error" => {
                            if let Some(error_message) = msg.get("message").and_then(|m| m.as_str())
                            {
                                entries.push(NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::ErrorMessage,
                                    content: error_message.to_string(),
                                    metadata: Some(json.clone()),
                                });
                            } else {
                                entries.push(NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::ErrorMessage,
                                    content: "Unknown error occurred".to_string(),
                                    metadata: Some(json.clone()),
                                });
                            }
                        }
                        _ => {
                            // Unknown message type, add as system message
                            entries.push(NormalizedEntry {
                                timestamp: None,
                                entry_type: NormalizedEntryType::SystemMessage,
                                content: format!("Unknown message type: {}", msg_type),
                                metadata: Some(json.clone()),
                            });
                        }
                    }
                }
            } else {
                // JSON without msg field, add as unrecognized
                entries.push(NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: format!("Unrecognized JSON: {}", trimmed),
                    metadata: Some(json),
                });
            }
        }

        Ok(NormalizedConversation {
            entries,
            session_id,
            executor_type: self.executor_type.clone(),
            prompt: None,
            summary: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_session_id_from_line() {
        let line = "2025-07-23T15:47:59.877058Z  INFO codex_exec: Codex initialized with event: Event { id: \"0\", msg: SessionConfigured(SessionConfiguredEvent { session_id: 3cdcc4df-c7c3-4cca-8902-48c3d4a0f96b, model: \"codex-mini-latest\", history_log_id: 9104228, history_entry_count: 1 }) }";
        let session_id = extract_session_id_from_line(line);
        assert_eq!(
            session_id,
            Some("3cdcc4df-c7c3-4cca-8902-48c3d4a0f96b".to_string())
        );
    }

    #[test]
    fn test_extract_session_id_no_match() {
        let line = "Some random log line without session id";
        let session_id = extract_session_id_from_line(line);
        assert_eq!(session_id, None);
    }

    #[test]
    fn test_normalize_logs_basic() {
        let executor = CodexExecutor::new();
        let logs = r#"{"id":"1","msg":{"type":"task_started"}}
{"id":"1","msg":{"type":"agent_reasoning","text":"**Inspecting the directory tree**\n\nI want to check the root directory tree and I think using `ls -1` is acceptable since the guidelines don't explicitly forbid it, unlike `ls -R`, `find`, or `grep`. I could also consider using `rg --files`, but that might be too overwhelming if there are many files. Focusing on the top-level files and directories seems like a better approach. I'm particularly interested in `LICENSE`, `README.md`, and any relevant README files. So, let's start with `ls -1`."}}
{"id":"1","msg":{"type":"exec_command_begin","call_id":"call_I1o1QnQDtlLjGMg4Vd9HXJLd","command":["bash","-lc","ls -1"],"cwd":"/Users/user/dev/vk-wip"}}
{"id":"1","msg":{"type":"exec_command_end","call_id":"call_I1o1QnQDtlLjGMg4Vd9HXJLd","stdout":"AGENT.md\nCLAUDE.md\nCODE-OF-CONDUCT.md\nCargo.lock\nCargo.toml\nDockerfile\nLICENSE\nREADME.md\nbackend\nbuild-npm-package.sh\ndev_assets\ndev_assets_seed\nfrontend\nnode_modules\nnpx-cli\npackage-lock.json\npackage.json\npnpm-lock.yaml\npnpm-workspace.yaml\nrust-toolchain.toml\nrustfmt.toml\nscripts\nshared\ntest-npm-package.sh\n","stderr":"","exit_code":0}}
{"id":"1","msg":{"type":"task_complete","last_agent_message":"I can see the directory structure of your project. This appears to be a Rust project with a frontend/backend architecture, using pnpm for package management. The project includes various configuration files, documentation, and development assets."}}"#;

        let result = executor.normalize_logs(logs, "/tmp/test").unwrap();

        // Should have: agent_reasoning, exec_command_begin (task_started and task_complete skipped)
        assert_eq!(result.entries.len(), 2);

        // Check agent reasoning (thinking)
        assert!(matches!(
            result.entries[0].entry_type,
            NormalizedEntryType::Thinking
        ));
        assert!(result.entries[0]
            .content
            .contains("Inspecting the directory tree"));

        // Check bash command
        assert!(matches!(
            result.entries[1].entry_type,
            NormalizedEntryType::ToolUse { .. }
        ));
        if let NormalizedEntryType::ToolUse {
            tool_name,
            action_type,
        } = &result.entries[1].entry_type
        {
            assert_eq!(tool_name, "bash");
            assert!(matches!(action_type, ActionType::CommandRun { .. }));
        }
        assert_eq!(result.entries[1].content, "`bash -lc ls -1`");
    }

    #[test]
    fn test_normalize_logs_shell_vs_bash_mapping() {
        let executor = CodexExecutor::new();

        // Test shell command (not bash)
        let shell_logs = r#"{"id":"1","msg":{"type":"exec_command_begin","call_id":"call_test","command":["sh","-c","echo hello"],"cwd":"/tmp"}}"#;
        let result = executor.normalize_logs(shell_logs, "/tmp").unwrap();
        assert_eq!(result.entries.len(), 1);

        if let NormalizedEntryType::ToolUse { tool_name, .. } = &result.entries[0].entry_type {
            assert_eq!(tool_name, "shell"); // Maps to shell, not bash
        }

        // Test bash command
        let bash_logs = r#"{"id":"1","msg":{"type":"exec_command_begin","call_id":"call_test","command":["bash","-c","echo hello"],"cwd":"/tmp"}}"#;
        let result = executor.normalize_logs(bash_logs, "/tmp").unwrap();
        assert_eq!(result.entries.len(), 1);

        if let NormalizedEntryType::ToolUse { tool_name, .. } = &result.entries[0].entry_type {
            assert_eq!(tool_name, "bash"); // Maps to bash
        }
    }

    #[test]
    fn test_normalize_logs_token_count_skipped() {
        let executor = CodexExecutor::new();
        let logs = r#"{"id":"1","msg":{"type":"task_started"}}
{"id":"1","msg":{"type":"token_count","input_tokens":1674,"cached_input_tokens":1627,"output_tokens":384,"reasoning_output_tokens":384,"total_tokens":2058}}
{"id":"1","msg":{"type":"task_complete","last_agent_message":"Done!"}}"#;

        let result = executor.normalize_logs(logs, "/tmp").unwrap();

        // Should have: nothing (task_started, task_complete, and token_count all skipped)
        assert_eq!(result.entries.len(), 0);
    }

    #[test]
    fn test_normalize_logs_malformed_json() {
        let executor = CodexExecutor::new();
        let logs = r#"{"id":"1","msg":{"type":"task_started"}}
invalid json line here
{"id":"1","msg":{"type":"task_complete","last_agent_message":"Done!"}}"#;

        let result = executor.normalize_logs(logs, "/tmp").unwrap();

        // Should have: raw output only (task_started and task_complete skipped)
        assert_eq!(result.entries.len(), 1);

        // Check that malformed JSON becomes raw output
        assert!(matches!(
            result.entries[0].entry_type,
            NormalizedEntryType::SystemMessage
        ));
        assert!(result.entries[0]
            .content
            .contains("Raw output: invalid json line here"));
    }

    #[test]
    fn test_find_rollout_file_path_basic() {
        // Test the rollout file path logic (this is a unit test, won't actually find files)
        let session_id = "00000000-0000-0000-0000-0000307f053d";

        // This will likely fail because the directory doesn't exist, but we can test the logic
        let result = find_rollout_file_path(session_id);

        // Should return an error since directory doesn't exist
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Could not find rollout file"));
    }

    #[test]
    fn test_normalize_logs_config_message() {
        let executor = CodexExecutor::new();
        let logs = r#"{"sandbox":"danger-full-access","reasoning summaries":"auto","approval":"Never","provider":"openai","reasoning effort":"medium","workdir":"/tmp","model":"codex-mini-latest"}"#;

        let result = executor.normalize_logs(logs, "/tmp").unwrap();

        // Should have 1 entry for the configuration message
        assert_eq!(result.entries.len(), 1);

        // Check configuration message
        assert!(matches!(
            result.entries[0].entry_type,
            NormalizedEntryType::SystemMessage
        ));
        assert!(result.entries[0].content.contains("Session Parameters:"));
        assert!(result.entries[0]
            .content
            .contains("model: codex-mini-latest"));
        assert!(result.entries[0]
            .content
            .contains("reasoning effort: medium"));
        assert!(result.entries[0].content.contains("provider: openai"));
    }

    #[test]
    fn test_normalize_logs_prompt_ignored() {
        let executor = CodexExecutor::new();
        let logs = r#"{"prompt":"project_id: f61fbd6a-9552-4b68-a1fe-10561f028dfc\n            \nTask title: describe this repo"}
{"id":"1","msg":{"type":"task_started"}}
{"id":"1","msg":{"type":"agent_message","message":"Hello, I'll help you with that."}}"#;

        let result = executor.normalize_logs(logs, "/tmp").unwrap();

        // Should have 1 entry (prompt and task_started ignored, only agent_message)
        assert_eq!(result.entries.len(), 1);

        // Check that we only have agent_message
        assert!(matches!(
            result.entries[0].entry_type,
            NormalizedEntryType::AssistantMessage
        ));
        assert_eq!(result.entries[0].content, "Hello, I'll help you with that.");
    }

    #[test]
    fn test_normalize_logs_error_message() {
        let executor = CodexExecutor::new();
        let logs = r#"{"id":"1","msg":{"type":"error","message":"Missing environment variable: `OPENAI_API_KEY`. Create an API key (https://platform.openai.com) and export it as an environment variable."}}"#;

        let result = executor.normalize_logs(logs, "/tmp").unwrap();

        // Should have 1 entry for the error message
        assert_eq!(result.entries.len(), 1);

        // Check error message
        assert!(matches!(
            result.entries[0].entry_type,
            NormalizedEntryType::ErrorMessage
        ));
        assert!(result.entries[0]
            .content
            .contains("Missing environment variable: `OPENAI_API_KEY`"));
    }

    #[test]
    fn test_normalize_logs_error_message_no_content() {
        let executor = CodexExecutor::new();
        let logs = r#"{"id":"1","msg":{"type":"error"}}"#;

        let result = executor.normalize_logs(logs, "/tmp").unwrap();

        // Should have 1 entry for the error message
        assert_eq!(result.entries.len(), 1);

        // Check error message fallback
        assert!(matches!(
            result.entries[0].entry_type,
            NormalizedEntryType::ErrorMessage
        ));
        assert_eq!(result.entries[0].content, "Unknown error occurred");
    }

    #[test]
    fn test_normalize_logs_real_example() {
        let executor = CodexExecutor::new();
        let logs = r#"{"sandbox":"danger-full-access","reasoning summaries":"auto","approval":"Never","provider":"openai","reasoning effort":"medium","workdir":"/private/var/folders/4m/6cwx14sx59lc2k9km5ph76gh0000gn/T/vibe-kanban-dev/vk-ec8b-describe-t","model":"codex-mini-latest"}
{"prompt":"project_id: f61fbd6a-9552-4b68-a1fe-10561f028dfc\n            \nTask title: describe this repo"}
{"id":"1","msg":{"type":"task_started"}}
{"id":"1","msg":{"type":"error","message":"Missing environment variable: `OPENAI_API_KEY`. Create an API key (https://platform.openai.com) and export it as an environment variable."}}"#;

        let result = executor.normalize_logs(logs, "/tmp").unwrap();

        // Should have 2 entries: config, error (prompt and task_started ignored)
        assert_eq!(result.entries.len(), 2);

        // Check configuration message
        assert!(matches!(
            result.entries[0].entry_type,
            NormalizedEntryType::SystemMessage
        ));
        assert!(result.entries[0].content.contains("Session Parameters:"));

        // Check error message
        assert!(matches!(
            result.entries[1].entry_type,
            NormalizedEntryType::ErrorMessage
        ));
        assert!(result.entries[1]
            .content
            .contains("Missing environment variable"));
    }

    #[test]
    fn test_is_system_config_message_predicate() {
        use serde_json::json;

        // Should identify system config messages
        let config_msg = json!({
            "sandbox": "danger-full-access",
            "reasoning effort": "medium",
            "provider": "openai",
            "model": "codex-mini-latest"
        });
        assert!(is_system_config_message(&config_msg));

        // Should NOT identify regular codex messages with "msg" field
        let regular_msg = json!({
            "id": "1",
            "msg": {"type": "task_started"}
        });
        assert!(!is_system_config_message(&regular_msg));

        // Should NOT identify tool messages with "id" field
        let tool_msg = json!({
            "id": "1",
            "msg": {"type": "exec_command_begin", "command": ["bash", "-c", "echo hello"]}
        });
        assert!(!is_system_config_message(&tool_msg));

        // Should NOT identify prompt messages (they have only 1 field)
        let prompt_msg = json!({
            "prompt": "project_id: abc\nTask title: test"
        });
        assert!(!is_system_config_message(&prompt_msg));

        // Should handle partial config messages (with at least 2 config fields)
        let partial_config = json!({
            "model": "codex-mini-latest",
            "provider": "openai"
        });
        assert!(is_system_config_message(&partial_config));

        // Should NOT match if only 1 config field
        let single_field = json!({
            "model": "codex-mini-latest"
        });
        assert!(!is_system_config_message(&single_field));
    }

    #[test]
    fn test_normalize_logs_partial_config() {
        let executor = CodexExecutor::new();
        // Test with just model and provider (should still work)
        let logs = r#"{"model":"codex-mini-latest","provider":"openai"}"#;

        let result = executor.normalize_logs(logs, "/tmp").unwrap();

        // Should have 1 entry for the configuration message
        assert_eq!(result.entries.len(), 1);

        // Check configuration message contains available params
        assert!(matches!(
            result.entries[0].entry_type,
            NormalizedEntryType::SystemMessage
        ));
        assert!(result.entries[0].content.contains("Session Parameters:"));
        assert!(result.entries[0]
            .content
            .contains("model: codex-mini-latest"));
        assert!(result.entries[0].content.contains("provider: openai"));
        assert!(!result.entries[0].content.contains("reasoning_effort")); // Should not be present
    }

    #[test]
    fn test_normalize_logs_agent_message() {
        let executor = CodexExecutor::new();
        let logs = r#"{"id":"1","msg":{"type":"agent_message","message":"I've made a small restructuring of the top‐level README:\n\n- **Inserted a \"Table of Contents\"** under the screenshot, linking to all major sections (Overview, Installation, Documentation, Support, Contributing, Development → Prerequisites/Running/Build, Environment Variables, Custom OAuth, and License).\n- **Appended a \"License\" section** at the bottom pointing to the Apache 2.0 LICENSE file.\n\nThese tweaks should make navigation and licensing info more discoverable. Let me know if you'd like any other adjustments!"}}"#;

        let result = executor.normalize_logs(logs, "/tmp").unwrap();

        // Should have 1 entry for the agent message
        assert_eq!(result.entries.len(), 1);

        // Check agent message
        assert!(matches!(
            result.entries[0].entry_type,
            NormalizedEntryType::AssistantMessage
        ));
        assert!(result.entries[0]
            .content
            .contains("I've made a small restructuring"));
        assert!(result.entries[0].content.contains("Table of Contents"));
    }

    #[test]
    fn test_normalize_logs_patch_apply() {
        let executor = CodexExecutor::new();
        let logs = r#"{"id":"1","msg":{"type":"patch_apply_begin","call_id":"call_zr84aWQuwJR3aWgJLkfv56Gl","auto_approved":true,"changes":{"/private/var/folders/4m/6cwx14sx59lc2k9km5ph76gh0000gn/T/vibe-kanban-dev/vk-a712-minor-rest/README.md":{"update":{"unified_diff":"@@ -18,2 +18,17 @@\n \n+## Table of Contents\n+\n+- [Overview](#overview)\n+- [Installation](#installation)","move_path":null}}}}}
{"id":"1","msg":{"type":"patch_apply_end","call_id":"call_zr84aWQuwJR3aWgJLkfv56Gl","stdout":"Success. Updated the following files:\nM /private/var/folders/4m/6cwx14sx59lc2k9km5ph76gh0000gn/T/vibe-kanban-dev/vk-a712-minor-rest/README.md\n","stderr":"","success":true}}"#;

        let result = executor.normalize_logs(logs, "/tmp").unwrap();

        // Should have 1 entry (patch_apply_begin, patch_apply_end skipped)
        assert_eq!(result.entries.len(), 1);

        // Check edit tool use (follows claude.rs pattern)
        assert!(matches!(
            result.entries[0].entry_type,
            NormalizedEntryType::ToolUse { .. }
        ));
        if let NormalizedEntryType::ToolUse {
            tool_name,
            action_type,
        } = &result.entries[0].entry_type
        {
            assert_eq!(tool_name, "edit");
            assert!(matches!(action_type, ActionType::FileWrite { .. }));
        }
        assert!(result.entries[0].content.contains("README.md"));
    }

    #[test]
    fn test_normalize_logs_skip_task_messages() {
        let executor = CodexExecutor::new();
        let logs = r#"{"id":"1","msg":{"type":"task_started"}}
{"id":"1","msg":{"type":"agent_message","message":"Hello world"}}
{"id":"1","msg":{"type":"task_complete","last_agent_message":"Done!"}}"#;

        let result = executor.normalize_logs(logs, "/tmp").unwrap();

        // Should have 1 entry (task_started and task_complete skipped)
        assert_eq!(result.entries.len(), 1);

        // Check that only agent_message remains
        assert!(matches!(
            result.entries[0].entry_type,
            NormalizedEntryType::AssistantMessage
        ));
        assert_eq!(result.entries[0].content, "Hello world");
    }
}
