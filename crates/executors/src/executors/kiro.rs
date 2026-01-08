use std::{path::Path, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
    },
    logs::{
        plain_text_processor::PlainTextLogProcessor,
        utils::EntryIndexProvider,
        NormalizedEntry, NormalizedEntryType,
    },
};

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Kiro {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl Kiro {
    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new("kiro-cli chat")
            .extend_params(["--no-interactive", "--trust-all-tools"]);

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model.as_str()]);
        }

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Kiro {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_parts = self.build_command_builder().build_initial()?;
        let (executable_path, args) = command_parts.into_resolved().await?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        // Create a unique session directory for this task to avoid session conflicts
        let session_dir = current_dir.join(".kiro-sessions");
        std::fs::create_dir_all(&session_dir).ok();
        
        tracing::info!("Kiro initial: Starting NEW session in {}, prompt length: {} chars", 
                      session_dir.display(), combined_prompt.len());
        tracing::debug!("Kiro initial: Command: {} {:?}", executable_path.display(), args);
        tracing::debug!("Kiro initial: Working directory: {}", session_dir.display());
        tracing::debug!("Kiro initial: Prompt content: {}", combined_prompt);

        let mut command = Command::new(executable_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(&session_dir)  // Run in session-specific directory
            .args(&args);

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

        let mut child = command.group_spawn()?;

        if let Some(mut stdin) = child.inner().stdin.take() {
            tracing::info!("Kiro initial: Writing prompt to stdin");
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
            tracing::info!("Kiro initial: Stdin closed, waiting for response");
        }

        Ok(child.into())
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        // Use --resume flag to continue the most recent session
        let command_parts = self
            .build_command_builder()
            .build_follow_up(&["--resume".to_string()])?;
        let (executable_path, args) = command_parts.into_resolved().await?;
        
        // Use the same session directory as initial spawn
        let session_dir = current_dir.join(".kiro-sessions");
        
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        tracing::info!("Kiro follow-up: RESUMING session in {}, prompt length: {} chars", 
                      session_dir.display(), combined_prompt.len());
        tracing::debug!("Kiro follow-up: Command: {} {:?}", executable_path.display(), args);
        tracing::debug!("Kiro follow-up: Working directory: {}", session_dir.display());
        tracing::debug!("Kiro follow-up: Session ID: {}", session_id);
        tracing::debug!("Kiro follow-up: Prompt content: {}", combined_prompt);

        let mut command = Command::new(executable_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(&session_dir)  // Run in same session-specific directory
            .args(&args);

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

        let mut child = command.group_spawn()?;

        if let Some(mut stdin) = child.inner().stdin.take() {
            tracing::info!("Kiro follow-up: Writing prompt to stdin");
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
            tracing::info!("Kiro follow-up: Stdin closed, waiting for response");
        }

        Ok(child.into())
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, _worktree_path: &Path) {
        use futures::StreamExt;
        use std::time::Duration;

        let entry_index_provider = EntryIndexProvider::start_from(&msg_store);

        // Generate a session ID for this Kiro session and emit it immediately
        let session_id = uuid::Uuid::new_v4().to_string();
        msg_store.push_session_id(session_id);
        tracing::info!("Kiro: Generated session ID for follow-up tracking");

        // Process stdout as plain text
        let msg_store_stdout = msg_store.clone();
        let entry_index_provider_stdout = entry_index_provider.clone();
        tokio::spawn(async move {
            let mut stdout = msg_store_stdout.stdout_chunked_stream();
            let mut processor = PlainTextLogProcessor::builder()
                .normalized_entry_producer(Box::new(|content: String| {
                    let content = strip_ansi_escapes::strip_str(&content);
                    NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::AssistantMessage,
                        content: content.to_string(),
                        metadata: None,
                    }
                }))
                .time_gap(Duration::from_secs(2))
                .index_provider(entry_index_provider_stdout)
                .build();

            while let Some(Ok(chunk)) = stdout.next().await {
                for patch in processor.process(chunk) {
                    msg_store_stdout.push_patch(patch);
                }
            }
        });

        // Process stderr as error messages
        let msg_store_stderr = msg_store.clone();
        let entry_index_provider_stderr = entry_index_provider;
        tokio::spawn(async move {
            let mut stderr = msg_store_stderr.stderr_chunked_stream();
            let mut processor = PlainTextLogProcessor::builder()
                .normalized_entry_producer(Box::new(|content: String| {
                    let content = strip_ansi_escapes::strip_str(&content);
                    NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: content.to_string(),
                        metadata: None,
                    }
                }))
                .time_gap(Duration::from_secs(2))
                .index_provider(entry_index_provider_stderr)
                .build();

            while let Some(Ok(chunk)) = stderr.next().await {
                for patch in processor.process(chunk) {
                    msg_store_stderr.push_patch(patch);
                }
            }
        });
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".kiro").join("config.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // Check if kiro-cli is installed by looking for the binary
        if which::which("kiro-cli").is_ok() {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
}
