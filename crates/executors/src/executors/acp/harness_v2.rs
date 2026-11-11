use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use acp::{
    Agent, ByteStreams, ConnectionTo, UntypedMessage,
    schema::{
        ProtocolVersion,
        v1::{
            CancelNotification, ContentBlock, InitializeRequest, LoadSessionRequest,
            NewSessionRequest, PromptRequest, RequestPermissionRequest, SessionNotification,
            SessionUpdate, TextContent,
        },
    },
};
use async_trait::async_trait;
use command_group::AsyncGroupChild;
use serde_json::Value;
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
            session_config::{
                ConfigSink, ConfigValue, DesiredConfig, SessionOptions, apply_config,
                describe_changes, summary,
            },
        },
    },
    profile::ExecutorConfig,
};

/// Reusable harness for ACP-based conns (Gemini, Qwen, etc.)
#[derive(Default)]
pub struct AcpAgentHarnessV2 {
    config: DesiredConfig,
    legacy_namespace: Option<String>,
}

/// Time limit for an agent to initialize / load a session / create a new session.
/// Not used for prompts, turns can legitimately run long
pub(crate) const SETUP_TIMEOUT: Duration = Duration::from_secs(120);

/// Time limit for each config change (model, reasoning, mode, ...) after the session starts.
pub(crate) const CONFIG_CHANGE_TIMEOUT: Duration = Duration::from_secs(10);

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
    /// What the agent advertises for the session, kept current so changes the agent makes
    /// itself (Copilot leaving plan mode, ...) can be shown.
    options: Arc<Mutex<SessionOptions>>,
    /// Set once our own config is applied. Before that, config notifications are echoes of our
    /// own changes and are not shown.
    tracking_config: Arc<AtomicBool>,
}

impl SessionShared {
    fn send(&self, event: AcpEvent) {
        let _ = self.log_tx.send(event.to_string()); // Display = JSON; the writer adds '\n'
    }

    /// Records a config or mode notification and shows what the agent changed.
    fn on_config_notification(&self, update: impl FnOnce(&mut SessionOptions)) {
        if !self.tracking_config.load(Ordering::SeqCst) {
            return;
        }
        let lines = {
            let mut options = self.options.lock().unwrap_or_else(|e| e.into_inner());
            let before = options.clone();
            update(&mut options);
            describe_changes(&before, &options)
        };
        for line in lines {
            self.send(AcpEvent::SessionConfig(line));
        }
    }
}

impl AcpAgentHarnessV2 {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_legacy_sessions(mut self, legacy_namespace: impl Into<String>) -> Self {
        self.legacy_namespace = Some(legacy_namespace.into());
        self
    }

    pub fn with_config(mut self, config: DesiredConfig) -> Self {
        self.config = config;
        self
    }

    pub fn config(&self) -> &DesiredConfig {
        &self.config
    }

    pub fn apply_overrides(&mut self, executor_config: &ExecutorConfig) {
        if let Some(model_id) = &executor_config.model_id {
            self.config.model = Some(model_id.clone());
        }
        if let Some(reasoning_id) = &executor_config.reasoning_id {
            self.config.reasoning = Some(reasoning_id.clone());
        }
        if let Some(agent_id) = &executor_config.agent_id {
            self.config.mode = Some(agent_id.clone());
        }
        if let Some(permission) = &executor_config.permission_policy {
            self.config.permission = Some(permission.clone());
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
        let env_vars = env.clone().with_profile(cmd_overrides).vars;
        let mut child = spawn_acp_process(current_dir, command_parts, &env_vars).await?;

        let (exit_tx, exit_rx) = tokio::sync::oneshot::channel::<ExecutorExitResult>();
        let cancel = CancellationToken::new();

        Self::bootstrap_acp_connection(
            &mut child,
            current_dir.to_path_buf(),
            None,
            prompt,
            Some(exit_tx),
            self.config.clone(),
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

        let env_vars = env.clone().with_profile(cmd_overrides).vars;
        let mut child = spawn_acp_process(current_dir, command_parts, &env_vars).await?;

        let (exit_tx, exit_rx) = tokio::sync::oneshot::channel::<ExecutorExitResult>();
        let cancel = CancellationToken::new();

        Self::bootstrap_acp_connection(
            &mut child,
            current_dir.to_path_buf(),
            existing_session,
            prompt_to_send,
            Some(exit_tx),
            self.config.clone(),
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
        config: DesiredConfig,
        approvals: Option<Arc<dyn ExecutorApprovalService>>,
        cancel: CancellationToken,
    ) -> Result<(), ExecutorError> {
        let transport = take_transport(child)?;

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
            options: Arc::default(),
            tracking_config: Arc::new(AtomicBool::new(false)),
        };
        let notification_shared = shared.clone();
        let permission_shared = shared.clone();
        let auto_approve_requests = config.auto_approve();

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
                        match &notification.update {
                            SessionUpdate::ConfigOptionUpdate(update) => {
                                let value = serde_json::to_value(update).unwrap_or_default();
                                notification_shared
                                    .on_config_notification(|o| o.update_config(&value));
                            }
                            // Shown through SessionConfig with the mode's name, not its raw id
                            SessionUpdate::CurrentModeUpdate(update) => {
                                let mode_id = update.current_mode_id.0.to_string();
                                notification_shared
                                    .on_config_notification(|o| o.set_current_mode(&mode_id));
                            }
                            _ => {
                                if let Ok(event) = AcpEvent::try_from(notification) {
                                    notification_shared.send(event);
                                }
                            }
                        }
                        Ok(())
                    },
                    acp::on_receive_notification!(),
                )
                .on_receive_request(
                    async move |request: RequestPermissionRequest, responder, connection| {
                        tracing::trace!("Received permission request: {:?}", request);
                        let approvals = match approvals.clone() {
                            Some(approvals) if !auto_approve_requests => approvals,
                            _ => {
                                let _ = responder.respond(auto_approve(&request));
                                return Ok(());
                            }
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
                .connect_with(transport, async move |connection: ConnectionTo<Agent>| {
                    run_session(connection, existing_session, cwd, prompt, config, shared).await
                })
                .await;

            // Notify container of completion
            let exit = match result {
                Ok(()) => ExecutorExitResult::Success,
                Err(err) => {
                    let _ = log_tx.send(exit_event(&err).to_string());
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

/// Spawns an ACP agent in its own process group, killed when dropped. Shared by runs and
/// option discovery, so a discovery that times out doesn't leave the agent running.
pub(crate) async fn spawn_acp_process(
    current_dir: &Path,
    command_parts: CommandParts,
    env_vars: &HashMap<String, String>,
) -> Result<AsyncGroupChild, ExecutorError> {
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
        .args(&args)
        .envs(env_vars);

    Ok(command.group_spawn_no_window()?)
}

/// Takes the child's stdin/stdout as the ACP transport.
pub(crate) fn take_transport(
    child: &mut AsyncGroupChild,
) -> Result<
    ByteStreams<
        tokio_util::compat::Compat<tokio::process::ChildStdin>,
        tokio_util::compat::Compat<tokio::process::ChildStdout>,
    >,
    ExecutorError,
> {
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
    Ok(ByteStreams::new(
        orig_stdin.compat_write(),
        orig_stdout.compat(),
    ))
}

pub(crate) async fn initialize(
    connection: &ConnectionTo<Agent>,
) -> Result<acp::schema::v1::InitializeResponse, acp::Error> {
    tracing::debug!("🤝 Initializing agent...");
    let init_response = with_timeout(
        "initialize",
        connection
            .send_request(InitializeRequest::new(ProtocolVersion::V1))
            .block_task(),
    )
    .await?;
    tracing::debug!("✓ Agent initialized: {:?}", init_response.agent_info);
    Ok(init_response)
}

/// Sends `session/new`, or `session/load` when `existing` is set, untyped so that both
/// `configOptions` and the older `models` / `modes` objects can be read.
/// Returns the session id and what the agent advertises for it.
pub(crate) async fn open_session(
    connection: &ConnectionTo<Agent>,
    existing: Option<String>,
    cwd: PathBuf,
) -> Result<(String, SessionOptions), acp::Error> {
    match existing {
        Some(session_id) => {
            tracing::debug!("📝 Loading session {session_id}...");
            let request = UntypedMessage::new(
                "session/load",
                LoadSessionRequest::new(session_id.clone(), cwd),
            )?;
            let response = with_timeout(
                "load the session",
                connection.send_request(request).block_task(),
            )
            .await?;
            tracing::debug!("✓ Session loaded {:?}", response);
            Ok((session_id, SessionOptions::from_response(&response)))
        }
        None => {
            tracing::debug!("📝 Creating new session...");
            let request = UntypedMessage::new("session/new", NewSessionRequest::new(cwd))?;
            let response = with_timeout(
                "create a new session",
                connection.send_request(request).block_task(),
            )
            .await?;
            let session_id = response
                .get("sessionId")
                .and_then(Value::as_str)
                .ok_or_else(|| acp::util::internal_error("session/new returned no sessionId"))?
                .to_string();
            tracing::debug!("✓ Session created");
            Ok((session_id, SessionOptions::from_response(&response)))
        }
    }
}

/// Sends config changes over an ACP connection, each with its own time limit.
pub(crate) struct ConnectionSink<'a> {
    pub connection: &'a ConnectionTo<Agent>,
    pub session_id: String,
}

impl ConnectionSink<'_> {
    async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        let request = UntypedMessage::new(method, params).map_err(|e| e.to_string())?;
        match tokio::time::timeout(
            CONFIG_CHANGE_TIMEOUT,
            self.connection.send_request(request).block_task(),
        )
        .await
        {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(e)) => Err(e.message),
            Err(_) => Err("the agent didn't answer in time".to_string()),
        }
    }
}

#[async_trait]
impl ConfigSink for ConnectionSink<'_> {
    async fn set_config_option(&mut self, id: &str, value: &ConfigValue) -> Result<Value, String> {
        let mut params = value.to_params();
        params["sessionId"] = Value::from(self.session_id.clone());
        params["configId"] = Value::from(id);
        self.request("session/set_config_option", params).await
    }

    async fn set_mode(&mut self, mode_id: &str) -> Result<(), String> {
        let params = serde_json::json!({ "sessionId": self.session_id, "modeId": mode_id });
        self.request("session/set_mode", params).await.map(|_| ())
    }

    async fn set_model(&mut self, model_id: &str) -> Result<(), String> {
        let params = serde_json::json!({ "sessionId": self.session_id, "modelId": model_id });
        self.request("session/set_model", params).await.map(|_| ())
    }
}

async fn run_session(
    connection: ConnectionTo<Agent>,
    existing_session: Option<String>,
    cwd: PathBuf,
    prompt: String,
    config: DesiredConfig,
    shared: SessionShared,
) -> Result<(), acp::Error> {
    let init_response = initialize(&connection).await?;

    if existing_session.is_some() {
        if !init_response.agent_capabilities.load_session {
            return Err(acp::util::internal_error(
                "agent does not support session/load",
            ));
        }
        shared.replaying.store(true, Ordering::SeqCst);
    }
    let opened = open_session(&connection, existing_session, cwd).await;
    shared.replaying.store(false, Ordering::SeqCst);
    let (session_id, mut options) = opened?;

    shared.send(AcpEvent::SessionStart(session_id.clone()));

    apply_session_config(&connection, &session_id, &mut options, &config, &shared).await;

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
                shared.send(AcpEvent::Done(stop_reason));
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

/// Applies the selected config, then shows what is in effect and anything that was skipped.
/// Never fails the run.
async fn apply_session_config(
    connection: &ConnectionTo<Agent>,
    session_id: &str,
    options: &mut SessionOptions,
    config: &DesiredConfig,
    shared: &SessionShared,
) {
    let mut sink = ConnectionSink {
        connection,
        session_id: session_id.to_string(),
    };
    let outcome = apply_config(options, config, &mut sink).await;
    for warning in &outcome.warnings {
        tracing::warn!("ACP session config: {warning}");
    }

    *shared.options.lock().unwrap_or_else(|e| e.into_inner()) = options.clone();
    shared.tracking_config.store(true, Ordering::SeqCst);

    if let Some(line) = summary(options, outcome.permission.as_ref()) {
        shared.send(AcpEvent::SessionConfig(line));
    }
    for warning in outcome.warnings {
        shared.send(AcpEvent::SessionConfig(warning));
    }
}

/// The event logged when a run ends with `err`. -32000 on `session/new` (signed out) or
/// `session/prompt` (token expired mid-session) becomes `AuthRequired`, not a plain error.
fn exit_event(err: &acp::Error) -> AcpEvent {
    if err.code == acp::ErrorCode::AuthRequired {
        let message = if err.message.is_empty() {
            err.code.to_string()
        } else {
            err.message.clone()
        };
        AcpEvent::AuthRequired(message)
    } else {
        AcpEvent::Error(err.to_string())
    }
}

pub(crate) async fn with_timeout<T>(
    step: &str,
    request: impl Future<Output = Result<T, acp::Error>>,
) -> Result<T, acp::Error> {
    tokio::time::timeout(SETUP_TIMEOUT, request)
        .await
        .map_err(|_| acp::util::internal_error(format!("Timed out waiting for agent to {step}")))?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The code must survive the request path; it's only turned into text by `exit_event`.
    #[tokio::test]
    async fn auth_error_keeps_its_code_through_with_timeout() {
        let err = with_timeout("create a new session", async {
            Err::<(), _>(acp::Error::new(-32000, "Authentication required"))
        })
        .await
        .unwrap_err();
        assert_eq!(err.code, acp::ErrorCode::AuthRequired);
        assert_eq!(err.message, "Authentication required");
    }

    #[test]
    fn auth_required_becomes_its_own_event() {
        let event = exit_event(&acp::Error::new(-32000, "Not signed in"));
        assert!(matches!(event, AcpEvent::AuthRequired(m) if m == "Not signed in"));

        // No message from the agent: fall back to the code's name
        let event = exit_event(&acp::Error::new(-32000, ""));
        let AcpEvent::AuthRequired(message) = event else {
            panic!("expected AuthRequired, got {event:?}");
        };
        assert_eq!(message, "Authentication required");
    }

    #[test]
    fn other_errors_stay_plain() {
        let event = exit_event(&acp::util::internal_error("boom"));
        assert!(matches!(event, AcpEvent::Error(_)));
    }
}
