pub mod client;
pub mod jsonrpc;
pub mod normalize_logs;
pub mod session;
use std::{
    collections::HashMap,
    io,
    path::{Path, PathBuf},
    sync::Arc,
};

use async_trait::async_trait;
use codex_app_server_protocol::{
    AskForApproval as CodexAskForApproval, ReviewTarget, SandboxMode as CodexSandboxMode,
    ThreadStartParams,
};
use codex_protocol::{
    ThreadId,
    config_types::{
        CollaborationMode as ProtocolCollaborationMode, CollaborationModeMask, ModeKind,
        Settings as ProtocolCollaborationSettings,
    },
    openai_models::ReasoningEffort as ProtocolReasoningEffort,
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
};
use crate::{
    actions::{SpawnContext, coding_agent_review::CodingAgentReviewRequest},
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuilder, CommandParts, apply_overrides},
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, ExecutorExitResult, ProtocolPeer,
        SpawnedChild, StandardCodingAgentExecutor,
        codex::{jsonrpc::ExitSignalSender, normalize_logs::Error},
    },
    logs::utils::EntryIndexProvider,
    stdout_dup::create_stdout_pipe_writer,
};

#[derive(Debug, Clone)]
pub struct CodexRuntimeModel {
    pub id: String,
    pub model: String,
    pub display_name: String,
    pub description: String,
    pub supported_reasoning_efforts: Vec<String>,
    pub default_reasoning_effort: Option<String>,
    pub is_default: bool,
}

#[derive(Debug, Clone)]
pub struct CodexRuntimeCollaborationMode {
    pub value: Option<String>,
    pub label: String,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CodexRuntimeCapabilities {
    pub models: Vec<CodexRuntimeModel>,
    pub collaboration_modes: Vec<CodexRuntimeCollaborationMode>,
    pub supports_interrupt: bool,
    pub supports_review: bool,
    pub supports_live_follow_up_messages: bool,
}

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
    Xhigh,
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

/// Native Codex collaboration mode presets.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[ts(export)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum CodexCollaborationMode {
    Plan,
    Code,
    PairProgramming,
    Execute,
    Custom,
}

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Codex {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub no_context: Option<bool>,
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
    pub include_apply_patch_tool: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compact_prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub developer_instructions: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(type = "string | null")]
    pub collaboration_mode: Option<CodexCollaborationMode>,
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

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        context: SpawnContext,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_parts = self.build_command_builder().build_initial()?;
        self.spawn_internal(current_dir, prompt, command_parts, None, context)
            .await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_parts = self.build_command_builder().build_follow_up(&[])?;

        // Placeholder context for follow-up (will be properly handled in future iteration)
        use uuid::Uuid;
        let placeholder_context = SpawnContext {
            task_attempt_id: Uuid::nil(),
            task_id: Uuid::nil(),
            execution_process_id: Uuid::nil(),
        };

        self.spawn_internal(
            current_dir,
            prompt,
            command_parts,
            Some(session_id),
            placeholder_context,
        )
        .await
    }

    async fn spawn_review(
        &self,
        current_dir: &Path,
        request: &CodingAgentReviewRequest,
        context: SpawnContext,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_parts = self.build_command_builder().build_initial()?;
        self.spawn_review_internal(current_dir, command_parts, request, context)
            .await
    }

    fn normalize_logs(
        &self,
        msg_store: Arc<MsgStore>,
        worktree_path: &Path,
        entry_index_provider: EntryIndexProvider,
    ) -> tokio::task::JoinHandle<()> {
        normalize_logs(msg_store, worktree_path, entry_index_provider)
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
        "npx -y @openai/codex@latest"
    }

    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new(Self::base_command());
        builder = builder.extend_params(["app-server"]);
        if self.oss.unwrap_or(false) {
            builder = builder.extend_params(["--oss"]);
        }

        apply_overrides(builder, &self.cmd)
    }

    fn build_thread_start_params(&self, cwd: &Path) -> ThreadStartParams {
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

        ThreadStartParams {
            model: self.model.clone(),
            model_provider: self.model_provider.clone(),
            cwd: Some(cwd.to_string_lossy().to_string()),
            approval_policy,
            sandbox,
            config: self.build_config_overrides(),
            base_instructions: self.base_instructions.clone(),
            developer_instructions: self.developer_instructions.clone(),
            personality: None,
            ephemeral: None,
            dynamic_tools: None,
            mock_experimental_field: None,
            experimental_raw_events: false,
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

        if let Some(profile) = &self.profile {
            overrides.insert("profile".to_string(), Value::String(profile.clone()));
        }

        if let Some(compact_prompt) = &self.compact_prompt {
            overrides.insert(
                "compact_prompt".to_string(),
                Value::String(compact_prompt.clone()),
            );
        }

        if let Some(include_apply_patch_tool) = self.include_apply_patch_tool {
            overrides.insert(
                "include_apply_patch_tool".to_string(),
                Value::Bool(include_apply_patch_tool),
            );
        }

        if overrides.is_empty() {
            None
        } else {
            Some(overrides)
        }
    }

    async fn spawn_internal(
        &self,
        current_dir: &Path,
        prompt: &str,
        command_parts: CommandParts,
        resume_session: Option<&str>,
        context: SpawnContext,
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

        // Remove pnpm-specific env vars that cause npm warnings when using npx
        process.env_remove("npm_config__jsr_registry");
        process.env_remove("npm_config_verify_deps_before_run");
        process.env_remove("npm_config_globalconfig");

        // Set VK context environment variables for MCP tools
        process
            .env("VK_ATTEMPT_ID", context.task_attempt_id.to_string())
            .env("VK_TASK_ID", context.task_id.to_string())
            .env(
                "VK_EXECUTION_PROCESS_ID",
                context.execution_process_id.to_string(),
            );

        let mut child = process.group_spawn()?;

        let child_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("Codex app server missing stdout"))
        })?;
        let child_stdin = child.inner().stdin.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("Codex app server missing stdin"))
        })?;

        let new_stdout = create_stdout_pipe_writer(&mut child)?;
        let (exit_signal_tx, exit_signal_rx) = tokio::sync::oneshot::channel();
        let client = AppServerClient::new(
            LogWriter::new(new_stdout),
            self.approvals.clone(),
            matches!(
                (&self.sandbox, &self.ask_for_approval),
                (Some(SandboxMode::DangerFullAccess), None)
            ),
        );

        let params = self.build_thread_start_params(current_dir);
        let resume_session = resume_session.map(|s| s.to_string());
        let collaboration_mode = self.collaboration_mode.clone();
        let model = self.model.clone();
        let model_reasoning_effort = self.model_reasoning_effort.clone();
        let developer_instructions = self.developer_instructions.clone();
        let protocol_peer = Arc::new(ProtocolPeer::Codex(client.clone()));
        tokio::spawn(async move {
            let exit_signal_tx = ExitSignalSender::new(exit_signal_tx);
            if let Err(err) = Self::launch_codex_app_server(
                client.clone(),
                params,
                resume_session,
                combined_prompt,
                child_stdout,
                child_stdin,
                exit_signal_tx.clone(),
                collaboration_mode,
                model,
                model_reasoning_effort,
                developer_instructions,
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
                        client
                            .log_writer()
                            .log_raw(&Error::auth_required(message.clone()).raw())
                            .await
                            .ok();
                        // Send failure signal so the process is marked as failed
                        exit_signal_tx
                            .send_exit_signal(ExecutorExitResult::failure(
                                crate::executors::SessionCompletionReason::Error {
                                    message: message.clone(),
                                },
                            ))
                            .await;
                        return;
                    }
                    _ => {
                        tracing::error!("Codex spawn error: {}", err);
                        client
                            .log_writer()
                            .log_raw(&Error::launch_error(err.to_string()).raw())
                            .await
                            .ok();
                    }
                }
                // For other errors, also send failure signal
                exit_signal_tx
                    .send_exit_signal(ExecutorExitResult::failure(
                        crate::executors::SessionCompletionReason::Error {
                            message: err.to_string(),
                        },
                    ))
                    .await;
            }
        });

        Ok(SpawnedChild {
            child,
            exit_signal: Some(exit_signal_rx),
            protocol_peer: Some(protocol_peer),
        })
    }

    #[allow(clippy::too_many_arguments)]
    async fn launch_codex_app_server(
        client: Arc<AppServerClient>,
        thread_params: ThreadStartParams,
        resume_session: Option<String>,
        combined_prompt: String,
        child_stdout: tokio::process::ChildStdout,
        child_stdin: tokio::process::ChildStdin,
        exit_signal_tx: ExitSignalSender,
        collaboration_mode: Option<CodexCollaborationMode>,
        model: Option<String>,
        model_reasoning_effort: Option<ReasoningEffort>,
        developer_instructions: Option<String>,
    ) -> Result<(), ExecutorError> {
        let rpc_peer =
            JsonRpcPeer::spawn(child_stdin, child_stdout, client.clone(), exit_signal_tx);
        client.connect(rpc_peer);
        client.initialize().await?;
        let auth_status = client.get_auth_status().await?;
        if auth_status.requires_openai_auth.unwrap_or(true) && auth_status.auth_method.is_none() {
            return Err(ExecutorError::AuthRequired(
                "Codex authentication required".to_string(),
            ));
        }
        match resume_session {
            None => {
                let response = client.start_thread(thread_params).await?;
                let conversation_id =
                    ThreadId::try_from(response.thread.id.clone()).map_err(|err| {
                        ExecutorError::Io(io::Error::other(format!(
                            "invalid thread id from thread/start: {err}"
                        )))
                    })?;
                client.register_session(&conversation_id).await?;
                client
                    .start_turn(
                        conversation_id,
                        combined_prompt,
                        build_turn_collaboration_mode(
                            collaboration_mode.as_ref(),
                            model.clone().unwrap_or(response.model.clone()),
                            model_reasoning_effort
                                .or_else(|| response.reasoning_effort.map(local_reasoning_effort)),
                            developer_instructions.clone(),
                        ),
                    )
                    .await?;
            }
            Some(session_id) => {
                let response = client
                    .fork_thread(
                        ThreadId::try_from(session_id.clone()).map_err(|err| {
                            ExecutorError::FollowUpNotSupported(format!(
                                "invalid session/thread id {session_id}: {err}"
                            ))
                        })?,
                        thread_params,
                    )
                    .await?;
                tracing::debug!(
                    "forked session using thread id {}, response {:?}",
                    session_id,
                    response
                );
                let conversation_id =
                    ThreadId::try_from(response.thread.id.clone()).map_err(|err| {
                        ExecutorError::Io(io::Error::other(format!(
                            "invalid thread id from thread/fork: {err}"
                        )))
                    })?;
                client.register_session(&conversation_id).await?;
                client
                    .start_turn(
                        conversation_id,
                        combined_prompt,
                        build_turn_collaboration_mode(
                            collaboration_mode.as_ref(),
                            model.clone().unwrap_or(response.model.clone()),
                            model_reasoning_effort
                                .or_else(|| response.reasoning_effort.map(local_reasoning_effort)),
                            developer_instructions.clone(),
                        ),
                    )
                    .await?;
            }
        }
        Ok(())
    }

    async fn launch_codex_review(
        client: Arc<AppServerClient>,
        thread_params: ThreadStartParams,
        resume_session: Option<String>,
        target: ReviewTarget,
        append_to_original_thread: bool,
        child_stdout: tokio::process::ChildStdout,
        child_stdin: tokio::process::ChildStdin,
        exit_signal_tx: ExitSignalSender,
    ) -> Result<(), ExecutorError> {
        let rpc_peer =
            JsonRpcPeer::spawn(child_stdin, child_stdout, client.clone(), exit_signal_tx);
        client.connect(rpc_peer);
        client.initialize().await?;
        let auth_status = client.get_auth_status().await?;
        if auth_status.requires_openai_auth.unwrap_or(true) && auth_status.auth_method.is_none() {
            return Err(ExecutorError::AuthRequired(
                "Codex authentication required".to_string(),
            ));
        }

        let conversation_id = match resume_session {
            None => {
                let response = client.start_thread(thread_params).await?;
                ThreadId::try_from(response.thread.id.clone()).map_err(|err| {
                    ExecutorError::Io(io::Error::other(format!(
                        "invalid thread id from thread/start: {err}"
                    )))
                })?
            }
            Some(session_id) => {
                let response = client
                    .fork_thread(
                        ThreadId::try_from(session_id.clone()).map_err(|err| {
                            ExecutorError::FollowUpNotSupported(format!(
                                "invalid session/thread id {session_id}: {err}"
                            ))
                        })?,
                        thread_params,
                    )
                    .await?;
                ThreadId::try_from(response.thread.id.clone()).map_err(|err| {
                    ExecutorError::Io(io::Error::other(format!(
                        "invalid thread id from thread/fork: {err}"
                    )))
                })?
            }
        };

        client.register_session(&conversation_id).await?;
        client
            .start_review(conversation_id, target, append_to_original_thread)
            .await?;
        Ok(())
    }

    pub async fn discover_runtime_capabilities(
        &self,
        current_dir: &Path,
    ) -> Result<CodexRuntimeCapabilities, ExecutorError> {
        let command_parts = self.build_command_builder().build_initial()?;
        let (program_path, args) = command_parts.into_resolved().await?;

        let mut process = Command::new(program_path);
        process
            .kill_on_drop(true)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .current_dir(current_dir)
            .args(&args)
            .env("NODE_NO_WARNINGS", "1")
            .env("NO_COLOR", "1")
            .env("RUST_LOG", "error");

        process.env_remove("npm_config__jsr_registry");
        process.env_remove("npm_config_verify_deps_before_run");
        process.env_remove("npm_config_globalconfig");

        let mut child = process.group_spawn()?;
        let child_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("Codex app server missing stdout"))
        })?;
        let child_stdin = child.inner().stdin.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("Codex app server missing stdin"))
        })?;

        let (exit_signal_tx, _exit_signal_rx) = tokio::sync::oneshot::channel();
        let client = AppServerClient::new(LogWriter::new(tokio::io::sink()), None, false);
        let rpc_peer = JsonRpcPeer::spawn(
            child_stdin,
            child_stdout,
            client.clone(),
            ExitSignalSender::new(exit_signal_tx),
        );
        client.connect(rpc_peer);

        let result = async {
            client.initialize().await?;
            let auth_status = client.get_auth_status().await?;
            if auth_status.requires_openai_auth.unwrap_or(true) && auth_status.auth_method.is_none()
            {
                return Err(ExecutorError::AuthRequired(
                    "Codex authentication required".to_string(),
                ));
            }

            let model_response = client.list_models().await?;
            let collaboration_response = client.list_collaboration_modes().await.ok();

            Ok(CodexRuntimeCapabilities {
                models: model_response
                    .data
                    .into_iter()
                    .map(|model| CodexRuntimeModel {
                        id: model.id,
                        model: model.model,
                        display_name: model.display_name,
                        description: model.description,
                        supported_reasoning_efforts: model
                            .supported_reasoning_efforts
                            .into_iter()
                            .map(|effort| effort.reasoning_effort.to_string())
                            .collect(),
                        default_reasoning_effort: Some(model.default_reasoning_effort.to_string()),
                        is_default: model.is_default,
                    })
                    .collect(),
                collaboration_modes: collaboration_response
                    .map(|response| {
                        response
                            .data
                            .into_iter()
                            .map(map_runtime_collaboration_mode)
                            .collect()
                    })
                    .unwrap_or_default(),
                supports_interrupt: true,
                supports_review: true,
                supports_live_follow_up_messages: true,
            })
        }
        .await;

        let _ = child.kill().await;
        result
    }
}

impl Codex {
    async fn spawn_review_internal(
        &self,
        current_dir: &Path,
        command_parts: CommandParts,
        request: &CodingAgentReviewRequest,
        context: SpawnContext,
    ) -> Result<SpawnedChild, ExecutorError> {
        let (program_path, args) = command_parts.into_resolved().await?;
        let mut process = Command::new(program_path);
        process
            .kill_on_drop(true)
            .current_dir(current_dir)
            .args(&args)
            .env("NODE_NO_WARNINGS", "1")
            .env("NO_COLOR", "1")
            .env("RUST_LOG", "error")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .env("VK_TASK_ATTEMPT_ID", context.task_attempt_id.to_string())
            .env("VK_TASK_ID", context.task_id.to_string())
            .env(
                "VK_EXECUTION_PROCESS_ID",
                context.execution_process_id.to_string(),
            );

        process.env_remove("npm_config__jsr_registry");
        process.env_remove("npm_config_verify_deps_before_run");
        process.env_remove("npm_config_globalconfig");

        let mut child = process.group_spawn()?;
        let child_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("Codex app server missing stdout"))
        })?;
        let child_stdin = child.inner().stdin.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("Codex app server missing stdin"))
        })?;
        let new_stdout = create_stdout_pipe_writer(&mut child)?;
        let (exit_signal_tx, exit_signal_rx) = tokio::sync::oneshot::channel();
        let client = AppServerClient::new(
            LogWriter::new(new_stdout),
            self.approvals.clone(),
            matches!(
                (&self.sandbox, &self.ask_for_approval),
                (Some(SandboxMode::DangerFullAccess), None)
            ),
        );

        let thread_params = self.build_thread_start_params(current_dir);
        let resume_session = request.session_id.clone();
        let target = map_review_target(&request.target);
        let append_to_original_thread = request.append_to_original_thread;
        let protocol_peer = Arc::new(ProtocolPeer::Codex(client.clone()));
        tokio::spawn(async move {
            let exit_signal_tx = ExitSignalSender::new(exit_signal_tx);
            if let Err(err) = Self::launch_codex_review(
                client.clone(),
                thread_params,
                resume_session,
                target,
                append_to_original_thread,
                child_stdout,
                child_stdin,
                exit_signal_tx.clone(),
            )
            .await
            {
                tracing::error!("Codex review spawn error: {}", err);
                client
                    .log_writer()
                    .log_raw(&Error::launch_error(err.to_string()).raw())
                    .await
                    .ok();
                exit_signal_tx
                    .send_exit_signal(ExecutorExitResult::failure(
                        crate::executors::SessionCompletionReason::Error {
                            message: err.to_string(),
                        },
                    ))
                    .await;
            }
        });

        Ok(SpawnedChild {
            child,
            exit_signal: Some(exit_signal_rx),
            protocol_peer: Some(protocol_peer),
        })
    }
}

fn build_turn_collaboration_mode(
    mode: Option<&CodexCollaborationMode>,
    model: String,
    reasoning_effort: Option<ReasoningEffort>,
    developer_instructions: Option<String>,
) -> Option<ProtocolCollaborationMode> {
    let mode = match mode {
        Some(mode) => mode,
        None => return None,
    };

    Some(ProtocolCollaborationMode {
        mode: match mode {
            CodexCollaborationMode::Plan => ModeKind::Plan,
            CodexCollaborationMode::Code => ModeKind::Code,
            CodexCollaborationMode::PairProgramming => ModeKind::PairProgramming,
            CodexCollaborationMode::Execute => ModeKind::Execute,
            CodexCollaborationMode::Custom => ModeKind::Custom,
        },
        settings: ProtocolCollaborationSettings {
            model,
            reasoning_effort: reasoning_effort.map(protocol_reasoning_effort),
            developer_instructions,
        },
    })
}

fn protocol_reasoning_effort(effort: ReasoningEffort) -> ProtocolReasoningEffort {
    match effort {
        ReasoningEffort::Low => ProtocolReasoningEffort::Low,
        ReasoningEffort::Medium => ProtocolReasoningEffort::Medium,
        ReasoningEffort::High => ProtocolReasoningEffort::High,
        ReasoningEffort::Xhigh => ProtocolReasoningEffort::XHigh,
    }
}

fn local_reasoning_effort(effort: ProtocolReasoningEffort) -> ReasoningEffort {
    match effort {
        ProtocolReasoningEffort::None => ReasoningEffort::Low,
        ProtocolReasoningEffort::Minimal => ReasoningEffort::Low,
        ProtocolReasoningEffort::Low => ReasoningEffort::Low,
        ProtocolReasoningEffort::Medium => ReasoningEffort::Medium,
        ProtocolReasoningEffort::High => ReasoningEffort::High,
        ProtocolReasoningEffort::XHigh => ReasoningEffort::Xhigh,
    }
}

fn map_runtime_collaboration_mode(mask: CollaborationModeMask) -> CodexRuntimeCollaborationMode {
    CodexRuntimeCollaborationMode {
        value: mask.mode.map(|mode| match mode {
            ModeKind::Plan => "plan".to_string(),
            ModeKind::Code => "code".to_string(),
            ModeKind::PairProgramming => "pair-programming".to_string(),
            ModeKind::Execute => "execute".to_string(),
            ModeKind::Custom => "custom".to_string(),
        }),
        label: mask.name,
        model: mask.model,
        reasoning_effort: mask
            .reasoning_effort
            .and_then(|effort| effort.map(|value| value.to_string())),
    }
}

fn map_review_target(
    target: &crate::actions::coding_agent_review::CodingAgentReviewTarget,
) -> ReviewTarget {
    match target {
        crate::actions::coding_agent_review::CodingAgentReviewTarget::UncommittedChanges => {
            ReviewTarget::UncommittedChanges
        }
        crate::actions::coding_agent_review::CodingAgentReviewTarget::BaseBranch { branch } => {
            ReviewTarget::BaseBranch {
                branch: branch.clone(),
            }
        }
        crate::actions::coding_agent_review::CodingAgentReviewTarget::Commit { sha, title } => {
            ReviewTarget::Commit {
                sha: sha.clone(),
                title: title.clone(),
            }
        }
        crate::actions::coding_agent_review::CodingAgentReviewTarget::Custom { instructions } => {
            ReviewTarget::Custom {
                instructions: instructions.clone(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_turn_collaboration_mode_uses_selected_mode() {
        let mode = build_turn_collaboration_mode(
            Some(&CodexCollaborationMode::Plan),
            "gpt-5.4".to_string(),
            Some(ReasoningEffort::High),
            Some("stay in planning mode".to_string()),
        )
        .expect("collaboration mode should be built");

        assert_eq!(mode.mode, ModeKind::Plan);
        assert_eq!(mode.settings.model, "gpt-5.4");
        assert_eq!(
            mode.settings.reasoning_effort,
            Some(ProtocolReasoningEffort::High)
        );
        assert_eq!(
            mode.settings.developer_instructions.as_deref(),
            Some("stay in planning mode")
        );
    }

    #[test]
    fn build_thread_start_params_preserves_v2_config_overrides() {
        let codex = Codex {
            append_prompt: AppendPrompt(None),
            no_context: None,
            sandbox: None,
            ask_for_approval: None,
            oss: None,
            model: Some("gpt-5.4".to_string()),
            model_reasoning_effort: Some(ReasoningEffort::High),
            model_reasoning_summary: None,
            model_reasoning_summary_format: None,
            profile: Some("work".to_string()),
            base_instructions: None,
            include_apply_patch_tool: Some(true),
            model_provider: None,
            compact_prompt: Some("compact".to_string()),
            developer_instructions: None,
            collaboration_mode: Some(CodexCollaborationMode::Code),
            cmd: CmdOverrides::default(),
            approvals: None,
        };

        let params = codex.build_thread_start_params(Path::new("/tmp/worktree"));
        let overrides = params.config.expect("config overrides should exist");

        assert_eq!(
            overrides.get("profile"),
            Some(&Value::String("work".to_string()))
        );
        assert_eq!(
            overrides.get("compact_prompt"),
            Some(&Value::String("compact".to_string()))
        );
        assert_eq!(
            overrides.get("include_apply_patch_tool"),
            Some(&Value::Bool(true))
        );
    }

    #[test]
    fn map_review_target_preserves_base_branch_target() {
        let target = map_review_target(
            &crate::actions::coding_agent_review::CodingAgentReviewTarget::BaseBranch {
                branch: "main".to_string(),
            },
        );

        assert!(matches!(
            target,
            ReviewTarget::BaseBranch { ref branch } if branch == "main"
        ));
    }
}
