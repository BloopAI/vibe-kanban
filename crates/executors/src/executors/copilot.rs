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
    io::AsyncWriteExt,
    process::Command,
    time::{interval, timeout},
};
use ts_rs::TS;
use uuid::Uuid;
use workspace_utils::{msg_store::MsgStore, path::get_vibe_kanban_temp_dir};

use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
    },
    logs::{
        NormalizedEntry, NormalizedEntryType, plain_text_processor::PlainTextLogProcessor,
        stderr_processor::normalize_stderr_logs, utils::EntryIndexProvider,
    },
    stdout_dup::{self, StdoutAppender},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Copilot {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
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
        let mut builder = CommandBuilder::new("npx -y @github/copilot@0.0.358").params([
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
        env: &ExecutionEnv,
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
            .env("NODE_NO_WARNINGS", "1");

        // Apply environment variables
        env.apply_to_command(&mut command);

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
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
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

        // Apply environment variables
        env.apply_to_command(&mut command);

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
    fn normalize_logs(&self, msg_store: Arc<MsgStore>, _worktree_path: &Path) {
        let entry_index_counter = EntryIndexProvider::start_from(&msg_store);
        normalize_stderr_logs(msg_store.clone(), entry_index_counter.clone());

        // Normalize Agent logs
        tokio::spawn(async move {
            let mut stdout_lines = msg_store.stdout_lines_stream();

            let mut processor = Self::create_simple_stdout_normalizer(entry_index_counter);

            while let Some(Ok(line)) = stdout_lines.next().await {
                if let Some(session_id) = line.strip_prefix(Self::SESSION_PREFIX) {
                    msg_store.push_session_id(session_id.trim().to_string());
                    continue;
                }

                for patch in processor.process(line + "\n") {
                    msg_store.push_patch(patch);
                }
            }
        });
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

    const SESSION_PREFIX: &'static str = "[copilot-session] ";

    // Find session id and write it to stdout prefixed
    fn send_session_id(log_dir_path: PathBuf, stdout_appender: StdoutAppender) {
        tokio::spawn(async move {
            match Self::watch_session_id(log_dir_path).await {
                Ok(session_id) => {
                    let session_line = format!("{}{}\n", Self::SESSION_PREFIX, session_id);
                    stdout_appender.append_line(&session_line);
                }
                Err(e) => {
                    tracing::error!("Failed to find session ID: {}", e);
                }
            }
        });
    }
}
