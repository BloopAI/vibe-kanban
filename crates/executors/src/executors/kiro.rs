use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command, task::JoinHandle};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, BaseCodingAgent, ExecutorError, SpawnedChild,
        StandardCodingAgentExecutor,
    },
    logs::{
        NormalizedEntry, NormalizedEntryType, plain_text_processor::PlainTextLogProcessor,
        utils::EntryIndexProvider,
    },
    profile::ExecutorConfig,
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
    fn build_command_builder(&self) -> Result<CommandBuilder, crate::command::CommandBuildError> {
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
        let command_parts = self.build_command_builder()?.build_initial()?;
        let (executable_path, args) = command_parts.into_resolved().await?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let session_dir = current_dir.join(".kiro-sessions");
        std::fs::create_dir_all(&session_dir).ok();

        tracing::info!(
            "Kiro initial: Starting NEW session in {}, prompt length: {} chars",
            session_dir.display(),
            combined_prompt.len()
        );

        let mut command = Command::new(executable_path);
        command
            .kill_on_drop(true)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(&session_dir)
            .args(&args);

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

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
        _session_id: &str,
        _reset_to_message_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_parts = self
            .build_command_builder()?
            .build_follow_up(&["--resume".to_string()])?;
        let (executable_path, args) = command_parts.into_resolved().await?;

        let session_dir = current_dir.join(".kiro-sessions");
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        tracing::info!(
            "Kiro follow-up: RESUMING session in {}, prompt length: {} chars",
            session_dir.display(),
            combined_prompt.len()
        );

        let mut command = Command::new(executable_path);
        command
            .kill_on_drop(true)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(&session_dir)
            .args(&args);

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

        let mut child = command.group_spawn()?;

        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child.into())
    }

    fn normalize_logs(
        &self,
        msg_store: Arc<MsgStore>,
        _worktree_path: &Path,
    ) -> Vec<JoinHandle<()>> {
        use std::time::Duration;

        use futures::StreamExt;

        let entry_index_provider = EntryIndexProvider::start_from(&msg_store);

        let session_id = uuid::Uuid::new_v4().to_string();
        msg_store.push_session_id(session_id);

        let msg_store_stdout = msg_store.clone();
        let entry_index_provider_stdout = entry_index_provider.clone();
        let handle_stdout = tokio::spawn(async move {
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

        let msg_store_stderr = msg_store.clone();
        let entry_index_provider_stderr = entry_index_provider;
        let handle_stderr = tokio::spawn(async move {
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

        vec![handle_stdout, handle_stderr]
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".kiro").join("config.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        if which::which("kiro-cli").is_ok() {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig {
            executor: BaseCodingAgent::Kiro,
            variant: None,
            model_id: None,
            agent_id: None,
            reasoning_id: None,
            permission_policy: Some(crate::model_selector::PermissionPolicy::Auto),
        }
    }
}
