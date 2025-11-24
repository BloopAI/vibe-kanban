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
use codex_protocol::{
    config_types::SandboxMode as CodexSandboxMode, protocol::AskForApproval as CodexAskForApproval,
};
use command_group::AsyncCommandGroup;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use strum_macros::AsRefStr;
use tokio::process::Command;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use self::{
    client::{AppServerClient, LogWriter},
    jsonrpc::JsonRpcPeer,
    normalize_logs::normalize_logs,
    session::SessionHandler,
};
use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuilder, CommandParts, apply_overrides},
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, ExecutorExitResult, SpawnedChild,
        StandardCodingAgentExecutor,
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

/// Determines when the user is consulted to approve Codex actions.
///
/// - `UnlessTrusted`: Read-only commands are auto-approved. Everything else will
///   ask the user to approve.
/// - `OnFailure`: All commands run in a restricted sandbox initially. If a
///   command fails, the user is asked to approve execution without the sandbox.
/// - `OnRequest`: The model decides when to ask the user for approval.
/// - `Never`: Commands never ask for approval. Commands that fail in the
///   restricted sandbox are not retried.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum AskForApproval {
    UnlessTrusted,
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

/// Format for model reasoning summaries
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum ReasoningSummaryFormat {
    None,
    Experimental,
}

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Codex {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<SandboxMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ask_for_approval: Option<AskForApproval>,
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

    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

#[async_trait]
impl StandardCodingAgentExecutor for Codex {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    async fn spawn(&self, current_dir: &Path, prompt: &str) -> Result<SpawnedChild, ExecutorError> {
        let command_parts = self.build_command_builder().build_initial()?;
        self.spawn(current_dir, prompt, command_parts, None).await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_parts = self.build_command_builder().build_follow_up(&[])?;
        self.spawn(current_dir, prompt, command_parts, Some(session_id))
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        normalize_logs(msg_store, worktree_path);
    }

    fn default_mcp_config_path(&self) -> Option<PathBuf> {
        dirs::home_dir().map(|home| home.join(".codex").join("config.toml"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        if let Some(timestamp) = dirs::home_dir()
            .and_then(|home| std::fs::metadata(home.join(".codex").join("auth.json")).ok())
            .and_then(|m| m.modified().ok())
            .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
        {
            return AvailabilityInfo::LoginDetected {
                last_auth_timestamp: timestamp,
            };
        }

        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        let installation_indicator_found = dirs::home_dir()
            .map(|home| home.join(".codex").join("version.json").exists())
            .unwrap_or(false);

        if mcp_config_found || installation_indicator_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
}

impl Codex {
    pub fn base_command() -> &'static str {
        "npx -y @openai/codex@0.60.1"
    }

    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new(Self::base_command());
        builder = builder.extend_params(["app-server"]);
        if self.oss.unwrap_or(false) {
            builder = builder.extend_params(["--oss"]);
        }

        apply_overrides(builder, &self.cmd)
    }

    fn build_new_conversation_params(&self, cwd: &Path) -> NewConversationParams {
        let sandbox = match self.sandbox.as_ref() {
            None | Some(SandboxMode::Auto) => Some(CodexSandboxMode::WorkspaceWrite), // match the Auto preset in codex
            Some(SandboxMode::ReadOnly) => Some(CodexSandboxMode::ReadOnly),
            Some(SandboxMode::WorkspaceWrite) => Some(CodexSandboxMode::WorkspaceWrite),
            Some(SandboxMode::DangerFullAccess) => Some(CodexSandboxMode::DangerFullAccess),
        };

        let approval_policy = match self.ask_for_approval.as_ref() {
            None if matches!(self.sandbox.as_ref(), None | Some(SandboxMode::Auto)) => {
                // match the Auto preset in codex
                Some(CodexAskForApproval::OnRequest)
            }
            None => None,
            Some(AskForApproval::UnlessTrusted) => Some(CodexAskForApproval::UnlessTrusted),
            Some(AskForApproval::OnFailure) => Some(CodexAskForApproval::OnFailure),
            Some(AskForApproval::OnRequest) => Some(CodexAskForApproval::OnRequest),
            Some(AskForApproval::Never) => Some(CodexAskForApproval::Never),
        };

        NewConversationParams {
            model: self.model.clone(),
            profile: self.profile.clone(),
            cwd: Some(cwd.to_string_lossy().to_string()),
            approval_policy,
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
        command_parts: CommandParts,
        resume_session: Option<&str>,
    ) -> Result<SpawnedChild, ExecutorError> {
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let (program_path, args) = command_parts.into_resolved().await?;

        let mut process = Command::new(program_path);
        process
            .kill_on_drop(true)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(current_dir)
            .args(&args)
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
        let auto_approve = matches!(
            (&self.sandbox, &self.ask_for_approval),
            (Some(SandboxMode::DangerFullAccess), None)
        );
        let approvals = self.approvals.clone();
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
                approvals,
                auto_approve,
            )
            .await
            {
                match &err {
                    ExecutorError::Io(io_err)
                        if io_err.kind() == std::io::ErrorKind::BrokenPipe =>
                    {
                        // Broken pipe likely means the parent process exited, so we can ignore it
                        return;
                    }
                    ExecutorError::AuthRequired(message) => {
                        log_writer
                            .log_raw(&Error::auth_required(message.clone()).raw())
                            .await
                            .ok();
                        // Send failure signal so the process is marked as failed
                        exit_signal_tx
                            .send_exit_signal(ExecutorExitResult::Failure)
                            .await;
                        return;
                    }
                    _ => {
                        tracing::error!("Codex spawn error: {}", err);
                        log_writer
                            .log_raw(&Error::launch_error(err.to_string()).raw())
                            .await
                            .ok();
                    }
                }
                // For other errors, also send failure signal
                exit_signal_tx
                    .send_exit_signal(ExecutorExitResult::Failure)
                    .await;
            }
        });

        Ok(SpawnedChild {
            child,
            exit_signal: Some(exit_signal_rx),
        })
    }

    #[allow(clippy::too_many_arguments)]
    async fn launch_codex_app_server(
        conversation_params: NewConversationParams,
        resume_session: Option<String>,
        combined_prompt: String,
        child_stdout: tokio::process::ChildStdout,
        child_stdin: tokio::process::ChildStdin,
        log_writer: LogWriter,
        exit_signal_tx: ExitSignalSender,
        approvals: Option<Arc<dyn ExecutorApprovalService>>,
        auto_approve: bool,
    ) -> Result<(), ExecutorError> {
        let client = AppServerClient::new(log_writer, approvals, auto_approve);
        let rpc_peer =
            JsonRpcPeer::spawn(child_stdin, child_stdout, client.clone(), exit_signal_tx);
        client.connect(rpc_peer);
        client.initialize().await?;
        let auth_status = client.get_auth_status().await?;
        if auth_status.auth_method.is_none() {
            return Err(ExecutorError::AuthRequired(
                "Codex authentication required".to_string(),
            ));
        }
        match resume_session {
            None => {
                let params = conversation_params;
                let response = client.new_conversation(params).await?;
                let conversation_id = response.conversation_id;
                client.register_session(&conversation_id).await?;
                client.add_conversation_listener(conversation_id).await?;
                client
                    .send_user_message(conversation_id, combined_prompt)
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
                let conversation_id = response.conversation_id;
                client.register_session(&conversation_id).await?;
                client.add_conversation_listener(conversation_id).await?;
                client
                    .send_user_message(conversation_id, combined_prompt)
                    .await?;
            }
        }
        Ok(())
    }
}
