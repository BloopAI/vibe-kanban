use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use acp::{
    Agent, ByteStreams, ConnectionTo,
    schema::{
        ProtocolVersion,
        v1::{
            CancelNotification, ContentBlock, InitializeRequest, LoadSessionRequest,
            NewSessionRequest, PromptRequest, RequestPermissionRequest, SessionNotification,
            TextContent,
        },
    },
};
use command_group::AsyncGroupChild;
use tokio::{
    io::AsyncWriteExt,
    process::Command,
    sync::{mpsc, mpsc::UnboundedSender},
};
use tokio_util::{
    compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt},
    sync::CancellationToken,
};
use workspace_utils::command_ext::GroupSpawnNoWindowExt;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandParts},
    env::ExecutionEnv,
    executors::{
        ExecutorError, ExecutorExitResult, SpawnedChild,
        acp::{
            AcpEvent, SessionManager,
            permissions::{ask_user, auto_approve},
        },
    },
};

/// Reusable harness for ACP-based conns (Gemini, Qwen, etc.)
#[derive(Default)]
pub struct AcpAgentHarnessV2 {
    model: Option<String>,
    mode: Option<String>,
    legacy_namespace: Option<String>,
}

/// Time limit for an agent to initialize / load a session / create a new session.
/// Not used for prompts, turns can legitimately run long
const SETUP_TIMEOUT: Duration = Duration::from_secs(120);

/// Per the ACP spec the agent wraps up and answers the prompt with stopReason=cancelled.
/// Stay connected so it can persist that, but stay under the container's 5s grace period.
const CANCEL_GRACE: Duration = Duration::from_secs(4);

/// State shared by the session loop and the ACP handlers. Cheap to clone (Arcs + a channel sender).
#[derive(Clone)]
struct SessionShared {
    log_tx: UnboundedSender<String>,
    cancel: CancellationToken,
    /// True while session/load replays history we already have in our logs.
    replaying: Arc<AtomicBool>,
    /// Reasons from "deny with feedback", sent to the agent after the turn ends.
    denial_feedback: Arc<Mutex<Vec<String>>>,
}

impl AcpAgentHarnessV2 {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_legacy_sessions(mut self, legacy_namespace: impl Into<String>) -> Self {
        self.legacy_namespace = Some(legacy_namespace.into());
        self
    }

    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }

    pub fn with_mode(mut self, mode: impl Into<String>) -> Self {
        self.mode = Some(mode.into());
        self
    }

    pub fn apply_overrides(&mut self, executor_config: &crate::profile::ExecutorConfig) {
        if let Some(model_id) = &executor_config.model_id {
            self.model = Some(model_id.clone());
        }

        if let Some(agent_id) = &executor_config.agent_id {
            self.mode = Some(agent_id.clone());
        }
    }

    pub async fn spawn_with_command(
        &self,
        current_dir: &Path,
        prompt: String,
        command_parts: CommandParts,
        env: &ExecutionEnv,
        cmd_overrides: &CmdOverrides,
        approvals: Option<std::sync::Arc<dyn ExecutorApprovalService>>,
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

        let mut child = command.group_spawn_no_window()?;

        let (exit_tx, exit_rx) = tokio::sync::oneshot::channel::<ExecutorExitResult>();
        let cancel = CancellationToken::new();

        Self::bootstrap_acp_connection(
            &mut child,
            current_dir.to_path_buf(),
            None,
            prompt,
            Some(exit_tx),
            self.model.clone(),
            self.mode.clone(),
            approvals,
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
    pub async fn spawn_follow_up_with_command(
        &self,
        current_dir: &Path,
        prompt: String,
        session_id: &str,
        command_parts: CommandParts,
        env: &ExecutionEnv,
        cmd_overrides: &CmdOverrides,
        approvals: Option<std::sync::Arc<dyn ExecutorApprovalService>>,
    ) -> Result<SpawnedChild, ExecutorError> {
        // Conversations started by the pre-V2 harness store our own id, which the agent can't
        // session/load. Start a new session and send the stored history inside the prompt instead.
        let legacy = self
            .legacy_namespace
            .as_deref()
            .and_then(|ns| {
                SessionManager::new(ns)
                    .inspect_err(|e| {
                        tracing::warn!("Failed to open legacy session store {ns}: {e}")
                    })
                    .ok()
            })
            .filter(|sm| sm.has_session(session_id));
        let (existing_session, prompt_to_send) = match legacy {
            Some(sm) => {
                tracing::debug!(
                    "Found legacy session with id {session_id}, generating resume prompt"
                );
                let resume_prompt = sm
                    .generate_resume_prompt(session_id, &prompt)
                    .unwrap_or_else(|e| {
                        tracing::warn!("Failed to load legacy session {session_id} from disk: {e}");
                        prompt
                    });

                (None, resume_prompt)
            }
            None => (Some(session_id.to_string()), prompt),
        };

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

        let mut child = command.group_spawn_no_window()?;

        let (exit_tx, exit_rx) = tokio::sync::oneshot::channel::<ExecutorExitResult>();
        let cancel = CancellationToken::new();

        Self::bootstrap_acp_connection(
            &mut child,
            current_dir.to_path_buf(),
            existing_session,
            prompt_to_send,
            Some(exit_tx),
            self.model.clone(),
            self.mode.clone(),
            approvals,
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
        existing_session: Option<String>,
        prompt: String,
        exit_signal: Option<tokio::sync::oneshot::Sender<ExecutorExitResult>>,
        // todo: implement model and mode config change
        _model: Option<String>,
        _mode: Option<String>,
        approvals: Option<Arc<dyn ExecutorApprovalService>>,
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
        // The agent's stdin is where WE write; its stdout is where WE read.
        // .compat*() adapts tokio's I/O traits to the futures traits the ACP SDK expects.
        let transport = ByteStreams::new(orig_stdin.compat_write(), orig_stdout.compat());

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

        let shared = SessionShared {
            log_tx: log_tx.clone(),
            cancel,
            replaying: Arc::new(AtomicBool::new(false)),
            denial_feedback: Arc::default(),
        };
        let notification_shared = shared.clone();
        let permission_shared = shared.clone();

        tokio::spawn(async move {
            let result = acp::Client
                .builder()
                .on_receive_notification(
                    async move |notification: SessionNotification, _cx| {
                        tracing::trace!(
                            "RAW ACP: {}",
                            serde_json::to_string(&notification).unwrap_or_default()
                        );
                        if notification_shared.replaying.load(Ordering::SeqCst) {
                            return Ok(()); // history replay from session/load: already in our logs
                        }
                        if let Ok(event) = AcpEvent::try_from(notification) {
                            let _ = notification_shared.log_tx.send(event.to_string()); // Display = JSON; the writer adds '\n'
                        }
                        Ok(())
                    },
                    acp::on_receive_notification!(),
                )
                .on_receive_request(
                    async move |request: RequestPermissionRequest, responder, connection| {
                        tracing::trace!("Received permission request: {:?}", request);
                        let Some(approvals) = approvals.clone() else {
                            let _ = responder.respond(auto_approve(&request));
                            return Ok(());
                        };

                        // the closure runs once per request → clone again for each spawned task
                        let shared = permission_shared.clone();
                        connection.spawn(async move {
                            let _ = responder.respond(
                                ask_user(
                                    &request,
                                    approvals,
                                    shared.cancel,
                                    &shared.log_tx,
                                    shared.denial_feedback,
                                )
                                .await,
                            );
                            Ok(())
                        })
                    },
                    acp::on_receive_request!(),
                )
                .connect_with(transport, |connection: ConnectionTo<Agent>| {
                    run_session(connection, existing_session, cwd, prompt, shared)
                })
                .await;

            // Notify container of completion
            let exit = match result {
                Ok(()) => ExecutorExitResult::Success,
                Err(err) => {
                    let _ = log_tx.send(AcpEvent::Error(err.to_string()).to_string());
                    ExecutorExitResult::Failure
                }
            };
            if let Some(tx) = exit_signal {
                let _ = tx.send(exit);
            }
        });

        Ok(())
    }
}

async fn run_session(
    connection: ConnectionTo<Agent>,
    existing_session: Option<String>,
    cwd: PathBuf,
    prompt: String,
    shared: SessionShared,
) -> Result<(), acp::Error> {
    // Initialize the agent
    tracing::debug!("🤝 Initializing agent...");
    let init_response = with_timeout(
        "initialize",
        connection
            .send_request(InitializeRequest::new(ProtocolVersion::V1))
            .block_task(),
    )
    .await?;

    tracing::debug!("✓ Agent initialized: {:?}", init_response.agent_info);

    let session_id = if let Some(existing) = existing_session {
        if !init_response.agent_capabilities.load_session {
            return Err(acp::util::internal_error(
                "agent does not support session/load",
            ));
        }
        shared.replaying.store(true, Ordering::SeqCst);

        tracing::debug!("📝 Loading session {existing}...");
        let load_session_response = with_timeout(
            "load the session",
            connection
                .send_request(LoadSessionRequest::new(existing.clone(), cwd.clone()))
                .block_task(),
        )
        .await;
        shared.replaying.store(false, Ordering::SeqCst);

        let load_session_response = load_session_response?;
        tracing::debug!("✓ Session loaded {:?}", load_session_response);
        existing
    } else {
        // Create a new session
        tracing::debug!("📝 Creating new session...");
        let new_session_response = with_timeout(
            "create a new session",
            connection
                .send_request(NewSessionRequest::new(cwd.clone()))
                .block_task(),
        )
        .await?;

        tracing::debug!("✓ Session created");
        new_session_response.session_id.to_string()
    };
    let _ = shared
        .log_tx
        .send(AcpEvent::SessionStart(session_id.clone()).to_string());

    // Denial feedback is delivered after the turn ends. Some agents (Copilot) end their turn on
    // rejection; others may keep working first, so for them the feedback can arrive late.
    let mut next_prompt = Some(prompt);
    while let Some(text) = next_prompt.take() {
        let mut turn = std::pin::pin!(
            connection
                .send_request(PromptRequest::new(
                    session_id.clone(),
                    vec![ContentBlock::Text(TextContent::new(text))]
                ))
                .block_task()
        );

        // Send the prompt and await completion to obtain stop_reason
        let response = tokio::select! {
            res = &mut turn => res,
            _ = shared.cancel.cancelled() => {
                connection.send_notification(CancelNotification::new(session_id.clone()))?;

                match tokio::time::timeout(CANCEL_GRACE, &mut turn).await {
                    Ok(res) => res,
                    Err(_) => return Ok(()),          // agent didn't answer in time; container will kill it
                }
            }
        };
        match response {
            Ok(resp) => {
                // Emit done with stop_reason
                let stop_reason = serde_json::to_string(&resp.stop_reason).unwrap_or_default();

                tracing::debug!("✅ Agent completed!");
                tracing::debug!("Stop reason: {:?}", stop_reason);
                let _ = shared.log_tx.send(AcpEvent::Done(stop_reason).to_string());
            }
            Err(e) => {
                tracing::debug!("error {} {e} {:?}", e.code, e.data);
                if acp::is_incoming_transport_closed(&e) {
                    tracing::debug!("ACP server killed");
                } else {
                    return Err(e);
                }
            }
        }

        if shared.cancel.is_cancelled() {
            // never send feedback after Stop
            break;
        }
        let feedback = shared
            .denial_feedback
            .lock()
            .unwrap()
            .drain(..)
            .collect::<Vec<_>>()
            .join("\n");
        if !feedback.is_empty() {
            next_prompt = Some(feedback);
        }
    }

    Ok(())
}

async fn with_timeout<T>(
    step: &str,
    request: impl Future<Output = Result<T, acp::Error>>,
) -> Result<T, acp::Error> {
    tokio::time::timeout(SETUP_TIMEOUT, request)
        .await
        .map_err(|_| acp::util::internal_error(format!("Timed out waiting for agent to {step}")))?
}
