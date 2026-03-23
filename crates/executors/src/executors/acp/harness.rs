use std::{
    path::{Path, PathBuf},
    process::Stdio,
    rc::Rc,
    sync::Arc,
};

use agent_client_protocol as proto;
use agent_client_protocol::Agent as _;
use command_group::AsyncGroupChild;
use futures::StreamExt;
use tokio::{io::AsyncWriteExt, process::Command, sync::mpsc};
use tokio_util::{
    compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt},
    io::ReaderStream,
    sync::CancellationToken,
};
use tracing::error;
use workspace_utils::{
    approvals::ApprovalStatus, command_ext::GroupSpawnNoWindowExt, stream_lines::LinesStreamExt,
};

use super::AcpClient;
use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandParts},
    env::ExecutionEnv,
    executors::{ExecutorError, ExecutorExitResult, SpawnedChild, acp::AcpEvent},
};

/// Generate a short unique operation ID for correlating log lines.
pub fn gen_op_id() -> String {
    use std::sync::atomic::{AtomicU32, Ordering};
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    format!("{:04x}", COUNTER.fetch_add(1, Ordering::Relaxed))
}

/// Run an async closure in a LocalSet (required by ACP SDK's `!Send` futures).
/// Uses `spawn_blocking` + current-thread runtime. Propagates the given
/// tracing span into the blocking thread. Can be replaced with a direct
/// LocalSet approach if the SDK ever supports Send futures.
pub async fn run_in_acp_local_set<F, Fut, T>(span: tracing::Span, f: F) -> Option<T>
where
    F: FnOnce() -> Fut + Send + 'static,
    Fut: std::future::Future<Output = Option<T>> + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(move || {
        let _guard = span.enter();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .ok()?;
        rt.block_on(async {
            let local = tokio::task::LocalSet::new();
            local.run_until(f()).await
        })
    })
    .await
    .ok()?
}

/// Whether to create a new session or follow-up on an existing one.
pub enum SessionAction {
    /// Create a brand-new session.
    New,
    /// Follow-up: try `session/fork` first, then `session/load`, then error.
    FollowUp { session_id: String },
}

/// Reusable harness for ACP-based connections.
pub struct AcpAgentHarness {
    model: Option<String>,
    mode: Option<String>,
    reasoning: Option<String>,
    mcp_servers: Vec<proto::McpServer>,
}

impl Default for AcpAgentHarness {
    fn default() -> Self {
        Self::new()
    }
}

impl AcpAgentHarness {
    pub fn new() -> Self {
        Self {
            model: None,
            mode: None,
            reasoning: None,
            mcp_servers: Vec::new(),
        }
    }

    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }

    pub fn with_mode(mut self, mode: impl Into<String>) -> Self {
        self.mode = Some(mode.into());
        self
    }

    pub fn with_reasoning(mut self, reasoning: impl Into<String>) -> Self {
        self.reasoning = Some(reasoning.into());
        self
    }

    pub fn with_mcp_servers(mut self, servers: Vec<proto::McpServer>) -> Self {
        self.mcp_servers = servers;
        self
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn spawn_with_command(
        &self,
        current_dir: &Path,
        prompt: String,
        command_parts: CommandParts,
        env: &ExecutionEnv,
        cmd_overrides: &CmdOverrides,
        approvals: Option<Arc<dyn ExecutorApprovalService>>,
        auto_approve: bool,
    ) -> Result<SpawnedChild, ExecutorError> {
        self.spawn_internal(
            current_dir,
            prompt,
            command_parts,
            env,
            cmd_overrides,
            approvals,
            auto_approve,
            SessionAction::New,
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn spawn_follow_up_with_command(
        &self,
        current_dir: &Path,
        prompt: String,
        session_id: &str,
        command_parts: CommandParts,
        env: &ExecutionEnv,
        cmd_overrides: &CmdOverrides,
        approvals: Option<Arc<dyn ExecutorApprovalService>>,
        auto_approve: bool,
    ) -> Result<SpawnedChild, ExecutorError> {
        self.spawn_internal(
            current_dir,
            prompt,
            command_parts,
            env,
            cmd_overrides,
            approvals,
            auto_approve,
            SessionAction::FollowUp {
                session_id: session_id.to_string(),
            },
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    async fn spawn_internal(
        &self,
        current_dir: &Path,
        prompt: String,
        command_parts: CommandParts,
        env: &ExecutionEnv,
        cmd_overrides: &CmdOverrides,
        approvals: Option<Arc<dyn ExecutorApprovalService>>,
        auto_approve: bool,
        session_action: SessionAction,
    ) -> Result<SpawnedChild, ExecutorError> {
        let (program_path, args) = command_parts.into_resolved().await?;
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

        env.clone()
            .with_profile(cmd_overrides)
            .apply_to_command(&mut command);

        tracing::info!(program = ?command.as_std().get_program(), "spawned command");

        let mut child = command.group_spawn_no_window()?;

        let (exit_tx, exit_rx) = tokio::sync::oneshot::channel::<ExecutorExitResult>();
        let cancel = CancellationToken::new();

        Self::bootstrap_acp_connection(
            &mut child,
            current_dir.to_path_buf(),
            session_action,
            prompt,
            Some(exit_tx),
            self.model.clone(),
            self.mode.clone(),
            self.reasoning.clone(),
            self.mcp_servers.clone(),
            approvals,
            auto_approve,
            cancel.clone(),
        )
        .await?;

        Ok(SpawnedChild {
            child,
            exit_signal: Some(exit_rx),
            cancel: Some(cancel),
        })
    }

    #[allow(clippy::too_many_arguments)]
    async fn bootstrap_acp_connection(
        child: &mut AsyncGroupChild,
        cwd: PathBuf,
        session_action: SessionAction,
        prompt: String,
        exit_signal: Option<tokio::sync::oneshot::Sender<ExecutorExitResult>>,
        model: Option<String>,
        mode: Option<String>,
        reasoning: Option<String>,
        mcp_servers: Vec<proto::McpServer>,
        approvals: Option<Arc<dyn ExecutorApprovalService>>,
        auto_approve: bool,
        cancel: CancellationToken,
    ) -> Result<(), ExecutorError> {
        // Take child's stdio for ACP wiring
        let orig_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Child process has no stdout",
            ))
        })?;
        let orig_stdin = child.inner().stdin.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Child process has no stdin",
            ))
        })?;

        // Create a fresh stdout pipe for logs
        let writer = crate::stdout_dup::create_stdout_pipe_writer(child)?;
        let shared_writer = Arc::new(tokio::sync::Mutex::new(writer));
        let (log_tx, mut log_rx) = mpsc::unbounded_channel::<String>();

        // Spawn log -> stdout writer task
        tokio::spawn(async move {
            while let Some(line) = log_rx.recv().await {
                let mut data = line.into_bytes();
                data.push(b'\n');
                let mut w = shared_writer.lock().await;
                let _ = w.write_all(&data).await;
            }
        });

        // ACP client STDIO
        let (mut to_acp_writer, acp_incoming_reader) = tokio::io::duplex(64 * 1024);
        let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

        // Process stdout -> ACP
        let stdout_shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            let mut stdout_stream = ReaderStream::new(orig_stdout);
            while let Some(res) = stdout_stream.next().await {
                if *stdout_shutdown_rx.borrow() {
                    break;
                }
                match res {
                    Ok(data) => {
                        let _ = to_acp_writer.write_all(&data).await;
                    }
                    Err(_) => break,
                }
            }
        });

        // ACP crate expects futures::AsyncRead + AsyncWrite, use tokio compat
        let (acp_out_writer, acp_out_reader) = tokio::io::duplex(64 * 1024);
        let outgoing = acp_out_writer.compat_write();
        let incoming = acp_incoming_reader.compat();

        // Process ACP -> stdin
        let stdin_shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            let mut child_stdin = orig_stdin;
            let mut lines = ReaderStream::new(acp_out_reader)
                .map(|res| res.map(|bytes| String::from_utf8_lossy(&bytes).into_owned()))
                .lines();
            while let Some(result) = lines.next().await {
                if *stdin_shutdown_rx.borrow() {
                    break;
                }
                match result {
                    Ok(line) => {
                        const LINE_ENDING: &str = if cfg!(windows) { "\r\n" } else { "\n" };
                        let line = line + LINE_ENDING;
                        if let Err(err) = child_stdin.write_all(line.as_bytes()).await {
                            tracing::debug!("Failed to write to child stdin {err}");
                            break;
                        }
                        let _ = child_stdin.flush().await;
                    }
                    Err(err) => {
                        tracing::debug!("ACP stdin line error {err}");
                        break;
                    }
                }
            }
        });

        let mut exit_signal_tx = exit_signal;

        // Run ACP client in a LocalSet
        tokio::task::spawn_blocking(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("build runtime");

            rt.block_on(async move {
                let local = tokio::task::LocalSet::new();
                local
                    .run_until(async move {
                        let (event_tx, mut event_rx) =
                            mpsc::unbounded_channel::<crate::executors::acp::AcpEvent>();

                        // Create ACP client with approvals support
                        let client = AcpClient::new(
                            event_tx.clone(),
                            approvals.clone(),
                            cancel.clone(),
                            auto_approve,
                        );
                        let client_feedback_handle = client.clone();
                        let client_event_control = client.clone();

                        client.record_user_prompt_event(&prompt);

                        // Set up connection
                        let (conn, io_fut) =
                            proto::ClientSideConnection::new(client, outgoing, incoming, |fut| {
                                tokio::task::spawn_local(fut);
                            });
                        let conn = Rc::new(conn);

                        // Drive I/O
                        let io_handle = tokio::task::spawn_local(async move {
                            let _ = io_fut.await;
                        });

                        // Initialize and probe capabilities
                        let init_resp = match conn
                            .initialize(proto::InitializeRequest::new(proto::ProtocolVersion::V1))
                            .await
                        {
                            Ok(resp) => resp,
                            Err(e) => {
                                error!("ACP initialize failed: {e}");
                                let _ = log_tx.send(
                                    AcpEvent::Error(format!("initialize failed: {e}")).to_string(),
                                );
                                return;
                            }
                        };

                        let caps = &init_resp.agent_capabilities;
                        let supports_fork = caps.session_capabilities.fork.is_some();
                        let supports_resume = caps.session_capabilities.resume.is_some();
                        let supports_load = caps.load_session;

                        let _ = log_tx.send(
                            AcpEvent::Capabilities(caps.clone()).to_string(),
                        );

                        // Don't call authenticate() — ACP servers handle auth internally
                        // during session/new. Calling it can trigger interactive OAuth that hangs.
                        let (acp_session_id, session_default_model, session_config_options): (
                            String,
                            Option<String>,
                            Option<Vec<proto::SessionConfigOption>>,
                        ) = match session_action {
                            SessionAction::New => {
                                match conn
                                    .new_session(
                                        proto::NewSessionRequest::new(cwd.clone())
                                            .mcp_servers(mcp_servers.clone()),
                                    )
                                    .await
                                {
                                    Ok(resp) => {
                                        let default_model = resp
                                            .models
                                            .as_ref()
                                            .map(|m| m.current_model_id.0.to_string());
                                        let cfg_opts = resp.config_options.clone();
                                        let _ = log_tx.send(
                                            AcpEvent::SessionMetadata {
                                                modes: resp.modes,
                                                models: resp.models,
                                                config_options: resp.config_options,
                                            }
                                            .to_string(),
                                        );
                                        (resp.session_id.0.to_string(), default_model, cfg_opts)
                                        }
                                        Err(e) => {
                                            let msg = format!("Failed to create session: {e}");
                                            error!("{msg}");
                                            let hint = if !init_resp.auth_methods.is_empty() {
                                                ". The server may require authentication — check login status."
                                            } else {
                                                ""
                                            };
                                            let _ = log_tx.send(
                                                AcpEvent::Error(format!("{msg}{hint}")).to_string(),
                                            );
                                            return;
                                        }
                                    }
                                }
                                SessionAction::FollowUp { session_id } => {
                                    if supports_fork {
                                        match conn
                                            .fork_session(
                                                proto::ForkSessionRequest::new(
                                                    proto::SessionId::new(session_id.clone()),
                                                    cwd.clone(),
                                                )
                                                .mcp_servers(mcp_servers.clone()),
                                            )
                                            .await
                                        {
                                            Ok(resp) => {
                                                let default_model = resp
                                                    .models
                                                    .as_ref()
                                                    .map(|m| m.current_model_id.0.to_string());
                                                let cfg_opts = resp.config_options.clone();
                                                (resp.session_id.0.to_string(), default_model, cfg_opts)
                                            }
                                            Err(e) => {
                                                error!("session/fork failed: {e}");
                                                let _ = log_tx.send(
                                                    AcpEvent::Error(format!(
                                                        "session/fork failed: {e}"
                                                    ))
                                                    .to_string(),
                                                );
                                                return;
                                            }
                                        }
                                    } else if supports_resume || supports_load {
                                        // Try resume first (no history replay), fall back to load
                                        let resume_ok = if supports_resume {
                                            match conn
                                                .resume_session(
                                                    proto::ResumeSessionRequest::new(
                                                        proto::SessionId::new(session_id.clone()),
                                                        cwd.clone(),
                                                    )
                                                    .mcp_servers(mcp_servers.clone()),
                                                )
                                                .await
                                            {
                                                Ok(resp) => {
                                                    let default_model = resp
                                                        .models
                                                        .as_ref()
                                                        .map(|m| m.current_model_id.0.to_string());
                                                    let cfg_opts = resp.config_options.clone();
                                                    Some((session_id.clone(), default_model, cfg_opts))
                                                }
                                                Err(e) => {
                                                    tracing::warn!("session/resume failed, falling back to session/load: {e}");
                                                    None
                                                }
                                            }
                                        } else {
                                            None
                                        };
                                        if let Some(result) = resume_ok {
                                            result
                                        } else if supports_load {
                                            client_event_control.set_suppress_events(true);
                                            let load_result = conn
                                                .load_session(
                                                    proto::LoadSessionRequest::new(
                                                        proto::SessionId::new(
                                                            session_id.clone(),
                                                        ),
                                                        cwd.clone(),
                                                    )
                                                    .mcp_servers(mcp_servers.clone()),
                                                )
                                                .await;
                                            match load_result {
                                                Ok(resp) => {
                                                    let default_model = resp
                                                        .models
                                                        .as_ref()
                                                        .map(|m| {
                                                            m.current_model_id.0.to_string()
                                                        });
                                                    let cfg_opts = resp.config_options.clone();
                                                    (session_id, default_model, cfg_opts)
                                                }
                                                Err(e) => {
                                                    error!("session/load failed: {e}");
                                                    let _ = log_tx.send(
                                                        AcpEvent::Error(format!(
                                                            "session/load failed: {e}"
                                                        ))
                                                        .to_string(),
                                                    );
                                                    return;
                                                }
                                            }
                                        } else {
                                            // resume failed, load not supported
                                            let _ = log_tx.send(
                                                AcpEvent::Error(
                                                    "session/resume failed and session/load \
                                                     is not supported"
                                                        .to_string(),
                                                )
                                                .to_string(),
                                            );
                                            return;
                                        }
                                    } else {
                                        let _ = log_tx.send(
                                            AcpEvent::Error(
                                                "Executor does not support session followups"
                                                    .to_string(),
                                            )
                                            .to_string(),
                                        );
                                        return;
                                    }
                                }
                            };

                        // Emit session ID (real ACP session ID)
                        let _ =
                            log_tx.send(AcpEvent::SessionStart(acp_session_id.clone()).to_string());

                        // Set model if configured, then emit ModelInfo
                        let model_set_result = if let Some(model) = model.clone() {
                            tracing::debug!(?model, "setting session model");
                            match conn
                                .set_session_model(proto::SetSessionModelRequest::new(
                                    proto::SessionId::new(acp_session_id.clone()),
                                    model.clone(),
                                ))
                                .await
                            {
                                Ok(_) => super::ModelSetResult::Success { model },
                                Err(e) => {
                                    error!("Failed to set session model: {e}");
                                    super::ModelSetResult::Failed {
                                        model,
                                        error: e.to_string(),
                                    }
                                }
                            }
                        } else {
                            super::ModelSetResult::NotAttempted
                        };
                        // Set reasoning/thought level if configured
                        let reasoning_set_result =
                            if let Some(reasoning_value) = reasoning.clone() {
                                if let Some(config_id) =
                                    find_reasoning_config_id(session_config_options.as_deref())
                                {
                                    match conn
                                        .set_session_config_option(
                                            proto::SetSessionConfigOptionRequest::new(
                                                proto::SessionId::new(acp_session_id.clone()),
                                                config_id.clone(),
                                                reasoning_value.as_str(),
                                            ),
                                        )
                                        .await
                                    {
                                        Ok(_) => super::ModelSetResult::Success {
                                            model: reasoning_value,
                                        },
                                        Err(e) => {
                                            error!(
                                                "Failed to set reasoning config {config_id}: {e}"
                                            );
                                            super::ModelSetResult::Failed {
                                                model: reasoning_value,
                                                error: e.to_string(),
                                            }
                                        }
                                    }
                                } else {
                                    // Server doesn't expose a reasoning config option
                                    super::ModelSetResult::NotAttempted
                                }
                            } else {
                                super::ModelSetResult::NotAttempted
                            };

                        let _ = log_tx.send(
                            AcpEvent::ModelInfo {
                                session_default: session_default_model,
                                model_set_result,
                                reasoning_set_result,
                            }
                            .to_string(),
                        );

                        // Replay of session history should have finished by now. Resume event processing.
                        client_event_control.set_suppress_events(false);

                        // Set mode if configured
                        if let Some(mode) = mode.clone() {
                            match conn
                                .set_session_mode(proto::SetSessionModeRequest::new(
                                    proto::SessionId::new(acp_session_id.clone()),
                                    mode,
                                ))
                                .await
                            {
                                Ok(_) => {}
                                Err(e) => error!("Failed to set session mode: {e}"),
                            }
                        }

                        // Forward events to stdout (no local session persistence)
                        let app_tx_clone = log_tx.clone();
                        let conn_for_cancel = conn.clone();
                        let acp_session_id_for_cancel = acp_session_id.clone();
                        tokio::task::spawn_local(async move {
                            while let Some(event) = event_rx.recv().await {
                                if let AcpEvent::ApprovalResponse(resp) = &event
                                    && let ApprovalStatus::Denied {
                                        reason: Some(reason),
                                    } = &resp.status
                                    && !reason.trim().is_empty()
                                {
                                    let _ = conn_for_cancel
                                        .cancel(proto::CancelNotification::new(
                                            proto::SessionId::new(
                                                acp_session_id_for_cancel.clone(),
                                            ),
                                        ))
                                        .await;
                                }

                                let line = event.to_string();
                                let _ = app_tx_clone.send(line);
                            }
                        });

                        // Build prompt request
                        let initial_req = proto::PromptRequest::new(
                            proto::SessionId::new(acp_session_id.clone()),
                            vec![proto::ContentBlock::Text(proto::TextContent::new(prompt))],
                        );

                        let mut current_req = Some(initial_req);

                        while let Some(req) = current_req.take() {
                            if cancel.is_cancelled() {
                                tracing::debug!("ACP executor cancelled, stopping prompt loop");
                                break;
                            }

                            tracing::trace!(?req, "sending ACP prompt request");
                            let prompt_result = tokio::select! {
                                _ = cancel.cancelled() => {
                                    tracing::debug!("ACP executor cancelled during prompt");
                                    break;
                                }
                                result = conn.prompt(req) => result,
                            };

                            match prompt_result {
                                Ok(resp) => {
                                    let stop_reason = serde_json::to_string(&resp.stop_reason)
                                        .unwrap_or_default();
                                    let _ = log_tx.send(AcpEvent::Done(stop_reason).to_string());
                                }
                                Err(e) => {
                                    tracing::debug!("error {} {e} {:?}", e.code, e.data);
                                    if e.code == agent_client_protocol::ErrorCode::InternalError
                                        && e.data
                                            .as_ref()
                                            .is_some_and(|d| d == "server shut down unexpectedly")
                                    {
                                        tracing::debug!("ACP server killed");
                                    } else {
                                        let _ = log_tx
                                            .send(AcpEvent::Error(format!("{e}")).to_string());
                                    }
                                }
                            }

                            // Flush any pending user feedback after finish
                            let feedback = client_feedback_handle
                                .drain_feedback()
                                .await
                                .join("\n")
                                .trim()
                                .to_string();
                            if !feedback.is_empty() {
                                tracing::trace!(?feedback, "sending ACP follow-up feedback");
                                let session_id = proto::SessionId::new(acp_session_id.clone());
                                let feedback_req = proto::PromptRequest::new(
                                    session_id.clone(),
                                    vec![proto::ContentBlock::Text(proto::TextContent::new(
                                        feedback,
                                    ))],
                                );
                                current_req = Some(feedback_req);
                            }
                        }

                        // Notify container of completion
                        if let Some(tx) = exit_signal_tx.take() {
                            let _ = tx.send(ExecutorExitResult::Success);
                        }

                        // Cancel session
                        let _ = conn
                            .cancel(proto::CancelNotification::new(proto::SessionId::new(
                                acp_session_id,
                            )))
                            .await;

                        // Cleanup
                        drop(conn);
                        let _ = shutdown_tx.send(true);
                        let _ = io_handle.await;
                        drop(log_tx);
                    })
                    .await;
            });
        });

        Ok(())
    }
}

/// Probe each available model to discover per-model reasoning options.
/// Switches models via set_session_config_option (preferred) or set_session_model,
/// reads back the updated config options, and extracts reasoning per model.
async fn probe_per_model_reasoning(
    conn: &proto::ClientSideConnection,
    session_id: &proto::SessionId,
    models: Option<&proto::SessionModelState>,
    initial_config: Option<&[proto::SessionConfigOption]>,
) -> super::discovery::PerModelReasoning {
    use super::discovery::PerModelReasoning;

    let mut result: PerModelReasoning = std::collections::HashMap::new();

    let Some(model_state) = models else {
        tracing::debug!(reason = "no_models", "acp_probe.reasoning skipped");
        return result;
    };

    // If no reasoning config option exists in initial config, skip probing
    if find_reasoning_config_id(initial_config).is_none() {
        tracing::debug!(
            reason = "no_thought_level_config",
            "acp_probe.reasoning skipped"
        );
        return result;
    }

    // Find model config option ID (for set_session_config_option)
    let model_config_id: Option<proto::SessionConfigId> = initial_config.and_then(|opts| {
        opts.iter().find_map(|o| {
            if matches!(o.category, Some(proto::SessionConfigOptionCategory::Model)) {
                Some(o.id.clone())
            } else {
                None
            }
        })
    });

    for model in &model_state.available_models {
        let model_id = model.model_id.0.to_string();

        // Switch to this model and get updated config
        let updated_config = if let Some(cfg_id) = model_config_id.clone() {
            conn.set_session_config_option(proto::SetSessionConfigOptionRequest::new(
                session_id.clone(),
                cfg_id,
                model_id.as_str(),
            ))
            .await
            .ok()
            .map(|r| r.config_options)
        } else {
            // No model config option — try set_session_model (doesn't return config)
            if conn
                .set_session_model(proto::SetSessionModelRequest::new(
                    session_id.clone(),
                    model_id.clone(),
                ))
                .await
                .is_ok()
            {
                // set_session_model doesn't return config, keep initial
                initial_config.map(|c| c.to_vec())
            } else {
                None
            }
        };

        let reasoning = super::discovery::extract_reasoning_options(updated_config.as_deref());

        result.insert(model_id, reasoning);
    }

    result
}

/// Collect AvailableCommands from the broadcast stream after a set_session_mode
/// round-trip. The notification arrives asynchronously after the response, so we
/// drain buffered messages then wait up to 2s for late notifications.
async fn collect_commands_from_stream(
    conn: &proto::ClientSideConnection,
    stream: &mut proto::StreamReceiver,
    session_id: &proto::SessionId,
    modes: Option<&proto::SessionModeState>,
) -> Vec<proto::AvailableCommand> {
    let Some(modes) = modes else {
        return Vec::new();
    };
    let _ = conn
        .set_session_mode(proto::SetSessionModeRequest::new(
            session_id.clone(),
            modes.current_mode_id.clone(),
        ))
        .await;

    let mut past_response = false;
    loop {
        let timeout = if past_response {
            std::time::Duration::from_secs(2)
        } else {
            std::time::Duration::from_secs(30)
        };
        let msg = match tokio::time::timeout(timeout, stream.recv()).await {
            Ok(Ok(msg)) => msg,
            _ => break,
        };
        match (&msg.direction, &msg.message) {
            (
                proto::StreamMessageDirection::Incoming,
                proto::StreamMessageContent::Response { .. },
            ) => {
                past_response = true;
            }
            (_, proto::StreamMessageContent::Notification { method, params })
                if method.as_ref() == "session/update" =>
            {
                if let Some(ac) = params
                    .as_ref()
                    .and_then(|p| p.get("update"))
                    .and_then(|u| u.get("availableCommands"))
                    && let Ok(cmds) =
                        serde_json::from_value::<Vec<proto::AvailableCommand>>(ac.clone())
                {
                    return cmds;
                }
            }
            _ => {}
        }
    }
    Vec::new()
}

/// Find the config option ID for reasoning/thought-level settings.
/// Matches by ThoughtLevel category first, then falls back to name/id heuristics.
fn find_reasoning_config_id(
    config_options: Option<&[proto::SessionConfigOption]>,
) -> Option<String> {
    let options = config_options?;
    // Prefer category match
    for opt in options {
        if matches!(
            opt.category,
            Some(proto::SessionConfigOptionCategory::ThoughtLevel)
        ) {
            return Some(opt.id.0.to_string());
        }
    }
    // Fallback: name/id heuristic
    for opt in options {
        let id_lower = opt.id.0.to_lowercase();
        let name_lower = opt.name.to_lowercase();
        if id_lower.contains("reason") || name_lower.contains("reason") {
            return Some(opt.id.0.to_string());
        }
    }
    None
}

/// Result of probing an ACP server for session metadata.
pub struct ProbeResult {
    pub modes: Option<proto::SessionModeState>,
    pub models: Option<proto::SessionModelState>,
    pub config_options: Option<Vec<proto::SessionConfigOption>>,
    pub per_model_reasoning: super::discovery::PerModelReasoning,
    pub commands: Vec<proto::AvailableCommand>,
}

/// Lightweight ACP probe: spawn server, initialize, new_session, extract
/// modes/models/config_options, then kill. Used for pre-session discovery.
/// Also probes per-model reasoning options by switching models.
///
/// Commands arrive asynchronously via notification — the returned
/// `commands_rx` resolves when they arrive. The caller should await it
/// with a timeout or in a streaming context.
/// Caller should set up a tracing span with `server` and `op` fields
/// before calling — all substep logs inherit those fields automatically.
pub async fn probe_session_metadata(
    command_parts: CommandParts,
    cwd: &Path,
    cmd_overrides: &CmdOverrides,
) -> Option<ProbeResult> {
    let (program_path, args) = command_parts.into_resolved().await.ok()?;
    let mut command = Command::new(program_path);
    command
        .kill_on_drop(true)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .current_dir(cwd)
        .env("NPM_CONFIG_LOGLEVEL", "error")
        .env("NODE_NO_WARNINGS", "1")
        .args(&args);

    if let Some(ref env_vars) = cmd_overrides.env {
        for (k, v) in env_vars {
            command.env(k, v);
        }
    }

    let mut child = command.spawn().ok()?;
    let stdout = child.stdout.take()?;
    let stdin = child.stdin.take()?;

    let (mut to_acp, acp_in) = tokio::io::duplex(64 * 1024);
    let (acp_out_w, acp_out_r) = tokio::io::duplex(64 * 1024);

    tokio::spawn(async move {
        let mut stream = ReaderStream::new(stdout);
        while let Some(Ok(data)) = stream.next().await {
            if to_acp.write_all(&data).await.is_err() {
                break;
            }
        }
    });

    let mut child_stdin = stdin;
    tokio::spawn(async move {
        let mut lines = ReaderStream::new(acp_out_r)
            .map(|r| r.map(|b| String::from_utf8_lossy(&b).into_owned()))
            .lines();
        while let Some(Ok(line)) = lines.next().await {
            let line = line + "\n";
            if child_stdin.write_all(line.as_bytes()).await.is_err() {
                break;
            }
            let _ = child_stdin.flush().await;
        }
    });

    let cwd_owned = cwd.to_path_buf();
    let result = run_in_acp_local_set(tracing::Span::current(), move || {
        Box::pin(async move {
            let (event_tx, _) = mpsc::unbounded_channel::<AcpEvent>();
            let cancel = CancellationToken::new();
            let client = AcpClient::new(event_tx, None, cancel, true);

            let outgoing = acp_out_w.compat_write();
            let incoming = acp_in.compat();

            let (conn, io_fut) =
                proto::ClientSideConnection::new(client, outgoing, incoming, |fut| {
                    tokio::task::spawn_local(fut);
                });
            let conn = Rc::new(conn);

            let _io = tokio::task::spawn_local(async move {
                let _ = io_fut.await;
            });

            // Initialize
            conn.initialize(proto::InitializeRequest::new(proto::ProtocolVersion::V1))
                .await
                .ok()?;

            // Subscribe to broadcast stream before new_session — the broadcast
            // is filled inline by handle_io, so it captures all notifications.
            let mut stream = conn.subscribe();

            let resp = conn
                .new_session(proto::NewSessionRequest::new(cwd_owned.clone()))
                .await
                .ok()?;

            let session_id = resp.session_id.clone();
            let model_count = resp.models.as_ref().map_or(0, |m| m.available_models.len());
            let mode_count = resp.modes.as_ref().map_or(0, |m| m.available_modes.len());

            // Probe per-model reasoning
            let per_model = probe_per_model_reasoning(
                &conn,
                &session_id,
                resp.models.as_ref(),
                resp.config_options.as_deref(),
            )
            .await;
            let reasoning_models = per_model.values().filter(|v| !v.is_empty()).count();

            // Collect AvailableCommands from broadcast stream.
            // The notification arrives async after set_mode response, so we
            // drain buffered messages then wait up to 2s for late notifications.
            let commands =
                collect_commands_from_stream(&conn, &mut stream, &session_id, resp.modes.as_ref())
                    .await;

            let _ = conn
                .cancel(proto::CancelNotification::new(session_id))
                .await;

            tracing::debug!(
                models = model_count,
                modes = mode_count,
                reasoning_models = reasoning_models,
                commands = commands.len(),
                "acp_probe.done"
            );

            Some(ProbeResult {
                modes: resp.modes,
                models: resp.models,
                config_options: resp.config_options,
                per_model_reasoning: per_model,
                commands,
            })
        }) as std::pin::Pin<Box<dyn std::future::Future<Output = Option<ProbeResult>>>>
    })
    .await?;

    // Kill the probe process
    let _ = child.kill().await;

    Some(result)
}

/// Lightweight probe: spawn server, initialize, check fork/load capabilities, kill.
/// Returns `Some((supports_followup, supports_fork))` or `None` if the probe failed.
pub async fn check_followup_support(
    command_parts: CommandParts,
    cwd: &Path,
    cmd_overrides: &CmdOverrides,
) -> Option<(bool, bool)> {
    let (program_path, args) = command_parts.into_resolved().await.ok()?;
    let mut command = Command::new(program_path);
    command
        .kill_on_drop(true)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .current_dir(cwd)
        .env("NPM_CONFIG_LOGLEVEL", "error")
        .env("NODE_NO_WARNINGS", "1")
        .args(&args);

    if let Some(ref env_vars) = cmd_overrides.env {
        for (k, v) in env_vars {
            command.env(k, v);
        }
    }

    let mut child = command.spawn().ok()?;
    let stdout = child.stdout.take()?;
    let stdin = child.stdin.take()?;

    let (mut to_acp, acp_in) = tokio::io::duplex(64 * 1024);
    let (acp_out_w, acp_out_r) = tokio::io::duplex(64 * 1024);

    tokio::spawn(async move {
        let mut stream = ReaderStream::new(stdout);
        while let Some(Ok(data)) = stream.next().await {
            if to_acp.write_all(&data).await.is_err() {
                break;
            }
        }
    });

    let mut child_stdin = stdin;
    tokio::spawn(async move {
        let mut lines = ReaderStream::new(acp_out_r)
            .map(|r| r.map(|b| String::from_utf8_lossy(&b).into_owned()))
            .lines();
        while let Some(Ok(line)) = lines.next().await {
            let line = line + "\n";
            if child_stdin.write_all(line.as_bytes()).await.is_err() {
                break;
            }
            let _ = child_stdin.flush().await;
        }
    });

    let result = run_in_acp_local_set(tracing::Span::current(), move || {
        Box::pin(async move {
            let (event_tx, _) = mpsc::unbounded_channel::<AcpEvent>();
            let cancel = CancellationToken::new();
            let client = AcpClient::new(event_tx, None, cancel, true);

            let outgoing = acp_out_w.compat_write();
            let incoming = acp_in.compat();

            let (conn, io_fut) =
                proto::ClientSideConnection::new(client, outgoing, incoming, |fut| {
                    tokio::task::spawn_local(fut);
                });
            let conn = Rc::new(conn);

            let _io = tokio::task::spawn_local(async move {
                let _ = io_fut.await;
            });

            let init_resp = conn
                .initialize(proto::InitializeRequest::new(proto::ProtocolVersion::V1))
                .await
                .ok()?;

            let caps = &init_resp.agent_capabilities;
            let supports_fork = caps.session_capabilities.fork.is_some();
            let supports_followup =
                supports_fork || caps.session_capabilities.resume.is_some() || caps.load_session;
            Some((supports_followup, supports_fork))
        }) as std::pin::Pin<Box<dyn std::future::Future<Output = Option<(bool, bool)>>>>
    })
    .await?;

    let _ = child.kill().await;

    Some(result)
}
