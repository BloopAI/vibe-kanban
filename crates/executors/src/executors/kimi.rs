pub mod normalize_logs;

use std::{path::Path, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use derivative::Derivative;
use normalize_logs::KimiLogProcessor;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuildError, CommandBuilder, CommandParts, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, BaseCodingAgent, ExecutorError,
        SpawnedChild, StandardCodingAgentExecutor,
    },
    profile::ExecutorConfig,
    stdout_dup::create_stdout_pipe_writer,
};

/// Kimi CLI executor configuration
#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Kimi {
    #[serde(default)]
    pub append_prompt: AppendPrompt,

    /// Model to use (e.g., "kimi-k2", "kimi-k2.5")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    /// Agent type (e.g., "default", "okabe", or custom agent file)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,

    /// Skills to load
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skills: Option<Vec<String>>,

    /// Custom agent file path
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_file: Option<String>,

    /// Session ID to resume (for internal use)
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    session_id: Option<String>,

    #[serde(flatten)]
    pub cmd: CmdOverrides,

    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl Kimi {
    fn base_command(&self) -> &'static str {
        "kimi"
    }

    async fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        // Use print mode with stream-json output for programmatic interaction
        let mut builder = CommandBuilder::new(self.base_command());
        builder = builder.extend_params([
            "--print",
            "--output-format",
            "stream-json",
            "--input-format",
            "stream-json",
        ]);

        // Add model if specified
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }

        // Add agent if specified
        if let Some(agent) = &self.agent {
            builder = builder.extend_params(["--agent", agent]);
        }

        // Add agent file if specified
        if let Some(agent_file) = &self.agent_file {
            builder = builder.extend_params(["--agent-file", agent_file]);
        }

        // Add skills if specified
        if let Some(skills) = &self.skills {
            for skill in skills {
                builder = builder.extend_params(["--skill", skill]);
            }
        }

        // Add session resume if specified
        if let Some(session_id) = &self.session_id {
            builder = builder.extend_params(["--session", session_id]);
        }

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Kimi {
    fn apply_overrides(&mut self, executor_config: &ExecutorConfig) {
        if let Some(model_id) = &executor_config.model_id {
            self.model = Some(model_id.clone());
        }
    }

    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_builder = self.build_command_builder().await?;
        let command_parts = command_builder.build_initial()?;
        self.spawn_internal(current_dir, prompt, command_parts, env).await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        _reset_to_message_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let mut command_builder = self.build_command_builder().await?;
        
        // Add session resume parameter
        command_builder = command_builder.extend_params(["--session", session_id]);
        
        let command_parts = command_builder.build_initial()?;
        self.spawn_internal(current_dir, prompt, command_parts, env).await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        KimiLogProcessor::process_logs(msg_store, worktree_path);
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".kimi").join("mcp.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // Check if kimi is installed
        match which::which("kimi") {
            Ok(_) => {
                // Check for login status by looking for auth file
                let auth_file = dirs::home_dir()
                    .map(|home| home.join(".kimi").join("credentials.json"));
                
                if let Some(path) = auth_file {
                    if let Ok(metadata) = std::fs::metadata(&path) {
                        if let Ok(modified) = metadata.modified() {
                            if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                                return AvailabilityInfo::LoginDetected {
                                    last_auth_timestamp: duration.as_secs() as i64,
                                };
                            }
                        }
                    }
                }
                
                AvailabilityInfo::InstallationFound
            }
            Err(_) => AvailabilityInfo::NotFound,
        }
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig {
            executor: BaseCodingAgent::Kimi,
            variant: None,
            model_id: self.model.clone(),
            agent_id: self.agent.clone(),
            reasoning_id: None,
            permission_policy: None,
        }
    }
}

impl Kimi {
    async fn spawn_internal(
        &self,
        current_dir: &Path,
        prompt: &str,
        command_parts: CommandParts,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let (program_path, args) = command_parts.into_resolved().await?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .env("NPM_CONFIG_LOGLEVEL", "error")
            .env("NODE_NO_WARNINGS", "1")
            .args(&args);

        // Apply environment from profile
        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

        let mut child = command.group_spawn()?;

        let child_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("Kimi CLI missing stdout"))
        })?;
        let child_stdin = child.inner().stdin.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("Kimi CLI missing stdin"))
        })?;

        // Create stdout pipe for log processing
        let new_stdout = create_stdout_pipe_writer(&mut child)?;

        // Create cancellation token
        let cancel = CancellationToken::new();

        // Spawn task to handle input/output
        let prompt_clone = combined_prompt.clone();
        let cancel_for_task = cancel.clone();

        tokio::spawn(async move {
            // Write prompt to stdin
            if let Err(e) = Self::write_prompt(child_stdin, &prompt_clone).await {
                tracing::error!("Failed to write prompt to Kimi CLI: {}", e);
                return;
            }

            // Process stdout
            if let Err(e) = Self::process_stdout(child_stdout, new_stdout, cancel_for_task).await {
                tracing::error!("Error processing Kimi CLI stdout: {}", e);
            }
        });

        Ok(SpawnedChild {
            child,
            exit_signal: None,
            cancel: Some(cancel),
        })
    }

    async fn write_prompt(
        mut stdin: tokio::process::ChildStdin,
        prompt: &str,
    ) -> Result<(), std::io::Error> {
        use tokio::io::AsyncWriteExt;
        
        // Kimi CLI expects JSON input in stream-json mode
        let input = serde_json::json!({
            "type": "prompt",
            "content": prompt
        });
        
        let input_line = format!("{}\n", serde_json::to_string(&input)?);
        stdin.write_all(input_line.as_bytes()).await?;
        stdin.flush().await?;
        
        Ok(())
    }

    async fn process_stdout(
        stdout: tokio::process::ChildStdout,
        mut output: impl tokio::io::AsyncWrite + Unpin,
        cancel: CancellationToken,
    ) -> Result<(), std::io::Error> {
        use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    tracing::debug!("Kimi CLI stdout processing cancelled");
                    break;
                }
                line = lines.next_line() => {
                    match line {
                        Ok(Some(line)) => {
                            output.write_all(line.as_bytes()).await?;
                            output.write_all(b"\n").await?;
                            output.flush().await?;
                        }
                        Ok(None) => break, // EOF
                        Err(e) => {
                            tracing::error!("Error reading Kimi CLI stdout: {}", e);
                            break;
                        }
                    }
                }
            }
        }

        Ok(())
    }
}
