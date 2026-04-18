use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
    time::Duration,
};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use futures::StreamExt;
use regex::Regex;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::{
    fs,
    io::{AsyncBufReadExt, AsyncSeekExt, AsyncWriteExt, BufReader},
    process::Command,
    time::{interval, timeout},
};
use ts_rs::TS;
use uuid::Uuid;
use workspace_utils::{msg_store::MsgStore, path::get_vibe_kanban_temp_dir};

use crate::{
    actions::SpawnContext,
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
    },
    logs::{
        NormalizedEntry, NormalizedEntryType,
        plain_text_processor::PlainTextLogProcessor,
        stderr_processor::normalize_stderr_logs,
        utils::{ConversationPatch, EntryIndexProvider},
    },
    stdout_dup::{self, StdoutAppender},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Copilot {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub no_context: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_all_tools: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_tool: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deny_tool: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub add_dir: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disable_mcp_server: Option<Vec<String>>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Copilot {
    fn build_command_builder(&self, log_dir: &str) -> CommandBuilder {
        let mut builder = CommandBuilder::new("npx -y @github/copilot@0.0.377").params([
            "--no-color",
            "--log-level",
            "debug",
            "--log-dir",
            log_dir,
        ]);

        if self.allow_all_tools.unwrap_or(false) {
            builder = builder.extend_params(["--allow-all-tools"]);
        }

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }

        if let Some(tool) = &self.allow_tool {
            builder = builder.extend_params(["--allow-tool", tool]);
        }

        if let Some(tool) = &self.deny_tool {
            builder = builder.extend_params(["--deny-tool", tool]);
        }

        if let Some(dirs) = &self.add_dir {
            for dir in dirs {
                builder = builder.extend_params(["--add-dir", dir]);
            }
        }

        if let Some(servers) = &self.disable_mcp_server {
            for server in servers {
                builder = builder.extend_params(["--disable-mcp-server", server]);
            }
        }

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Copilot {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        context: SpawnContext,
    ) -> Result<SpawnedChild, ExecutorError> {
        let log_dir = Self::create_temp_log_dir(current_dir).await?;
        let command_parts = self
            .build_command_builder(&log_dir.to_string_lossy())
            .build_initial()?;
        let (program_path, args) = command_parts.into_resolved().await?;

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&args)
            .env("NODE_NO_WARNINGS", "1")
            .env("VK_ATTEMPT_ID", context.task_attempt_id.to_string())
            .env("VK_TASK_ID", context.task_id.to_string())
            .env(
                "VK_EXECUTION_PROCESS_ID",
                context.execution_process_id.to_string(),
            );

        // Remove pnpm-specific env vars that cause npm warnings when using npx
        command.env_remove("npm_config__jsr_registry");
        command.env_remove("npm_config_verify_deps_before_run");
        command.env_remove("npm_config_globalconfig");

        let mut child = command.group_spawn()?;

        // Write prompt to stdin
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        let (_, appender) = stdout_dup::tee_stdout_with_appender(&mut child)?;
        Self::send_session_id(log_dir, appender);

        Ok(child.into())
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<SpawnedChild, ExecutorError> {
        // Note: Environment variables (VK_ATTEMPT_ID, VK_TASK_ID, VK_EXECUTION_PROCESS_ID)
        // are inherited from the parent process that calls this method.
        let log_dir = Self::create_temp_log_dir(current_dir).await?;
        let command_parts = self
            .build_command_builder(&log_dir.to_string_lossy())
            .build_follow_up(&["--resume".to_string(), session_id.to_string()])?;
        let (program_path, args) = command_parts.into_resolved().await?;

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(program_path);

        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&args)
            .env("NODE_NO_WARNINGS", "1");

        // Remove pnpm-specific env vars that cause npm warnings when using npx
        command.env_remove("npm_config__jsr_registry");
        command.env_remove("npm_config_verify_deps_before_run");
        command.env_remove("npm_config_globalconfig");

        let mut child = command.group_spawn()?;

        // Write comprehensive prompt to stdin
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        let (_, appender) = stdout_dup::tee_stdout_with_appender(&mut child)?;
        Self::send_session_id(log_dir, appender);

        Ok(child.into())
    }

    /// Parses both stderr and stdout logs for Copilot executor using PlainTextLogProcessor.
    ///
    /// Each entry is converted into an `AssistantMessage` or `ErrorMessage` and emitted as patches.
    /// Additionally, starts a log file watcher to extract structured information like model info
    /// from Copilot's debug log files.
    fn normalize_logs(
        &self,
        msg_store: Arc<MsgStore>,
        worktree_path: &Path,
        entry_index_counter: EntryIndexProvider,
    ) -> tokio::task::JoinHandle<()> {
        let stderr_handle = normalize_stderr_logs(msg_store.clone(), entry_index_counter.clone());

        let worktree_path = worktree_path.to_path_buf();
        let entry_index_for_log_watcher = entry_index_counter.clone();
        let msg_store_for_log_watcher = msg_store.clone();

        // Normalize Agent logs
        let stdout_handle = tokio::spawn(async move {
            let mut stdout_lines = msg_store.stdout_lines_stream();

            let mut processor = Self::create_simple_stdout_normalizer(entry_index_counter);

            while let Some(Ok(line)) = stdout_lines.next().await {
                if let Some(session_id) = line.strip_prefix(Self::SESSION_PREFIX) {
                    msg_store.push_session_id(session_id.trim().to_string());
                    continue;
                }

                // Check for log directory path and start log file watcher
                if let Some(log_dir) = line.strip_prefix(Self::LOG_DIR_PREFIX) {
                    let log_dir_path = PathBuf::from(log_dir.trim());
                    Self::start_log_file_watcher(
                        log_dir_path,
                        msg_store_for_log_watcher.clone(),
                        entry_index_for_log_watcher.clone(),
                        worktree_path.clone(),
                    );
                    continue;
                }

                for patch in processor.process(line + "\n") {
                    msg_store.push_patch(patch);
                }
            }
        });

        // Return a handle that awaits both normalization tasks
        tokio::spawn(async move {
            let _ = stderr_handle.await;
            let _ = stdout_handle.await;
        })
    }

    // MCP configuration methods
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".copilot").join("mcp-config.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        let installation_indicator_found = dirs::home_dir()
            .map(|home| home.join(".copilot").join("config.json").exists())
            .unwrap_or(false);

        if mcp_config_found || installation_indicator_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
}

impl Copilot {
    fn create_simple_stdout_normalizer(
        index_provider: EntryIndexProvider,
    ) -> PlainTextLogProcessor {
        PlainTextLogProcessor::builder()
            .normalized_entry_producer(Box::new(|content: String| NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::AssistantMessage,
                content,
                metadata: None,
            }))
            .transform_lines(Box::new(|lines| {
                lines.iter_mut().for_each(|line| {
                    *line = strip_ansi_escapes::strip_str(&line);
                })
            }))
            .index_provider(index_provider)
            .build()
    }

    async fn create_temp_log_dir(current_dir: &Path) -> Result<PathBuf, ExecutorError> {
        let base_log_dir = get_vibe_kanban_temp_dir().join("copilot_logs");
        fs::create_dir_all(&base_log_dir)
            .await
            .map_err(ExecutorError::Io)?;

        let run_log_dir = base_log_dir
            .join(current_dir.file_name().unwrap_or_default())
            .join(Uuid::new_v4().to_string());
        fs::create_dir_all(&run_log_dir)
            .await
            .map_err(ExecutorError::Io)?;

        Ok(run_log_dir)
    }

    // Scan the log directory for a file named `<UUID>.log` or `session-<UUID>.log` and extract the UUID as session ID.
    async fn watch_session_id(log_dir_path: PathBuf) -> Result<String, String> {
        let mut ticker = interval(Duration::from_millis(200));
        let re =
            Regex::new(r"^(?:session-)?([0-9a-fA-F-]{36})\.log$").map_err(|e| e.to_string())?;

        timeout(Duration::from_secs(600), async {
            loop {
                if let Ok(mut rd) = fs::read_dir(&log_dir_path).await {
                    while let Ok(Some(e)) = rd.next_entry().await {
                        if let Some(file_name) = e.file_name().to_str()
                            && let Some(caps) = re.captures(file_name)
                            && let Some(matched) = caps.get(1)
                        {
                            let uuid_str = matched.as_str();
                            if Uuid::parse_str(uuid_str).is_ok() {
                                return uuid_str.to_string();
                            }
                        }
                    }
                }
                ticker.tick().await;
            }
        })
        .await
        .map_err(|_| format!("No [session-]<uuid>.log found in {log_dir_path:?}"))
    }

    /// Find the session log file path once it exists
    async fn find_session_log_file(log_dir_path: PathBuf) -> Result<PathBuf, String> {
        let mut ticker = interval(Duration::from_millis(200));
        let re =
            Regex::new(r"^(?:session-)?([0-9a-fA-F-]{36})\.log$").map_err(|e| e.to_string())?;

        timeout(Duration::from_secs(600), async {
            loop {
                if let Ok(mut rd) = fs::read_dir(&log_dir_path).await {
                    while let Ok(Some(e)) = rd.next_entry().await {
                        if let Some(file_name) = e.file_name().to_str()
                            && re.is_match(file_name)
                        {
                            return e.path();
                        }
                    }
                }
                ticker.tick().await;
            }
        })
        .await
        .map_err(|_| format!("No session log found in {log_dir_path:?}"))
    }

    const SESSION_PREFIX: &'static str = "[copilot-session] ";
    const LOG_DIR_PREFIX: &'static str = "[copilot-log-dir] ";

    // Find session id and write it to stdout prefixed
    fn send_session_id(log_dir_path: PathBuf, stdout_appender: StdoutAppender) {
        tokio::spawn(async move {
            match Self::watch_session_id(log_dir_path.clone()).await {
                Ok(session_id) => {
                    let session_line = format!("{}{}\n", Self::SESSION_PREFIX, session_id);
                    stdout_appender.append_line(&session_line);
                    // Also send log dir path for log file parsing
                    let log_dir_line =
                        format!("{}{}\n", Self::LOG_DIR_PREFIX, log_dir_path.display());
                    stdout_appender.append_line(&log_dir_line);
                }
                Err(e) => {
                    tracing::error!("Failed to find session ID: {}", e);
                }
            }
        });
    }

    /// Start watching and parsing the Copilot log file for structured information
    fn start_log_file_watcher(
        log_dir_path: PathBuf,
        msg_store: Arc<MsgStore>,
        entry_index: EntryIndexProvider,
        worktree_path: PathBuf,
    ) {
        tokio::spawn(async move {
            // Wait for the log file to be created
            let log_file_path = match Self::find_session_log_file(log_dir_path).await {
                Ok(path) => path,
                Err(e) => {
                    tracing::error!("Failed to find session log file: {}", e);
                    return;
                }
            };

            // Parse the log file
            if let Err(e) =
                Self::parse_log_file(log_file_path, msg_store, entry_index, worktree_path).await
            {
                tracing::error!("Error parsing log file: {}", e);
            }
        });
    }

    /// Parse Copilot log file and emit normalized entries for tool calls
    async fn parse_log_file(
        log_file_path: PathBuf,
        msg_store: Arc<MsgStore>,
        entry_index: EntryIndexProvider,
        _worktree_path: PathBuf,
    ) -> Result<(), std::io::Error> {
        let mut model_reported = false;

        // Open file for reading, following as it grows
        let file = fs::File::open(&log_file_path).await?;
        let mut reader = BufReader::new(file);
        let mut line_buf = String::new();

        loop {
            line_buf.clear();
            let bytes_read = reader.read_line(&mut line_buf).await?;

            if bytes_read == 0 {
                // Check if we've reached the end and should stop
                if msg_store.is_finished() {
                    break;
                }
                // Wait briefly for more content
                tokio::time::sleep(Duration::from_millis(100)).await;
                // Re-open file to catch new content (tail -f style)
                let file = fs::File::open(&log_file_path).await?;
                let pos = reader.stream_position().await.unwrap_or(0);
                reader = BufReader::new(file);
                reader.seek(std::io::SeekFrom::Start(pos)).await?;
                continue;
            }

            let line = line_buf.trim();
            if line.is_empty() {
                continue;
            }

            // Parse log line: "TIMESTAMP [LEVEL] MESSAGE"
            if let Some(entry) = Self::parse_log_line(line, &mut model_reported) {
                let id = entry_index.next();
                msg_store.push_patch(ConversationPatch::add_normalized_entry(id, entry));
            }
        }

        Ok(())
    }

    /// Parse a single log line and optionally return a NormalizedEntry
    fn parse_log_line(line: &str, model_reported: &mut bool) -> Option<NormalizedEntry> {
        // Extract log level and message content
        let (level, content) = Self::parse_log_level_and_content(line)?;

        // Try to parse DEBUG/LOG lines for model info
        if level == "DEBUG" || level == "LOG" {
            // Check for model info: "Using model: <model>"
            if !*model_reported && let Some(model) = content.strip_prefix("Using model: ") {
                *model_reported = true;
                return Some(NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: format!("Model: {}", model.trim()),
                    metadata: None,
                });
            }
        }

        None
    }

    /// Parse log level and content from a log line
    fn parse_log_level_and_content(line: &str) -> Option<(&str, &str)> {
        // Format: "2025-12-31T01:40:37.640Z [LEVEL] content"
        let bracket_start = line.find('[')?;
        let bracket_end = line.find(']')?;

        if bracket_start >= bracket_end {
            return None;
        }

        let level = line.get(bracket_start + 1..bracket_end)?;
        let content = line.get(bracket_end + 1..)?.trim();

        Some((level, content))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_log_level_and_content() {
        let line = "2025-12-31T01:40:37.640Z [DEBUG] Using model: claude-haiku-4.5";
        let result = Copilot::parse_log_level_and_content(line);
        assert!(result.is_some());
        let (level, content) = result.unwrap();
        assert_eq!(level, "DEBUG");
        assert_eq!(content, "Using model: claude-haiku-4.5");
    }

    #[test]
    fn test_parse_log_level_log() {
        let line = "2025-12-31T01:41:08.899Z [LOG] Creating MCP client for github-mcp-server...";
        let result = Copilot::parse_log_level_and_content(line);
        assert!(result.is_some());
        let (level, content) = result.unwrap();
        assert_eq!(level, "LOG");
        assert!(content.contains("MCP client"));
    }

    #[test]
    fn test_parse_model_info() {
        let mut model_reported = false;

        let line = "2025-12-31T01:41:08.664Z [DEBUG] Using model: claude-haiku-4.5";
        let result = Copilot::parse_log_line(line, &mut model_reported);

        assert!(result.is_some());
        let entry = result.unwrap();
        assert!(matches!(
            entry.entry_type,
            NormalizedEntryType::SystemMessage
        ));
        assert!(entry.content.contains("claude-haiku-4.5"));
        assert!(model_reported);
    }
}
