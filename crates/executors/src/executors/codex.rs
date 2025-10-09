pub mod client;
pub mod jsonrpc;
pub mod normalize_logs;
pub mod session;

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};

use async_trait::async_trait;
use codex_app_server_protocol::NewConversationParams;
use codex_protocol::config_types::SandboxMode as CodexSandboxMode;
use command_group::AsyncCommandGroup;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use strum_macros::AsRefStr;
use tokio::process::Command;
use ts_rs::TS;
use workspace_utils::{msg_store::MsgStore, shell::get_shell_command};

use self::{
    client::{AppServerClient, LogWriter},
    jsonrpc::JsonRpcPeer,
    normalize_logs::normalize_logs,
    session::SessionHandler,
};
use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{
        AppendPrompt, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
        codex::{jsonrpc::ExitSignalSender, normalize_logs::Error},
    },
    stdout_dup::create_stdout_pipe_writer,
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

/// Format for model reasoning summaries
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum ReasoningSummaryFormat {
    None,
    Experimental,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Codex {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<SandboxMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub oss: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_reasoning_effort: Option<ReasoningEffort>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_reasoning_summary: Option<ReasoningSummary>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_reasoning_summary_format: Option<ReasoningSummaryFormat>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_instructions: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_plan_tool: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_apply_patch_tool: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

#[async_trait]
impl StandardCodingAgentExecutor for Codex {
    async fn spawn(&self, current_dir: &Path, prompt: &str) -> Result<SpawnedChild, ExecutorError> {
        let command = self.build_command_builder().build_initial();
        self.spawn(current_dir, prompt, command, None).await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command = self.build_command_builder().build_follow_up(&[]);
        self.spawn(current_dir, prompt, command, Some(session_id))
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        normalize_logs(msg_store, worktree_path);
    }

    fn default_mcp_config_path(&self) -> Option<PathBuf> {
        dirs::home_dir().map(|home| home.join(".codex").join("config.toml"))
    }
}

impl Codex {
    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new("npx -y @openai/codex@0.46.0 app-server");

        if self.oss.unwrap_or(false) {
            builder = builder.extend_params(["--oss"]);
        }

        apply_overrides(builder, &self.cmd)
    }

    fn build_new_conversation_params(&self, cwd: &Path) -> NewConversationParams {
        let sandbox = match self.sandbox.as_ref() {
            None | Some(SandboxMode::Auto) => None,
            Some(SandboxMode::ReadOnly) => Some(CodexSandboxMode::ReadOnly),
            Some(SandboxMode::WorkspaceWrite) => Some(CodexSandboxMode::WorkspaceWrite),
            Some(SandboxMode::DangerFullAccess) => Some(CodexSandboxMode::DangerFullAccess),
        };

        NewConversationParams {
            model: self.model.clone(),
            profile: self.profile.clone(),
            cwd: Some(cwd.to_string_lossy().to_string()),
            approval_policy: None,
            sandbox,
            config: self.build_config_overrides(),
            base_instructions: self.base_instructions.clone(),
            include_plan_tool: self.include_plan_tool,
            include_apply_patch_tool: self.include_apply_patch_tool,
        }
    }

    fn build_config_overrides(&self) -> Option<HashMap<String, Value>> {
        let mut overrides = HashMap::new();

        if let Some(effort) = &self.model_reasoning_effort {
            overrides.insert(
                "model_reasoning_effort".to_string(),
                Value::String(effort.as_ref().to_string()),
            );
        }

        if let Some(summary) = &self.model_reasoning_summary {
            overrides.insert(
                "model_reasoning_summary".to_string(),
                Value::String(summary.as_ref().to_string()),
            );
        }

        if let Some(format) = &self.model_reasoning_summary_format
            && format != &ReasoningSummaryFormat::None
        {
            overrides.insert(
                "model_reasoning_summary_format".to_string(),
                Value::String(format.as_ref().to_string()),
            );
        }

        if overrides.is_empty() {
            None
        } else {
            Some(overrides)
        }
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        command: String,
        resume_session: Option<&str>,
    ) -> Result<SpawnedChild, ExecutorError> {
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let (shell_cmd, shell_arg) = get_shell_command();

        let mut process = Command::new(shell_cmd);
        process
            .kill_on_drop(true)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&command)
            .env("NODE_NO_WARNINGS", "1")
            .env("NO_COLOR", "1")
            .env("RUST_LOG", "error");

        let mut child = process.group_spawn()?;

        let child_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("Codex app server missing stdout"))
        })?;
        let child_stdin = child.inner().stdin.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("Codex app server missing stdin"))
        })?;

        let new_stdout = create_stdout_pipe_writer(&mut child)?;
        let (exit_signal_tx, exit_signal_rx) = tokio::sync::oneshot::channel();

        let params = self.build_new_conversation_params(current_dir);
        let resume_session = resume_session.map(|s| s.to_string());
        tokio::spawn(async move {
            let exit_signal_tx = ExitSignalSender::new(exit_signal_tx);
            let log_writer = LogWriter::new(new_stdout);
            if let Err(err) = Self::launch_codex_app_server(
                params,
                resume_session,
                combined_prompt,
                child_stdout,
                child_stdin,
                log_writer.clone(),
                exit_signal_tx.clone(),
            )
            .await
            {
                if matches!(&err, ExecutorError::Io(io_err) if io_err.kind() == std::io::ErrorKind::BrokenPipe)
                {
                    // Broken pipe likely means the parent process exited, so we can ignore it
                    return;
                }
                tracing::error!("Codex spawn error: {}", err);
                log_writer
                    .log_raw(&Error::launch_error(err.to_string()).raw())
                    .await
                    .ok();
                exit_signal_tx.send_exit_signal().await;
            }
        });

        Ok(SpawnedChild {
            child,
            exit_signal: Some(exit_signal_rx),
        })
    }

    async fn launch_codex_app_server(
        conversation_params: NewConversationParams,
        resume_session: Option<String>,
        combined_prompt: String,
        child_stdout: tokio::process::ChildStdout,
        child_stdin: tokio::process::ChildStdin,
        log_writer: LogWriter,
        exit_signal_tx: ExitSignalSender,
    ) -> Result<(), ExecutorError> {
        let client = AppServerClient::new(log_writer);
        let rpc_peer =
            JsonRpcPeer::spawn(child_stdin, child_stdout, client.clone(), exit_signal_tx);
        client.connect(rpc_peer);
        client.initialize().await?;
        match resume_session {
            None => {
                let params = conversation_params;
                let response = client.new_conversation(params).await?;
                client
                    .add_conversation_listener(response.conversation_id)
                    .await?;
                client
                    .send_user_message(response.conversation_id, combined_prompt)
                    .await?;
            }
            Some(session_id) => {
                let (rollout_path, _forked_session_id) =
                    SessionHandler::fork_rollout_file(&session_id)
                        .map_err(|e| ExecutorError::FollowUpNotSupported(e.to_string()))?;
                let overrides = conversation_params;
                let response = client
                    .resume_conversation(rollout_path.clone(), overrides)
                    .await?;
                tracing::debug!(
                    "resuming session using rollout file {}, response {:?}",
                    rollout_path.display(),
                    response
                );
                client
                    .add_conversation_listener(response.conversation_id)
                    .await?;
                client
                    .send_user_message(response.conversation_id, combined_prompt)
                    .await?;
            }
        }
        Ok(())
    }
}
